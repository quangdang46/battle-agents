import {
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  eq,
  users,
} from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Ownership, checked against a live Postgres.
 *
 * The agent feature cannot import the database, so the repository it is given
 * is the only thing standing between two users' characters. That makes this
 * the test that decides whether "a user's agent cannot be read by another user"
 * is a property of the system or only a comment in an interface.
 *
 * A unit test with an in-memory repository proves the feature asks for the
 * right thing. It cannot prove the query does, which is where an ownership bug
 * would actually live: a WHERE clause that filters the wrong column is
 * indistinguishable from a correct one until it is run against real rows.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 2;
const AT = '2026-09-24T00:00:00.000Z';

let pool: Pool;
let database: Database;
let repository: DrizzleAgentRepository;

interface SeededUser {
  readonly id: string;
}

/**
 * The integration database is a volume that survives `docker compose down`, so
 * a test that inserts fixed ids passes once and then fails on the second run for
 * reasons that have nothing to do with the code. Every run gets its own ids.
 */
const RUN_TOKEN = randomUUID();
const createdUserIds: string[] = [];

/** A user row, so agents have an owner to belong to. */
async function createUser(label: string): Promise<SeededUser> {
  const githubId = `${RUN_TOKEN}-${label}`;
  // Through the schema rather than raw SQL, so the test breaks when the schema
  // does. A hand-written INSERT keeps working after a column is renamed and
  // stops inserting what the test thinks it is inserting.
  const [created] = await database.insert(users).values({ githubId, login: githubId }).returning();
  if (created === undefined) {
    throw new Error(`could not create a user for ${label}`);
  }
  createdUserIds.push(created.id);
  return { id: created.id };
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
  repository = new DrizzleAgentRepository(database);
});

afterAll(async () => {
  // Leave the database as the seed left it. Agents cascade from their owner, so
  // removing the users this run created removes everything the run wrote.
  for (const userId of createdUserIds) {
    await database.delete(users).where(eq(users.id, userId));
  }
  await closeDatabasePool(pool);
});

describe('agent ownership', () => {
  it('stores an agent under its owner and returns it to that owner', async () => {
    const owner = await createUser('ownership-owner');
    const created = await repository.create(
      { ownerId: owner.id, name: 'CodeKnight', harness: 'claude' },
      AT,
    );

    expect(created.name).toBe('CodeKnight');
    expect(created.ownerId).toBe(owner.id);
    await expect(repository.findOwned(owner.id, created.id)).resolves.toMatchObject({
      id: created.id,
    });
  });

  it('does not return another user’s agent', async () => {
    const owner = await createUser('ownership-a');
    const stranger = await createUser('ownership-b');
    const created = await repository.create(
      { ownerId: owner.id, name: 'Private', harness: 'claude' },
      AT,
    );

    // Undefined, not an error and not a row: a caller must not be able to learn
    // from the answer that somebody else's agent id is real.
    await expect(repository.findOwned(stranger.id, created.id)).resolves.toBeUndefined();
  });

  it('refuses to act as another user’s agent', async () => {
    const owner = await createUser('ownership-c');
    const stranger = await createUser('ownership-d');
    const created = await repository.create(
      { ownerId: owner.id, name: 'Guarded', harness: 'claude' },
      AT,
    );

    await expect(repository.requireOwned(stranger.id, created.id)).rejects.toMatchObject({
      code: 'agent-not-owned',
    });
  });

  it('reports a missing agent the same way as somebody else’s', async () => {
    const owner = await createUser('ownership-e');
    const stranger = await createUser('ownership-f');
    const created = await repository.create(
      { ownerId: owner.id, name: 'Hidden', harness: 'claude' },
      AT,
    );

    const onSomebodyElses = repository
      .requireOwned(stranger.id, created.id)
      .catch((e: unknown) => e);
    const onNothing = repository
      .requireOwned(stranger.id, '00000000-0000-0000-0000-000000000000')
      .catch((e: unknown) => e);

    const [first, second] = await Promise.all([onSomebodyElses, onNothing]);
    expect((first as { code?: string }).code).toBe((second as { code?: string }).code);
  });

  it('lists only the caller’s own agents', async () => {
    const owner = await createUser('ownership-g');
    const stranger = await createUser('ownership-h');
    await repository.create({ ownerId: owner.id, name: 'Mine', harness: 'claude' }, AT);
    await repository.create({ ownerId: stranger.id, name: 'Theirs', harness: 'codex' }, AT);

    const mine = await repository.listForOwner(owner.id);

    expect(mine.map((each) => each.name)).toEqual(['Mine']);
    expect(mine.every((each) => each.ownerId === owner.id)).toBe(true);
  });

  it('lets two users each register the same name', async () => {
    const first = await createUser('ownership-i');
    const second = await createUser('ownership-j');

    const a = await repository.create({ ownerId: first.id, name: 'Codex', harness: 'codex' }, AT);
    const b = await repository.create({ ownerId: second.id, name: 'Codex', harness: 'codex' }, AT);

    expect(a.id).not.toBe(b.id);
  });

  it('refuses the same name twice for one user, and says it is a conflict', async () => {
    const owner = await createUser('ownership-k');
    await repository.create({ ownerId: owner.id, name: 'Twin', harness: 'codex' }, AT);

    // The code, not a message: the feature catches a coded failure so a broken
    // database is never reported to a user as a name conflict.
    await expect(
      repository.create({ ownerId: owner.id, name: 'Twin', harness: 'codex' }, AT),
    ).rejects.toMatchObject({ code: 'agent-name-taken' });
  });

  it('keeps the stored harness even when it is one the domain does not know', async () => {
    const owner = await createUser('ownership-l');
    const created = await repository.create(
      { ownerId: owner.id, name: 'Future', harness: 'koda' },
      AT,
    );

    // A new coding agent ships an adapter before the domain grows an entry, and
    // the core has to keep accepting its characters meanwhile.
    expect(created.harness).toBe('other');
  });
});
