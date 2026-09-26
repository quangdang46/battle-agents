/**
 * The runtime surface: one capability, one action, and what it refuses.
 *
 * The action is the only way into this package from outside it, so the tests
 * here are mostly about the refusals. A pose evaluator answers "here is a frame"
 * for anything it is handed, and the boundary is where the interesting failures
 * are: a skeleton that is not installed, an input that is not shaped like an
 * input, a pose the rig does not have.
 *
 * What this file deliberately does NOT test is that a frame is correct — that is
 * `golden-frames.test.ts`, and re-asserting it here through the action would be
 * a second copy of the same goldens to keep in step.
 */

import { describe, expect, it } from 'vitest';

import { createRuntime } from '@battle-agents/core';
import type { EventBus, StateStore } from '@battle-agents/core';

import { ANIMATION_POSE, animationFeature } from './feature.js';
import { animationInputRejected, isAnimationPoseInput } from './input.js';
import { AGENT_16, AGENT_16_ID } from './fixtures/agent-rig.js';
import { poseSnapshot } from './pose.js';
import { evaluatePose } from './evaluate.js';
import { AGENT_STATES, poseRequestForState } from './agent-state.js';
import type { Skeleton } from './skeleton.js';

function install(skeletons: readonly Skeleton[] = [AGENT_16]) {
  const bus: EventBus = { publish: () => undefined, subscribe: () => () => undefined };
  const store: StateStore = {
    append: async () => undefined,
    load: () => undefined,
    save: async () => undefined,
  };
  return createRuntime({ extensions: [animationFeature({ skeletons })], store, bus });
}

describe('the feature declares itself to the runtime', () => {
  it('installs as "animation" and offers exactly one capability, named after its action', () => {
    const runtime = install();
    expect(runtime.domains()).toContain('animation');
    expect(runtime.capabilities()).toEqual([ANIMATION_POSE]);
    expect(runtime.actions()).toEqual([ANIMATION_POSE]);
  });

  it('runs no action when it is not installed, which is what makes it removable', () => {
    // The removability criterion's first half, from the runtime's side. The other
    // half — that removing it leaves the game CORRECT, not merely standing — is
    // the module-graph test in tests/unit/animation-removability.test.ts, because
    // a runtime that simply has no animation domain says nothing about whether
    // anything else changed.
    const runtime = install();
    runtime.uninstall('animation');
    expect(runtime.domains()).not.toContain('animation');
    expect(runtime.actions()).toEqual([]);
    return expect(runtime.runAction(ANIMATION_POSE, {})).rejects.toThrow();
  });

  it('declares no command, no event handler and nothing to persist', () => {
    // Plan section 24 describes this feature as subscribing to visual events and
    // projecting them to stored poses. That is deliberately NOT what ships, and
    // this is the test that says so: a handler that wrote poses nothing reads
    // would make the feature look integrated while every gate stayed green. See
    // the header comment in feature.ts for the whole argument.
    const feature = animationFeature({ skeletons: [AGENT_16] });
    expect(feature.commands ?? []).toEqual([]);
    expect(feature.eventHandlers ?? []).toEqual([]);
    expect(feature.persistedEvents ?? []).toEqual([]);
    expect(feature.requires ?? []).toEqual([]);
  });
});

