import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { agents, users } from '../platform.js';

/**
 * The guild feature's tables. M6.
 *
 * ── The decision this file exists to make ───────────────────────────────────
 *
 * A guild has a treasury, a treasury funds a bounty, a bounty pays a member and
 * a guild tally counts wins. Four things touch money or score, and the failure
 * mode is a number that used to be right. This repository has already solved
 * the hard version of that once, and the solution is visible one file over:
 * `bounties` has NO `amount_cents` column, `bounty_funds` has the rows, and
 * `db:verify` FAILS THE BUILD if the scalar is ever added back
 * (`checkMoneyIsIntegerCents`). The comment on `bounty_funding_totals` says
 * why — a stored total drifts the moment a second funder arrives, and then the
 * leaderboard is a number nobody can reconstruct.
 *
 * So: `guilds` has no balance column, and `checkNoCachedGuildTotals` fails the
 * build if one appears. The balance is `SUM(contributions) - SUM(commitments)`
 * over `guild_treasury_entries`, exposed as a view for the same reason the
 * bounty's is. A guild's standing is `COUNT` over `guild_work_log`, so the
 * tally, the quest progress and the number in the log are the same number read
 * three ways.
 *
 * ── Why the treasury has two kinds rather than a signed amount ─────────────
 *
 * A `contribution` is money a person has said they are putting in, and a
 * `commitment` is money a guild has earmarked for one bounty. Collapsing them
 * into a `+amount`/`-amount` column is smaller and it is worse: a negative
 * contribution is not a contribution, and a CHECK that has to read a sign to
 * tell the two apart is a CHECK whose meaning is in the sign. Two kinds, a
 * CHECK that names which columns each requires, and a view that subtracts.
 *
 * ── Why there is no foreign key to `bounties` ───────────────────────────────
 *
 * Not an oversight, and not the `messages.guild_id` shrug. `bounty_funds`
 * references `bounties`, but `bounty_funds` IS the bounty feature's table, and
 * §12.1 makes every feature removable. A guild row that must point at a
 * surviving `bounties` row makes removing the bounty feature — which is a thing
 * `scripts/removal-test.sh` does on every run — a decision about guild data. A
 * commitment to a bounty that is no longer here is a dangling reference, and
 * that is the correct reading: the guild earmarked money for work nobody
 * finished. The alternative, `onDelete: 'set null'`, would silently rewrite it
 * into a contribution-shaped hole, which is a lie about who was owed what.
 */

/** The two things a treasury row can be. Neither is a payment. */
export const GUILD_TREASURY_KINDS = ['contribution', 'commitment'] as const;
export type GuildTreasuryKind = (typeof GUILD_TREASURY_KINDS)[number];

/**
 * The four team roles §10.2 takes from TFT.
 *
 * A copy rather than an import, for the reason `PAYOUT_INTENT_STATES` in
 * bounty.ts gives: infrastructure may not import the layer that consumes it, so
 * the two agree on the spelling and the composition root is where that agreement
 * belongs. `tests/unit/guild-role-signal-durability.test.ts` reads BOTH this
 * list and the feature's, which is the check a shared import cannot give for
 * free.
 *
 * The CHECK below is the reason the list is written down at all. A row naming a
 * role this build cannot classify is a claim about a character's behaviour that
 * no reader can resolve, so the database is where a fifth value is turned away.
 */
export const GUILD_ROLES = ['researcher', 'coder', 'tester', 'reviewer'] as const;

/**
 * The same four names, typed.
 *
 * Exported so the Drizzle repository can type a row it reads without importing
 * the feature that classifies it — infrastructure may not import the layer that
 * consumes it, so the two copies agree by spelling and the composition root is
 * where that agreement is checked. `tests/unit/guild-role-signal-durability.test.ts`
 * reads both lists, which is the check a shared import could not give for free.
 */
export type GuildRole = (typeof GUILD_ROLES)[number];

export const guilds = pgTable(
  'guilds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lowercased by the feature, so the unique index is case-blind. */
    name: text('name').notNull(),
    /** The short handle. Same rule, and bounded so it fits a badge. */
    tag: text('tag').notNull(),
    /**
     * The agent that created the guild, and `set null` when it leaves the game.
     *
     * A guild outliving its founder is the normal case rather than an edge: a
     * character is deleted when its owner withdraws it, and a guild whose only
     * record of who started it is that row would otherwise be deleted with it.
     */
    foundedByAgentId: uuid('founded_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('guilds_name_key').on(table.name),
    uniqueIndex('guilds_tag_key').on(table.tag),
    check('guilds_name_not_empty', sql`length(trim(${table.name})) > 0`),
    check('guilds_tag_not_empty', sql`length(trim(${table.tag})) > 0`),
    check('guilds_tag_bounded', sql`length(${table.tag}) <= 32`),
    // The unique indexes are only case-blind if the stored value is folded, and
    // a second guild called "Foo" beside "foo" is two guilds that render
    // identically. The feature folds before it writes; this is the check that
    // says so rather than trusting it.
    check('guilds_name_folded', sql`${table.name} = lower(${table.name})`),
    check('guilds_tag_folded', sql`${table.tag} = lower(${table.tag})`),
  ],
);

