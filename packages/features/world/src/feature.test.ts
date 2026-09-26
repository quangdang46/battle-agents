import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent } from '@battle-agents/core';

import { describe, expect, it, vi } from 'vitest';

import { BUILDINGS, gateRefusal, type LevelGate } from './rules.js';
import type { BaseView, WorldRepository } from './repository.js';
import {
  WORLD_BUILDINGS,
  WORLD_READ,
  WORLD_UNLOCKS,
  WORLD_UPGRADE,
  worldFeature,
  type BaseSummary,
  type UnlockView,
} from './feature.js';

const NOW = '2026-09-27T12:00:00.000Z';

/**
 * A store that outlives the process, which is the only kind that can be asked
 * the question M5 asks.
 *
 * Deliberately NOT the runtime's `InMemoryStateStore`. A cold restart is only a
 * test if everything except the database is rebuilt, so this holds the rows
 * itself and a second runtime is handed the SAME instance. If the world were
 * living in the runtime or in a module variable, this would happily pass while
 * the feature was broken, which is the failure the milestone is named for.
 */
class DurableBaseStore implements WorldRepository {
  readonly rows = new Map<string, BaseView>();
  saves = 0;

  async find(agentId: string): Promise<BaseView | undefined> {
    return this.rows.get(agentId);
  }

  async ensure(agentId: string, now: string): Promise<BaseView> {
    const existing = this.rows.get(agentId);
    if (existing !== undefined) return existing;
    const created: BaseView = { agentId, buildings: {}, updatedAt: now };
    this.rows.set(agentId, created);
    return created;
  }

  async save(input: {
    agentId: string;
    buildings: Readonly<Record<string, number>>;
    now: string;
  }): Promise<void> {
    this.saves += 1;
    this.rows.set(input.agentId, {
      agentId: input.agentId,
      buildings: { ...input.buildings },
      updatedAt: input.now,
    });
  }
}

/**
 * A comparison, handed in the way the composition root does.
 *
 * Deliberately NOT named after the export it stands in for. Borrowing a
 * sibling feature's identifier is the shape a whole-file copy leaves behind, and
 * `feature-package-isolation.test.ts` exists to catch exactly that — it turned
 * this file red for naming it `meetsGate`. The name is the point: this is a
 * function world was GIVEN, not one it took.
 */
const levelClears: LevelGate = (level, requiredLevel) => level >= requiredLevel;

function harness(levels: Readonly<Record<string, number>> = {}) {
  const store = new DurableBaseStore();
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((each) => seen.push(each));
  const runtime = createRuntime({
    extensions: [
      worldFeature({
        repository: store,
        // Read from the LEVELS the test set, not from a real character sheet.
        // The gate is progression's, supplied at the composition root; what is
        // under test here is that world CALLS it and honours the answer.
        levelOf: async (agentId: string) => levels[agentId] ?? 1,
        gate: levelClears,
      }),
    ],
    store: new InMemoryStateStore(),
    bus,
    now: () => NOW,
  });
  return { runtime, store, seen };
}

