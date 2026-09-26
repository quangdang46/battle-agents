import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { levelForXp, meetsGate, progressionFeature } from '@battle-agents/progression';
import {
  WORLD_BUILDINGS,
  WORLD_READ,
  WORLD_UPGRADE,
  worldFeature,
  type BaseSummary,
  type UnlockView,
} from '@battle-agents/world';
import {
  agents as agentsTable,
  closeDatabasePool,
  createDatabase,
  DrizzleProgressionRepository,
  DrizzleStateStore,
  DrizzleWorldRepository,
  sessions as sessionsTable,
  users,
  type Database,
} from '@battle-agents/db';
import { eq } from 'drizzle-orm';
import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * M5 against a real database, and the test that decides what "next day" means.
 *
 * ## Why the real store
 *
 * An in-memory repository cannot answer the only question this milestone asks.
 * "Close all sessions, reopen next day, world + character state intact" is a
 * claim about DURABILITY, and a hand-written map is durable in exactly the way a
 * process is not. `AGENTS.md` puts it better: a WHERE clause reimplemented by
 * hand in a double is a restatement of the intention rather than a check on the
 * code.
 *
 * ## What "NEXT DAY" IS TAKEN TO MEAN
 *
 * Not a 24-hour wait — a test that waits is a test nobody runs. The content of
 * the sentence is that the world is a function of durable state and not of any
 * live process, so the strongest available proxy is used: the runtime, the bus,
 * the state store AND the repository object are all thrown away and rebuilt,
 * against the same database, by code that never ran before. Everything a cold
 * process would have lost is lost here except the rows.
 *
 * ## Why the level comes from a real character
 *
 * The gate is progression's and the level is a column on `agents`, so the
 * boundary test below drives a character that has actually earned a level rather
 * than a stub returning one. A gate tested against a stub is a gate tested
 * against the test.
 */

const AT = '2026-09-27T12:00:00.000Z';

let pool: Pool;
let database: Database;

beforeAll(async () => {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined) {
    throw new Error('DATABASE_URL is not set. Run through scripts/test-m0.sh.');
  }
  pool = new Pool({ connectionString, max: 4 });
  database = createDatabase(pool);
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/**
 * A real character, at a real level.
 *
 * XP and level are BOTH written, and progression's own `levelForXp` decides the
 * second from the first. They are separate columns — the repository stores the
 * pair and does not derive one from the other on read — so writing only `xp`
 * left `level` at its default of 1 and every gate in this file refused
 * everything. Writing `level` by hand instead would put a character on a level
 * its XP does not support, which is a fixture that can lie; asking progression
 * for the number means the character is on a level it has actually earned.
 */
async function aCharacterAt(xp: number): Promise<string> {
  const login = `world-${randomUUID()}`;
  const [user] = await database
    .insert(users)
    .values({ githubId: login, login })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agentsTable)
    .values({
      userId: user?.id ?? '',
      name: `worldly-${randomUUID().slice(0, 8)}`,
      harness: 'claude-code',
      xp,
      level: levelForXp(xp),
    })
    .returning({ id: agentsTable.id });
  if (agent === undefined) throw new Error('a character was created and could not be read back');
  return agent.id;
}

/** A whole runtime, built from nothing but the database. */
function boot(): { api: ApplicationApi; worldStore: DrizzleWorldRepository } {
  const worldStore = new DrizzleWorldRepository(database);
  const progressionRepository = new DrizzleProgressionRepository(database);
  const api = createApplicationApi(
    createRuntime({
      extensions: [
        progressionFeature({ repository: progressionRepository }),
        worldFeature({
          repository: worldStore,
          levelOf: async (agentId: string) =>
            (await progressionRepository.find(agentId))?.level ?? 1,
          gate: meetsGate,
        }),
      ],
      store: new DrizzleStateStore(database),
      bus: createInMemoryEventBus(),
      now: () => AT,
    }),
  );
  return { api, worldStore };
}

