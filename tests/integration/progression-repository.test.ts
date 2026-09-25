import {
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleProgressionRepository,
  users,
} from '@battle-agents/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Pool } from 'pg';

/**
 * The progression adapter against a real database.
 *
 * The record spans two tables — xp and level on `agents`, the build and the
 * award history on `agent_stats` — so the thing worth testing is that a save
 * followed by a find returns the same thing, across both. A repository that
 * wrote to one and read from the other would pass every unit test and lose an
 * agent's progress on the first restart.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';

let pool: Pool;
let repository: DrizzleProgressionRepository;
let agentId: string;

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: 4 });
  const database = createDatabase(pool);
  repository = new DrizzleProgressionRepository(database);
  const agentRepository = new DrizzleAgentRepository(database);
  const agent = await agentRepository.create(
    {
      ownerId: await ownerFor(database),
      name: `progression-${Math.random().toString(36).slice(2)}`,
      harness: 'claude',
    },
    '2026-09-25T00:00:00.000Z',
  );
  agentId = agent.id;
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/** A user to own the agent, since agents.user_id is NOT NULL. */
async function ownerFor(database: ReturnType<typeof createDatabase>): Promise<string> {
  const githubId = `progression-owner-${Math.random().toString(36).slice(2)}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  return owner?.id ?? '';
}

describe('the progression repository, over a real database', () => {
  it('reports nothing for an agent with no progress', async () => {
    // A missing record and a zero record are different situations, and only the
    // store can tell them apart.
    await expect(repository.find('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
  });

  it('round-trips a save across both tables', async () => {
    const now = '2026-09-25T00:00:00.000Z';
    const created = await repository.ensure({ agentId }, now);
    expect(created.xp).toBe(0);
    expect(created.level).toBe(1);

    await repository.save({
      agentId,
      xp: 340,
      level: 4,
      build: 'builder',
      history: [{ build: 'builder', weight: 2, at: now }],
      updatedAt: now,
    });

    const read = await repository.find(agentId);
    expect(read?.xp).toBe(340);
    expect(read?.level).toBe(4);
    expect(read?.build).toBe('builder');
    // The history is the reason the column exists. A feature that says a
    // reclassification is a re-read has to be able to read it back.
    expect(read?.history).toEqual([{ build: 'builder', weight: 2, at: now }]);
  });

  it('is idempotent for two awards arriving together', async () => {
    const now = '2026-09-25T00:01:00.000Z';
    const [first, second] = await Promise.all([
      repository.ensure({ agentId }, now),
      repository.ensure({ agentId }, now),
    ]);

    // Both outcomes are normal and must be the same record: two events for one
    // agent must not produce two rows, and "first one wins" is the same answer
    // whichever request lost.
    expect(first.agentId).toBe(second.agentId);
    expect(first.xp).toBe(second.xp);
    expect(first.level).toBe(second.level);
  });

  it('refuses to create progress for something that is not an agent', async () => {
    // The foreign key does the refusing, and it does it loudly at the query.
    // The assertion is on that rather than on the repository's own message,
    // because a test that pinned the message would be asserting which of the two
    // guards happened to fire first.
    await expect(
      repository.ensure(
        { agentId: '00000000-0000-0000-0000-000000000000' },
        '2026-09-25T00:02:00.000Z',
      ),
    ).rejects.toThrow();
  });
});
