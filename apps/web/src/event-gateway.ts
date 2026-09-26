import { isAuthenticationFailure } from '@battle-agents/api';
import { authenticate } from '@battle-agents/db';
import { createInMemoryEventBus } from '@battle-agents/core';
import type { EventBus, Runtime } from '@battle-agents/core';
import {
  DrizzleAgentRepository,
  DrizzleBattleRepository,
  DrizzleAchievementsRepository,
  DrizzleBountyRepository,
  DrizzleCredentialStore,
  DrizzlePayoutIntentStore,
  DrizzleProgressionRepository,
  DrizzleQuestRepository,
  DrizzleReputationRepository,
  DrizzleSessionRepository,
  DrizzleSocialRepository,
  DrizzleStateStore,
  type Database,
} from '@battle-agents/db';
import { PROTOCOL_VERSION } from '@battle-agents/protocol';

import { sharedRuntime } from './shared-runtime.js';

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
 * The runtime and bus arrive from `await sharedRuntime()`. This file used to build
 * its own, and the paragraph that used to sit here argued for it: folding the
 * two runtimes together "belongs with the work that makes the act path a
 * first-class publisher". MCP is that work, and the fold is done — see
 * `shared-runtime.ts` for why two buses were a correctness bug rather than an
 * inefficiency, and `tests/integration/shared-runtime-fold.test.ts` for the
 * assertion that holds them together.
 */

export interface EventGatewayDependencies {
  /**
   * How a request proves which installation is calling.
   *
   * Injected rather than imported, and that is the whole point. The gateway
   * imported `authenticate` from the agent feature, which put a feature import
   * outside the composition root — and the removal test then correctly reported
   * that the agent feature could not be removed, because two files besides the
   * root had to change with it. "Adding a feature is a package and one line"
   * stopped being true. The gateway is a transport; asking it for an
   * authenticator is a dependency, and the composition root is the place that
   * decides which features exist.
   */
  readonly authenticate?: (request: unknown) => Promise<{ readonly installationId: string }>;

  readonly database: Database;
  /**
   * The runtime and bus to publish on. Supplied by the app so the telemetry
   * plane and the action plane share one bus; omitted by a test that wants an
   * isolated runtime of its own.
   *
   * This is the seam that removed the two-bus defect. The gateway used to build
   * its own runtime and its own `createInMemoryEventBus()`, which meant an event
   * emitted by a game action through the Application API was published to a bus
   * no subscriber was on. The gateway's own header had recorded the fold as
   * belonging with the work that makes the act path a first-class publisher, and
   * MCP is that work.
   */
  readonly runtime?: Runtime;
  readonly bus?: EventBus;
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

  const bus = dependencies.bus ?? createInMemoryEventBus();
  const store = new DrizzleStateStore(dependencies.database);
  const sessionRepository = new DrizzleSessionRepository(dependencies.database);

  // Falls back to refusing rather than to a default. A gateway wired without
  // an authenticator is a gateway that would accept unauthenticated ingest if
  // the fallback were permissive, and "unreachable in practice" is not a
  // property worth betting a write path on.
  const authenticateRequest =
    dependencies.authenticate ??
    ((): Promise<never> => Promise.reject(new Error('no authenticator was supplied')));

  const runtime =
    dependencies.runtime ??
    createGameRuntime({
      store,
      bus,
      agentRepository: new DrizzleAgentRepository(dependencies.database),
      questRepository: new DrizzleQuestRepository(dependencies.database),
      sessionRepository,
      progressionRepository: new DrizzleProgressionRepository(dependencies.database),
      reputationRepository: new DrizzleReputationRepository(dependencies.database),
      socialRepository: new DrizzleSocialRepository(dependencies.database),
      bountyRepository: new DrizzleBountyRepository(dependencies.database),
      payoutIntentStore: new DrizzlePayoutIntentStore(dependencies.database),
      battleRepository: new DrizzleBattleRepository(dependencies.database),
      achievementsRepository: new DrizzleAchievementsRepository(dependencies.database),
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
    // The mapping from whatever the authenticator threw to the shape `routes.ts`
    // recognises as a 401 happens HERE, where the authenticator is called, and
    // not inside each authenticator. A supplied authenticator that forgot it
    // turned a rejected token into a 500, which tells the caller to retry a
    // credential that will never be accepted.
    authenticate: async (request) => {
      try {
        const caller = await authenticateRequest(request);
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
 * Re-throws an authentication failure as the shape the HTTP surface recognises.
 *
 * `isAuthenticationFailure` in the api package is what `routes.ts` uses to turn
 * any authentication failure into a 401, and it reads the reason at the top
 * level. An authenticator supplied by the composition root may carry it nested
 * instead, so both are accepted here — in the one place that knows both — rather
 * than in each route that has to catch it.
 */
export function toAuthenticationFailure(error: unknown): never {
  if (isAuthenticationFailure(error)) {
    throw withReason(new Error(error.message, { cause: error }), error.reason);
  }
  // The agent feature's own error carries its reason nested under `failure`,
  // while the api's guard reads it at the top level. An earlier version of this
  // function handled only one of the two and the rejected-token case answered
  // 500 instead of 401, which tells a caller to retry a credential that will
  // never be accepted. Both shapes are accepted here, in the one place that
  // knows both, rather than in each authenticator.
  const nested = readNestedReason(error);
  if (nested !== undefined) {
    throw withReason(
      new Error(error instanceof Error ? error.message : String(error), { cause: error }),
      nested,
    );
  }
  throw error;
}

function readNestedReason(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('failure' in error)) return undefined;
  const failure = (error as { failure: unknown }).failure;
  if (typeof failure !== 'object' || failure === null || !('reason' in failure)) return undefined;
  const reason = (failure as { reason: unknown }).reason;
  return typeof reason === 'string' ? reason : undefined;
}

function withReason(error: Error, reason: string): Error & { reason: string } {
  const annotated = error as Error & { reason: string };
  annotated.reason = reason;
  return annotated;
}

let cached: { gateway: EventGateway; close: () => Promise<void> } | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * The hub has to be the SAME hub every request sees, because a second one would
 * be a second realtime plane with no events in it. The runtime and bus come from
 * `await sharedRuntime()` so they are also the ones the Application API acts through —
 * that is the whole point of the fold, and it is why the gateway no longer opens
 * a pool of its own.
 */
export async function sharedEventGateway(): Promise<EventGateway> {
  if (cached !== undefined) {
    return cached.gateway;
  }
  const { database, runtime, bus } = await sharedRuntime();
  // The authenticator is the one thing here that needs the agent feature, and it
  // is supplied here rather than imported, so this file has no feature import and
  // the removal test can take the feature out without touching it. This function
  // is the composition root for the telemetry plane, which is where the plan says
  // the decision of which features exist belongs.
  const gateway = createEventGateway({
    database,
    runtime,
    bus,
    authenticate: async (request) => {
      const caller = await authenticate(
        { store: new DrizzleCredentialStore(database), now: new Date().toISOString() },
        request as never,
      );
      return { installationId: caller.installationId };
    },
  });
  cached = { gateway, close: () => Promise.resolve() };
  return gateway;
}

/** Releases the hub and the pool. For a graceful shutdown. */
export async function closeSharedEventGateway(): Promise<void> {
  cached?.gateway.close();
  await cached?.close();
  cached = undefined;
}
