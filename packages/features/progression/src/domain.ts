import { MIN_LEVEL } from './rules.js';
import type { BehaviourSignal, Build } from './rules.js';

/**
 * What a character has earned, and what it is becoming.
 *
 * The record is owned by this feature and the agent row carries a copy of the
 * counters for cheap sorting. Two places holding the same number is a thing to
 * be careful about, and the alternative — reading every agent's history to draw
 * a leaderboard — is worse; this is a projection, and the rule for which one
 * wins is that a derived counter never survives a rebuild.
 */
export interface AgentProgress {
  readonly agentId: string;
  readonly xp: number;
  readonly level: number;
  readonly build: Build;
  /**
   * The individual outcomes, kept so a reclassification is a re-read rather than
   * a guess, and so a mis-awarded one self-corrects on the next award.
   */
  readonly history: readonly BehaviourSignal[];
  readonly updatedAt: string;
}

export interface NewProgress {
  readonly agentId: string;
}

/** The event this feature emits when a character crosses a level. */
export const AGENT_LEVEL_UP = 'agent.level_up';

export interface AgentLevelUpPayload {
  readonly agentId: string;
  readonly level: number;
  readonly previousLevel: number;
  readonly xp: number;
}

/* ───────────────────────────── the three actions that read a payload ───────────────────────────── */

/**
 * Every way this feature refuses a payload, or undefined when it accepts one.
 *
 * One union across the three reading actions, for the reason quest keeps one:
 * the reason exists to be written into a sentence, and a caller that wanted to
 * know WHICH action it was had just named it.
 */
export type ProgressionRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'agent-id-not-a-string' }
  | { readonly reason: 'agent-id-empty' }
  | { readonly reason: 'required-level-not-a-number' }
  | { readonly reason: 'required-level-not-a-whole-number' }
  | { readonly reason: 'required-level-below-one' }
  | { readonly reason: 'event-type-not-a-string' }
  | { readonly reason: 'event-type-empty' };

/** The character a read or a gate is about. */
export interface ProgressionAgentInput {
  readonly agentId: string;
}

/** A gate is a read plus the level being asked about. */
export interface ProgressionGateInput extends ProgressionAgentInput {
  readonly requiredLevel: number;
}

/** An awards question: what would this outcome be worth. */
export interface ProgressionAwardsInput {
  readonly eventType: string;
}

/**
 * Why a read cannot be asked for, or undefined when it can.
 *
 * `unknown`, like every validator here: the payload arrived from `act()` as an
 * unconstrained generic, so `act('progression.read', {})` was a query for
 * `agentId = undefined` and then a TypeError out of the store driver, which
 * names a driver rather than the caller.
 */
export function whyProgressionReadIsRejected(input: unknown): ProgressionRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  return whyAgentIdIsMissing((input as { readonly agentId?: unknown }).agentId);
}

/**
 * Why a gate cannot be asked for, or undefined when it can.
 *
 * The level is checked as a whole number at or above one rather than merely
 * being a number. `meetsGate` is a plain comparison and every character is at
 * least level 1, so a caller who sent 0 — or 0.5 — was told `allowed: true`
 * about a level that is not on the ladder: a gate that opens on a question
 * nobody asked is worse than one that refuses.
 */
export function whyProgressionGateIsRejected(input: unknown): ProgressionRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  const { agentId, requiredLevel } = input as {
    readonly agentId?: unknown;
    readonly requiredLevel?: unknown;
  };

  const missing = whyAgentIdIsMissing(agentId);
  if (missing !== undefined) {
    return missing;
  }
  if (typeof requiredLevel !== 'number') {
    return { reason: 'required-level-not-a-number' };
  }
  if (!Number.isInteger(requiredLevel)) {
    return { reason: 'required-level-not-a-whole-number' };
  }
  if (requiredLevel < MIN_LEVEL) {
    return { reason: 'required-level-below-one' };
  }
  return undefined;
}

/**
 * Why an awards question cannot be asked for, or undefined when it can.
 *
 * The event type is checked as a string and NOT against the outcome table,
 * because an outcome this build has never heard of is a real answer to "what is
 * that worth" and the action already gives it: `recognised: false`. Refusing it
 * would take away the one question a caller with a newer adapter needs to be
 * able to ask.
 */
export function whyProgressionAwardsIsRejected(input: unknown): ProgressionRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  const { eventType } = input as { readonly eventType?: unknown };

  if (typeof eventType !== 'string') {
    return { reason: 'event-type-not-a-string' };
  }
  if (eventType.length === 0) {
    return { reason: 'event-type-empty' };
  }
  return undefined;
}

/** The same three judgements, as guards, so no read below them needs a cast. */
export function isProgressionReadInput(input: unknown): input is ProgressionAgentInput {
  return whyProgressionReadIsRejected(input) === undefined;
}

export function isProgressionGateInput(input: unknown): input is ProgressionGateInput {
  return whyProgressionGateIsRejected(input) === undefined;
}

export function isProgressionAwardsInput(input: unknown): input is ProgressionAwardsInput {
  return whyProgressionAwardsIsRejected(input) === undefined;
}

/** What each action wanted, as a sentence the caller can act on. */
export const PROGRESSION_READ_SHAPE = 'A read takes an agentId, which must be a non-empty string.';
export const PROGRESSION_GATE_SHAPE =
  'A gate takes an agentId, which must be a non-empty string, and a requiredLevel, which must be a whole number of at least 1.';
export const PROGRESSION_AWARDS_SHAPE =
  'An awards question takes an eventType, which must be a non-empty string. A type this build has never heard of is answered, not refused.';

/**
 * The error a refused payload becomes.
 *
 * Built from the verdict, never from the payload: the caller guaranteed to be
 * handed the answer is the one that must not be reading the input.
 */
export function progressionInputRejected(
  action: string,
  rejection: ProgressionRejection,
  expected: string,
): Error {
  return Object.assign(new Error(`${action} rejected: ${rejection.reason}. ${expected}`), {
    code: 'malformed-input',
  });
}

/** Shared so the two actions that name an agent cannot disagree about one. */
function whyAgentIdIsMissing(agentId: unknown): ProgressionRejection | undefined {
  if (typeof agentId !== 'string') {
    return { reason: 'agent-id-not-a-string' };
  }
  if (agentId.length === 0) {
    return { reason: 'agent-id-empty' };
  }
  return undefined;
}
