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
 * Two things cross this boundary that a fake would wave through. The two rates
 * arrive as scaled integers, so the thing worth proving is that a rate survives
 * the round trip: 0.7 and 0.83 read back as 0.7000000000000001 as floats, and a
 * trust score that decides bounty tier gating must not drift on the way to
 * storage. And the claim that stops one outcome being counted twice is a
 * UNIQUE INDEX, so what is worth proving is that the second insert really is
 * refused by the engine — a boolean in a hand-written store is right by
 * construction and tells you nothing about the index.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';

let pool: Pool;
let repository: DrizzleReputationRepository;
let agentId: string;
let ownerId: string;
let database: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: 4 });
  database = createDatabase(pool);
  repository = new DrizzleReputationRepository(database);

  const githubId = `reputation-owner-${Math.random().toString(36).slice(2)}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  ownerId = owner?.id ?? '';

  const agent = await new DrizzleAgentRepository(database).create(
    {
      ownerId,
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
      refusedOutcomes: 0,
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
      refusedOutcomes: 0,
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
      refusedOutcomes: 0,
      updatedAt: AT,
    });

    const read = await repository.find(agentId);
    // One cent, not one point zero one. The schema's check forbids a negative
    // and the column is an integer; a float would be the wrong encoding for the
    // same reason the rates are scaled.
    expect(read?.earnedCents).toBe(1);
  });

  it('keeps a refusal count, which is a diagnostic and still has to survive', async () => {
    // Nothing reads refusedOutcomes when it computes a trust score, and it is
    // still stored: a refusal that cannot be queried is how a reputation stops
    // being auditable.
    await repository.save({
      agentId,
      completed: 1,
      failed: 0,
      acceptanceRate: 1,
      reviewScore: 0,
      earnedCents: 0,
      refusedOutcomes: 4,
      updatedAt: AT,
    });

    await expect(repository.find(agentId)).resolves.toMatchObject({ refusedOutcomes: 4 });
  });
});

describe('claiming an outcome, over a real database', () => {
  // The reason this file grew a section. `claimOutcome` returning the right
  // boolean is the whole double-count defence, and a boolean is trivially right
  // in a fake: what has to be proven against a real engine is that the SECOND
  // insert of one bounty really is refused, and that the two kinds of one bounty
  // really are two claims rather than one.
  //
  // A per-run suffix on every bounty id, because these rows are never cleaned
  // up and the database is not reset between runs. The first version used fixed
  // ids and passed against a fresh database and then failed on the second run
  // against the same one — a test whose result depends on whether the table
  // happened to be empty, which is a coin toss dressed as an assertion.
  const run = Math.random().toString(36).slice(2);
  const bounty = (name: string): string => `bounty-${name}-${run}`;

  it('lets the first claim through and refuses the second, without raising', async () => {
    const outcome = { agentId, bountyId: bounty('once'), kind: 'completed' as const };

    await expect(repository.claimOutcome(outcome, AT)).resolves.toBe(true);
    // Idempotent, not an error: a duplicate delivery is a normal thing for
    // GitHub to do, and throwing here would put it in the emitter's error path
    // for something the emitter did right.
    await expect(repository.claimOutcome(outcome, AT)).resolves.toBe(false);
    await expect(repository.claimOutcome(outcome, AT)).resolves.toBe(false);
  });

  it('claims the same bounty twice when the outcomes are of different kinds', async () => {
    // A bounty resolved and then retracted is two outcomes. A key of the bounty
    // alone would refuse the second and freeze the record at the first telling,
    // so the kind is part of the unique index and this is where that is proven.
    const bountyId = bounty('retracted');

    await expect(
      repository.claimOutcome({ agentId, bountyId, kind: 'completed' }, AT),
    ).resolves.toBe(true);
    await expect(repository.claimOutcome({ agentId, bountyId, kind: 'failed' }, AT)).resolves.toBe(
      true,
    );
  });

  it('claims a bounty only once whoever the agent is', async () => {
    // The agent is deliberately not in the key, so two events disagreeing about
    // who did the work cannot both be credited. Proved here rather than in the
    // unit suite, because it is the index that decides it.
    const bountyId = bounty('contested');
    const other = await new DrizzleAgentRepository(database).create(
      {
        ownerId,
        name: `rep-other-${Math.random().toString(36).slice(2)}`,
        harness: 'claude',
      },
      AT,
    );

    await expect(
      repository.claimOutcome({ agentId, bountyId, kind: 'completed' }, AT),
    ).resolves.toBe(true);
    await expect(
      repository.claimOutcome({ agentId: other.id, bountyId, kind: 'completed' }, AT),
    ).resolves.toBe(false);
  });

  it('refuses a bounty id that is blank, and a kind it has no case for', async () => {
    // Both are refused by the database rather than by the adapter, so a row
    // written by anything that is not this adapter obeys the same rules. Without
    // the CHECKs an empty key would silently disable the dedup for every outcome
    // it claimed to cover, and the unique index would then be refusing to
    // double-count two rows the feature reads as one.
    //
    // The cast is the point, not a slip: the type says this cannot be sent, so
    // the only way to prove the DATABASE also refuses it is to send it anyway.
    await expect(
      repository.claimOutcome({ agentId, bountyId: '   ', kind: 'completed' }, AT),
    ).rejects.toThrow();
    await expect(
      repository.claimOutcome(
        { agentId, bountyId: bounty('bad-kind'), kind: 'disputed' as 'completed' },
        AT,
      ),
    ).rejects.toThrow();
  });
});
