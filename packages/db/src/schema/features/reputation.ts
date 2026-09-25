import { check, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
  ],
);
