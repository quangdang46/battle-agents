import { authenticate, AuthenticationError } from '@battle-agents/agent';
import { createInMemoryEventBus } from '@battle-agents/core';
import type { EventBus, Runtime } from '@battle-agents/core';
import {
  closeDatabasePool,
  createDatabase,
  createDatabasePool,
  DrizzleAgentRepository,
  DrizzleCredentialStore,
  DrizzleQuestRepository,
  DrizzleSessionRepository,
  DrizzleStateStore,
  type Database,
} from '@battle-agents/db';
import { PROTOCOL_VERSION } from '@battle-agents/protocol';

import { readBatchLimits, type BatchLimits } from './event-batch.js';
import { createEventRoutes } from './event-routes.js';
import { EventStreamHub, type GameSnapshot } from './event-stream.js';
import { createGameRuntime } from './composition.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The event gateway: the composition root for the telemetry plane.
 *
 * Plan section 7.2, as code:
 *
 *     Agents -> Next.js Event Gateway -> {Realtime -> Browser} + {important -> Neon}
 *
 * and this file is where the split is actually made. There is ONE bus, ONE hub
 * and ONE runtime, and the two downstream paths fork inside the runtime, not
 * here: `runtime.emit` persists what the persistence policy says is worth a row
 * and publishes EVERY event to the bus, and the hub is subscribed to the bus and
 * to nothing else. So the realtime path does not consult the store, and the
 * store does not consult the hub — "we do not persist it" can never quietly
 * become "we drop it", because dropping is a decision neither of them is in a
 * position to make.
 *
 * Why the gateway owns its own runtime rather than borrowing the one in
 * `routes.ts`. The hub has to be attached to the same bus the ingest runtime
 * publishes on, and borrowing a runtime that routes.ts builds privately would
 * mean reaching into it. The two runtimes share the durable store — the same
 * `event_log` table — and the event plane is otherwise self-contained. Folding
 * the two runtimes into one is a real simplification, but it belongs with the
 * work that makes the act path a first-class publisher, not with a bead whose
 * subject is the telemetry plane.
 */

export interface EventGatewayDependencies {
  readonly database: Database;
  /** Resolved once here, at composition time, so a bad env var fails at startup. */
  readonly limits?: BatchLimits;
  /** Injectable so a test can pin the clock the token expiry is judged against. */
  readonly now?: () => string;
  readonly maxSubscriberLag?: number;
}

export interface EventGateway {
  readonly runtime: Runtime;
  readonly bus: EventBus;
  readonly hub: EventStreamHub;
  readonly limits: BatchLimits;
  /** The two handlers, ready to hand to a Next.js adapter. */
  handle(request: HttpRequest): Promise<HttpResponse>;
  close(): void;
}

export function createEventGateway(dependencies: EventGatewayDependencies): EventGateway {
  const limits = dependencies.limits ?? readBatchLimits(process.env);
  const now = dependencies.now ?? (() => new Date().toISOString());

  const bus = createInMemoryEventBus();
  const store = new DrizzleStateStore(dependencies.database);
  const sessionRepository = new DrizzleSessionRepository(dependencies.database);
  const credentialStore = new DrizzleCredentialStore(dependencies.database);

  const runtime = createGameRuntime({
    store,
    bus,
    agentRepository: new DrizzleAgentRepository(dependencies.database),
    questRepository: new DrizzleQuestRepository(dependencies.database),
    sessionRepository,
  });

  // The snapshot is deliberately synchronous and deliberately empty of live
  // sessions. Synchronous because the hub takes a subscriber's snapshot and
  // starts watching it in one non-yielding step, so no event can slip between
  // "here is the world" and "this client is watching"; an async provider would
  // reopen exactly that window. Empty of live sessions because there is no
  // presence registry in this bead, and an empty list is an honest value rather
  // than a fabricated one.
  const hub = new EventStreamHub({
    bus,
    snapshot: (): GameSnapshot => ({ protocolVersion: PROTOCOL_VERSION, liveSessionIds: [] }),
    ...(dependencies.maxSubscriberLag === undefined
      ? {}
      : { maxSubscriberLag: dependencies.maxSubscriberLag }),
  });

  const routes = createEventRoutes({
    limits,
    // No required scope: the token proves which installation is calling and
    // `resolveSession` proves the session belongs to it, which is the whole of
    // what this route checks. A scope here would be a second, weaker gate in
    // front of a real one, and it would be the one a fixture forgets to grant.
    authenticate: async (request) => {
      try {
        const caller = await authenticate({ store: credentialStore, now: now() }, request);
        return { installationId: caller.installationId };
      } catch (error) {
        return toAuthenticationFailure(error);
      }
    },
    resolveSession: (sessionId, installationId) =>
      sessionRepository.findOwnedByInstallation(sessionId, installationId),
    emit: (event) => runtime.emit(event),
    hub,
  });

  return {
    runtime,
    bus,
    hub,
    limits,
    handle: routes,
    close: () => {
      hub.close();
    },
  };
}

/**
 * Re-throws a credential failure as the shape the HTTP surface recognises.
 *
 * The agent feature's `AuthenticationError` carries its reason at
 * `failure.reason`, while `isAuthenticationFailure` in the api package — which
 * `routes.ts` uses to turn any authentication failure into a 401 — recognises
 * the same reason at the top level. The two are structurally compatible but not
 * identical, and the mapping between them belongs here, in the one place that
 * knows both, rather than in each route that has to catch it.
 */
export function toAuthenticationFailure(error: unknown): never {
  if (error instanceof AuthenticationError) {
    const failure = new Error(error.message) as Error & { reason: string };
    failure.reason = error.failure.reason;
    throw failure;
  }
  throw error;
}

let cached: { gateway: EventGateway; close: () => Promise<void> } | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` is: a database pool is fine once
 * and fatal per request, and the hub has to be the SAME hub every request sees,
 * because a second one would be a second realtime plane with no events in it.
 */
export function sharedEventGateway(): EventGateway {
  if (cached !== undefined) {
    return cached.gateway;
  }
  const pool = createDatabasePool();
  const database = createDatabase(pool);
  const gateway = createEventGateway({ database });
  cached = { gateway, close: () => closeDatabasePool(pool) };
  return gateway;
}

/** Releases the hub and the pool. For a graceful shutdown. */
export async function closeSharedEventGateway(): Promise<void> {
  cached?.gateway.close();
  await cached?.close();
  cached = undefined;
}
