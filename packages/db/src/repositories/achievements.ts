import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { achievements, eventLog } from '../schema/index.js';
import type { Database } from '../client.js';

/**
 * Achievements against the real database.
 *
 * It does not import the achievements feature, because infrastructure may not
 * depend on the layers that consume it. The shapes below are the ones that
 * feature's `AchievementsRepository` port declares, and the place a caller
 * hands this to the feature is where the two are checked against each other.
 *
 * There is no migration behind this file. The `achievements` table is plan
 * section 21's, and section 21 was implemented whole in the initial migration:
 * id, an agent reference, a code and an instant, with a UNIQUE index on
 * (agent_id, code). That index is not a convenience here — it is the mutex, and
 * `award` is built on it.
 */

/** One recorded outcome, in the shape the feature's port declares. */
export interface RecordedOutcomeRow {
  readonly sequence: number;
  readonly type: string;
  readonly sessionId: string | null;
  readonly actorId: string | null;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** One badge. The code is the string the column holds, not a union restated. */
export interface AwardedAchievementRow {
  readonly agentId: string;
  readonly code: string;
  readonly awardedAt: string;
}

export interface AchievementsStore {
  history(agentId: string, eventTypes: readonly string[]): Promise<readonly RecordedOutcomeRow[]>;
  list(agentId: string): Promise<readonly AwardedAchievementRow[]>;
  /**
   * True when this call is the one that recorded the badge. See the port's own
   * doc for why the caller has to ask before it believes anything.
   */
  award(agentId: string, code: string, now: string): Promise<boolean>;
}

/**
 * Which logged events belong to one character.
 *
 * Two shapes reach the log and the predicate has to match both, in the same
 * order the feature's `agentIdOf` applies them, because a rule that counted
 * rows the handler could not see would be a badge awarded on part of the
 * evidence:
 *
 *   - a game's own event names the agent in its payload and sets `actor_id` to
 *     the feature that emitted it (`bounty.completed` arrives with 'bounty',
 *     because a GitHub login is a person and not an agent);
 *   - an adapter's event has no agent in the payload and carries the character
 *     in `actor_id`, because the session resolved the agent and that is the only
 *     field the ingest route fills.
 *
 * One expression rather than two OR'd branches, so "both matched" is not a
 * state the query can be in. `jsonb_typeof` rather than `->>` alone, because
 * `->>'agentId'` on a non-string value returns its text form and a numeric id
 * would then match the string that spells it — the feature refuses a non-string
 * outright and this has to refuse it the same way or the two sides disagree on
 * a row neither of them is talking about. A row with no actor and no agent in
 * its payload falls out as NULL, which excludes it: nobody can be placed, and
 * placing it anyway is a guess.
 *
 * This is a scan over the rows of the requested types rather than an index
 * lookup: `event_log` is indexed on (type, occurred_at), and the type filter is
 * the selective half. The cost is bounded by how much one agent's history of
 * these four types has grown, which is what the retention policy is for. A
 * denormalised agent column would make it an index, at the price of a second
 * copy of the attribution this table is the record of.
 */
function attributedTo(agentId: string) {
  return sql`coalesce(
    case
      when jsonb_typeof(${eventLog.payload}->'agentId') = 'string'
        and ${eventLog.payload}->>'agentId' <> ''
      then ${eventLog.payload}->>'agentId'
    end,
    ${eventLog.actorId}
  ) = ${agentId}`;
}

export class DrizzleAchievementsRepository implements AchievementsStore {
  constructor(private readonly database: Database) {}

  async history(
    agentId: string,
    eventTypes: readonly string[],
  ): Promise<readonly RecordedOutcomeRow[]> {
    if (eventTypes.length === 0) {
      // An empty IN list is a query the database is entitled to refuse, and a
      // rule with no evidence types is not a reason to fail a projection.
      return [];
    }
    const rows = await this.database
      .select({
        sequence: eventLog.id,
        type: eventLog.type,
        sessionId: eventLog.sessionId,
        actorId: eventLog.actorId,
        payload: eventLog.payload,
        occurredAt: eventLog.occurredAt,
      })
      .from(eventLog)
      .where(and(inArray(eventLog.type, [...eventTypes]), attributedTo(agentId)))
      // By the log's own sequence rather than its timestamp. Two events in the
      // same millisecond have no order between their timestamps, and a
      // projection whose replay resolves ties differently is a projection that
      // cannot be reproduced.
      .orderBy(asc(eventLog.id));

    return rows.map((row) => ({
      sequence: row.sequence,
      type: row.type,
      sessionId: row.sessionId,
      actorId: row.actorId,
      // Null becomes an empty object rather than passing a null through: every
      // reader here indexes into the payload, and a rule's condition has to be
      // able to say "this payload does not carry that field" without first
      // proving the payload exists.
      payload: (row.payload ?? {}) as Record<string, unknown>,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }

  async list(agentId: string): Promise<readonly AwardedAchievementRow[]> {
    const rows = await this.database
      .select({
        agentId: achievements.agentId,
        code: achievements.code,
        awardedAt: achievements.awardedAt,
      })
      .from(achievements)
      .where(eq(achievements.agentId, agentId))
      // Oldest award first, with the code breaking a tie so two badges granted
      // in the same millisecond come back in the same order every time.
      .orderBy(asc(achievements.awardedAt), asc(achievements.code));

    return rows.map((row) => ({
      agentId: row.agentId,
      code: row.code,
      awardedAt: row.awardedAt.toISOString(),
    }));
  }

  /**
   * The unique index is the mutex, not a check afterwards.
   *
   * Read-then-insert would leave two callers both finding no row and both
   * inserting, and the loser's insert is the double award. Letting the database
   * refuse the second one means the answer and the record are written in the
   * same statement, so there is no window in which both callers believe they
   * were first — which is the whole reason the bus can deliver twice and a
   * backfill can re-derive every rule without anything being granted twice.
   *
   * `doNothing` rather than `doUpdate`: an update would succeed and report a
   * row, which would read as "I granted this one" and put the double award
   * back with an extra step.
   */
  async award(agentId: string, code: string, now: string): Promise<boolean> {
    const inserted = await this.database
      .insert(achievements)
      .values({ agentId, code, awardedAt: new Date(now) })
      .onConflictDoNothing()
      .returning({ id: achievements.id });

    return inserted.length > 0;
  }
}
