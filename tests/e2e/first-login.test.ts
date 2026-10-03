import { agents, closeDatabasePool, createDatabase, users, type Database } from '@battle-agents/db';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootstrapGameAccount } from '../../apps/web/src/auth/bootstrap.js';

/**
 * The M0 smoke, and the last stage `pnpm test:m0` reports red on.
 *
 * ## What it asserts, and what it stopped asserting
 *
 * It used to assert four things: a GitHub login creates a `users` row, that user
 * starts with an EMPTY agent list, an agent HELLO creates a session, and a second
 * login shows the SAME user and the SAME agents.
 *
 * The session handshake is gone with the feature that owned it — `hello` was an
 * action in the deleted agent package, and no action is registered in this build
 * — so there is nothing to drive. The three assertions that remain are the ones
 * about a contract that still holds: a human session is never agent identity,
 * and a first login is idempotent. Those are not the leftovers that happened to
 * be easy; they are the boundary this repository has already got wrong once.
 *
 * ## Why the OAuth round trip is stubbed
 *
 * A live GitHub redirect cannot run in CI, and a test that depends on one is a
 * test that is skipped, not one that passes — and a skipped smoke reads as a
 * green smoke in every report that only counts failures. What is exercised for
 * real is everything downstream of "a human is signed in": the account
 * bootstrap and the agent list it does not create. Local development is still
 * expected to try the real flow, because the stub cannot tell you the callback
 * URL is wrong.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;

let pool: Pool;
let database: Database;
const createdUserIds: string[] = [];

/** The GitHub-shaped payload a Better Auth callback hands over. */
function signedInHuman(githubId: string): {
  authUserId: string;
  githubId: string;
  login: string;
  avatarUrl: string | null;
} {
  return {
    authUserId: `auth-${githubId}`,
    githubId,
    login: `octocat-${githubId}`,
    avatarUrl: null,
  };
}

beforeAll(async () => {
  const url = process.env[DATABASE_URL_VARIABLE];
  if (url === undefined) {
    throw new Error(`${DATABASE_URL_VARIABLE} is not set; the smoke needs a database`);
  }
  pool = new Pool({ connectionString: url, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
});

afterAll(async () => {
  // Scoped to the rows this file created. The delivery-ledger guard exists
  // because a blanket delete here races every other suite against one database,
  // and it is checked on this directory too.
  for (const id of createdUserIds) {
    await database.delete(agents).where(eq(agents.userId, id));
    await database.delete(users).where(eq(users.id, id));
  }
  createdUserIds.length = 0;
  await closeDatabasePool(pool);
});

describe('the M0 smoke: a GitHub login becomes an account, and nothing else', () => {
  it('creates the users row and no agents', async () => {
    const human = signedInHuman('smoke-first-login');
    const account = await bootstrapGameAccount(database, human);

    expect(account.created).toBe(true);
    expect(account.githubId).toBe(human.githubId);
    expect(account.login).toBe(human.login);
    createdUserIds.push(account.id);

    const characters = await database
      .select()
      .from(agents)
      .where(eq(agents.userId, account.id));
    // A human signing in is not a character. An agent row appears when an
    // operator registers one, never because somebody logged in.
    expect(characters).toEqual([]);
  });

  it('returns the SAME account on a second login, and says it was not created', async () => {
    // Idempotence, and the `created` flag a caller uses to decide whether to
    // greet somebody. Getting the flag wrong greets a returning user as new.
    const second = await bootstrapGameAccount(database, signedInHuman('smoke-idempotent'));

    expect(second.created).toBe(true);
    createdUserIds.push(second.id);

    const again = await bootstrapGameAccount(database, signedInHuman('smoke-idempotent'));

    expect(again.created).toBe(false);
    expect(again.id).toBe(second.id);
  });

  it('keeps a person and a character apart at the schema level', async () => {
    // The rule this file exists for: a GitHub OAuth token identifies a PERSON,
    // and `users.user_id` is the only thing linking a character to one. A second
    // login must not produce a second person, and a person must not arrive with
    // a character attached.
    const human = signedInHuman('smoke-identity');
    const first = await bootstrapGameAccount(database, human);
    createdUserIds.push(first.id);
    const second = await bootstrapGameAccount(database, human);

    expect(second.id).toBe(first.id);

    const rows = await database.select().from(users).where(eq(users.githubId, human.githubId));
    expect(rows).toHaveLength(1);
    expect(await database.select().from(agents).where(eq(agents.userId, first.id))).toEqual([]);
  });
});