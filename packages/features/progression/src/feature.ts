import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import { AGENT_LEVEL_UP, type AgentLevelUpPayload, type AgentProgress } from './domain.js';
import type { ProgressionRepository } from './repository.js';
import {
  classifyBuild,
  DEFAULT_BUILD_WEIGHTS,
  explainBuild,
  levelForXp,
  outcomeFor,
  OUTCOME_TYPES,
  type BehaviourSignal,
  type BuildWeights,
} from './rules.js';

export const PROGRESSION_READ = 'progression.read';
export const PROGRESSION_AWARDS = 'progression.awards';

export interface ProgressionSummary {
  readonly agentId: string;
  readonly xp: number;
  readonly level: number;
  readonly build: string;
  readonly classification: ReturnType<typeof explainBuild>;
}

export interface ProgressionDependencies {
  readonly repository: ProgressionRepository;
  /** Exposed so the classifier can be retuned without editing the feature. */
  readonly weights?: BuildWeights;
}

/**
 * Progression: experience, levels, and what a character is becoming.
 *
 * There is no command here for granting experience, and that is the design
 * rather than an omission. A command would be a door, and anything with a door
 * can be pushed through by a caller that finds it. Experience arrives because
 * something real happened — a bounty completed, a test passed, a battle won —
 * and this feature is the only thing that decides what that is worth.
 *
 * That is also why every other feature is a peer here: progression reacts to
 * their events rather than being wired to them, so any feature can be added or
 * removed without editing this file.
 */
export function progressionFeature(dependencies: ProgressionDependencies): GameFeature {
  const { repository } = dependencies;
  const weights = dependencies.weights ?? DEFAULT_BUILD_WEIGHTS;

  /**
   * One handler per outcome type, because the runtime dispatches by exact event
   * name and has no wildcard. Registering them from the same table the awards
   * come from is what keeps the two in step: an outcome nobody listens to
   * cannot pay, and a listener for an outcome that cannot pay is dead code.
   */
  const handlers: EventHandler[] = OUTCOME_TYPES.map((outcomeType) => ({
    on: outcomeType,
    handle: (event: GameEvent, context: RuntimeContext) => awardFor(event, context),
  }));

  async function awardFor(event: GameEvent, context: RuntimeContext): Promise<void> {
    const outcome = outcomeFor(event.type);
    if (outcome === undefined) {
      return;
    }
    const agentId = agentIdOf(event);
    if (agentId === undefined) {
      return;
    }

    const before = await repository.ensure({ agentId }, context.now());
    const after = apply(before, outcome, context.now());
    if (after.xp === before.xp && after.level === before.level) {
      return;
    }
    await repository.save(after);

    if (after.level > before.level) {
      await context.bus.publish({
        type: AGENT_LEVEL_UP,
        occurredAt: context.now(),
        actorId: after.agentId,
        ...(event.causationId === undefined ? {} : { causationId: event.causationId }),
        payload: {
          agentId: after.agentId,
          level: after.level,
          previousLevel: before.level,
          xp: after.xp,
        } satisfies AgentLevelUpPayload,
      });
    }
  }

  return {
    id: 'progression',
    eventHandlers: handlers,
    persistedEvents: [AGENT_LEVEL_UP],
    capabilities: [
      { name: PROGRESSION_READ, description: "Read a character's experience, level and build." },
      { name: PROGRESSION_AWARDS, description: 'Ask what an outcome is worth before it happens.' },
    ],
    actionDefs: [
      defineAction({
        id: 'progression.read',
        permissions: [PROGRESSION_READ],
        run: (input: { agentId: string }) => summarize(repository, input.agentId, weights),
      }),
      defineAction({
        id: 'progression.awards',
        permissions: [PROGRESSION_AWARDS],
        run: async (input: { eventType: string }) => {
          const outcome = outcomeFor(input.eventType);
          return outcome === undefined
            ? { eventType: input.eventType, xp: 0, recognised: false }
            : { eventType: input.eventType, ...outcome, recognised: true };
        },
      }),
    ],
  };
}

async function summarize(
  repository: ProgressionRepository,
  agentId: string,
  weights: BuildWeights,
): Promise<ProgressionSummary> {
  const progress = await repository.find(agentId);
  if (progress === undefined) {
    // Distinct from "level 1, zero experience": a character that has never
    // done anything and a character nobody has heard of are different answers,
    // and collapsing them makes a missing record look like a new player.
    throw Object.assign(new Error(`no progress recorded for agent ${agentId}`), {
      code: 'no-such-progress',
    });
  }
  return {
    agentId: progress.agentId,
    xp: progress.xp,
    level: progress.level,
    build: progress.build,
    classification: explainBuild(progress.history, weights),
  };
}

/**
 * Applies one outcome, recomputing everything that follows from it.
 *
 * Pure, so the rule that a level is a function of experience rather than a
 * counter somebody increments is testable without a store. The build is
 * recomputed from the whole history on every award rather than adjusted, so a
 * mis-awarded outcome self-corrects instead of leaving a permanently wrong
 * specialisation behind.
 */
export function apply(
  before: AgentProgress,
  outcome: {
    readonly xp: number;
    readonly build: BehaviourSignal['build'];
    readonly weight: number;
  },
  now: string,
): AgentProgress {
  const history: BehaviourSignal[] = [
    ...before.history,
    { build: outcome.build, weight: outcome.weight, at: now },
  ];
  const xp = before.xp + outcome.xp;
  return {
    ...before,
    xp,
    level: levelForXp(xp),
    build: classifyBuild(history),
    history,
    updatedAt: now,
  };
}

/** The agent an event is about, if it names one. */
function agentIdOf(event: GameEvent): string | undefined {
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const candidate = (payload as { agentId?: unknown }).agentId;
  return typeof candidate === 'string' ? candidate : undefined;
}
