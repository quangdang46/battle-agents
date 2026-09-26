/**
 * Golden-frame tests: a named rig, at named poses, against committed goldens.
 *
 * The bead asks for a golden rather than a property assertion, and the reason is
 * specific. Every other test in this package can be satisfied by a pose that is
 * wrong in a way the assertion does not describe — a stage that solves IK in the
 * wrong order, a region placed before the solve, a bind matrix applied twice. A
 * golden is the only instrument here that says "this exact frame", so it is the
 * one that catches a pipeline rearranged into something that still typechecks.
 *
 * ## What makes a golden a golden
 *
 * Two properties, and the second is the one that is easy to get wrong:
 *
 * 1. It is COMMITTED. `goldens/agent-16.json` is in the tree and is not produced
 *    by this file. Nothing here writes it, and a test that regenerates its
 *    expectation before comparing it is a test that cannot fail.
 * 2. It is compared EXACTLY. `expect(snapshot).toEqual(golden)` on the whole
 *    object, with no tolerance and no field-by-field loop that skips the ones it
 *    does not understand. A tolerance would be a way of saying "close enough to
 *    be a different pose".
 *
 * The numbers in the file are rounded to six decimals by `poseSnapshot`, which
 * is also what makes them reviewable: a changed digit is a changed digit, not a
 * last-bit difference in the twelfth place.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluate, evaluatePose } from './evaluate.js';
import { poseSnapshot } from './pose.js';
import type { PoseSnapshot } from './pose.js';
import { drawList } from './render.js';
import { ANIMATION_NAMES } from './agent-state.js';
import type { Skeleton } from './skeleton.js';
import { AGENT_16 } from './fixtures/agent-rig.js';

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), 'goldens', 'agent-16.json');

const GOLDENS = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, PoseSnapshot>;

/**
 * The recorded cases, named by the pose and the moment.
 *
 * Five, chosen so that between them every animation the state map can select is
 * exercised, every animated bone in the fixture appears at least once, and two of
 * them rotate the torso — which is what makes the IK solver's parent-angle term
 * load-bearing on a golden rather than a code path nobody walks. Three are loops
 * and two are not, so the sampler's wrap and its hold are both on record. Adding
 * a sixth is a deliberate act with a reason, not something to do because a branch
 * is uncovered.
 */
const CASES = [
  { key: 'reading@0', animationId: 'reading', atMs: 0 },
  { key: 'terminal@450', animationId: 'terminal', atMs: 450 },
  { key: 'damage@100', animationId: 'damage', atMs: 100 },
  { key: 'attack@120', animationId: 'attack', atMs: 120 },
  { key: 'victory@600', animationId: 'victory', atMs: 600 },
] as const;

describe('a named rig poses to a committed golden', () => {
  it('reads a golden file with cases in it, so an empty expectation cannot pass', () => {
    // The failure this guards: a path that quietly stops resolving and `JSON.parse`
    // of undefined, or a filter that matched nothing, and a loop over zero cases
    // that reports success. A golden suite that compares nothing is the exact
    // shape of the gate-that-cannot-fail this repository keeps meeting.
    expect(Object.keys(GOLDENS).sort()).toEqual(CASES.map((entry) => entry.key).sort());
  });

  for (const { key, animationId, atMs } of CASES) {
    it(`${key} matches its golden exactly`, () => {
      const snapshot = poseSnapshot(evaluatePose(AGENT_16, { animationId, atMs }));
      expect(snapshot).toEqual(GOLDENS[key]);
    });
  }

  it('has a golden for every animation the state map can select', () => {
    // The five states map to five animations and this rig has all five. A rig
    // that dropped one would still pass the four cases above, and the gap would
    // surface as an agent that reaches a state and stops moving. Asserting it
    // here rather than in the state-map test is deliberate: this is the RIG's
    // completeness, and the map's totality is a different file's job.
    const requested = new Set(CASES.map((entry) => entry.animationId));
    for (const name of ANIMATION_NAMES) {
      expect(requested, `no golden exercises the "${name}" animation`).toContain(name);
    }
  });
});

