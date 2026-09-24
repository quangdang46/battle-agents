import { sql } from 'drizzle-orm';
import { integer, pgView, uuid } from 'drizzle-orm/pg-core';

import { bounties, bountyFunds } from './features/bounty.js';

/**
 * A bounty's total is the sum of its funding rows. Exposing it as a view keeps
 * the number always correct instead of storing a scalar that drifts the moment a
 * second sponsor funds the bounty.
 */
export const bountyFundingTotals = pgView('bounty_funding_totals', {
  bountyId: uuid('bounty_id').notNull(),
  fundedCents: integer('funded_cents').notNull(),
  sponsorCount: integer('sponsor_count').notNull(),
}).as(sql`
  SELECT b.id AS bounty_id,
         COALESCE(SUM(f.amount_cents), 0)::integer AS funded_cents,
         COUNT(f.id)::integer AS sponsor_count
  FROM ${bounties} b
  LEFT JOIN ${bountyFunds} f ON f.bounty_id = b.id
  GROUP BY b.id
`);
