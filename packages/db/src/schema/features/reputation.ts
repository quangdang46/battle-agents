import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { agents } from '../platform.js';

/**
 * What the reputation feature stores, one row per agent.
 *
 * Two rates are held as scaled integers rather than floats. `acceptance_rate`
 * is basis points, 0..10000, and `review_score` is hundredths, 0..500. A float
 * would be the natural encoding and the wrong one: a trust score that decides
 * bounty tier gating is compared for equality and accumulated, and a float
 * that reads back as 0.7000000000000001 is a trust score that has quietly
 * changed. The feature's own doc says acceptance is HELD rather than derived,
 * because a submission under review moves neither number — a float would move
 * both by rounding.
 */
export const agentReputation = pgTable(
  'agent_reputation',
  {
    agentId: uuid('agent_id')
      .primaryKey()
      .references(() => agents.id, { onDelete: 'cascade' }),
    completed: integer('completed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    /** Share of submitted work accepted, in basis points. 0..10000. */
    acceptanceRate: integer('acceptance_rate').notNull().default(0),
    /** Mean review quality in hundredths, on the 0..5 scale reviewers give. 0..500. */
    reviewScore: integer('review_score').notNull().default(0),
    /** Lifetime earnings in whole cents. Never a float. */
    earnedCents: integer('earned_cents').notNull().default(0),
    /**
     * Outcomes the feature refused to count because the event naming them
     * carried no bounty to be identified by.
     *
     * Denormalised onto the aggregate because the events themselves have no key
     * to be stored under — that is the whole reason they were refused — so
     * there is no row anywhere else for a count to be derived from. It is a
     * diagnostic, not an input to the trust formula, and the loss it can suffer
     * from a concurrent write is a count that is out by one.
     */
    refusedOutcomes: integer('refused_outcomes').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('agent_reputation_agent_unique').on(table.agentId),
    check('agent_reputation_completed_non_negative', sql`${table.completed} >= 0`),
    check('agent_reputation_failed_non_negative', sql`${table.failed} >= 0`),
    check(
      'agent_reputation_acceptance_rate_in_range',
      sql`${table.acceptanceRate} >= 0 AND ${table.acceptanceRate} <= 10000`,
    ),
    check(
      'agent_reputation_review_score_in_range',
      sql`${table.reviewScore} >= 0 AND ${table.reviewScore} <= 500`,
    ),
    check('agent_reputation_earned_cents_non_negative', sql`${table.earnedCents} >= 0`),
    check('agent_reputation_refused_outcomes_non_negative', sql`${table.refusedOutcomes} >= 0`),
  ],
);

/**
 * The two things an outcome can be, as the database holds them.
 *
 * A copy rather than an import from the feature, for the same reason
 * payout_intents' states are a copy: infrastructure may not import the layer
 * that consumes it. Unlike those states, this one is ALSO a CHECK below, so the
 * two copies cannot drift without the database refusing the write — the
 * integration suite proves the refusal rather than asserting it.
 */
export const REPUTATION_OUTCOME_KINDS = ['completed', 'failed'] as const;

/**
 * One row per outcome that has been counted, and the thing that makes a second
 * one recognisable as the same.
 *
 * UNIQUE on (bounty_id, kind) rather than a list of ids on agent_reputation,
 * and the reason is that the list has no upper bound and lives in the row every
 * read of a trust score has to load. This way the hot row stays a fixed width
 * and the evidence grows where growth is free.
 *
 * `kind` is part of the key because one bounty can be resolved and then
 * retracted, and those are two outcomes rather than one. Keying on the bounty
 * alone would make the second one a duplicate and freeze the record at the
 * first telling, which is the one way a dedup key can be worse than none.
 *
 * `agent_id` is NOT part of the key, and `bounty_id` is text with no foreign
 * key to `bounties`. A foreign key would couple two features' tables and would
 * mean deleting a bounty row deletes the evidence that its outcome was counted,
 * at which point a replay of that outcome would count a second time — the exact
 * failure this table exists to prevent, arriving through the cleanup path. The
 * agent is a reference because a record whose agent is gone has nothing left to
 * be a record of; the bounty is an identity, and an identity outlives the row
 * that carried it.
 */
export const reputationOutcomes = pgTable(
  'reputation_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    bountyId: text('bounty_id').notNull(),
    kind: text('kind', { enum: REPUTATION_OUTCOME_KINDS }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('reputation_outcomes_bounty_kind_key').on(table.bountyId, table.kind),
    check('reputation_outcomes_bounty_id_not_empty', sql`length(trim(${table.bountyId})) > 0`),
    check(
      'reputation_outcomes_kind_known',
      sql`${table.kind} IN ('completed', 'failed')`,
    ),
  ],
);
