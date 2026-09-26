import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { agents, users } from '../platform.js';
import { quests } from './quest.js';

export const BOUNTY_STATUSES = [
  'open',
  'claimed',
  'submitted',
  'completed',
  'expired',
  'disputed',
] as const;
export type BountyStatus = (typeof BOUNTY_STATUSES)[number];

/**
 * The payout states a recorded intent passes through.
 *
 * A copy rather than an import from the feature: infrastructure may not import
 * the layer that consumes it, so the two agree on the spelling and the
 * composition root is where that agreement is checked. Adding a fourth state
 * here without adding it to the feature's machine would fail the CHECK below
 * rather than leave a row the feature cannot read.
 */
export const PAYOUT_INTENT_STATES = ['funded', 'pending', 'recorded'] as const;
export type PayoutIntentState = (typeof PAYOUT_INTENT_STATES)[number];

/**
 * The only mode that exists, in the only place that holds money-shaped values.
 *
 * A CHECK rather than an enum type, so a second mode added anywhere else is
 * refused by the database instead of being read by a feature that has no case
 * for it. The reason this cannot become `real` is in
 * packages/features/bounty/src/payout.ts: the platform does not hold, route or
 * process money, and that guarantee is only worth something if the storage
 * layer cannot hold a value that says it does.
 */
export const PAYOUT_INTENT_MODES = ['intent-only'] as const;

export const DEFAULT_CURRENCY = 'USD';

/**
 * The mode a bounty resolves work under.
 *
 * Free text with a default and no CHECK, deliberately, and the reason is a bead
 * boundary rather than a preference: the mode and tier taxonomy belongs to
 * ba-bounty-modes-tiers-seasons-62l, and a CHECK constraint here would be this
 * bead defining half that enum — which the bead's own brief calls a duplication
 * bug. What the lifecycle needs is one question, "is claiming exclusive", and
 * the feature answers it for every value it does not recognise rather than
 * assuming a vocabulary only half of which exists.
 */
export const DEFAULT_BOUNTY_MODE = 'race';

export const bounties = pgTable(
  'bounties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questId: uuid('quest_id').references(() => quests.id, { onDelete: 'set null' }),
    repoOwner: text('repo_owner').notNull(),
    repoName: text('repo_name').notNull(),
    issueNumber: integer('issue_number').notNull(),
    issueUrl: text('issue_url').notNull(),
    currency: text('currency').notNull().default(DEFAULT_CURRENCY),
    requirements: jsonb('requirements').$type<readonly string[]>().notNull().default([]),
    status: text('status', { enum: BOUNTY_STATUSES }).notNull().default('open'),
    mode: text('mode').notNull().default(DEFAULT_BOUNTY_MODE),
    sponsorUserId: uuid('sponsor_user_id').references(() => users.id, { onDelete: 'set null' }),
    claimedAgentId: uuid('claimed_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    prUrl: text('pr_url'),
    /**
     * The GitHub ACCOUNT that merged the pull request.
     *
     * A person, and the column is named to keep saying so. It is not an agent
     * and there is no foreign key to `agents`, because the agent that did the
     * work is `claimed_agent_id` and the two are routinely different: a human
     * opens the pull request an agent wrote, or presses merge on someone else's
     * behalf. A single identity column here is how reputation lands on the
     * wrong party.
     */
    mergedBy: text('merged_by'),
    /**
     * When the merge completed the bounty, and when an expiry ended it.
     *
     * Both exist because the payout rail's dispute windows are measured from
     * them, and a window measured from a guessed instant is a deadline the
     * platform invented. They are written by exactly one statement each and read
     * by exactly one summary builder, which is what makes them load-bearing
     * rather than audit decoration.
     */
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('bounties_quest_id_idx').on(table.questId),
    index('bounties_status_idx').on(table.status),
    index('bounties_claimed_agent_id_idx').on(table.claimedAgentId),
    // The merge correlation is an exact lookup on this URL and happens on every
    // merged pull request the platform is told about, so it is an index rather
    // than a scan. Not UNIQUE: two bounties may name the same pull request (a
    // maintainer can open one PR against two issues), and which one completes is
    // decided by the feature reading the row, not by the database refusing it.
    index('bounties_pr_url_idx').on(table.prUrl),
    check('bounties_issue_number_positive', sql`${table.issueNumber} > 0`),
  ],
);

export const bountyFunds = pgTable(
  'bounty_funds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bountyId: uuid('bounty_id')
      .notNull()
      .references(() => bounties.id, { onDelete: 'cascade' }),
    sponsorUserId: uuid('sponsor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('bounty_funds_bounty_id_idx').on(table.bountyId),
    index('bounty_funds_sponsor_user_id_idx').on(table.sponsorUserId),
    check('bounty_funds_amount_cents_non_negative', sql`${table.amountCents} >= 0`),
  ],
);

/**
 * One row per bounty: the current payout intent.
 *
 * UNIQUE on `bounty_id` rather than a history table, and the reason is the one
 * the payout rail cares about most. There is no state in which the platform
 * holds money, so there is nothing to keep a history OF — the three facts are
 * funded, pending and recorded, and the row moves through them. A ledger of
 * every version would be a table whose only reader is an auditor who has to
 * decide which row is current, and that decision is exactly the ambiguity the
 * single-row design removes.
 *
 * `reported_by` is NOT NULL because every state is somebody's claim, including
 * "funded". An unattributed intent is the one row the audit trail cannot use,
 * and payout.ts refuses to build one.
 */
export const payoutIntents = pgTable(
  'payout_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bountyId: uuid('bounty_id')
      .notNull()
      .references(() => bounties.id, { onDelete: 'cascade' }),
    /** A stated target in integer cents. Never a transferred amount. */
    amountCents: integer('amount_cents').notNull(),
    state: text('state', { enum: PAYOUT_INTENT_STATES }).notNull(),
    mode: text('mode', { enum: PAYOUT_INTENT_MODES }).notNull().default('intent-only'),
    /** ISO instant. Postgres renders it back as an instant. */
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    reportedBy: text('reported_by').notNull(),
  },
  (table) => [
    uniqueIndex('payout_intents_bounty_id_key').on(table.bountyId),
    check('payout_intents_amount_cents_non_negative', sql`${table.amountCents} >= 0`),
    check('payout_intents_reported_by_not_empty', sql`length(trim(${table.reportedBy})) > 0`),
    // The constraint the comment above this table has claimed since it was
    // written, and which did not exist. `state` is a CHECK rather than a pgEnum
    // for the reason the comment gives, and a pgEnum would have been the honest
    // way to get it — so the gap was a CHECK that was described and never
    // written, which is the failure this repository keeps meeting. A payout
    // intent in a state the feature cannot read is a row nothing can process.
    check('payout_intents_state_known', sql`${table.state} IN ('funded', 'pending', 'recorded')`),
  ],
);
