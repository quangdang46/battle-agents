import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { projects } from '../platform.js';

export const QUEST_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

export const DEFAULT_QUEST_DIFFICULTY = 1;
export const DEFAULT_QUEST_XP_REWARD = 100;

export const quests = pgTable(
  'quests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body'),
    difficulty: integer('difficulty').notNull().default(DEFAULT_QUEST_DIFFICULTY),
    xpReward: integer('xp_reward').notNull().default(DEFAULT_QUEST_XP_REWARD),
    status: text('status', { enum: QUEST_STATUSES }).notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('quests_project_id_idx').on(table.projectId),
    index('quests_status_idx').on(table.status),
  ],
);
