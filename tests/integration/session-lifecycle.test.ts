import { eq } from 'drizzle-orm';

import { hello, sweepStaleSessions, UnknownAgentError } from '@battle-agents/agent';
import {
  agents,
  closeDatabasePool,
  createDatabase,
  DrizzleSessionRepository,
  DrizzleSessionSweeper,
  installations,
  sessions,
  users,
  type Database,
} from '@battle-agents/db';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The session lifecycle, against a live Postgres.
 *
 * The unit tests decide the rules with an in-memory store. These check that
 * the queries behind them are the ones the rules assume — in particular that a
 * resumable session is matched on agent, installation AND project, which is
 * three predicates, and that a session the handshake cannot see is not resumed
 * even when it looks resumable.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const MINUTE_MS = 60_000;
const HEARTBEAT_TIMEOUT_MS = 5 * MINUTE_MS;
const RESUME_GRACE_MS = 15 * MINUTE_MS;

let pool: Pool;
let database: Database;
let repository: DrizzleSessionRepository;
let sweeper: DrizzleSessionSweeper;
const createdUserIds: string[] = [];

const NOW = '2026-09-24T12:00:00.000Z';

function at(minutesFromNow: number): string {
  return new Date(Date.parse(NOW) + minutesFromNow * MINUTE_MS).toISOString();
}

async function createUser(): Promise<string> {
  const githubId = `${randomUUID()}-session`;
  const [created] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  if (created === undefined) {
    throw new Error('could not create a user');
  }
  createdUserIds.push(created.id);
  return created.id;
}

async function createAgent(ownerId: string, name: string): Promise<string> {
  const [created] = await database
    .insert(agents)
    .values({ userId: ownerId, name, harness: 'claude' })
    .returning({ id: agents.id });
  if (created === undefined) {
    throw new Error('could not create an agent');
  }
  return created.id;
}

function helloRequest(ownerId: string, overrides: Record<string, unknown> = {}) {
  return {
    installationKey: `install-${randomUUID()}`,
    ownerId,
    agentName: 'CodeKnight',
    harness: 'claude',
    projectKey: 'battle-agents',
    now: NOW,
    ...overrides,
  };
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
  repository = new DrizzleSessionRepository(database);
  sweeper = new DrizzleSessionSweeper(database);
});

afterAll(async () => {
  for (const userId of createdUserIds) {
    await database.delete(users).where(eq(users.id, userId));
  }
  await closeDatabasePool(pool);
});

describe('the HELLO handshake against Postgres', () => {
  it('refuses to connect to a character that does not exist', async () => {
    const ownerId = await createUser();
    await expect(hello(repository, helloRequest(ownerId))).rejects.toBeInstanceOf(
      UnknownAgentError,
    );
  });

  it('starts a session for a known character', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');

    const result = await hello(repository, helloRequest(ownerId));

    expect(result.resumed).toBe(false);
    const [row] = await database.select().from(sessions).where(eq(sessions.id, result.sessionId));
    expect(row?.status).toBe('active');
    // The session is keyed on the character, never on the human.
    expect(row?.agentId).toBe(result.agentId);
  });

  it('resumes the same session when the same character reconnects', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');
    const request = helloRequest(ownerId);

    const first = await hello(repository, request);
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-2)) })
      .where(eq(sessions.id, first.sessionId));

    const second = await hello(repository, { ...request, now: at(0) });

    expect(second).toMatchObject({ sessionId: first.sessionId, resumed: true });
  });

  it('starts a new session once the grace window has passed', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');
    const request = helloRequest(ownerId);

    const first = await hello(repository, request);
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-40)) })
      .where(eq(sessions.id, first.sessionId));

    const second = await hello(repository, { ...request, now: at(0) });

    expect(second.resumed).toBe(false);
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('keeps each project resumable session to itself', async () => {
    // The match is on agent + installation AND project. A character working in
    // two repositories at once must not have one run resume the other — and
    // coming back to the first project must still find the first session, not
    // be blocked by the second one existing.
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');
    const request = helloRequest(ownerId);

    const inFirst = await hello(repository, request);
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-2)) })
      .where(eq(sessions.id, inFirst.sessionId));

    const inOther = await hello(repository, { ...request, projectKey: 'some-other-repo' });
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-1)) })
      .where(eq(sessions.id, inOther.sessionId));

    // Both are disconnected and both are inside the window. Each handshake must
    // pick the one belonging to its own project.
    const backInFirst = await hello(repository, { ...request, now: at(0) });
    const backInOther = await hello(repository, {
      ...request,
      projectKey: 'some-other-repo',
    });

    expect(backInFirst).toMatchObject({ sessionId: inFirst.sessionId, resumed: true });
    expect(backInOther).toMatchObject({ sessionId: inOther.sessionId, resumed: true });
  });

  it('does not resume across a different installation', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');
    const request = helloRequest(ownerId);

    const first = await hello(repository, request);
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-2)) })
      .where(eq(sessions.id, first.sessionId));

    const otherMachine = await hello(repository, {
      ...request,
      installationKey: `install-${randomUUID()}`,
    });

    expect(otherMachine.resumed).toBe(false);
  });

  it('does not resume another user’s session', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await createAgent(owner, 'CodeKnight');
    await createAgent(stranger, 'CodeKnight');
    const request = helloRequest(owner);

    const first = await hello(repository, request);
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-2)) })
      .where(eq(sessions.id, first.sessionId));

    const theirs = await hello(repository, helloRequest(stranger));

    expect(theirs.resumed).toBe(false);
    expect(theirs.agentId).not.toBe(first.agentId);
  });
});