describe('bones are identified by id, never by name', () => {
  /**
   * Renames every display name in the rig and demands an identical frame.
   *
   * This is the test the stable-id property is actually made of. Stable ids are a
   * claim; a claim is worth nothing until something has tried to break it, and
   * the thing that breaks an id-based rig is a rename. If any stage anywhere in
   * the pipeline reads `bone.name` — as a lookup key, as a Map index, as a
   * comparison — this goes red, and the failure names the stage.
   *
   * The rename is total and adversarial rather than one bone: names become
   * numeric strings, names that collide with ids, names that collide with each
   * other, and names that are already used by a DIFFERENT bone. A rig that
   * resolved by name at all fails on the collisions alone, and a rig that
   * resolved by id passes all of it.
   */
  it('produces byte-identical poses after every bone is renamed', () => {
    const namesByBone = new Map(AGENT_16.bones.map((bone) => [bone.name, bone.id]));
    expect(
      namesByBone.size,
      'the fixture needs distinct names for the rename to mean anything',
    ).toBe(AGENT_16.bones.length);

    const RENAMES = ['0', '1', '0', 'zzz', 'bone.root', 'id-like', 'id-like', 'q', '', '7'];
    const renamed: Skeleton = {
      ...AGENT_16,
      bones: AGENT_16.bones.map((bone, index) => ({
        ...bone,
        name: RENAMES[index] ?? `r${index}`,
      })),
    };

    for (const { key, animationId, atMs } of CASES) {
      const before = JSON.stringify(poseSnapshot(evaluatePose(AGENT_16, { animationId, atMs })));
      const after = JSON.stringify(poseSnapshot(evaluatePose(renamed, { animationId, atMs })));
      expect(after, `renaming a bone moved the frame for ${key}`).toBe(before);
      // And the same comparison against the committed golden, so this test
      // cannot pass by both rigs being wrong in the same way.
      expect(JSON.parse(after)).toEqual(GOLDENS[key]);
    }
  });

  it('keeps a slot rename from moving anything either', () => {
    // The same property one level down. A renderer that looks art up by slot
    // name rather than by slot id is a renderer that changes what a character is
    // wearing when somebody renames a layer in an editor.
    const renamed: Skeleton = {
      ...AGENT_16,
      slots: AGENT_16.slots.map((slot, index) => ({
        ...slot,
        name: `layer-${AGENT_16.slots.length - index}`,
      })),
      animations: AGENT_16.animations.map((animation) => ({
        ...animation,
        name: `clip-${animation.id}`,
      })),
    };
    for (const { key, animationId, atMs } of CASES) {
      expect(poseSnapshot(evaluatePose(renamed, { animationId, atMs }))).toEqual(GOLDENS[key]);
    }
  });
});

describe('evaluation is deterministic', () => {
  it('yields byte-identical poses for the same rig and request', () => {
    // "Byte for byte" is taken literally: the two snapshots are serialised and
    // the STRINGS compared. Comparing objects with toEqual would pass for two
    // poses whose values differ only by a key insertion order, which is the one
    // difference a caller over a wire would actually notice.
    for (const { key, animationId, atMs } of CASES) {
      const first = JSON.stringify(poseSnapshot(evaluatePose(AGENT_16, { animationId, atMs })));
      const second = JSON.stringify(poseSnapshot(evaluatePose(AGENT_16, { animationId, atMs })));
      const third = JSON.stringify(poseSnapshot(evaluatePose(AGENT_16, { animationId, atMs })));
      expect(second).toBe(first);
      expect(third).toBe(first);
      expect(first).toBe(JSON.stringify(GOLDENS[key]));
    }
  });

  it('does not mutate the rig it was handed', () => {
    // A stage that writes into the skeleton it was given is correct exactly once
    // and wrong on the second evaluation, which is the kind of bug a test that
    // evaluates each case once in a fresh process never sees. Serialising before
    // and after is the cheapest way to catch it, and it caught a real one while
    // this file was being written.
    const before = JSON.stringify(AGENT_16);
    for (const { animationId, atMs } of CASES) evaluate(AGENT_16, { animationId, atMs });
    expect(JSON.stringify(AGENT_16)).toBe(before);
  });

  it('does not mutate a request it was handed', () => {
    const request = Object.freeze({
      animationId: 'attack',
      atMs: 120,
      ikTargets: Object.freeze({ 'ik.leg-r': Object.freeze({ x: 11, y: 18.5 }) }),
    });
    const before = JSON.stringify(request);
    evaluatePose(AGENT_16, request);
    expect(JSON.stringify(request)).toBe(before);
  });
});

describe('the renderer consumes a pose without solving anything', () => {
  it('draws in slot order with bounds that contain every point', () => {
    // The end of the split. `drawList` takes a Pose and returns plain data; the
    // assertions here are about the SHAPE of what comes out, because a renderer
    // that had to re-derive a world transform from bones would need fields this
    // function has no way to ask for.
    const pose = evaluatePose(AGENT_16, { animationId: 'attack', atMs: 120 });
    const list = drawList(pose);

    expect(list.commands.map((command) => command.slotId)).toEqual([
      'slot.leg-l',
      'slot.leg-r',
      'slot.scarf',
      'slot.torso',
      'slot.head',
      'slot.arm-l',
      'slot.arm-r',
    ]);
    expect(list.bounds).not.toBeNull();
    for (const command of list.commands) {
      const points = command.kind === 'region' ? command.corners : command.vertices;
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(list.bounds!.minX);
        expect(point.x).toBeLessThanOrEqual(list.bounds!.maxX);
        expect(point.y).toBeGreaterThanOrEqual(list.bounds!.minY);
        expect(point.y).toBeLessThanOrEqual(list.bounds!.maxY);
      }
    }
  });

  it('reaches every attachment a slot names, and nothing a slot does not', () => {
    const pose = evaluatePose(AGENT_16, { animationId: 'reading', atMs: 0 });
    const drawn = [...pose.regions, ...pose.meshes].map((drawn_) => drawn_.slotId).sort();
    const slotsWithArt = AGENT_16.slots
      .filter((slot) => slot.attachmentId !== null)
      .map((slot) => slot.id)
      .sort();
    expect(drawn).toEqual(slotsWithArt);
  });
});
