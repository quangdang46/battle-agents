/**
 * The state map is total over the five states, and refuses everything else.
 *
 * The bead's criterion, and the part of it worth being careful about is the
 * second half. A test that walks the five named states and asserts each resolves
 * passes just as happily against `AGENT_STATE_ANIMATION[state] ?? 'idle'` — and
 * that implementation is the failure the criterion is about, because an agent
 * that reaches a state nobody mapped then stands in a generic pose while the
 * game reads as though it is responding.
 *
 * So the tests below are paired: one asserts each named state resolves to the
 * animation the plan names, and the others assert that a state OUTSIDE the five
 * throws rather than resolving. The second group is the one that would catch the
 * fallback, and it is deliberately built out of shapes a `??` gets wrong in
 * different ways — an unknown word, an empty string, a name that exists on
 * `Object.prototype`, and a near-miss like `Reading`.
 */

import { describe, expect, it } from 'vitest';

import {
  AGENT_STATE_ANIMATION,
  AGENT_STATES,
  ANIMATION_NAMES,
  UnknownAgentStateError,
  animationForState,
  isAgentState,
  poseRequestForState,
} from './agent-state.js';
import { UnknownAnimationError } from './pose.js';
import { evaluatePose } from './evaluate.js';
import { AGENT_16 } from './fixtures/agent-rig.js';
import type { Skeleton } from './skeleton.js';

/** The mapping plan section 9.2 states, restated so a change to either is a failure. */
const EXPECTED: Readonly<Record<string, string>> = {
  reading: 'reading',
  testing: 'terminal',
  failed: 'damage',
  fixed: 'victory',
  battling: 'attack',
};

describe('the five agent states and the five animations', () => {
  it('names exactly the five states and the five animations the bead names', () => {
    expect([...AGENT_STATES]).toEqual(['reading', 'testing', 'failed', 'fixed', 'battling']);
    expect([...ANIMATION_NAMES]).toEqual(['reading', 'terminal', 'damage', 'victory', 'attack']);
  });

  it('resolves every state to the animation the plan names', () => {
    for (const state of AGENT_STATES) {
      expect(animationForState(state), `state "${state}" resolved to the wrong animation`).toBe(
        EXPECTED[state],
      );
    }
  });

  it('maps each state to the animation, with no entry left out and none invented', () => {
    // Checked as a whole object rather than by iteration, so a REMOVED entry and
    // an EXTRA entry both fail. Iterating the keys would pass on a table that
    // had grown a sixth mapping nobody asked for, and comparing lengths alone
    // would pass on one that had dropped a state and added a duplicate.
    expect(AGENT_STATE_ANIMATION).toEqual(EXPECTED);
  });

  it('is frozen, because a temporary edit from a consumer is how two characters diverge', () => {
    expect(Object.isFrozen(AGENT_STATE_ANIMATION)).toBe(true);
  });

  it('produces a different pose for each state, so a mapping that always answered the same would fail', () => {
    // A map with five correct-looking entries that all pointing at one animation
    // would satisfy every assertion above except this one, and it would look
    // completely right in a screenshot of a character that was barely moving.
    //
    // Sampled at each animation's MIDPOINT rather than at zero, and the reason
    // matters: `damage` and `attack` both start at the rest pose, so a zero-time
    // comparison finds those two identical and reports a failure that is really
    // a property of the fixture. The instant a comparison happens is part of the
    // claim, not a detail of the test.
    const seen = new Map<string, string>();
    for (const state of AGENT_STATES) {
      const animationId = animationForState(state);
      const animation = AGENT_16.animations.find((entry) => entry.id === animationId)!;
      const pose = evaluatePose(AGENT_16, {
        animationId,
        atMs: Math.round(animation.durationMs / 2),
      });
      const key = JSON.stringify([
        ...pose.regions.map((region) => region.matrix),
        ...pose.meshes.map((mesh) => mesh.vertices),
      ]);
      expect(
        seen.get(key),
        `state "${state}" poses identically to "${seen.get(key)}"`,
      ).toBeUndefined();
      seen.set(key, state);
    }
    expect(seen.size).toBe(AGENT_STATES.length);
  });
});