describe('the sweep against Postgres', () => {
  it('disconnects a stale session and leaves a live one alone', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');

    const quiet = await hello(repository, helloRequest(ownerId));
    const talking = await hello(repository, helloRequest(ownerId, { projectKey: 'other-repo' }));

    await database
      .update(sessions)
      .set({ lastHeartbeatAt: new Date(at(-30)) })
      .where(eq(sessions.id, quiet.sessionId));
    await database
      .update(sessions)
      .set({ lastHeartbeatAt: new Date(at(0)) })
      .where(eq(sessions.id, talking.sessionId));

    const result = await sweepStaleSessions(sweeper, {
      now: NOW,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      resumeGraceMs: RESUME_GRACE_MS,
    });

    expect(result.disconnected).toContain(quiet.sessionId);
    expect(result.disconnected).not.toContain(talking.sessionId);

    const [row] = await database.select().from(sessions).where(eq(sessions.id, quiet.sessionId));
    expect(row?.status).toBe('disconnected');
  });

  it('abandons a disconnected session only after its window', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');

    const stale = await hello(repository, helloRequest(ownerId));
    const recent = await hello(repository, helloRequest(ownerId, { projectKey: 'other-repo' }));

    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-60)) })
      .where(eq(sessions.id, stale.sessionId));
    await database
      .update(sessions)
      .set({ status: 'disconnected', endedAt: new Date(at(-1)) })
      .where(eq(sessions.id, recent.sessionId));

    const result = await sweepStaleSessions(sweeper, {
      now: NOW,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      resumeGraceMs: RESUME_GRACE_MS,
    });

    expect(result.abandoned).toContain(stale.sessionId);
    expect(result.abandoned).not.toContain(recent.sessionId);
  });

  it('leaves an abandoned session alone on the next pass', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');
    const session = await hello(repository, helloRequest(ownerId));
    await database
      .update(sessions)
      .set({ status: 'abandoned', endedAt: new Date(at(-60)) })
      .where(eq(sessions.id, session.sessionId));

    const result = await sweepStaleSessions(sweeper, {
      now: NOW,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      resumeGraceMs: RESUME_GRACE_MS,
    });

    expect(result.abandoned).not.toContain(session.sessionId);
  });
});

describe('the installation record', () => {
  it('is reused rather than duplicated when the same machine reconnects', async () => {
    const ownerId = await createUser();
    await createAgent(ownerId, 'CodeKnight');
    const installationKey = `install-${randomUUID()}`;

    const first = await hello(repository, helloRequest(ownerId, { installationKey }));
    const second = await hello(repository, helloRequest(ownerId, { installationKey }));

    expect(second.installationId).toBe(first.installationId);
    const rows = await database
      .select()
      .from(installations)
      .where(eq(installations.installationKey, installationKey));
    expect(rows).toHaveLength(1);
  });
});
