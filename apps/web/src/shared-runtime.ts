import { createInMemoryEventBus } from '@battle-agents/core';
import type { EventBus, Runtime } from '@battle-agents/core';
import {
  closeDatabasePool,
  createDatabase,
  createDatabasePool,
  DrizzleAgentRepository,
  DrizzleBattleRepository,
  DrizzleAchievementsRepository,
  DrizzleBountyRepository,
  DrizzlePayoutIntentStore,
  DrizzleProgressionRepository,
  DrizzleQuestRepository,
  DrizzleReputationRepository,
  DrizzleSessionRepository,
  DrizzleSocialRepository,
  DrizzleStateStore,
} from '@battle-agents/db';
import type { Database } from '@battle-agents/db';

import { createGameRuntime } from './composition.js';

/**
 * The one runtime, the one bus, the one pool.
 *
 * This file exists because there used to be two of each. `routes.ts` built a
 * runtime for the Application API and `event-gateway.ts` built another for the
 * telemetry plane, each with its own `createInMemoryEventBus()`. The two never
 * met, so an event emitted by a game action — a quest claimed, an agent levelled,
 * a reputation changed — was published to a bus nobody was listening to, and the
 * public stream carried telemetry and nothing else.
 *
 * The gateway's own doc comment had already recorded this as a deliberate
 * deferral, and named the condition: folding the runtimes together "belongs
 * with the work that makes the act path a first-class publisher." MCP is the
 * third surface that acts, so the condition is met.
 *
 * The bus is the part that has to be shared. Two runtimes over one database is
 * a real inefficiency; two BUSES is a correctness bug, because the realtime
 * path and the action path were publishing into different rooms and each looked
 * complete from the inside.
 *
 * Composition stays in `composition.ts`. This file wires repositories to it and
 * deliberately holds no feature name, so `scripts/removal-test.sh` still has
 * exactly one place to strip a feature from.
 */

export interface SharedRuntime {
  readonly database: Database;
  readonly runtime: Runtime;
  readonly bus: EventBus;
}

let cached: { shared: SharedRuntime; close: () => Promise<void> } | undefined;

/**
 * Built on first use, never at module scope.
 *
 * The Next.js route adapters import their gateway at module scope, and a
 * module-scope pool would be opened while `next build` is still walking the
 * tree rather than when a request arrives.
 */
export async function sharedRuntime(): Promise<SharedRuntime> {
  if (cached !== undefined) {
    return cached.shared;
  }
  const pool = createDatabasePool();
  const database = createDatabase(pool);
  const bus = createInMemoryEventBus();
  const sessionRepository = new DrizzleSessionRepository(database);

  const store = new DrizzleStateStore(database);
  // Awaited, never fired and forgotten. StateStore.load is synchronous in the
  // frozen contract, so the cache can only be filled where awaiting is allowed,
  // and a prime that races the first request answers `undefined` for a feature
  // with durable state. For battle that is not a degraded read: the arena gate
  // stops gating and no win since the restart emits a reward, because the agent
  // a session belongs to is looked up rather than trusted from a caller.
  await store.prime();

  const runtime = createGameRuntime({
    store,
    bus,
    agentRepository: new DrizzleAgentRepository(database),
    questRepository: new DrizzleQuestRepository(database),
    sessionRepository,
    progressionRepository: new DrizzleProgressionRepository(database),
    reputationRepository: new DrizzleReputationRepository(database),
    socialRepository: new DrizzleSocialRepository(database),
    bountyRepository: new DrizzleBountyRepository(database),
    payoutIntentStore: new DrizzlePayoutIntentStore(database),
    battleStore: new DrizzleBattleRepository(database),
    achievementsRepository: new DrizzleAchievementsRepository(database),
  });

  cached = { shared: { database, runtime, bus }, close: () => closeDatabasePool(pool) };
  return cached.shared;
}

/** Releases the pool. For a graceful shutdown, not for per-request cleanup. */
export async function closeSharedRuntime(): Promise<void> {
  await cached?.close();
  cached = undefined;
}
