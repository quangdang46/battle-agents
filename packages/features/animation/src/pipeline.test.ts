/**
 * The pipeline's stages, each tested against the property that makes it a stage.
 *
 * `golden-frames.test.ts` says "this exact frame". This file says WHY that frame
 * is the right one, and it is the file that keeps the stage order honest: a
 * pipeline rearranged into something that still produces a plausible picture is
 * the failure the split exists to prevent, and a golden alone cannot tell you
 * which stage moved.
 *
 * So each stage gets a test that would go red if that stage were removed, run
 * early, or given the wrong input:
 *
 * - sampling: what a moment in an animation means, and that it does not mutate.
 * - FK: a chain, composed in the documented order.
 * - IK: a foot lands on its target, from every direction, and a target out of
 *   reach is clamped rather than producing NaN.
 * - skinning: a mesh returns to its rest shape when nothing moves, and bends
 *   when something does.
 * - region transform: a region inherits its bone's transform, and the pivot is
 *   applied in the bone's own space rather than the world's.
 */

import { describe, expect, it } from 'vitest';

import { evaluate, evaluatePose } from './evaluate.js';
import { composeAffine, applyPoint, localFrameToAffine } from './geometry.js';
import { forwardKinematics, worldAngle } from './fk.js';
import { predictedTip, solveTwoBone } from './ik.js';
import { regionMatrix } from './regions.js';
import { invertAffine, skinMesh } from './skinning.js';
import { animationIds, sampleKeysAt, sampleTime } from './sampling.js';
import {
  isMeshAttachment,
  isRegionAttachment,
  validateSkeleton,
  InvalidSkeletonError,
} from './skeleton.js';
import { UnknownAnimationError } from './pose.js';
import { AGENT_16 } from './fixtures/agent-rig.js';
import type { LocalFrame, Point } from './pose.js';
import type { MeshAttachment, Skeleton } from './skeleton.js';

const REST = new Map(AGENT_16.bones.map((bone) => [bone.id, bone.setup] as const));

describe('sampling turns a moment into one local frame per bone', () => {
  it('wraps a looping animation and holds a one-shot past its end', () => {
    const loop = AGENT_16.animations.find((animation) => animation.id === 'reading')!;
    const oneShot = AGENT_16.animations.find((animation) => animation.id === 'damage')!;
    // 1600 is the reading clip's duration, so a request at 1850 lands at 250 —
    // the arithmetic is written out rather than left to a reader who has to go
    // and look up which clip this is.
    expect(sampleTime(loop, 1850)).toBe(250);
    expect(sampleTime(loop, -350)).toBe(1250);
    expect(sampleTime(loop, 1600)).toBe(0);
    expect(sampleTime(oneShot, 9000)).toBe(oneShot.durationMs);
    expect(sampleTime(oneShot, -50)).toBe(0);
  });

  it('reports the SAMPLED moment, not the requested one', () => {
    // A pose that claimed to be at 1250ms while sampling 250 would make every
    // golden ambiguous about which moment it recorded.
    expect(evaluatePose(AGENT_16, { animationId: 'reading', atMs: 1850 }).atMs).toBe(250);
    expect(evaluatePose(AGENT_16, { animationId: 'damage', atMs: 1250 }).atMs).toBe(400);
  });

  it('interpolates linearly between keys and holds outside them', () => {
    const keys = [
      { atMs: 100, value: 0 },
      { atMs: 200, value: 10 },
    ];
    expect(sampleKeysAt(keys, 150, -1)).toBe(5);
    expect(sampleKeysAt(keys, 0, -1)).toBe(0);
    expect(sampleKeysAt(keys, 10_000, -1)).toBe(10);
    // A channel with no keys returns the REST value, not zero: zero is a
    // plausible `angle` and a collapsed character for `scaleX`.
    expect(sampleKeysAt([], 150, 0.75)).toBe(0.75);
  });

  it('lets a request override a bone the animation also animates', () => {
    // An override is a correction to a sampled pose, so it lands last and wins.
    // If it landed first, the animation would overwrite the caller's value and
    // the request would look accepted while having done nothing.
    const sampled = evaluatePose(AGENT_16, { animationId: 'attack', atMs: 120 });
    const pinned = evaluatePose(AGENT_16, {
      animationId: 'attack',
      atMs: 120,
      boneOverrides: { 'bone.arm-r': { angle: 0 } },
    });
    const angleOf = (pose: typeof sampled, id: string): number => pose.bones.get(id)!.angle;
    // `angle` is a bone's LOCAL angle, so pinning the arm's to zero leaves its
    // WORLD angle equal to the torso's -8 degrees, not to zero. Asserting
    // against zero would be asserting a different rig; asserting against the
    // parent is what says "the override won" rather than "the number got small".
    expect(angleOf(sampled, 'bone.arm-r')).toBeCloseTo(-118 * (Math.PI / 180), 6);
    expect(angleOf(pinned, 'bone.arm-r')).toBeCloseTo(angleOf(pinned, 'bone.torso'), 9);
  });

  it('refuses a pose the rig does not have', () => {
    expect(() => evaluatePose(AGENT_16, { animationId: 'dancing', atMs: 0 })).toThrow(
      UnknownAnimationError,
    );
  });

  it("lists the rig's poses, and the state map asks for all five of them", () => {
    expect([...animationIds(AGENT_16)].sort()).toEqual([
      'attack',
      'damage',
      'reading',
      'terminal',
      'victory',
    ]);
  });
});

