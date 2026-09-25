import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  AGENT_LEVEL_UP,
  isProgressionAwardsInput,
  isProgressionGateInput,
  isProgressionReadInput,
  PROGRESSION_AWARDS_SHAPE,
  PROGRESSION_GATE_SHAPE,
  PROGRESSION_READ_SHAPE,
  progressionInputRejected,
  whyProgressionAwardsIsRejected,
  whyProgressionGateIsRejected,
  whyProgressionReadIsRejected,
  type AgentLevelUpPayload,
  type AgentProgress,
} from './domain.js';
import type { ProgressionRepository } from './repository.js';
import {
  classifyBuild,
  DEFAULT_BUILD_WEIGHTS,
  explainBuild,
  LEVEL_GATES,
  levelForXp,
  meetsGate,
  outcomeFor,
  OUTCOME_TYPES,
  qualifies,
  type BehaviourSignal,
  type BuildWeights,
} from './rules.js';

export const PROGRESSION_READ = 'progression.read';
export const PROGRESSION_AWARDS = 'progression.awards';
export const PROGRESSION_GATE = 'progression.gate';
export const PROGRESSION_TIERS = 'progression.tiers';

export interface ProgressionSummary {
  readonly agentId: string;
  readonly xp: number;
  readonly level: number;
  readonly build: string;
  readonly classification: ReturnType<typeof explainBuild>;
}

/** What a caller asking "may this character have this?" is told. */
export interface GateDecision {
  readonly agentId: string;
  readonly requiredLevel: number;
  readonly allowed: boolean;
  readonly level: number;
  /** What the level being asked about unlocks, or null when nothing does. */
  readonly unlocks: string | null;
}

/** The ladder, so a client can render the gates without hardcoding them. */
export interface LevelGateView {
  readonly level: number;
  readonly unlocks: string;
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
    // The event name finds the row; the payload decides whether the row applies.
    // A battle that was lost is dropped whole — no experience and no history
    // entry — because the award table has nothing to say a defeat is evidence
    // of, and a signal written anyway would let an agent collect the build by
    // losing.
    if (!qualifies(outcome, event.payload)) {
      return;
    }
    const agentId = agentIdOf(event);
    if (agentId === undefined) {
      return;
    }

    const before = await repository.ensure({ agentId }, context.now());
    const after = apply(before, outcome, context.now(), weights);
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
      { name: PROGRESSION_GATE, description: 'Ask whether a character has reached a level.' },
      { name: PROGRESSION_TIERS, description: 'List the levels and what each one unlocks.' },
    ],
    actionDefs: [
      // Every `run` that reads its payload takes `unknown` and is guarded. The
      // annotation these used to carry was never checked: `act()` hands the
      // payload through as a generic, so `act('progression.read', {})` compiled
      // clean and queried `agentId = undefined`. `progression.tiers` is the one
      // action with no payload, and it has nothing to guard.
      defineAction({
        id: PROGRESSION_READ,
        permissions: [PROGRESSION_READ],
        run: async (input: unknown) => {
          if (!isProgressionReadInput(input)) {
            throw progressionInputRejected(
              PROGRESSION_READ,
              whyProgressionReadIsRejected(input) ?? { reason: 'not-an-object' },
              PROGRESSION_READ_SHAPE,
            );
          }
          return summarize(repository, input.agentId, weights);
        },
      }),
      defineAction({
        id: PROGRESSION_AWARDS,
        permissions: [PROGRESSION_AWARDS],
        run: async (input: unknown) => {
          if (!isProgressionAwardsInput(input)) {
            throw progressionInputRejected(
              PROGRESSION_AWARDS,
              whyProgressionAwardsIsRejected(input) ?? { reason: 'not-an-object' },
              PROGRESSION_AWARDS_SHAPE,
            );
          }
          const outcome = outcomeFor(input.eventType);
          return outcome === undefined
            ? { eventType: input.eventType, xp: 0, recognised: false }
            : { eventType: input.eventType, ...outcome, recognised: true };
        },
      }),
      defineAction({
        id: PROGRESSION_GATE,
        permissions: [PROGRESSION_GATE],
        run: async (input: unknown) => {
          if (!isProgressionGateInput(input)) {
            throw progressionInputRejected(
              PROGRESSION_GATE,
              whyProgressionGateIsRejected(input) ?? { reason: 'not-an-object' },
              PROGRESSION_GATE_SHAPE,
            );
          }
          return decideGate(repository, input.agentId, input.requiredLevel);
        },
      }),
      defineAction({
        id: PROGRESSION_TIERS,
        permissions: [PROGRESSION_TIERS],
        run: async () => LEVEL_GATES.map<LevelGateView>((gate) => ({ ...gate })),
      }),
    ],
  };
}

/**
 * Whether a character has reached a level.
 *
 * Answers for an agent with no record rather than refusing, which is a
 * deliberate difference from `progression.read`. A read is a character sheet,
 * and a sheet for nobody has nothing to draw. A gate is a decision, and a
 * decision a caller has to catch an exception to make is a gate that fails
 * open — every defensive caller turns the error into "allow". A character
 * nobody has heard of is level 1, and the only question here is whether level
 * 1 is enough.
 */
async function decideGate(
  repository: ProgressionRepository,
  agentId: string,
  requiredLevel: number,
): Promise<GateDecision> {
  const progress = await repository.find(agentId);
  const level = progress?.level ?? levelForXp(0);
  const gate = LEVEL_GATES.find((entry) => entry.level === requiredLevel);
  return {
    agentId,
    requiredLevel,
    allowed: meetsGate(level, requiredLevel),
    level,
    unlocks: gate?.unlocks ?? null,
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
 *
 * The weights belong on this signature and not only on the read path. A build
 * stored under one set of weights and reported under another is a record that
 * disagrees with itself, and a retune that only reaches `explainBuild` changes
 * what the feature SAYS about a character without changing what it BELIEVES.
 */
export function apply(
  before: AgentProgress,
  outcome: {
    readonly xp: number;
    readonly build: BehaviourSignal['build'];
    readonly weight: number;
  },
  now: string,
  weights: BuildWeights = DEFAULT_BUILD_WEIGHTS,
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
    build: classifyBuild(history, weights),
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