describe('the pose action', () => {
  it('returns the same snapshot a direct evaluation does', async () => {
    const runtime = install();
    const overAction = await runtime.runAction(ANIMATION_POSE, {
      skeletonId: AGENT_16_ID,
      animationId: 'attack',
      atMs: 120,
    });
    const direct = poseSnapshot(evaluatePose(AGENT_16, { animationId: 'attack', atMs: 120 }));
    expect(overAction).toEqual(direct);
  });

  it('poses each of the five states, through the map rather than by naming a clip', async () => {
    // The integration surface the bead asks for, end to end: a game state in, a
    // frame out, with nothing in between deciding what the character is doing.
    const runtime = install();
    for (const state of AGENT_STATES) {
      const request = poseRequestForState(AGENT_16, state, 250);
      const frame = await runtime.runAction(ANIMATION_POSE, {
        skeletonId: AGENT_16_ID,
        ...request,
      });
      expect(frame).toMatchObject({ skeletonId: AGENT_16_ID, animationId: request.animationId });
      expect((frame as { regions: unknown[] }).regions.length).toBeGreaterThan(0);
    }
  });

  it('refuses a skeleton this runtime does not have, and names the ones it does', async () => {
    const runtime = install();
    await expect(
      runtime.runAction(ANIMATION_POSE, {
        skeletonId: 'agent-32',
        animationId: 'reading',
        atMs: 0,
      }),
    ).rejects.toThrow(/no skeleton "agent-32" is installed.*agent-16/s);
  });

  it('refuses a pose the rig does not have, and says which rig', async () => {
    const runtime = install();
    await expect(
      runtime.runAction(ANIMATION_POSE, {
        skeletonId: AGENT_16_ID,
        animationId: 'dancing',
        atMs: 0,
      }),
    ).rejects.toThrow(/skeleton "agent-16" has no animation "dancing"/);
  });

  it('passes a bone override and an IK target through to the evaluator', async () => {
    const runtime = install();
    const pinned = await runtime.runAction(ANIMATION_POSE, {
      skeletonId: AGENT_16_ID,
      animationId: 'reading',
      atMs: 0,
      boneOverrides: { 'bone.arm-l': { angle: 1.25 } },
      ikTargets: { 'ik.leg-l': { x: 4, y: 19 } },
    });
    const foot = (
      pinned as { bones: { boneId: string; origin: { x: number; y: number } }[] }
    ).bones.find((bone) => bone.boneId === 'bone.foot-l')!;
    expect(foot.origin.x).toBeCloseTo(4, 6);
  });
});

describe('the wire boundary narrows before anything reads it', () => {
  const BAD: readonly [string, unknown][] = [
    ['null', null],
    ['a string', 'reading'],
    ['an array', []],
    ['no skeletonId', { animationId: 'reading', atMs: 0 }],
    ['an empty skeletonId', { skeletonId: '', animationId: 'reading', atMs: 0 }],
    ['no animationId', { skeletonId: AGENT_16_ID, atMs: 0 }],
    ['a stringy atMs', { skeletonId: AGENT_16_ID, animationId: 'reading', atMs: '120' }],
    ['a NaN atMs', { skeletonId: AGENT_16_ID, animationId: 'reading', atMs: Number.NaN }],
    ['a negative atMs', { skeletonId: AGENT_16_ID, animationId: 'reading', atMs: -1 }],
    [
      'an override on an unknown bone property',
      {
        skeletonId: AGENT_16_ID,
        animationId: 'reading',
        atMs: 0,
        boneOverrides: { 'bone.head': { rotation: 1 } },
      },
    ],
    [
      'an override that is not an object',
      {
        skeletonId: AGENT_16_ID,
        animationId: 'reading',
        atMs: 0,
        boneOverrides: { 'bone.head': 3 },
      },
    ],
    [
      'an IK target that is not a point',
      {
        skeletonId: AGENT_16_ID,
        animationId: 'reading',
        atMs: 0,
        ikTargets: { 'ik.leg-l': { x: 1 } },
      },
    ],
    [
      'a non-finite IK target',
      {
        skeletonId: AGENT_16_ID,
        animationId: 'reading',
        atMs: 0,
        ikTargets: { 'ik.leg-l': { x: Number.POSITIVE_INFINITY, y: 0 } },
      },
    ],
  ];

  for (const [label, input] of BAD) {
    it(`refuses ${label}, naming the field`, () => {
      expect(isAnimationPoseInput(input)).toBe(false);
      const reason = animationInputRejected(input);
      expect(reason).toMatch(/[a-z]/);
      // A reason that does not name a field sends the reader to the source.
      expect(reason, `"${reason}" names no field`).toMatch(
        /skeletonId|animationId|atMs|boneOverrides|ikTargets|takes an object/,
      );
    });

    it(`refuses ${label} at the action, too`, async () => {
      const runtime = install();
      await expect(runtime.runAction(ANIMATION_POSE, input)).rejects.toThrow();
    });
  }

  it('accepts a well-formed input, and one with neither optional field', () => {
    expect(isAnimationPoseInput({ skeletonId: AGENT_16_ID, animationId: 'reading', atMs: 0 })).toBe(
      true,
    );
    expect(
      isAnimationPoseInput({
        skeletonId: AGENT_16_ID,
        animationId: 'reading',
        atMs: 0,
        boneOverrides: {},
        ikTargets: {},
      }),
    ).toBe(true);
  });
});
