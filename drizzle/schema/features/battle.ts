import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { sessions } from '../platform.js';
import { bounties } from './bounty.js';

export const BATTLE_MODES = ['speed', 'ranked', 'tournament'] as const;
export type BattleMode = (typeof BATTLE_MODES)[number];

export const BATTLE_STATUSES = ['running', 'finished', 'cancelled'] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

export type BattleWeights = {
  readonly correctness: number;
  readonly tests: number;
  readonly regression: number;
  readonly quality: number;
  readonly efficiency: number;
};

export const battles = pgTable(
  'battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mode: text('mode', { enum: BATTLE_MODES }).notNull(),
    bountyId: uuid('bounty_id').references(() => bounties.id, { onDelete: 'set null' }),
    weightsJson: jsonb('weights_json').$type<BattleWeights>(),
    status: text('status', { enum: BATTLE_STATUSES }).notNull().default('running'),
    winnerSessionId: uuid('winner_session_id').references(() => sessions.id, {
      onDelete: 'set null',
    }),
    replayJson: jsonb('replay_json').$type<Record<string, unknown>>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('battles_bounty_id_idx').on(table.bountyId),
    index('battles_status_idx').on(table.status),
  ],
);

export const battleParticipants = pgTable(
  'battle_participants',
  {
    battleId: uuid('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    scoreJson: jsonb('score_json').$type<Record<string, unknown>>(),
  },
  (table) => [
    primaryKey({ columns: [table.battleId, table.sessionId], name: 'battle_participants_pk' }),
    index('battle_participants_session_id_idx').on(table.sessionId),
  ],
);
