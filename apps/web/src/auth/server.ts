import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import {
  betterAuthSchema,
  closeDatabasePool,
  createDatabase,
  createDatabasePool,
} from '@battle-agents/db';
import type { Database } from '@battle-agents/db';

/**
 * Better Auth, and nothing else.
 *
 * Plan section 38 is emphatic: this owns human authentication, full stop. Every
 * game concept that creeps into this file is a future extraction cost, because
 * the day an agent token has to be issued through a library that also issues
 * session cookies is the day the two become inseparable.
 *
 * So: no agents, no characters, no sessions of our own, no progression. The
 * `users` row and the `sessions` table this codebase owns are written by
 * features, not here. What this file decides is who is logged in; whether a
 * game account exists for them is bootstrap.ts's question.
 *
 * The agent-token refusal is a test, not a comment: server.test.ts reads this
 * file and fails on any of the words the plan reserves for features. A comment
 * saying "no agents here" is worth exactly as much as the last time somebody
 * added an agent here anyway.
 */

export interface AuthEnvironment {
  readonly secret: string;
  readonly baseUrl: string;
  readonly githubClientId: string;
  readonly githubClientSecret: string;
}

const LOCALHOST_URL = /^https?:\/\/localhost([:/]|$)/i;

/**
 * Reads the auth configuration from the environment, or explains what is wrong.
 *
 * The callback URL is checked rather than passed through, because GitHub
 * matches it strictly and treats 127.0.0.1 and localhost as different origins.
 * That mismatch is the single most likely reason a newcomer's first run fails,
 * and it fails late: the app is up, the OAuth app is registered, the login
 * button works, and then GitHub rejects the callback. An error at startup names
 * both URLs to register and saves the afternoon.
 *
 * DATABASE_URL is deliberately absent from the required set. The db package
 * reads it and already reports a missing value better than this file could, and
 * a field carried here and never read is a field that looks like it owns
 * something it does not.
 */
export function readAuthEnvironment(
  // Not NodeJS.ProcessEnv: Next.js augments that type to REQUIRE NODE_ENV, so
  // every caller and every test would have to supply a variable this function
  // does not read. The few names it actually needs is the honest signature.
  env: Readonly<Record<string, string | undefined>>,
): AuthEnvironment {
  const required = {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim() === '')
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new MissingAuthConfigurationError(missing);
  }

  const baseUrl = required.BETTER_AUTH_URL!;
  if (LOCALHOST_URL.test(baseUrl)) {
    throw new Error(
      [
        `BETTER_AUTH_URL is "${baseUrl}". Use 127.0.0.1 instead.`,
        'GitHub treats localhost and 127.0.0.1 as different origins, so a',
        'localhost callback fails with redirect_uri_mismatch after the app is',
        'already running and the OAuth app is already registered.',
      ].join('\n'),
    );
  }

  return {
    secret: required.BETTER_AUTH_SECRET!,
    baseUrl,
    githubClientId: required.GITHUB_CLIENT_ID!,
    githubClientSecret: required.GITHUB_CLIENT_SECRET!,
  };
}

export class MissingAuthConfigurationError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `auth is not configured: ${missing.join(', ')}.\n` +
        'Copy .env.example to .env and fill in the values. Then register a GitHub\n' +
        'OAuth app with EXACTLY these two URLs, or the login fails with\n' +
        'redirect_uri_mismatch — the most likely first-run failure:\n' +
        '  Homepage URL:        http://127.0.0.1:3000\n' +
        '  Callback URL:        http://127.0.0.1:3000/api/auth/callback/github',
    );
    this.name = 'MissingAuthConfigurationError';
    this.missing = missing;
  }
}

/**
 * Builds the auth instance against a database.
 *
 * The database is a parameter rather than something this opens, so the same
 * instance can be pointed at a pool the process already has. `betterAuth()` is
 * synchronous and does not connect on construction, so calling this at module
 * scope does not open a connection.
 */
export function createAuth(database: Database, environment: AuthEnvironment) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: betterAuthSchema,
    }),
    secret: environment.secret,
    baseURL: environment.baseUrl,
    socialProviders: {
      // Client id and secret and nothing else. Better Auth already knows how to
      // read a GitHub profile, and the moment this config starts reshaping one
      // it is doing the game's job — the users row is created by
      // bootstrapGameAccount in bootstrap.ts, not by an auth callback.
      github: {
        clientId: environment.githubClientId,
        clientSecret: environment.githubClientSecret,
      },
    },
  });
}

let shared: { auth: ReturnType<typeof createAuth>; close: () => Promise<void> } | undefined;

/** The process-wide instance, built on first use. */
export function sharedAuth() {
  if (shared !== undefined) {
    return shared.auth;
  }
  const environment = readAuthEnvironment(process.env);
  const pool = createDatabasePool();
  const database = createDatabase(pool);
  const auth = createAuth(database, environment);
  shared = { auth, close: () => closeDatabasePool(pool) };
  return auth;
}

/** Releases the pool. For a graceful shutdown, not for per-request cleanup. */
export async function closeSharedAuth(): Promise<void> {
  await shared?.close();
  shared = undefined;
}
