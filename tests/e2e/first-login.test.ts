import {
  agents,
  closeDatabasePool,
  createDatabase,
  installations,
  sessions,
  users,
  type Database,
} from '@battle-agents/db';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootstrapGameAccount } from '../../apps/web/src/auth/bootstrap.js';
import { hello } from '@battle-agents/agent';
import { DrizzleSessionRepository } from '@battle-agents/db';

/**
 * The M0 smoke, and the last stage `pnpm test:m0` reports red on.
 *
 * Plan section 1101 is precise about what this may assert: a GitHub login, a
 * users row, an EMPTY agent list, an agent HELLO creating a session, and a
 * second login showing the SAME user and the SAME agents. Bounty claims and
 * replay rendering are M2 and M4, and asserting them here is what made the gate
 * impossible to pass before those milestones existed.
 *
 * The OAuth round trip is stubbed, deliberately. A live GitHub redirect cannot
 * run in CI and a test that depends on one is a test that is skipped, not one
 * that passes — and a skipped smoke reads as a green smoke in every report that
 * only counts failures. What is exercised for real is everything downstream of
 * "a human is signed in": the account bootstrap, the agent list, the session
 * handshake and the second login. Local development is still expected to try
 * the real flow, because the stub cannot tell you the callback URL is wrong.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const AT = '2026-09-24T12:00:00.000Z';

let pool: Pool;
let database: Database;
const createdUserIds: string[] = [];

/** A distinct GitHub identity per test, so runs never collide. */
function aHuman(label: string) {
  const githubId = `e2e-${label}-${Math.random().toString(36).slice(2)}`;
  return { authUserId: `auth-${githubId}`, githubId, login: githubId, avatarUrl: null };
}

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await database.delete(users).where(eq(users.id, userId));
  }
  await closeDatabasePool(pool);
});

async function remove(userId: string): Promise<void> {
  await database.delete(users).where(eq(users.id, userId));
  const at = createdUserIds.indexOf(userId);
  if (at !== -1) {
    createdUserIds.splice(at, 1);
  }
}

async function agentsOf(ownerId: string): Promise<readonly { id: string; name: string }[]> {
  return database
    .select({ id: agents.id, name: agents.name })
    .from(agents)
    .where(eq(agents.userId, ownerId));
}

async function sessionsOf(agentId: string): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::integer` })
    .from(sessions)
    .where(eq(sessions.agentId, agentId));
  return row?.total ?? 0;
}

describe('the M0 smoke: sign in, be yourself, come back', () => {
  it('creates a game account on first login, with no characters', async () => {
    const human = aHuman('first');
    const account = await bootstrapGameAccount(database, human);

    createdUserIds.push(account.id);
    expect(account.created).toBe(true);
    expect(await agentsOf(account.id)).toEqual([]);
  });

  it('shows the SAME user and the SAME empty list when they sign in again', async () => {
    // The assertion that matters. "Logout then login shows the same user" is the
    // whole identity model in one line: if the second login minted a new
    // account, every character, every session and every battle history would
    // have belonged to somebody who no longer exists.
    const human = aHuman('again');
    const first = await bootstrapGameAccount(database, human);
    const second = await bootstrapGameAccount(database, human);

    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(await agentsOf(second.id)).toEqual([]);
  });

  it('leaves two different people as two different accounts', async () => {
    const one = await bootstrapGameAccount(database, aHuman('person-one'));
    const other = await bootstrapGameAccount(database, aHuman('person-two'));
    createdUserIds.push(one.id, other.id);

    expect(one.id).not.toBe(other.id);
  });

  it('registers a character and gives it a session, which survives a re-login', async () => {
    const human = aHuman('session');
    const account = await bootstrapGameAccount(database, human);
    createdUserIds.push(account.id);

    const [agent] = await database
      .insert(agents)
      .values({ userId: account.id, name: 'CodeKnight', harness: 'claude' })
      .returning();
    const installationKey = `e2e-install-${human.githubId}`;

    const repository = new DrizzleSessionRepository(database);
    // Through the schema rather than raw SQL, so a renamed column fails this
    // test instead of quietly testing nothing.
    await database
      .insert(installations)
      .values({ userId: account.id, installationKey })
      .onConflictDoNothing();
    const created = await hello(repository, {
      installationKey,
      ownerId: account.id,
      agentName: 'CodeKnight',
      harness: 'claude',
      projectKey: undefined,
      now: AT,
    });

    expect(created.resumed).toBe(false);
    expect(await sessionsOf(agent?.id ?? '')).toBe(1);

    // Sign out and back in: the account, the character and the session are the
    // same ones, not new ones with new ids.
    const back = await bootstrapGameAccount(database, human);
    expect(back.id).toBe(account.id);
    expect((await agentsOf(back.id)).map((each) => each.name)).toEqual(['CodeKnight']);
    expect(await sessionsOf(agent?.id ?? '')).toBe(1);
  });

  it('leaves no trace behind, so the smoke can run twice in a row', async () => {
    // The smoke runs on every commit. If it left rows behind, the second run
    // would fail on data the first run wrote, and the gate would stop being a
    // gate and become a coin toss.
    const human = aHuman('idempotent');
    const account = await bootstrapGameAccount(database, human);
    createdUserIds.push(account.id);
    const [alsoCreated] = await database
      .insert(users)
      .values({ githubId: `${human.githubId}-twin`, login: human.login })
      .returning();

    await remove(account.id);
    await remove(alsoCreated?.id ?? '');

    const rows = await database.execute<{ total: number }>(
      sql`SELECT count(*)::integer AS total FROM users WHERE github_id LIKE ${`${human.githubId}%`}`,
    );
    const found = (rows.rows?.[0]?.total ?? 0) as number;
    expect(found).toBe(0);
  });
});
