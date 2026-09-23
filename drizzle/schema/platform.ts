import { sql } from 'drizzle-orm';
import {
  bigserial,
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

export const AGENT_STATUSES = ['offline', 'online', 'busy', 'disconnected'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const SESSION_STATUSES = ['active', 'ended', 'disconnected', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const MIN_AGENT_LEVEL = 1;

function creationTimestamp() {
  return timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    githubId: text('github_id').notNull(),
    login: text('login').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: creationTimestamp(),
  },
  (table) => [uniqueIndex('users_github_id_unique').on(table.githubId)],
);

export const installations = pgTable(
  'installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    installationKey: text('installation_key').notNull(),
    label: text('label'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: creationTimestamp(),
  },
  (table) => [
    uniqueIndex('installations_installation_key_unique').on(table.installationKey),
    index('installations_user_id_idx').on(table.userId),
  ],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    harness: text('harness').notNull(),
    level: integer('level').notNull().default(1),
    xp: integer('xp').notNull().default(0),
    reputation: integer('reputation').notNull().default(0),
    build: text('build'),
    status: text('status', { enum: AGENT_STATUSES }).notNull().default('offline'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: creationTimestamp(),
  },
  (table) => [
    index('agents_user_id_idx').on(table.userId),
    index('agents_user_id_name_unique').on(table.userId, table.name),
    // A bound parameter would emit `$1`, which raw migration DDL cannot execute.
    check('agents_level_min', sql`${table.level} >= ${sql.raw(String(MIN_AGENT_LEVEL))}`),
    check('agents_xp_non_negative', sql`${table.xp} >= 0`),
    check('agents_reputation_non_negative', sql`${table.reputation} >= 0`),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    repoUrl: text('repo_url'),
    name: text('name').notNull(),
    createdAt: creationTimestamp(),
  },
  (table) => [index('projects_user_id_idx').on(table.userId)],
);

export const agentCredentials = pgTable(
  'agent_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    scopes: jsonb('scopes').$type<readonly string[]>().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: creationTimestamp(),
  },
  (table) => [
    uniqueIndex('agent_credentials_token_hash_unique').on(table.tokenHash),
    index('agent_credentials_installation_id_idx').on(table.installationId),
    index('agent_credentials_agent_id_idx').on(table.agentId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    installationId: uuid('installation_id')
      .notNull()
      .references(() => installations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    harnessSessionRef: text('harness_session_ref'),
    status: text('status', { enum: SESSION_STATUSES }).notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  },
  (table) => [
    index('sessions_agent_id_idx').on(table.agentId),
    index('sessions_installation_id_idx').on(table.installationId),
    index('sessions_status_last_heartbeat_at_idx').on(table.status, table.lastHeartbeatAt),
  ],
);

export const eventLog = pgTable(
  'event_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    actorId: text('actor_id'),
    // The trail must outlive the run that produced it, so the reference is
    // cleared rather than cascading the audit rows away.
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    causationId: text('causation_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('event_log_occurred_at_idx').on(table.occurredAt),
    index('event_log_type_occurred_at_idx').on(table.type, table.occurredAt),
    index('event_log_actor_id_occurred_at_idx').on(table.actorId, table.occurredAt),
    index('event_log_session_id_occurred_at_idx').on(table.sessionId, table.occurredAt),
  ],
);
