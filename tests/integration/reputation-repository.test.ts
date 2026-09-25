import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Pool } from 'pg';

import {
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleReputationRepository,
  users,
} from '@battle-agents/db';

/**
 * The reputation adapter against a real database.
 *
 * The two rates cross this boundary as scaled integers, so the thing worth
 * proving is that a rate survives the round trip. 0.7 and 0.83 are the awkward
 * ones: as floats they read back as 0.7000000000000001, and a trust score
 * that decides bounty tier gating must not drift on the way to storage.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';

let pool: Pool;
let repository: DrizzleReputationRepository;
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
  repository = new DrizzleReputationRepository(database);

  const githubId = `reputation-owner-${Math.random().toString(36).slice(2)}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });

  const agent = await new DrizzleAgentRepository(database).create(
    {
      ownerId: owner?.id ?? '',
      name: `rep-${Math.random().toString(36).slice(2)}`,
      harness: 'claude',
    },
    '2026-09-25T00:00:00.000Z',
  );
  agentId = agent.id;
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

const AT = '2026-09-25T00:00:00.000Z';

describe('the reputation repository, over a real database', () => {
  it('reports nothing for an agent nobody has heard of', async () => {
    // A missing record and a zero record are different answers, and only the
    // store can tell them apart.
    await expect(repository.find('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
  });

  it('round-trips the awkward rates exactly', async () => {
    // 0.7 and 0.83 are the values a float gets wrong. Basis points and
    // hundredths exist so that "exactly" is achievable.
    await repository.save({
      agentId,
      completed: 17,
      failed: 3,
      acceptanceRate: 0.83,
      reviewScore: 4.2,
      earnedCents: 128_450,
      updatedAt: AT,
    });

    const read = await repository.find(agentId);
    expect(read?.completed).toBe(17);
    expect(read?.failed).toBe(3);
    expect(read?.acceptanceRate).toBe(0.83);
    expect(read?.reviewScore).toBe(4.2);
    expect(read?.earnedCents).toBe(128_450);
  });

  it('replaces rather than accumulating, because the caller owns the whole record', async () => {
    await repository.save({
      agentId,
      completed: 18,
      failed: 3,
      acceptanceRate: 0.857_142_857,
      reviewScore: 4.2,
      earnedCents: 128_450,
      updatedAt: AT,
    });

    const read = await repository.find(agentId);
    // Not 35 completed: the port says the caller supplies the whole record, and
    // a reputation record is derived state rather than a log.
    expect(read?.completed).toBe(18);
  });

  it('keeps money an integer through the round trip', async () => {
    await repository.save({
      agentId,
      completed: 1,
      failed: 0,
      acceptanceRate: 1,
      reviewScore: 5,
      earnedCents: 1,
      updatedAt: AT,
    });

    const read = await repository.find(agentId);
    // One cent, not one point zero one. The schema's check forbids a negative
    // and the column is an integer; a float would be the wrong encoding for the
    // same reason the rates are scaled.
    expect(read?.earnedCents).toBe(1);
  });
});