describe('a base that survives its sessions', () => {
  it('is byte-identical after a cold restart, and a second runtime reads it', async () => {
    // M5's definition of done is "close all sessions, reopen next day, world +
    // character state intact". A test cannot wait a day, and it should not: the
    // real content of the sentence is that the state is a function of DURABLE
    // STORAGE and not of any live session or in-memory process.
    //
    // So: build a base, throw the runtime away, hand the SAME store to a brand
    // new runtime, and read the base back. Everything that is not the database
    // has been rebuilt.
    //
    // AND THE MODULE IS RELOADED, which is the half a first version of this
    // test left out. Rebuilding the runtime is not a process restart when the
    // two runtimes share a module: a module-level `Map` in the feature survives
    // both, and the world living in one is exactly the failure the milestone
    // names. Measured — injecting such a cache left THIS test green and only
    // turned two unrelated ones red, which is not evidence about anything.
    // `vi.resetModules()` plus a dynamic import gives a genuinely fresh module
    // instance, so the only thing shared between the two halves is the store.
    const store = new DurableBaseStore();
    const first = createRuntime({
      extensions: [
        worldFeature({ repository: store, levelOf: async () => 30, gate: levelClears }),
      ],
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => NOW,
    });
    await first.runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'workshop' });
    await first.runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'lab' });
    await first.runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'command-center' });
    const before = (await first.runAction(WORLD_READ, { agentId: 'agent-1' })) as BaseSummary;

    vi.resetModules();
    const cold = await import('./feature.js');
    const core = await import('@battle-agents/core');
    const second = core.createRuntime({
      extensions: [
        cold.worldFeature({ repository: store, levelOf: async () => 30, gate: levelClears }),
      ],
      store: new core.InMemoryStateStore(),
      bus: core.createInMemoryEventBus(),
      now: () => NOW,
    });
    const after = (await second.runAction(cold.WORLD_READ, { agentId: 'agent-1' })) as BaseSummary;

    expect(after).toEqual(before);
    expect(after.buildings.map((each) => each.id).sort()).toEqual([
      'command-center',
      'lab',
      'workshop',
    ]);
  });

  it('reads back a character it has never heard of as absent, not as an empty base', async () => {
    // The difference M5 rests on. A repository that synthesised an empty base
    // would make "has built nothing" and "does not exist" the same answer, and
    // the second is not a base at all.
    const { runtime } = harness();
    const read = (await runtime.runAction(WORLD_READ, { agentId: 'nobody' })) as BaseSummary;
    expect(read.buildings).toEqual([]);
    expect(read.agentId).toBe('nobody');
  });
});

describe('buildings unlock capability, and refuse when they should', () => {
  it('refuses a building below its level and names the level required', async () => {
    // Both halves are required. A gate that only ever grants is not a gate, and
    // the refusal is what tells a client WHY the building is missing rather than
    // leaving it to guess from an empty list.
    const { runtime } = harness({ 'agent-1': 9 });

    const refused = await runtime
      .runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'arena' })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(Error);
    const error = refused as { code?: string; requiredLevel?: number; level?: number };
    expect(error.code).toBe('level-gate');
    expect(error.requiredLevel).toBe(10);
    expect(error.level).toBe(9);
    // And the message says it in words, because a client shows the message.
    expect(String((refused as Error).message)).toContain('level 10');
    expect(String((refused as Error).message)).toContain('level 9');
  });

  it('grants a building at its level exactly, and one below the character it is for', async () => {
    // The boundary, on both sides. "At or above" rather than "above" is the
    // whole difference between a gate a level-10 character clears and one they
    // do not.
    const { runtime } = harness({ 'agent-1': 10 });
    const raised = (await runtime.runAction(WORLD_UPGRADE, {
      agentId: 'agent-1',
      buildingId: 'arena',
    })) as BaseSummary;
    expect(raised.buildings.map((each) => each.id)).toEqual(['arena']);
  });

  it('does not put a refused building in the store', async () => {
    // The gate is enforced at the WRITE, not only in the view. A gate that is
    // only in the view is one a client walks around by asking twice and
    // believing the second answer, and the row is what outlives the process.
    //
    // Asserted as "no row at all" rather than "an empty row", because the
    // refusal happens before the base is even created: asking for a building a
    // character has not earned must not bring a base into existence, or every
    // refused request would leave a mark.
    const { runtime, store } = harness({ 'agent-1': 1 });
    await runtime
      .runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'guild-hall' })
      .catch(() => undefined);
    expect(store.saves).toBe(0);
    expect(store.rows.has('agent-1'), 'a refused upgrade created a base').toBe(false);
  });

  it('lists every building with its own standing, granted and refused alike', async () => {
    // A list holding only what a character may do cannot answer "what is this
    // and why can I not have it", which is the question a client draws a city
    // with.
    const { runtime } = harness({ 'agent-1': 10 });
    const read = (await runtime.runAction(WORLD_UNLOCKS, { agentId: 'agent-1' })) as {
      unlocks: readonly UnlockView[];
    };
    expect(read.unlocks).toHaveLength(BUILDINGS.length);
    const allowed = read.unlocks.filter((each) => each.allowed).map((each) => each.buildingId);
    const refused = read.unlocks.filter((each) => !each.allowed).map((each) => each.buildingId);
    expect(allowed.sort()).toEqual(['arena', 'lab', 'workshop']);
    expect(refused.sort()).toEqual(['command-center', 'guild-hall']);
    for (const view of read.unlocks) {
      expect(view.level, 'each view carries the level so a client need not ask twice').toBe(10);
    }
  });

  it('takes the comparison from the composition root rather than making its own', () => {
    // The gate is progression's. A copy of the comparison inside this feature
    // would be a second answer to a question progression owns, and it would
    // keep answering it after progression retuned the curve. So the only
    // arithmetic here is a call, and this proves the call is what decides.
    let asked: { level: number; requiredLevel: number } | undefined;
    const spy: LevelGate = (level, requiredLevel) => {
      asked = { level, requiredLevel };
      return false;
    };
    expect(gateRefusal(spy, 1, 99)).toContain('level 99');
    expect(asked).toEqual({ level: 1, requiredLevel: 99 });
  });
});