describe('forward kinematics composes a chain parents first', () => {
  it('places a child at the parent origin plus the child offset, turned by the parent', () => {
    const worlds = forwardKinematics(AGENT_16, REST);
    // torso is at root's origin with no offset; head hangs six above the torso.
    expect(worlds.get('bone.torso')!.originX).toBeCloseTo(8, 9);
    expect(worlds.get('bone.head')!.originY).toBeCloseTo(7, 9);
    // arm-l is three left and three up of the torso: an UNROTATED offset, so the
    // numbers are exact. An implementation that applied the parent's rotation to
    // a zero-angle parent is indistinguishable here, which is why the rotated
    // case below is the one that carries the weight.
    expect(worlds.get('bone.arm-l')!.originX).toBeCloseTo(5, 9);
    expect(worlds.get('bone.arm-l')!.originY).toBeCloseTo(10, 9);
  });

  it("turns a child offset by its parent's rotation", () => {
    // A parent rotated 90 degrees puts a child that was below it to one side.
    // Composing the wrong way round puts it above, and the difference is a whole
    // quadrant of the screen rather than a rounding error.
    const rest = (x: number, y: number, angle: number): LocalFrame => ({
      x,
      y,
      angle,
      scaleX: 1,
      scaleY: 1,
    });
    const rig: Skeleton = {
      id: 'two',
      name: 'two',
      bones: [
        { id: 'a', name: 'a', parentId: null, setup: rest(0, 0, Math.PI / 2) },
        { id: 'b', name: 'b', parentId: 'a', setup: rest(0, 4, 0) },
      ],
      slots: [],
      attachments: [],
      ik: [],
      animations: [],
    };
    const locals = new Map(rig.bones.map((bone) => [bone.id, bone.setup] as const));
    const worlds = forwardKinematics(rig, locals);
    // Stated as the composition rather than as a number, because the SIGN depends
    // on which way a positive angle turns and that is not the property under
    // test: the property is that the parent's transform was applied to the
    // child's offset AT ALL. An implementation that ignored the parent puts the
    // child at (0,4) and this comparison fails by 8.
    const parentWorld = applyPoint(localFrameToAffine(locals.get('a')!), {
      x: locals.get('b')!.x,
      y: locals.get('b')!.y,
    });
    expect(worlds.get('b')!.originX).toBeCloseTo(parentWorld.x, 9);
    expect(worlds.get('b')!.originY).toBeCloseTo(parentWorld.y, 9);
    // And that is NOT where the child would be with an unrotated parent, so the
    // assertion is not passing for a reason that has nothing to do with rotation.
    expect(Math.hypot(worlds.get('b')!.originX, worlds.get('b')!.originY)).toBeCloseTo(4, 9);
  });

  it("reports a bone's world angle as the parent's plus its own", () => {
    const worlds = forwardKinematics(AGENT_16, REST);
    expect(worldAngle(worlds.get('bone.torso')!.world)).toBeCloseTo(0, 9);
    expect(worldAngle(worlds.get('bone.head')!.world)).toBeCloseTo(0, 9);
  });
});

