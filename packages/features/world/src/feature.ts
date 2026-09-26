import { defineAction } from '@battle-agents/core';
import type { GameFeature, RuntimeContext } from '@battle-agents/core';
import { WORLD_EVENTS } from '@battle-agents/protocol';

import {
  isWorldAgentInput,
  isWorldUpgradeInput,
  worldInputRejected,
  whyWorldReadIsRejected,
  whyWorldUpgradeIsRejected,
  type WorldAgentInput,
  type WorldUpgradeInput,
} from './domain.js';
import { BUILDINGS, buildingFor, gateRefusal, type LevelGate } from './rules.js';
import type { WorldRepository } from './repository.js';

export const WORLD_READ = 'world.read';
export const WORLD_BUILDINGS = 'world.buildings';
export const WORLD_UNLOCKS = 'world.unlocks';
export const WORLD_UPGRADE = 'world.upgrade';

const WORLD_READ_SHAPE = 'world.read takes { agentId: string }.';
const WORLD_UNLOCKS_SHAPE = 'world.unlocks takes { agentId: string }.';
const WORLD_UPGRADE_SHAPE = 'world.upgrade takes { agentId: string, buildingId: string }.';

/** What the character can do, in the order the plan lists them. */
export interface UnlockView {
  readonly buildingId: string;
  readonly name: string;
  readonly unlocks: string;
  readonly requiredLevel: number;
  /** The character's own level, so a client need not make a second call. */
  readonly level: number;
  /** Whether the character has reached the level this unlocks at. */
  readonly allowed: boolean;
  /** Present when refused, in the words a client shows. Absent when allowed. */
  readonly refusal?: string;
}

/** A character's base, and everything standing in it. */
export interface BaseSummary {
  readonly agentId: string;
  readonly level: number;
  readonly buildings: readonly { readonly id: string; readonly name: string; readonly level: number }[];
  readonly unlocks: readonly UnlockView[];
}

export interface WorldDependencies {
  readonly repository: WorldRepository;
  /**
   * The character's level.
   *
   * A PORT rather than an import, and the reason is the layering rule: world is
   * a sibling of progression, and features never import each other. The
   * composition root supplies the real read, and a test supplies a real level —
   * so the level-boundary test below settles the gate against an actual level
   * rather than against a stub that agrees with whatever it was handed.
   */
  readonly levelOf: (agentId: string) => Promise<number>;
  /**
   * The comparison, supplied rather than imported for the same reason.
   *
   * This is progression's `meetsGate` handed in at the composition root. A copy
   * of `level >= requiredLevel` inside this feature would be a second answer to
   * a question progression already owns, and it would keep answering it after
   * progression retuned.
   */
  readonly gate: LevelGate;
  /** The event a standing building emits, and the feature persists. */
  readonly now?: () => string;
}

/** The payload of `world.building_raised`, read by a client that draws a city. */
export interface WorldBuildingRaisedPayload {
  readonly agentId: string;
  readonly buildingId: string;
  readonly level: number;
  /** The capability this building unlocks, so a client need not look it up. */
  readonly unlocks: string;
}

export const WORLD_BUILDING_RAISED = WORLD_EVENTS.buildingRaised;

