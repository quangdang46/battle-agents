import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';

import { agents } from '../platform.js';

export type AgentSkills = Record<string, number>;

/** One recorded award, kept so a reclassification is a re-read. */
export interface ProgressionSignal {
  readonly kind: string;
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
    // The award history is a list, so it cannot live in skills_json: that column
    // is Record<string, number>, and a list is not a number. Without its own
    // column the feature's promise that a reclassification is a re-read rather
    // than a guess cannot be kept once the process restarts.
    historyJson: jsonb('history_json').$type<ProgressionSignal[]>().notNull().default([]),
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