describe('inverse kinematics puts a foot where it was told to put it', () => {
  /**
   * The property, stated once: for a target the limb can reach, the tip's world
   * position IS the target.
   *
   * Swept rather than sampled, and from a rig with no animation on it, so what
   * is under test is the solver and not the sampler. A single target would pass
   * against a solver that is only correct straight ahead.
   */
  it('reaches a target from every direction, for both bend directions', () => {
    // Targets are ABSOLUTE world points and the two hips are at different
    // places, so each leg is given its own target placed RADIUS away from its
    // OWN hip. Handing both legs one shared point looks equivalent and is not:
    // it puts the right leg's target 13 units from the right hip, which is
    // outside a 7-unit limb, and the sweep then reports a clamping failure for a
    // reason that has nothing to do with the solver.
    const { pose: rest } = evaluate(AGENT_16, { animationId: 'reading', atMs: 0 });
    const RADIUS = 4;
    const CHAIN = [
      { constraint: 'ik.leg-l', tip: 'bone.foot-l' },
      { constraint: 'ik.leg-r', tip: 'bone.foot-r' },
    ] as const;

    for (let degrees = 0; degrees < 360; degrees += 15) {
      const angle = (degrees * Math.PI) / 180;
      const targets: Record<string, Point> = {};
      for (const { constraint, tip } of CHAIN) {
        const hipId = tip.replace('foot', 'hip');
        const hip = rest.bones.get(hipId)!.origin;
        targets[constraint] = {
          x: hip.x + Math.cos(angle) * RADIUS,
          y: hip.y + Math.sin(angle) * RADIUS,
        };
      }
      const { pose } = evaluate(AGENT_16, { animationId: 'reading', atMs: 0, ikTargets: targets });
      for (const { constraint, tip } of CHAIN) {
        const reached = pose.bones.get(tip)!.origin;
        const target = targets[constraint]!;
        // 1e-6 on a 4-unit radius: the error of composing and re-reading the same
        // two matrices, not a tolerance for a wrong answer.
        expect(
          Math.hypot(reached.x - target.x, reached.y - target.y),
          `${constraint} at ${degrees} degrees`,
        ).toBeLessThan(1e-6);
      }
    }
  });

  it('agrees with an independent prediction of where the tip should land', () => {
    // `predictedTip` computes the tip's position straight from the two law-of-
    // cosines formulae, without going through the write-back path. Comparing the
    // two is a check on `solveConstraint` rather than on itself.
    const root: Point = { x: 0, y: 0 };
    const target: Point = { x: 2, y: 3 };
    const expected = predictedTip(root, target, 3.5, 3.5, 1);
    const solution = solveTwoBone(root, target, 3.5, 3.5, 1);
    const mid: Point = {
      x: Math.cos(solution.upperWorldAngle) * 3.5,
      y: Math.sin(solution.upperWorldAngle) * 3.5,
    };
    const lower = solution.upperWorldAngle + Math.PI - solution.midInterior;
    expect(mid.x + Math.cos(lower) * 3.5).toBeCloseTo(expected.x, 9);
    expect(mid.y + Math.sin(lower) * 3.5).toBeCloseTo(expected.y, 9);
    // The target is well inside the limb's reach, so the tip LANDS on it — which
    // is the whole claim, and the reason `predictedTip` exists: a second
    // computation of where the tip should be, from the formulae alone, to check
    // the write-back path against.
    expect(solution.onTarget).toBe(true);
    expect(solution.solvedDistance).toBeCloseTo(Math.hypot(target.x, target.y), 9);
    expect(Math.hypot(expected.x - target.x, expected.y - target.y)).toBeCloseTo(0, 9);
  });

  it('clamps a target out of reach instead of producing a number that is not one', () => {
    // A target further than the limb can extend has no solution, and the cosine
    // argument leaves its domain. The symptom without a clamp is a NaN that
    // propagates into every region transform and makes the character disappear —
    // so this asserts both the clamp AND the absence of a non-finite number,
    // because a clamp that produced `Infinity` would satisfy the first.
    const { pose, ik } = evaluate(AGENT_16, {
      animationId: 'reading',
      atMs: 0,
      ikTargets: { 'ik.leg-l': { x: 400, y: 400 } },
    });
    const diagnostic = ik.find((entry) => entry.constraintId === 'ik.leg-l')!;
    expect(diagnostic.onTarget).toBe(false);
    expect(diagnostic.stretch).toBeGreaterThan(1);
    // Out of reach by a factor of ~50, so the tip sits at the limit, which for a
    // 7-long leg from a hip 6 above the ground is a point a long way up-right.
    const reached = pose.bones.get('bone.foot-l')!.origin;
    const hip = pose.bones.get('bone.hip-l')!.origin;
    expect(Math.hypot(reached.x - hip.x, reached.y - hip.y)).toBeCloseTo(7, 6);
    for (const value of [reached.x, reached.y, pose.atMs]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('honours a request that moves ONE foot, and leaves the other where it was', () => {
    // The case a totality check on `ikTargets` gets wrong: a caller moving one
    // foot is ordinary, and a check that demanded the map name every constraint
    // would refuse it. A test that only ever passed both feet together would not
    // have found that.
    const before = evaluatePose(AGENT_16, { animationId: 'reading', atMs: 0 });
    const after = evaluatePose(AGENT_16, {
      animationId: 'reading',
      atMs: 0,
      ikTargets: { 'ik.leg-l': { x: 5.5, y: 15 } },
    });
    expect(after.bones.get('bone.foot-l')!.origin.y).toBeCloseTo(15, 6);
    expect(after.bones.get('bone.foot-r')!.origin.y).toBeCloseTo(
      before.bones.get('bone.foot-r')!.origin.y,
      9,
    );
  });

  it('reports what each solve did, so a foot that missed is visible', () => {
    const { ik } = evaluate(AGENT_16, { animationId: 'reading', atMs: 0 });
    expect(ik.map((entry) => entry.constraintId)).toEqual(['ik.leg-l', 'ik.leg-r']);
    for (const entry of ik) {
      expect(entry.onTarget).toBe(true);
      expect(entry.reached.x).toBeCloseTo(entry.target.x, 6);
      expect(entry.reached.y).toBeCloseTo(entry.target.y, 6);
    }
  });

  it('solves constraints in their declared order, not the order they were written', () => {
    // Two constraints on the same limb is a rig whose output depends on sequence,
    // and a rig whose output depends on the order somebody happened to type an
    // array has goldens that move when a file is alphabetised.
    const swapped: Skeleton = {
      ...AGENT_16,
      ik: [...AGENT_16.ik].reverse(),
    };
    const request = { animationId: 'reading', atMs: 0 } as const;
    expect(evaluatePose(swapped, request)).toEqual(evaluatePose(AGENT_16, request));
  });
});

describe('mesh skinning bends with the rig and rests when nothing moves', () => {
  const scarf = AGENT_16.attachments.find(
    (attachment): attachment is MeshAttachment => attachment.kind === 'mesh',
  )!;

  it('returns every vertex to its authored position when the rig is at its bind pose', () => {
    // The property the bind world exists for. Without it a mesh either collapses
    // to the origin or is left behind by a moving bone, and both look like a
    // rendering bug rather than a maths one.
    const worlds = forwardKinematics(AGENT_16, REST);
    const skinned = skinMesh(scarf, worlds);
    for (const [index, vertex] of scarf.vertices.entries()) {
      expect(skinned[index]!.x).toBeCloseTo(vertex.x, 9);
      expect(skinned[index]!.y).toBeCloseTo(vertex.y, 9);
    }
  });

  it('moves only the vertices the animated bone influences', () => {
    // Vertex 3 is the one straddling the torso and the head, so a head animation
    // must move it. Vertices 0 and 1 follow the torso alone, and `reading` does
    // not animate the torso, so they must NOT move. A skinner that applied every
    // bone to every vertex would move all four and pass every other test here.
    const worlds = forwardKinematics(AGENT_16, REST);
    const rest = skinMesh(scarf, worlds);
    const { pose } = evaluate(AGENT_16, { animationId: 'reading', atMs: 800 });
    const posed = skinMesh(scarf, pose.bones);
    const moved = posed
      .map((vertex, index) => Math.hypot(vertex.x - rest[index]!.x, vertex.y - rest[index]!.y))
      .map((distance) => Number(distance.toFixed(6)));

    expect(moved[0]).toBe(0);
    expect(moved[1]).toBe(0);
    expect(moved[2]).toBeGreaterThan(0);
    expect(moved[3]).toBeGreaterThan(0);
  });

  it("carries a rigid influence through a bone's transform exactly", () => {
    // A vertex weighted entirely to one bone follows that bone, and follows it
    // RELATIVE to the pose the mesh was bound in. The expected placement is
    // stated the long way round — take the vertex back into the bone's bind
    // space, then push it through the bone's CURRENT world transform — because
    // that is the claim `current · bind⁻¹` makes and the bracket
    // `bind · current⁻¹` does not.
    //
    // The bone has to have MOVED for this to say anything: at the bind pose both
    // brackets are the identity and both give the vertex's own position, which
    // is why the first test in this block asserts the rest shape and this one
    // asserts the moved shape.
    const bindWorlds = forwardKinematics(AGENT_16, REST);
    const bindWorld = bindWorlds.get('bone.head')!.world;
    const vertex: Point = { x: 6, y: 10 };
    const mesh: MeshAttachment = {
      id: 'a',
      kind: 'mesh',
      meshId: 'm',
      vertices: [vertex],
      triangles: [],
      bindings: [[{ boneId: 'bone.head', weight: 1, bindWorld }]],
    };
    // `reading` at 800ms is the head's most-rotated moment: 6 degrees.
    const posed = evaluatePose(AGENT_16, { animationId: 'reading', atMs: 800 });
    const currentWorld = posed.bones.get('bone.head')!.world;
    expect(currentWorld).not.toEqual(bindWorld);

    const skinned = skinMesh(mesh, posed.bones)[0]!;
    const expected = applyPoint(currentWorld, applyPoint(invertAffine(bindWorld), vertex));
    expect(skinned.x).toBeCloseTo(expected.x, 9);
    expect(skinned.y).toBeCloseTo(expected.y, 9);
    // And the rotation is the head's, not the inverse of it: a vertex 4 units
    // left of the head's origin moves UP when the head tips one way and DOWN
    // when it tips the other, and the other bracket moves it the other way.
    expect(skinned.y).not.toBeCloseTo(vertex.y, 6);
  });

  it('inverts an affine by composing back to the identity', () => {
    const m = localFrameToAffine({ x: 3, y: -2, angle: 0.7, scaleX: 1.5, scaleY: 0.5 });
    const round = composeAffine(m, invertAffine(m));
    expect(round.a).toBeCloseTo(1, 9);
    expect(round.b).toBeCloseTo(0, 9);
    expect(round.c).toBeCloseTo(0, 9);
    expect(round.d).toBeCloseTo(1, 9);
    expect(round.tx).toBeCloseTo(0, 9);
    expect(round.ty).toBeCloseTo(0, 9);
  });

  it('treats a zero-scale bone as having no inverse rather than dividing by zero', () => {
    const collapsed = invertAffine({ a: 0, b: 0, c: 0, d: 0, tx: 1, ty: 1 });
    expect(collapsed).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });
});

describe("the region transform places art in its bone's space", () => {
  // Narrowing by kind ALONE finds the first region in the rig, which is a leg.
  // A test that names a variable `torso` and holds a leg is a test whose
  // assertions are about the wrong rectangle, and it still typechecks.
  const torso = AGENT_16.attachments
    .filter(isRegionAttachment)
    .find((entry) => entry.id === 'attachment.torso')!;

  it("puts the bone on the art's pivot, whatever the pivot is", () => {
    // THE property, and it is not "the bone is at the middle of the picture" —
    // that is only true of a centred pivot, and an earlier version of this test
    // asserted it for a corner pivot too and was wrong. What must hold for every
    // pivot is that the point of the art the pivot names lands on the bone.
    //
    // Stated by mapping the pivot through the matrix rather than by reading the
    // matrix, so the assertion is about the answer. It is also the assertion
    // that catches the bug this test was written for: a pivot applied in
    // unit-quad units instead of art units puts every rectangle's bone a third
    // of its own width from where it should be, and nothing else in the package
    // notices — the picture still looks like a character.
    //
    // Torso art is 6x7 with an offset of (0,-2), so the bone sits at (8, 11) in
    // every case and only the art around it moves.
    const BONE_PLUS_OFFSET: Point = { x: 8, y: 11 };
    for (const [pivotX, pivotY] of [
      [0, 0],
      [0.5, 0.5],
      [0.25, 0.75],
      [1, 1],
      [0, 1],
    ] as const) {
      const matrix = regionMatrix(
        { ...torso, pivotX, pivotY },
        { a: 1, b: 0, c: 0, d: 1, tx: 8, ty: 13 },
      );
      const landed = applyPoint(matrix, { x: pivotX, y: pivotY });
      expect(landed.x, `pivot ${pivotX},${pivotY} landed at x=${landed.x}`).toBeCloseTo(
        BONE_PLUS_OFFSET.x,
        9,
      );
      expect(landed.y, `pivot ${pivotX},${pivotY} landed at y=${landed.y}`).toBeCloseTo(
        BONE_PLUS_OFFSET.y,
        9,
      );
    }
  });

  it('scales the art to the size its attachment declares', () => {
    // The other half of "pivot lands on the bone": the picture around the pivot
    // is the declared size. A region that ignored `width` would still put the
    // bone in the right place and still pass the test above.
    const matrix = regionMatrix(torso, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    expect(matrix.a).toBeCloseTo(torso.width, 9);
    expect(matrix.d).toBeCloseTo(torso.height, 9);
    const left = applyPoint(matrix, { x: 0, y: 0 });
    const right = applyPoint(matrix, { x: 1, y: 0 });
    const bottom = applyPoint(matrix, { x: 0, y: 0 });
    const top = applyPoint(matrix, { x: 0, y: 1 });
    expect(Math.abs(right.x - left.x)).toBeCloseTo(torso.width, 9);
    expect(Math.abs(top.y - bottom.y)).toBeCloseTo(torso.height, 9);
  });

  it("turns the art with the bone, in the bone's own space", () => {
    // A quarter turn puts a 6-wide rectangle's corner where its edge was. If the
    // pivot were applied in WORLD space the art would orbit the bone instead of
    // turning inside it, and the difference is a whole quadrant again.
    const turned = regionMatrix(
      torso,
      localFrameToAffine({ x: 0, y: 0, angle: Math.PI / 2, scaleX: 1, scaleY: 1 }),
    );
    const unturned = regionMatrix(torso, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    // The matrix column that carries X is the rectangle's own width direction.
    expect(turned.a).toBeCloseTo(0, 9);
    expect(turned.b).toBeCloseTo(unturned.a, 9);
  });

  it("inherits the bone's solved transform, which is what makes the order matter", () => {
    // If the region stage ran BEFORE the IK solve it would still produce a
    // picture — the leg would just be in the wrong place. The assertion is that
    // the region's world matrix EQUALS the bone's world matrix composed with the
    // attachment's own, taken from the SOLVED pose rather than the rest one.
    const { pose } = evaluate(AGENT_16, { animationId: 'reading', atMs: 0 });
    const legSlot = AGENT_16.slots.find((slot) => slot.id === 'slot.leg-l')!;
    const attachment = AGENT_16.attachments
      .filter(isRegionAttachment)
      .find((entry) => entry.id === legSlot.attachmentId)!;
    const posed = pose.regions.find((region) => region.slotId === 'slot.leg-l')!;
    const boneWorld = pose.bones.get(legSlot.boneId)!.world;
    expect(posed.matrix).toEqual(regionMatrix(attachment, boneWorld));
    // And the solved bone is NOT at its rest transform, so the two would differ if
    // the order were wrong. Asserted rather than assumed: if a future rig has no
    // IK on a slot's bone, this comparison is vacuous and the test says so.
    expect(boneWorld).not.toEqual(forwardKinematics(AGENT_16, REST).get(legSlot.boneId)!.world);
  });
});

describe('a rig that does not resolve is refused before a stage runs', () => {
  const base = AGENT_16;

  it('refuses a dangling parent, a dangling slot bone and a dangling attachment', () => {
    const cases: readonly [string, Skeleton][] = [
      [
        'bone with no such parent',
        {
          ...base,
          bones: base.bones.map((bone) =>
            bone.id === 'bone.head' ? { ...bone, parentId: 'bone.ghost' } : bone,
          ),
        },
      ],
      [
        'slot bound to a bone that is not there',
        {
          ...base,
          slots: base.slots.map((slot) =>
            slot.id === 'slot.head' ? { ...slot, boneId: 'bone.ghost' } : slot,
          ),
        },
      ],
      [
        'slot naming an attachment that is not there',
        {
          ...base,
          slots: base.slots.map((slot) =>
            slot.id === 'slot.head' ? { ...slot, attachmentId: 'attachment.ghost' } : slot,
          ),
        },
      ],
      [
        'channel animating a bone that is not there',
        {
          ...base,
          animations: base.animations.map((animation) =>
            animation.id === 'reading'
              ? {
                  ...animation,
                  channels: [
                    { boneId: 'bone.ghost', property: 'angle', keys: [{ atMs: 0, value: 0 }] },
                  ],
                }
              : animation,
          ),
        },
      ],
      [
        'bone authored before its parent',
        { ...base, bones: [base.bones[1]!, base.bones[0]!, ...base.bones.slice(2)] },
      ],
    ];
    for (const [label, rig] of cases) {
      expect(() => validateSkeleton(rig), label).toThrow(InvalidSkeletonError);
    }
  });

  it('refuses a mesh whose influences do not add up, or whose triangles do not close', () => {
    // A mesh weighted to 90% shrinks as it deforms, in proportion to the error,
    // and the shrink is invisible in a still frame and obvious in motion. A
    // triangle index past the last vertex reads as undefined and then as a crash
    // in whatever consumed it.
    const mesh = base.attachments.find(isMeshAttachment)!;
    /** Replaces one attachment, keeping the union honest without a cast. */
    const swap = (replacement: MeshAttachment): Skeleton['attachments'] =>
      base.attachments.map((attachment) => (attachment.id === mesh.id ? replacement : attachment));
    const withBindings = (scale: number): MeshAttachment => ({
      ...mesh,
      bindings: mesh.bindings.map((list) =>
        list.map((binding) => ({ ...binding, weight: binding.weight * scale })),
      ),
    });
    const cases: readonly [string, Skeleton][] = [
      ['weights summing to 0.9', { ...base, attachments: swap(withBindings(0.9)) }],
      [
        'a triangle index past the last vertex',
        { ...base, attachments: swap({ ...mesh, triangles: [0, 1, 9] }) },
      ],
      [
        'a triangle list that is not a multiple of three',
        { ...base, attachments: swap({ ...mesh, triangles: [0, 1] }) },
      ],
    ];
    for (const [label, rig] of cases) {
      expect(() => validateSkeleton(rig), label).toThrow(InvalidSkeletonError);
    }
  });

  it('accepts the shipped rig, and says so rather than passing vacuously', () => {
    expect(() => validateSkeleton(base)).not.toThrow();
  });
});
