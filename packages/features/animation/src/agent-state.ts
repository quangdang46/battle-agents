/**
 * The five agent states and the five animations they select.
 *
 * Plan section 9.2 states the mapping this file is: agent state (reading,
 * testing, failed, fixed, battling) selects a reading / terminal / damage /
 * victory / attack animation. It is the reason a game engine decides the
 * animation rather than a spritesheet hardcoding it — a skeletal rig exposes
 * structured state that something upstream sets, and this is the table that sets
 * it.
 *
 * ## Why the error path matters more than the happy path
 *
 * The tempting implementation is a lookup with a fallback:
 *
 *     const clip = AGENT_STATE_ANIMATION[state] ?? 'idle';
 *
 * and it is wrong in a way nothing else in this package is. A fallback makes the
 * table look complete when it is not: an agent that reaches a state nobody mapped
 * stands in a generic idle while the game reads as though it is responding, and
 * the gap surfaces only when somebody watches that specific agent at that
 * specific moment. A test that checks the five named states resolve passes either
 * way. So both halves are closed here:
 *
 * - `AGENT_STATE_ANIMATION` is typed `Record<AgentState, AnimationName>`, so it
 *   is exhaustive at compile time — a sixth state is a build error until
 *   somebody decides what it does.
 * - `animationForState` takes a `string` and REFUSES one that is not in the
 *   table. It cannot return a default; it has no parameter to return one. The
 *   union type is the answer to "what does an unmapped state animate as", and
 *   the answer is that it does not animate, it fails.
 *
 * Nothing here decides a game outcome. It maps a state to the NAME of a pose and
 * stops. What the rig does with the name is a renderer's problem; whether the
 * rig HAS the name is `poseRequestForState`'s problem, and it fails loudly there
 * too.
 */

import { UnknownAnimationError } from './pose.js';
import type { PoseRequest } from './pose.js';
import { animationsOf } from './skeleton.js';
import type { Skeleton } from './skeleton.js';

/**
 * Every state an agent can be in.
 *
 * A value, not just a type, so the list the table is checked against has one
 * definition. `agent-state.test.ts` iterates it, and a test that iterated a
 * hand-written list would agree with a table that had lost an entry.
 */
export const AGENT_STATES = ['reading', 'testing', 'failed', 'fixed', 'battling'] as const;
export type AgentState = (typeof AGENT_STATES)[number];

/** Every animation a rig is expected to have. Named by the plan, not by this package. */
export const ANIMATION_NAMES = ['reading', 'terminal', 'damage', 'victory', 'attack'] as const;
export type AnimationName = (typeof ANIMATION_NAMES)[number];

/**
 * State to animation. Total over `AgentState`, by construction.
 *
 * A `Record` over a union rather than a `Map`, so the compiler checks it against
 * `AgentState` and a state added to `AGENT_STATES` without an entry here fails
 * the build rather than being missing at runtime. Frozen, because a temporary
 * edit to this table from a consumer is a way for two characters on the same
 * screen to animate differently with nothing in any log.
 */
export const AGENT_STATE_ANIMATION: Readonly<Record<AgentState, AnimationName>> = Object.freeze({
  reading: 'reading',
  testing: 'terminal',
  failed: 'damage',
  fixed: 'victory',
  battling: 'attack',
});

/** Thrown for a state outside the five. Named so a caller can catch it specifically. */
export class UnknownAgentStateError extends Error {
  constructor(
    readonly state: string,
    readonly known: readonly string[],
  ) {
    super(
      `no animation is mapped for agent state "${state}". Known states: ${known.join(', ')}. ` +
        'Mapping it to a generic animation would make an unmapped state look handled, so this ' +
        'refuses instead — add the state to AGENT_STATES and to AGENT_STATE_ANIMATION.',
    );
    this.name = 'UnknownAgentStateError';
  }
}

/**
 * The animation a state selects. Throws for a state that is not one of the five.
 *
 * `hasOwnProperty` rather than a truthiness check, so a state called
 * `constructor` or `toString` is not answered out of `Object.prototype` — a
 * lookup that returns a function where an animation name belongs is a type lie
 * that TypeScript will not catch, because the value came from a string.
 */
export function animationForState(state: string): AnimationName {
  const mapped: AnimationName | undefined = Object.prototype.hasOwnProperty.call(
    AGENT_STATE_ANIMATION,
    state,
  )
    ? AGENT_STATE_ANIMATION[state as AgentState]
    : undefined;
  if (mapped === undefined) throw new UnknownAgentStateError(state, AGENT_STATES);
  return mapped;
}

/** Whether a string is one of the five. For a caller validating untrusted input. */
export function isAgentState(state: string): state is AgentState {
  return Object.prototype.hasOwnProperty.call(AGENT_STATE_ANIMATION, state);
}

/**
 * The request that poses a rig in a given agent state.
 *
 * The whole integration surface: a game state in, a pose request out, with the
 * game engine rather than the rig deciding what the character is doing. `atMs` is
 * a parameter because a caller playing a loop has to be able to ask for a
 * moment; the animation's own `loop` flag decides what happens past its end.
 *
 * Fails on the second axis the mapping can be incomplete on. A state maps to an
 * animation NAME, and a rig that does not have that animation cannot play it.
 * Substituting the first animation the rig does have would make a rig missing
 * two of the five look like it is animating, which is the same failure as the
 * silent default one level up.
 */
export function poseRequestForState(skeleton: Skeleton, state: string, atMs: number): PoseRequest {
  const animationId = animationForState(state);
  if (!animationsOf(skeleton).has(animationId)) {
    throw new UnknownAnimationError(skeleton.id, animationId);
  }
  return Object.freeze({ animationId, atMs });
}