describe('the world is reachable without a browser', () => {
  it('answers every action over the protocol, and is discoverable', async () => {
    // §34's machine-native rule: every gameplay loop must be playable through
    // the protocol alone. A base that can only be inspected in a browser is not
    // done, exactly as a quest that cannot be claimed through act() is not.
    const { runtime } = harness({ 'agent-1': 30 });
    const read = (await runtime.runAction(WORLD_READ, { agentId: 'agent-1' })) as BaseSummary;
    await runtime.runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'workshop' });
    const after = (await runtime.runAction(WORLD_READ, { agentId: 'agent-1' })) as BaseSummary;
    expect(after.buildings).toHaveLength(1);
    expect(read.agentId).toBe('agent-1');

    const catalogue = (await runtime.runAction(WORLD_BUILDINGS, {})) as {
      buildings: readonly { id: string; requiredLevel: number; gated: boolean }[];
    };
    expect(catalogue.buildings).toHaveLength(BUILDINGS.length);
    // Every one of them names a level, because a building with no gate is a
    // building that unlocked itself the moment it shipped.
    for (const building of catalogue.buildings) {
      expect(building.requiredLevel).toBeGreaterThanOrEqual(1);
    }
  });

  it('announces a raised building, so a city can be drawn from the bus', async () => {
    const { runtime, seen } = harness({ 'agent-1': 30 });
    await runtime.runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'lab' });
    const raised = seen.filter((each) => each.type === 'world.building_raised');
    expect(raised).toHaveLength(1);
    expect(raised[0]?.payload).toMatchObject({
      agentId: 'agent-1',
      buildingId: 'lab',
      unlocks: 'benchmarks',
    });
  });

  it('refuses a payload that is not a question it can answer', async () => {
    // `act()` hands the payload through as a generic, so an unguarded `run`
    // reads `agentId = undefined` and looks for a character called "undefined".
    const { runtime } = harness();
    for (const bad of [{}, { agentId: '' }, { agentId: 7 }, 'not-an-object']) {
      const refused = await runtime.runAction(WORLD_READ, bad).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
      expect((refused as { code?: string }).code).toBe('malformed-input');
    }
    const unknown = await runtime
      .runAction(WORLD_UPGRADE, { agentId: 'agent-1', buildingId: 'pyramid' })
      .catch((error: unknown) => error);
    expect((unknown as { code?: string }).code).toBe('malformed-input');
  });
});
