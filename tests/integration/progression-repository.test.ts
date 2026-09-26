import {
  agentStats,
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleProgressionRepository,
  eq,
  type ProgressionRow,
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
let database: ReturnType<typeof createDatabase>;
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
  database = createDatabase(pool);
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
      skills: { ...created.skills, coding: 340 },
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

  it('round-trips the skill map, which is the column the independent-skills model needs', async () => {
    // `skills_json` had a writer before the model did, and it wrote `{}` on
    // every award. That was invisible until something read it and now it is the
    // map the whole RuneScape half of progression sits on, so the round trip is
    // asserted here rather than assumed from a unit test that never touched a
    // database.
    const now = '2026-09-25T00:03:00.000Z';
    const current = await repository.find(agentId);
    expect(current).toBeDefined();

    const practised = { ...(current as ProgressionRow).skills, coding: 700, debugging: 300 };
    await repository.save({
      agentId,
      xp: 900,
      level: 3,
      build: 'tester',
      skills: practised,
      history: [{ build: 'tester', weight: 1, at: now }],
      updatedAt: now,
    });

    const read = await repository.find(agentId);
    expect(read?.skills).toEqual(practised);
    // Two keys carried, six still there at zero. A save that wrote only what it
    // was told about would come back as a two-key map, and every consumer would
    // then need to know the difference.
    expect(Object.keys(read?.skills ?? {}).sort()).toEqual([
      'coding',
      'collaboration',
      'debugging',
      'documentation',
      'refactoring',
      'research',
      'security',
      'testing',
    ]);
  });

  it('drops a skill it does not know rather than passing a stranger through', async () => {
    // A row written by a newer build, or corrupted on disk. The feature's own
    // type names eight disciplines and this package may not import that list, so
    // the narrowing here is what keeps an unknown key from arriving as a claim
    // the feature has no way to level.
    await database
      .update(agentStats)
      .set({ skillsJson: { coding: 12, carpentry: 4000 } })
      .where(eq(agentStats.agentId, agentId));

    const read = await repository.find(agentId);
    expect(read?.skills.coding).toBe(12);
    expect(Object.values(read?.skills ?? {})).toEqual([12, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('reports when the record last changed, and only then', async () => {
    // It used to be read time, which meant the same unchanged row answered with
    // a different value on every call and the instant the feature set on save was
    // discarded by the next read. Both halves are asserted: that a save moves it,
    // and that a read which changes nothing does not.
    const before = await repository.find(agentId);
    const settled = before?.updatedAt ?? '';
    expect(settled).not.toBe('');

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const reread = await repository.find(agentId);
    expect(reread?.updatedAt).toBe(settled);

    const later = '2026-09-25T00:05:00.000Z';
    await repository.save({
      agentId,
      xp: 1200,
      level: 3,
      build: 'tester',
      skills: { ...(before as ProgressionRow).skills, testing: 200 },
      history: [{ build: 'tester', weight: 1, at: later }],
      updatedAt: later,
    });

    const moved = await repository.find(agentId);
    expect(moved?.updatedAt).toBe(new Date(later).toISOString());
  });

  it("stamps a new record with the caller's clock rather than the server's", async () => {
    // `ensure` writes the instant the feature supplied. Left on the column
    // default, the row would carry the database's time while everything else in
    // it carries the feature's, and the two are only the same by coincidence —
    // which is exactly the kind of bug that never shows up on a machine whose
    // clock and its database are the same machine.
    const owner = await ownerFor(database);
    const agent = await new DrizzleAgentRepository(database).create(
      { ownerId: owner, name: `stamp-${Math.random().toString(36).slice(2)}`, harness: 'claude' },
      '2026-09-25T00:06:00.000Z',
    );
    const supplied = '2026-01-02T03:04:05.000Z';

    const created = await repository.ensure({ agentId: agent.id }, supplied);

    expect(created.updatedAt).toBe(supplied);
    // Read back through the column, not through the value `ensure` returned, or
    // the assertion would be about a field the method just echoed.
    const [row] = await database
      .select({ updatedAt: agentStats.updatedAt })
      .from(agentStats)
      .where(eq(agentStats.agentId, agent.id))
      .limit(1);
    expect(row?.updatedAt.toISOString()).toBe(new Date(supplied).toISOString());
  });
});
