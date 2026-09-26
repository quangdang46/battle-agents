import { sql } from 'drizzle-orm';
import { integer, pgView, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  /**
   * When the bounty first became claimable, which is `MIN` and not `MAX`.
   *
   * The payout rail's claim window is measured from this instant, so a sponsor
   * who funds a bounty late must not reopen a claim window that is about to
   * shut. It lives in the view rather than in a reader's aggregate because the
   * alternative — a correlated subquery written by a repository — renders
   * through drizzle as a bare `"id"` inside the subquery, which resolves to the
   * inner table's own primary key and quietly answers null. See
   * packages/db/src/repositories/bounties.ts.
   */
  fundedAt: timestamp('funded_at', { withTimezone: true }),
}).as(sql`
  SELECT b.id AS bounty_id,
         COALESCE(SUM(f.amount_cents), 0)::integer AS funded_cents,
         COUNT(f.id)::integer AS sponsor_count,
         MIN(f.created_at) AS funded_at
  FROM ${bounties} b
  LEFT JOIN ${bountyFunds} f ON f.bounty_id = b.id
  GROUP BY b.id
`);