export const guildMembers = pgTable(
  'guild_members',
  {
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.agentId], name: 'guild_members_pk' }),
    // The ACL's hot path: "which guilds is this agent in". A PK on
    // (guild_id, agent_id) cannot answer it, so this index is what stops the
    // authorization decision being a table scan.
    index('guild_members_agent_id_idx').on(table.agentId),
  ],
);

/**
 * One row per outcome a guild has counted.
 *
 * This is the guild's single ledger, and three things read it: a quest's
 * progress, the weekly tally, and the dedup that stops a re-delivered GitHub
 * merge being counted twice. Merging the three is why the table exists rather
 * than three tables that would each want their own copy of "what this guild
 * finished".
 *
 * UNIQUE on (guild_id, bounty_id) and not on bounty_id alone, because the
 * dedup question is "has THIS guild counted it", and an agent may belong to
 * more than one guild — so a second guild counting the same bounty is a correct
 * answer rather than a duplicate. A bounty has one claim and therefore one
 * agent, but a guild is a membership question and this file does not get to
 * decide the answer to it.
 *
 * There is no `progress` column anywhere in this feature. Progress is
 * `COUNT(*) FILTER (repository = <the quest's scope>)` against this table, so
 * the number a quest shows and the number a reader can count are the same
 * number.
 */
export const guildWorkLog = pgTable(
  'guild_work_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    /** The outcome. No foreign key; see the header on why there is none. */
    bountyId: uuid('bounty_id').notNull(),
    /** `owner/name`, as the outcome reported it, so a quest can scope on it. */
    repository: text('repository').notNull(),
    /** The event this row was evidence of, kept so a reader can trace it. */
    sourceType: text('source_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('guild_work_log_guild_id_bounty_id_key').on(table.guildId, table.bountyId),
    // The tally's only query: this guild's work inside a window, oldest first.
    index('guild_work_log_guild_id_occurred_at_idx').on(table.guildId, table.occurredAt),
    check('guild_work_log_repository_not_empty', sql`length(trim(${table.repository})) > 0`),
    check('guild_work_log_source_type_not_empty', sql`length(trim(${table.sourceType})) > 0`),
  ],
);

