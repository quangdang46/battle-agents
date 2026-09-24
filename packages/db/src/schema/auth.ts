import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Better Auth's own tables: human identity, nothing else.
 *
 * These are separate from `users` on purpose, and the separation is the whole
 * point of plan section 38. `user` here is the login Better Auth manages; the
 * `users` row in platform.ts is the game account, created on first login and
 * linked by GitHub id. A human signing in does not thereby become a character,
 * and a character's history does not belong to a session cookie.
 *
 * The names are Better Auth's defaults (singular) because the adapter looks
 * them up by name. Renaming them for tidiness is the kind of change that costs
 * an afternoon of "why is nobody logging in".
 */

function createdAt() {
  return timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
}

export const authUser = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('user_email_unique').on(table.email)],
);

export const authSession = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    /** The cookie value, stored in the clear: it is a lookup key, not a password. */
    token: text('token').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_id_idx').on(table.userId),
  ],
);

/**
 * OAuth accounts: one row per provider a human has linked.
 *
 * The token columns here are the provider's own OAuth tokens, held by Better
 * Auth for the human's login and never read by anything else in this system.
 * They are plaintext because that is the provider contract Better Auth
 * implements; scripts/check-schema-hygiene.sh carries an explicit, named
 * exemption for exactly these columns rather than being quietly pointed
 * somewhere else, so a NEW credential-shaped column added beside them still
 * fails the gate.
 */
export const authAccount = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId)],
);

export const authVerification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** The adapter's schema map, keyed by the names Better Auth looks up. */
export const betterAuthSchema = {
  user: authUser,
  session: authSession,
  account: authAccount,
  verification: authVerification,
};
