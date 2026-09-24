import { asc, desc, eq, lt, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { eventLog } from '../schema/index.js';

/**
 * The activity log in Postgres.
 *
 * It does not import the activity feature, because infrastructure may not
 * depend on the layers that consume it. The shapes below are the ones that
 * feature's `ActivityLog` port declares, and the place a caller hands this to
 * the feature is where the two are checked against each other.
 *
 * Ordering is by the sequence column rather than by timestamp. Two events
 * emitted in the same millisecond are ordered by the order they were appended,
 * and a replay that reorders them is a replay of something that never happened.
 * Timestamps are what a reader sees; the sequence is what the order means.
 */

/** One row, in the shape the activity log port declares. */
export interface ActivityLogEntry {
  readonly sequence: number;
  readonly type: string;
  readonly actorId: string | null;
  readonly sessionId: string | null;
  readonly causationId: string | null;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
}

export interface ActivityTrailQuery {
  readonly sessionId: string;
  readonly limit?: number;
}

export class DrizzleActivityLog {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async trail(query: ActivityTrailQuery): Promise<readonly ActivityLogEntry[]> {
    const rows = await this.#database
      .select()
      .from(eventLog)
      .where(eq(eventLog.sessionId, query.sessionId))
      .orderBy(asc(eventLog.id))
      .limit(query.limit ?? DEFAULT_TRAIL_LIMIT);
    return rows.map(toEntry);
  }

  async recent(sessionId: string, limit: number): Promise<readonly ActivityLogEntry[]> {
    const rows = await this.#database
      .select()
      .from(eventLog)
      .where(eq(eventLog.sessionId, sessionId))
      .orderBy(desc(eventLog.id))
      .limit(limit);
    return rows.map(toEntry);
  }

  /**
   * Deletes what has aged out, and reports how many rows it removed.
   *
   * Returns the count so a caller can tell "nothing was old" from "the delete
   * matched nothing", which look identical otherwise and mean very different
   * things to somebody watching a storage budget. The window is a parameter
   * rather than a constant here so the feature's policy decides it and this
   * only knows how to apply one.
   */
  async prune(before: string): Promise<number> {
    const deleted = await this.#database
      .delete(eventLog)
      .where(lt(eventLog.occurredAt, new Date(before)))
      .returning({ id: eventLog.id });
    return deleted.length;
  }

  /** How many rows the log holds, which is the number a storage budget cares about. */
  async size(): Promise<number> {
    const [row] = await this.#database
      .select({ total: sql<number>`count(*)::integer` })
      .from(eventLog);
    return row?.total ?? 0;
  }
}

/**
 * A cap on a single trail read.
 *
 * Not an optimisation: an unbounded read of a long-running session is a request
 * that can exhaust memory, and the sessions this log serves are the ones a
 * coding agent leaves running overnight.
 */
export const DEFAULT_TRAIL_LIMIT = 5_000;

type EventLogRow = typeof eventLog.$inferSelect;

function toEntry(row: EventLogRow): ActivityLogEntry {
  return {
    sequence: row.id,
    type: row.type,
    actorId: row.actorId,
    sessionId: row.sessionId,
    causationId: row.causationId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    occurredAt: row.occurredAt.toISOString(),
  };
}
