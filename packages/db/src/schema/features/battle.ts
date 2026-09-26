import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { sessions } from '../platform.js';
import { bounties } from './bounty.js';

/**
 * A battle, and who is in it.
 *
 * TWO THINGS IN THIS FILE ARE LOAD-BEARING AND BOTH ARE ASSERTED ELSEWHERE, so
 * the comments here point at the checks rather than restating them.
 *
 * 1. A PARTICIPANT IS A SESSION, NEVER AN AGENT. `battle_participants` is keyed
 *    (battle_id, session_id) and its foreign key points at `sessions`. Plan
 *    section 3.1 names the anti-pattern — "Battle -> Claude vs Codex" is wrong,
 *    because the same Claude fights two battles in two sessions; Battle#918 is
 *    Claude/Session#241 against Codex/Session#552.
 *    `db:verify.ts:checkBattleParticipantIdentity` fails the build if an
 *    `agent_id` column ever appears on this table or the key changes, so the
 *    invariant is a gate rather than a convention.
 *
 * 2. THE WINNER IS A FLAG ON THE PARTICIPANT, NOT A COLUMN ON THE BATTLE. A
 *    shared win has two winners, and a `winner_session_id` column can hold one,
 *    so a column and a flag would be two sources for one fact free to disagree —
 *    the same shape as the `bounties.amount_cents` scalar `db:verify.ts` already
 *    refuses. `winner_session_id` was here and is gone; a battle's winners are
 *    the rows where `won` is true, which cannot contradict the participant list.
 *    ba-battle-replay-yjb's brief names the dropped column and should read
 *    `battle_participants.won` instead.
 */

/**
 * The states section 3.2 names, and the ONLY ones this build writes.
 *
 * A CHECK rather than drizzle's `enum` option, because `enum` is a TypeScript
 * type and emits a bare `text` column: a row written by a future build, or by
 * hand, can carry a state this one has never heard of, and nothing in the
 * database would notice. The bounty feature's payout states were handed to their
 * owner in ba-risk-gates-e74 for exactly this reason — a comment claiming a CHECK
 * existed that did not. The check below is real, and the integration suite
 * proves the database refuses the write.
 */
export const BATTLE_STATUSES = ['running', 'paused', 'completed', 'abandoned', 'expired'] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

/**
 * The published rubric, as this package holds it.
 *
 * `Record<string, number>` rather than a union of criterion names, for the reason
 * `AgentSkills` is: this package may not import the feature that owns that
 * vocabulary. A CHECK that the five sum to one is NOT written here, and that is
 * deliberate rather than an oversight — a fixed list of criterion names in
 * infrastructure would be a second copy of the taxonomy the feature owns, and a
 * database constraint cannot tell a rubric of 0.9/0.1/0/0/0 from a typo. The
 * feature validates it on the way in, which is the layer that knows the names.
 */
export type BattleWeights = Record<string, number>;

