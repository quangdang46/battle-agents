import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export const DEFAULT_CURRENCY = 'USD';

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
    sponsorUserId: uuid('sponsor_user_id').references(() => users.id, { onDelete: 'set null' }),
    claimedAgentId: uuid('claimed_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    prUrl: text('pr_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => [
    index('bounties_quest_id_idx').on(table.questId),
    index('bounties_status_idx').on(table.status),
    index('bounties_claimed_agent_id_idx').on(table.claimedAgentId),
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
