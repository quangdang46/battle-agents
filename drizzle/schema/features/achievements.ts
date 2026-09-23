import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { agents } from '../platform.js';

export const achievements = pgTable(
  'achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('achievements_agent_id_code_unique').on(table.agentId, table.code)],
);