export const battles = pgTable(
  'battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * The mode, as a plain string with no enum and no CHECK.
     *
     * Same decision `bounties.mode` makes and for the reason its own comment
     * gives: the mode taxonomy belongs to ba-bounty-modes-tiers-seasons-62l, and
     * a closed list written here would be a second copy of it. The feature needs
     * a stored value and two yes/no questions (how many fighters, how a tie
     * resolves) and answers both fail-closed for a value it does not recognise.
     */
    mode: text('mode').notNull(),
    bountyId: uuid('bounty_id').references(() => bounties.id, { onDelete: 'set null' }),
    /**
     * The rubric, frozen onto the battle at creation.
     *
     * NOT NULL because every battle this feature creates carries one: a
     * published rubric is the fairness property of section 17.4, and a nullable
     * column would let a battle exist with no rubric at all — which is the one
     * state the feature's own read path has to paper over with a default. Making
     * it not null moves that fallback out of the storage layer, where it cannot
     * be reached by a row written outside the feature.
     */
    weightsJson: jsonb('weights_json').$type<BattleWeights>().notNull(),
    status: text('status', { enum: BATTLE_STATUSES }).notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /**
     * When a disconnect paused the battle, and the instant that pause runs out.
     *
     * Two columns rather than one because they answer different questions and a
     * reader needs both: "how long has this been waiting" and "how long has it
     * got left". Deriving one from the other on every read is arithmetic in
     * every reader, and the grace period is a number the wiring supplies — the
     * same fifteen minutes everywhere, and this feature never writes a constant.
     */
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    resumeDeadline: timestamp('resume_deadline', { withTimezone: true }),
    /**
     * The battle timeline, built by ba-battle-replay-yjb from the activity log
     * and the judge's per-criterion events. Left nullable and untouched: the
     * column is where that bead writes, and a battle that has not been replayed
     * has no timeline rather than an empty one.
     */
    replayJson: jsonb('replay_json').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('battles_bounty_id_idx').on(table.bountyId),
    index('battles_status_idx').on(table.status),
    // The sweep asks "which paused battles are past their window" on every tick,
    // and without this it is a sequential scan of every battle ever opened.
    index('battles_resume_deadline_idx').on(table.resumeDeadline),
    // Not a comment claiming a constraint that does not exist: this one is here,
    // and the integration suite proves the database refuses the other five.
    check(
      'battles_status_known',
      sql`${table.status} IN ('running', 'paused', 'completed', 'abandoned', 'expired')`,
    ),
    // A paused battle with no deadline is a battle nothing can ever abandon: the
    // sweep asks `resume_deadline <= now`, and a null never compares true. This
    // is the same shape as `sessions_disconnected_has_ended_at`, and for the same
    // reason — a row that is neither resumable nor ever abandoned is invisible.
    check(
      'battles_paused_has_resume_deadline',
      sql`${table.status} <> 'paused'::text OR ${table.resumeDeadline} IS NOT NULL`,
    ),
    check(
      'battles_finished_has_finished_at',
      sql`${table.status} NOT IN ('completed', 'abandoned', 'expired') OR ${table.finishedAt} IS NOT NULL`,
    ),
  ],
);

export const battleParticipants = pgTable(
  'battle_participants',
  {
    battleId: uuid('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    // A SESSION. See the header. `db:verify.ts` fails if this ever names agents.
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    /**
     * When a VALID submission was accepted, and null until one is.
     *
     * This is the fact the speed tiebreak reads, so it is stored rather than
     * inferred from a score: a participant that scored 0.8 three times and
     * finally submitted is not the participant that submitted first, and a
     * tiebreak that cannot tell them apart is a tiebreak on a score.
     */
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Whether this participant won. A shared win sets it on more than one row. */
    won: integer('won').notNull().default(0),
    /**
     * The per-criterion results and the weighted total, as the judge produced
     * them: `{ total, contributions: [{ criterion, weight, score, weighted }] }`.
     *
     * The PARTS are stored alongside the total, not just the total, because a
     * number that cannot be decomposed cannot be shown to the agent that lost to
     * it. What the criteria are named is the feature's vocabulary, so the column
     * stays `Record<string, unknown>` for the same reason `AgentSkills` is a
     * `Record<string, number>`.
     */
    scoreJson: jsonb('score_json').$type<Record<string, unknown>>(),
  },
  (table) => [
    primaryKey({ columns: [table.battleId, table.sessionId], name: 'battle_participants_pk' }),
    index('battle_participants_session_id_idx').on(table.sessionId),
    // `battlesForSession` walks this index, and it is the query the Battle#918
    // invariant runs on: one session can be in several battles, and it is looked
    // up by SESSION rather than by anything an agent shares between them.
    index('battle_participants_battle_won_idx').on(table.battleId, table.won),
    // A boolean would be the obvious type and is deliberately not used: the
    // column is `integer` so the constraint below can be a CHECK the database
    // enforces, and a value that is neither 0 nor 1 is a stored row no reader
    // could interpret.
    check('battle_participants_won_is_zero_or_one', sql`${table.won} IN (0, 1)`),
    check(
      'battle_participants_won_has_a_score',
      sql`${table.won} = 0 OR ${table.scoreJson} IS NOT NULL`,
    ),
  ],
);
