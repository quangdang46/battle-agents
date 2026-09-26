import type { GameEvent, StateStore } from '@battle-agents/core';

import { sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { eventLog, featureState } from '../schema/index.js';

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
  readonly #slices = new Map<string, { readonly state: unknown }>();

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
   * `undefined` before the feature's first write, and ONLY then. A `load` that
   * answered "you have no state" for a feature that has written would let it run
   * against an empty account and look like a working product with nothing in it
   * — the failure mode this whole store is built to avoid — so the absent case is
   * a row that was never written rather than a row whose column is null.
   *
   * The shape is one value per feature because `StateStore.load` takes a feature
   * id and no key: the frozen contract has no place for a second one, and a table
   * with a composite key would be inventing an addressing scheme the interface
   * does not have. The battle feature is what needed this, and
   * `schema/feature-state.ts` says what it keeps and why.
   */
  load<S>(feature: string): S | undefined {
    const row = this.#readRow(feature);
    return row === undefined ? undefined : (row.state as S);
  }

  async save<S>(feature: string, state: S): Promise<void> {
    // Insert-or-replace rather than update-then-insert: a feature's first write
    // must not depend on a row it has never seen, and the two-step version has a
    // window in which two first writes collide on the primary key.
    await this.#database
      .insert(featureState)
      .values({ feature, state: state as Record<string, unknown>, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: featureState.feature,
        set: { state: state as Record<string, unknown>, updatedAt: new Date() },
      });
    this.#slices.set(feature, { state });
  }

  /**
   * Reads every feature's slice into the cache, so a restarted process sees the
   * state the previous one left.
   *
   * THIS IS NOT OPTIONAL FOR A HOST THAT RESTARTS, and the reason is a real
   * failure it prevents. `StateStore.load` is synchronous in the frozen contract,
   * which is the right call — a contract only one store can satisfy is not a
   * contract — and it leaves this class unable to await a query. So the database
   * read happens here, once, where awaiting is allowed, and `load` answers from
   * the cache afterwards.
   *
   * Without it, a process that started fresh would answer `undefined` for a
   * feature that had durable state, and the battle feature's session-to-agent map
   * would come back empty: the arena gate would stop gating and no battle won
   * since the restart would emit a reward event, because the agent a session
   * belonged to is looked up rather than trusted from a caller. The composition
   * root must await this at startup.
   */
  async prime(): Promise<void> {
    const rows = await this.#database.select().from(featureState);
    this.#slices.clear();
    for (const row of rows) {
      this.#slices.set(row.feature, { state: row.state });
    }
  }

  /** The cache, and only the cache. See `prime` for why this cannot query. */
  #readRow(feature: string): { readonly state: unknown } | undefined {
    return this.#slices.get(feature);
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