export function worldFeature(dependencies: WorldDependencies): GameFeature {
  const { repository, levelOf, gate } = dependencies;

  /**
   * Every building, with the character's own standing against it.
   *
   * All of them, granted and refused alike. A list containing only what a
   * character may do is a list that cannot answer "what is this and why can I
   * not have it", which is the question a client draws a city with.
   */
  async function unlocksFor(agentId: string): Promise<readonly UnlockView[]> {
    const level = await levelOf(agentId);
    return BUILDINGS.map((building) => {
      const refusal = gateRefusal(gate, level, building.requiredLevel);
      return {
        buildingId: building.id,
        name: building.name,
        unlocks: building.unlocks,
        requiredLevel: building.requiredLevel,
        level,
        allowed: refusal === undefined,
        ...(refusal === undefined ? {} : { refusal }),
      };
    });
  }

  return {
    id: 'world',
    // The one event this feature narrates. `session.recovered` is deliberately
    // NOT handled: a crashed run must leave the base standing, and a handler
    // here would be a handler that could be written to tidy up on the way out.
    // The cold-restart test in feature.test.ts is what proves the base is not
    // touched by a session ending, and it passes because there is nothing here
    // to fire.
    eventHandlers: [],
    persistedEvents: [WORLD_BUILDING_RAISED],
    capabilities: [
      { name: WORLD_READ, description: "Read a character's base: what stands in it and what it unlocks." },
      { name: WORLD_BUILDINGS, description: 'List the buildings and the levels at which each unlocks something.' },
      { name: WORLD_UNLOCKS, description: 'Ask what a character has and has not unlocked.' },
      { name: WORLD_UPGRADE, description: 'Raise a building in a character base.' },
    ],
    actionDefs: [
      defineAction({
        id: WORLD_READ,
        permissions: [WORLD_READ],
        run: async (input: unknown) => {
          if (!isWorldAgentInput(input)) {
            throw worldInputRejected(
              WORLD_READ,
              whyWorldReadIsRejected(input) ?? { reason: 'not-an-object' },
              WORLD_READ_SHAPE,
            );
          }
          return readBase(repository, levelOf, gate, input);
        },
      }),
      defineAction({
        id: WORLD_UNLOCKS,
        permissions: [WORLD_UNLOCKS],
        run: async (input: unknown) => {
          if (!isWorldAgentInput(input)) {
            throw worldInputRejected(
              WORLD_UNLOCKS,
              whyWorldReadIsRejected(input) ?? { reason: 'not-an-object' },
              WORLD_UNLOCKS_SHAPE,
            );
          }
          const world = input as WorldAgentInput;
          return { agentId: world.agentId, unlocks: await unlocksFor(world.agentId) };
        },
      }),
      // No payload, and nothing to guard. The one action in this feature that is
      // asked a question with no subject.
      defineAction({
        id: WORLD_BUILDINGS,
        permissions: [WORLD_BUILDINGS],
        run: async () => ({
          buildings: BUILDINGS.map((building) => ({
            id: building.id,
            name: building.name,
            unlocks: building.unlocks,
            requiredLevel: building.requiredLevel,
            gated: building.gated,
          })),
        }),
      }),
      defineAction({
        id: WORLD_UPGRADE,
        permissions: [WORLD_UPGRADE],
        run: async (input: unknown, context: RuntimeContext) => {
          if (
            !isWorldUpgradeInput(input) ||
            whyWorldUpgradeIsRejected(input, BUILDINGS.map((building) => building.id)) !== undefined
          ) {
            throw worldInputRejected(
              WORLD_UPGRADE,
              whyWorldUpgradeIsRejected(input, BUILDINGS.map((building) => building.id)) ?? {
                reason: 'not-an-object',
              },
              WORLD_UPGRADE_SHAPE,
            );
          }
          return raise(repository, levelOf, gate, input as WorldUpgradeInput, context);
        },
      }),
    ],
  };
}

async function readBase(
  repository: WorldRepository,
  levelOf: (agentId: string) => Promise<number>,
  gate: LevelGate,
  input: WorldAgentInput,
): Promise<BaseSummary> {
  const base = await repository.find(input.agentId);
  const level = await levelOf(input.agentId);
  const standing = base?.buildings ?? {};
  return {
    agentId: input.agentId,
    level,
    buildings: BUILDINGS.filter((building) => standing[building.id] !== undefined).map(
      (building) => ({
        id: building.id,
        name: building.name,
        level: standing[building.id] ?? 0,
      }),
    ),
    unlocks: BUILDINGS.map((building) => {
      const refusal = gateRefusal(gate, level, building.requiredLevel);
      return {
        buildingId: building.id,
        name: building.name,
        unlocks: building.unlocks,
        requiredLevel: building.requiredLevel,
        level,
        allowed: refusal === undefined,
        ...(refusal === undefined ? {} : { refusal }),
      };
    }),
  };
}

/**
 * Raise a building, if the character has earned it.
 *
 * The gate is checked HERE, at the write, rather than only on the read path. A
 * gate that is enforced in the view and not in the store is a gate a client can
 * walk around by asking twice and believing the second answer, and the stored
 * row is the one that outlives the process.
 */
async function raise(
  repository: WorldRepository,
  levelOf: (agentId: string) => Promise<number>,
  gate: LevelGate,
  input: WorldUpgradeInput,
  context: RuntimeContext,
): Promise<BaseSummary> {
  const building = buildingFor(input.buildingId);
  if (building === undefined) {
    // Unreachable through the guarded `run` above, which checks the id against
    // the same table. Present because a function that indexes an array must
    // answer for the miss, and because the alternative — asserting a lookup is
    // total — is a claim that stops being true the moment a building is added.
    throw Object.assign(new Error(`no building named ${input.buildingId}`), {
      code: 'no-such-building',
    });
  }
  const level = await levelOf(input.agentId);
  const refusal = gateRefusal(gate, level, building.requiredLevel);
  if (refusal !== undefined) {
    throw Object.assign(new Error(`world.upgrade refused: ${refusal}`), {
      code: 'level-gate',
      building: building.id,
      requiredLevel: building.requiredLevel,
      level,
    });
  }

  const base = await repository.ensure(input.agentId, context.now());
  const next = { ...base.buildings, [building.id]: (base.buildings[building.id] ?? 0) + 1 };
  await repository.save({ agentId: input.agentId, buildings: next, now: context.now() });

  await context.runtime.emit({
    type: WORLD_BUILDING_RAISED,
    occurredAt: context.now(),
    actorId: input.agentId,
    payload: {
      agentId: input.agentId,
      buildingId: building.id,
      level: next[building.id] ?? 0,
      unlocks: building.unlocks,
    } satisfies WorldBuildingRaisedPayload,
  });

  return readBase(repository, levelOf, gate, input);
}
