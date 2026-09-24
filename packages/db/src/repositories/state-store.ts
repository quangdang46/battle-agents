import type { GameEvent, StateStore } from '@battle-agents/core';

import { sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { eventLog } from '../schema/index.js';

/**
 * The runtime's durable store, backed by the activity log.
 *
 * This is the only path an event takes to the database, and it is deliberately
 * thin: the runtime has already decided whether the event is worth a row before
 * it calls `append`, so this class writes whatever it is handed and applies no
 * policy of its own. A second filter here would make "what gets persisted"
 * depend on which store is installed, which is how a filter gets bypassed by
 * swapping a driver.
 *
 * Core is the one upper layer infrastructure may import — this implements
 * core's interface, and every other layer is off limits.
 */
export class DrizzleStateStore implements StateStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async append(event: GameEvent): Promise<void> {
    const { sessionId, payload } = splitSession(event);
    await this.#database.insert(eventLog).values({
      type: event.type,
      actorId: event.actorId,
      sessionId,
      causationId: event.causationId ?? null,
      payload,
      occurredAt: new Date(event.occurredAt),
    });
  }

  /**
   * Per-feature durable state, namespaced by the feature that owns it.
   *
   * Unsupported, and it fails loudly on both halves rather than returning
   * undefined. A `load` that quietly answered "you have no state" would let a
   * feature run against an empty account and look like a working product with
   * nothing in it — the failure mode this whole store is built to avoid. The
   * plan puts per-feature state with the features that own it, so the first
   * feature to need it decides the shape rather than inheriting a guess.
   */
  load<S>(_feature: string): S | undefined {
    throw new Error(
      'DrizzleStateStore.load is not implemented: no feature needs durable ' +
        'per-feature state yet, and the first one to need it should decide the shape.',
    );
  }

  async save<S>(_feature: string, _state: S): Promise<void> {
    throw new Error(
      'DrizzleStateStore.save is not implemented: no feature needs durable ' +
        'per-feature state yet, and the first one to need it should decide the shape.',
    );
  }

  /** How many rows the log holds, which is the number a storage budget cares about. */
  async size(): Promise<number> {
    const [row] = await this.#database
      .select({ total: sql<number>`count(*)::integer` })
      .from(eventLog);
    return row?.total ?? 0;
  }
}

const SESSION_ID_FIELD = 'sessionId';

/**
 * Splits a session id out of an event payload.
 *
 * Core's GameEvent carries a type and a payload, not a session, and a run's
 * event knows its own session inside the payload. `session_id` is a real column
 * with an index on it and a replay filters by it, so the value is lifted into the
 * column rather than left buried in the payload: still readable, but not by the
 * query that matters, which makes a session's trail come back empty while the
 * data sits there looking present.
 *
 * An event with no session in its payload is stored with a null session, which is
 * correct for platform-level events like a level-up that outlive any run.
 */
function splitSession(event: GameEvent): {
  sessionId: string | null;
  payload: Record<string, unknown>;
} {
  const payload: Record<string, unknown> =
    typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload)
      ? { ...(event.payload as Record<string, unknown>) }
      : { value: event.payload };

  const candidate = payload[SESSION_ID_FIELD];
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return { sessionId: null, payload };
  }
  delete payload[SESSION_ID_FIELD];
  return { sessionId: candidate, payload };
}