export const guildTreasuryEntries = pgTable(
  'guild_treasury_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: GUILD_TREASURY_KINDS }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    /**
     * A contribution names the PERSON whose money it is.
     *
     * `restrict` rather than `set null`, for the reason `bounty_funds` uses it:
     * this row is the only record that somebody said they were putting money in,
     * and a cascade that nulls the name leaves a contribution belonging to
     * nobody, which reads as a corrupt balance rather than a departed account.
     */
    contributorUserId: uuid('contributor_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    /**
     * A commitment names the bounty it is earmarked for. No foreign key; see
     * the header.
     */
    bountyId: uuid('bounty_id'),
    /**
     * Which member of the guild made the call, so a commitment is attributable
     * to an agent and not only to a guild.
     */
    committedByAgentId: uuid('committed_by_agent_id').references(() => agents.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('guild_treasury_entries_guild_id_idx').on(table.guildId),
    // Positive, not non-negative. A zero-cent commitment is not a commitment and
    // a negative one is a withdrawal, which is not a thing this table records —
    // a member who wants their money back removes nothing here, because nothing
    // was ever taken. See NO_MONEY_WAS_TAKEN in the feature.
    check('guild_treasury_entries_amount_cents_positive', sql`${table.amountCents} > 0`),
    // The shape rule, as a CHECK rather than a convention. Exactly one of the
    // two pairings, so a row cannot be half a contribution and half a
    // commitment, which is the state no reader would know how to total.
    check(
      'guild_treasury_entries_shape_known',
      sql`(
        ${table.kind} = 'contribution'
        AND ${table.contributorUserId} IS NOT NULL
        AND ${table.bountyId} IS NULL
      ) OR (
        ${table.kind} = 'commitment'
        AND ${table.contributorUserId} IS NULL
        AND ${table.bountyId} IS NOT NULL
      )`,
    ),
    // One earmark per bounty per guild, so a retry cannot double-commit and a
    // retry is a thing a caller will do after a timeout it cannot distinguish
    // from success. Partial, because two contributions for the same bounty must
    // both be allowed — a guild can be topped up by several members.
    uniqueIndex('guild_treasury_entries_guild_id_bounty_id_key')
      .on(table.guildId, table.bountyId)
      .where(sql`${table.kind} = 'commitment'`),
  ],
);

/**
 * A guild quest: "fix 10 issues in project X".
 *
 * NO `progress` column. The count is `guild_work_log` filtered to this quest's
 * scope and start instant, so the number a quest renders and the number a
 * reader counts are the same one, and lowering a goal cannot leave a counter
 * ahead of the work.
 *
 * `completedAt` is the exception, and it is a fact rather than a total: it
 * records WHEN the goal was first met, which a count cannot answer. It is
 * written by exactly one statement and read by exactly one summary builder, the
 * arrangement `bounties.merged_at` already uses for the same reason.
 */
export const guildQuests = pgTable(
  'guild_quests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: uuid('guild_id')
      .notNull()
      .references(() => guilds.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** `owner/name`, or null for a quest about any repository. */
    repository: text('repository'),
    goal: integer('goal').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('guild_quests_guild_id_idx').on(table.guildId),
    check('guild_quests_title_not_empty', sql`length(trim(${table.title})) > 0`),
    check('guild_quests_goal_positive', sql`${table.goal} > 0`),
    check(
      'guild_quests_completed_at_ordered',
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.createdAt}`,
    ),
  ],
);

/**
 * One row per observed behaviour that is evidence of a role.
 *
 * §10.2 is explicit that a role comes from BEHAVIOUR and never from a model
 * name, and the part that is easy to skip is what "behaviour" has to mean. The
 * durable record of what an agent did is `event_log`, and an event only reaches
 * it if its type is in `PERSISTED_EVENT_TYPES` or in the `persistedEvents` of an
 * installed feature. A role read off a bus-only event is a claim that cannot be
 * re-derived, so this table is the guild's own durable projection of the
 * trail — a SECOND READER of the same records, not a second tracking system.
 *
 * Every row keeps `sourceType` and `sourceKey` so a reader can name the fact
 * behind a role, and `sourceKey` is what makes the projection idempotent: a
 * re-delivered merge arrives twice and must not make an agent look twice as
 * methodical.
 *
 * There is no `guild_agent_roles` table. A stored role would be a cached
 * projection with no evidence beside it, and it would look exactly like the
 * self-declared label §10.2 forbids.
 */
export const guildRoleSignals = pgTable(
  'guild_role_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    role: text('role', { enum: GUILD_ROLES }).notNull(),
    weight: integer('weight').notNull(),
    sourceType: text('source_type').notNull(),
    sourceKey: text('source_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('guild_role_signals_agent_id_source_key_key').on(table.agentId, table.sourceKey),
    index('guild_role_signals_agent_id_idx').on(table.agentId),
    check('guild_role_signals_weight_positive', sql`${table.weight} > 0`),
    check(
      'guild_role_signals_role_known',
      sql`${table.role} IN ('researcher', 'coder', 'tester', 'reviewer')`,
    ),
  ],
);

/**
 * A guild's money, derived from the rows that make it up.
 *
 * A view rather than a column, for the reason the header gives, and the same
 * shape as `bounty_funding_totals`: the number is always correct instead of
 * being right until the second funder arrives.
 *
 * `balance_cents` is allowed to be negative, and that is not a hole in the
 * model. It is the honest reading of a guild that has earmarked more than its
 * members have recorded putting in, and the feature refuses a commitment that
 * would cause it rather than pretending the two cannot happen. A CHECK here
 * would make the ledger refuse to record a state a reader must be able to see.
 */
export const guildTreasuryBalances = pgView('guild_treasury_balances', {
  guildId: uuid('guild_id').notNull(),
  contributedCents: integer('contributed_cents').notNull(),
  committedCents: integer('committed_cents').notNull(),
  balanceCents: integer('balance_cents').notNull(),
  entryCount: integer('entry_count').notNull(),
}).as(sql`
  SELECT g.id AS guild_id,
         COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'contribution'), 0)::integer
           AS contributed_cents,
         COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'commitment'), 0)::integer
           AS committed_cents,
         (COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'contribution'), 0)
           - COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'commitment'), 0))::integer
           AS balance_cents,
         COUNT(e.id)::integer AS entry_count
  FROM ${guilds} g
  LEFT JOIN ${guildTreasuryEntries} e ON e.guild_id = g.id
  GROUP BY g.id
`);