describe('an unmapped state is a loud failure, not a fallback', () => {
  /**
   * The shapes a lookup with a default gets wrong differently.
   *
   * Each of these is here because it defeats a DIFFERENT implementation, so a
   * list of five is not five copies of the same assertion:
   *
   * - `'idle'` is the fallback a real implementation would reach for, and the
   *   one this criterion exists to forbid.
   * - `'Reading'` and `'reading '` are near misses. A lookup that lowercases or
   *   trims before indexing passes those, which is a second silent default
   *   wearing a normalisation step.
   * - `'constructor'` and `'toString'` are on `Object.prototype`, so a lookup
   *   that reads `AGENT_STATE_ANIMATION[state]` without `hasOwnProperty` returns
   *   a FUNCTION where an animation name belongs. The result is a type lie that
   *   TypeScript cannot catch, because the value came in as a string.
   * - `''` and `'   '` are what an unset field looks like on the wire.
   */
  const UNMAPPED = [
    'idle',
    'Reading',
    'reading ',
    ' constructor',
    'toString',
    'valueOf',
    '__proto__',
    '',
    '   ',
    'reading,testing',
  ];

  for (const state of UNMAPPED) {
    it(`refuses ${JSON.stringify(state)}`, () => {
      expect(() => animationForState(state)).toThrow(UnknownAgentStateError);
      expect(() => animationForState(state)).toThrow(/no animation is mapped/);
      expect(isAgentState(state)).toBe(false);
    });
  }

  it('names the states it does know, so the failure is actionable', () => {
    // A bare "unknown state" is a message that sends the reader to the source to
    // work out which five were meant. The list is in the error because a caller
    // receiving this over a wire has no source to read.
    try {
      animationForState('idle');
      expect.unreachable('animationForState should have thrown for "idle"');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownAgentStateError);
      const unknown = error as UnknownAgentStateError;
      expect(unknown.state).toBe('idle');
      expect([...unknown.known]).toEqual([...AGENT_STATES]);
      expect(unknown.message).toContain('reading, testing, failed, fixed, battling');
    }
  });

  it('reports the same for every state that is not one of the five, and no animation for any of them', () => {
    // The property the table does not have, stated directly: the function's
    // range is a SUBSET of the five animations and its domain outside the five
    // states is empty. A `??` makes the range all five and the domain everything.
    const answers = UNMAPPED.map((state) => {
      try {
        return animationForState(state);
      } catch {
        return 'threw';
      }
    });
    expect(answers).toEqual(UNMAPPED.map(() => 'threw'));
  });
});

describe('a state maps to a pose the rig can actually play', () => {
  it('builds a request for each state and evaluates it', () => {
    for (const state of AGENT_STATES) {
      const request = poseRequestForState(AGENT_16, state, 250);
      expect(request.animationId).toBe(EXPECTED[state]);
      expect(evaluatePose(AGENT_16, request).regions.length).toBeGreaterThan(0);
    }
  });

  it('refuses a state the rig has no animation for, rather than substituting one', () => {
    // The same silent-default failure one level up. A rig missing `damage` that
    // fell back to the first animation it does have would look like it is
    // animating, and the agent would appear to shrug instead of flinching.
    const withoutDamage: Skeleton = {
      ...AGENT_16,
      animations: AGENT_16.animations.filter((animation) => animation.id !== 'damage'),
    };
    expect(() => poseRequestForState(withoutDamage, 'failed', 0)).toThrow(UnknownAnimationError);
    expect(() => poseRequestForState(withoutDamage, 'failed', 0)).toThrow(
      /has no animation "damage"/,
    );

    // And the states the shortened rig CAN still play are unaffected, which is
    // what makes the refusal a per-state failure rather than the feature being
    // simply absent.
    expect(poseRequestForState(withoutDamage, 'reading', 0).animationId).toBe('reading');
  });

  it('refuses an unmapped state before it ever looks at the rig', () => {
    // The order matters and is asserted rather than assumed: a caller that passed
    // an unknown state AND a rig that does not exist should hear about the state,
    // because that is the mistake they made.
    expect(() => poseRequestForState(AGENT_16, 'idle', 0)).toThrow(UnknownAgentStateError);
  });
});