describe('a base that is really in a database', () => {
  it('is the same base after the process is thrown away and rebuilt', async () => {
    const { api, worldStore } = boot();
    const agentId = await aCharacterAt(56_000);

    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'workshop' });
    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'workshop' });
    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'lab' });
    const before = (await api.act(WORLD_READ, { agentId })) as BaseSummary;

    // Everything goes. A new repository object over the same pool, a new
    // runtime, a new bus, a new state store — the only thing carried across is
    // the rows, which is the only thing a cold process would keep.
    const cold = boot();
    const after = (await cold.api.act(WORLD_READ, { agentId })) as BaseSummary;

    expect(after).toEqual(before);
    // And the levels themselves, because a summary that agreed with itself while
    // the stored map disagreed would be the drift this column is forbidden from
    // having.
    const stored = await worldStore.find(agentId);
    expect(stored?.buildings).toEqual({ workshop: 2, lab: 1 });
  });

  it('keeps a base when every session the character had has ended', async () => {
    // §10.2's death rule reaching its consequence. A base keyed on a session
    // would leave with the run; keyed on the agent, it is still here. The
    // character has no session in this file at all, which is the point — the
    // world does not need one to exist.
    const { api, worldStore } = boot();
    const agentId = await aCharacterAt(56_000);
    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'workshop' });
    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'lab' });

    // The character has NO session, and none is created or ended — the world
    // does not need a live session to exist. Asserted rather than assumed,
    // because a fixture that quietly had one would make the test below vacuous
    // and would look like it proved a session-independence it never exercised.
    const sessions = await database
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.agentId, agentId));
    expect(sessions, 'the character was given a session, so nothing is being proved').toHaveLength(0);
    // Compared as a MAP, not as a key list. `jsonb` does not preserve key
    // order — it reorders by length then bytewise — so a key-list assertion
    // fails on a store that stored exactly the right thing.
    expect((await worldStore.find(agentId))?.buildings).toEqual({ workshop: 1, lab: 1 });
  });

  it('refuses a building below the character level and stores nothing', async () => {
    // The boundary, against a real level. 56_000 XP is level 15, which clears
    // the Workshop, the Lab and the Arena and refuses the Guild Hall at 20 and
    // the Command Center at 30. The first version of this used 200_000, which
    // progression's own curve puts at level 22 — past every gate in the table,
    // so it asserted that everything is unlocked and proved nothing.
    const { api, worldStore } = boot();
    const agentId = await aCharacterAt(56_000);

    const refused = await api
      .act(WORLD_UPGRADE, { agentId, buildingId: 'guild-hall' })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(Error);
    expect((refused as { code?: string }).code).toBe('level-gate');
    // Nothing was written. A refused request must not leave a mark, and the row
    // is what outlives the process.
    expect(await worldStore.find(agentId)).toBeUndefined();

    const raised = (await api.act(WORLD_UPGRADE, { agentId, buildingId: 'workshop' })) as BaseSummary;
    expect(raised.buildings.map((each) => each.id)).toEqual(['workshop']);
  });

  it('answers the whole building table with the character standing against each', async () => {
    const { api } = boot();
    const agentId = await aCharacterAt(56_000);
    const catalogue = (await api.act(WORLD_BUILDINGS, {})) as {
      buildings: readonly { id: string; unlocks: string; requiredLevel: number }[];
    };
    const read = (await api.act(WORLD_READ, { agentId })) as BaseSummary;

    expect(catalogue.buildings.length).toBeGreaterThanOrEqual(5);
    // Every building is present in the read, granted or not — a list holding
    // only what a character may do cannot answer "why can I not have this".
    expect(read.unlocks).toHaveLength(catalogue.buildings.length);
    const allowed = read.unlocks.filter((each: UnlockView) => each.allowed).map((each) => each.buildingId);
    const refused = read.unlocks.filter((each: UnlockView) => !each.allowed).map((each) => each.buildingId);
    expect(allowed).toContain('workshop');
    expect(refused).toContain('guild-hall');
    // And a refusal names the level, in the words a client shows.
    const guildHall = read.unlocks.find((each: UnlockView) => each.buildingId === 'guild-hall');
    expect(guildHall?.refusal).toContain('level 20');
  });
});
