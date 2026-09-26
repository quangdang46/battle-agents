import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { agents } from '../platform.js';

/**
 * Experience per skill, and counts rather than levels on purpose.
 *
 * The level of a skill is a function of its experience and of a curve that lives
 * in the feature, so storing it here would be a second copy of a number the
 * feature can retune. `Record<string, number>` rather than a union of skill
 * names because this package may not import the feature that owns that union,
 * the same rule that makes `build` a text column the adapter narrows.
 */
export type AgentSkills = Record<string, number>;

/**
 * One recorded award, kept so a reclassification is a re-read.
 *
 * `build` is spelled as a string here and narrowed by the adapter, for the same
 * reason the build name is: this package may not import the feature that owns
 * the union. Naming the field `kind` would have matched nothing — the feature's
 * signal carries the build it implies, not a category of its own.
 */
export interface ProgressionSignal {
  readonly build: string;
  readonly weight: number;
  readonly at: string;
}

export const agentStats = pgTable(
  'agent_stats',
  {
    agentId: uuid('agent_id')
      .primaryKey()
      .references(() => agents.id, { onDelete: 'cascade' }),
    prsOpened: integer('prs_opened').notNull().default(0),
    prsMerged: integer('prs_merged').notNull().default(0),
    prsRejected: integer('prs_rejected').notNull().default(0),
    testsPassed: integer('tests_passed').notNull().default(0),
    testsFailed: integer('tests_failed').notNull().default(0),
    recoveries: integer('recoveries').notNull().default(0),
    battlesWon: integer('battles_won').notNull().default(0),
    battlesLost: integer('battles_lost').notNull().default(0),
    skillsJson: jsonb('skills_json').$type<AgentSkills>().notNull().default({}),
    // When this progression record last changed. It was read time before, which
    // made `updatedAt` mean "now" and returned a different value on every read of
    // an unchanged row — so nothing could tell a stale character sheet from a
    // current one, and the instant the feature set on save was discarded by the
    // next read. Defaulted rather than nullable so a row created by `ensure`
    // has a real one before anything has been awarded.
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // The award history is a list, so it cannot live in skills_json: that column
    // is Record<string, number>, and a list is not a number. Without its own
    // column the feature's promise that a reclassification is a re-read rather
    // than a guess cannot be kept once the process restarts.
    historyJson: jsonb('history_json').$type<ProgressionSignal[]>().notNull().default([]),
    // The classified build, stored rather than recomputed on read. The feature
    // classifies from the history on every award and saves the result, so the
    // value here is always the freshest one; recomputing it in the adapter
    // would mean importing the classifier, and infrastructure may not depend on
    // the layers that consume it.
    build: text('build').notNull().default('generalist'),
  },
  (table) => [
    check('agent_stats_prs_opened_non_negative', sql`${table.prsOpened} >= 0`),
    check('agent_stats_prs_merged_non_negative', sql`${table.prsMerged} >= 0`),
    check('agent_stats_prs_rejected_non_negative', sql`${table.prsRejected} >= 0`),
    check('agent_stats_tests_passed_non_negative', sql`${table.testsPassed} >= 0`),
    check('agent_stats_tests_failed_non_negative', sql`${table.testsFailed} >= 0`),
    check('agent_stats_recoveries_non_negative', sql`${table.recoveries} >= 0`),
    check('agent_stats_battles_won_non_negative', sql`${table.battlesWon} >= 0`),
    check('agent_stats_battles_lost_non_negative', sql`${table.battlesLost} >= 0`),
  ],
);
