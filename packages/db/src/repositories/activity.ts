import { asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

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

/**
 * The subject of a scoped read: a payload tag, a set of sessions, or both.
 *
 * Declared here rather than imported from the activity feature, for the reason
 * this file carries no feature import at all — infrastructure may not depend on
 * the layers that consume it. The shapes match the port's `ScopedTimelineQuery`,
 * and `apps/web` checks the two against each other at the one call site where
 * the feature and this implementation are both in scope.
 */
export interface ActivityScopeQuery {
  readonly tagged?: { readonly key: string; readonly value: string };
  readonly sessionIds?: readonly string[];
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
   * The rows belonging to one subject: a payload tag, a set of sessions, or both.
   *
   * The `tagged` half reads `payload->>key`, which is a sequential scan. That is
   * a real cost and it is paid once per replay rather than once per beat, which
   * is the trade the design makes: a per-beat alternative would need an index
   * per event type, and the number of event types is a thing features add. The
   * session half below is indexed, so the second read of a battle's timeline —
   * the one that carries the bulk of the rows — is the cheap one.
   *
   * THE EMPTY CASE IS DECIDED HERE, not by leaving the WHERE clause bare. A
   * query with no tag and no sessions has no predicate, and a predicate-free
   * read of this table is the audit trail in its entirety, handed to a caller
   * that asked for nothing. It returns an empty list instead.
   */
  async scopedTimeline(query: ActivityScopeQuery): Promise<readonly ActivityLogEntry[]> {
    const sessionIds = [...(query.sessionIds ?? [])].filter((id) => id.length > 0);
    const predicates: SQL[] = [];

    if (query.tagged !== undefined && query.tagged.value.length > 0) {
      // The key is a bound parameter, not interpolated text: `->>` takes a text
      // operand, so the database parses it, and a caller cannot turn a tag name
      // into SQL by passing one.
      predicates.push(sql`${eventLog.payload}->>${query.tagged.key} = ${query.tagged.value}`);
    }
    if (sessionIds.length > 0) {
      predicates.push(inArray(eventLog.sessionId, sessionIds));
    }
    if (predicates.length === 0) return [];

    // OR, not AND, and the difference is the whole method. A battle's timeline
    // is the union of the rows the battle stamped with its own id and the rows
    // its fighters' runs produced; a fighter's test run carries a session and no
    // battle tag, and the battle's opening beat carries the tag and no session.
    // ANDing the two returned the intersection, which is the empty set in every
    // real case — a query that looked right and answered nothing.
    const rows = await this.#database
      .select()
      .from(eventLog)
      .where(or(...predicates))
      .orderBy(asc(eventLog.id))
      .limit(query.limit ?? DEFAULT_TRAIL_LIMIT);
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
