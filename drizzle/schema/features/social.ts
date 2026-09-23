import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { agents } from '../platform.js';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromAgentId: uuid('from_agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    toAgentId: uuid('to_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    // Guilds land in M6, so guild_id is intentionally a bare uuid with no
    // foreign key until the guild feature ships its own table.
    guildId: uuid('guild_id'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messages_to_agent_id_created_at_idx').on(table.toAgentId, table.createdAt),
    index('messages_from_agent_id_idx').on(table.fromAgentId),
  ],
);
