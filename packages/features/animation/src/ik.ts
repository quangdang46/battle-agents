/**
 * Stage 2: two-bone inverse kinematics.
 *
 * **This module is the reason the pipeline is a pipeline.** A renderer that
 * solved IK would look identical on screen right up until the day an editor and
 * a player disagreed about where a foot goes, and the disagreement would be
 * invisible in every screenshot. So the solver lives here, `evaluate.ts` is the
 * only file that imports it, and `tests/unit/animation-core-boundaries.test.ts`
 * walks the module graph to prove that — it reads who imports whom, not what
 * this file exports.
 *
 * The case solved is the two-bone one and nothing more: an upper joint, a lower
 * joint rigidly following it, and a target the tip should reach. It is analytic
 * rather than iterative, which is what makes it deterministic for free — the
 * same rig and target give the same doubles on every machine, with no iteration
 * count and no tolerance to argue about.
 *
 * ## The one thing a reader has to hold in their head
 *
 * Two joint angles are written, and which joint does which job is the whole
 * content of this file:
 *
 * - The **root** bone's local angle aims the UPPER bone. The root's world angle
 *   plus the mid's rest offset direction is the direction the upper bone points,
 *   so the root's angle is what turns the whole limb without moving its base.
 * - The **mid** bone's local angle folds the knee, taking up the interior angle
 *   the solve worked out.
 *
 * A solver written the other way round — the reading the name "mid bone"
 * invites — aims the knee at the target and swings the thigh where it fell,
 * which produces a limb that reaches sideways and raises no error anywhere. The
 * hip and the knee is what a leg has, and the names here say so.
 *
 * Nothing imposes an authoring convention beyond that. The mid's rest offset may
 * point any direction; the solve reads its angle out of the rig rather than
 * assuming it is zero, so a leg authored pointing DOWN and an arm authored
 * pointing sideways are both correct without either being special-cased.
 */

import { rewriteLocalAngle } from './fk.js';
import type { MutableWorldFrames, WorldFrame } from './fk.js';
import type { LocalFrame, Point } from './pose.js';
import type { Bone, Id, IkConstraint, Skeleton } from './skeleton.js';

/** What a solve did, so a caller can tell a foot that reached from one that did not. */
export interface IkDiagnostic {
  readonly constraintId: Id;
  /** Where the target was, after any request override. */
  readonly target: Point;
  /** Where the tip ended up. Differs from the target when the target is out of reach. */
  readonly reached: Point;
  /** Requested distance from the root over the limb's length. Over 1 is out of reach. */
  readonly stretch: number;
  /** False when the target was clamped to what the limb can do. */
  readonly onTarget: boolean;
}

/** The angles a two-bone limb needs, and whether the target was reachable. */
export interface TwoBoneSolution {
  /** The world direction the upper bone should point in. */
  readonly upperWorldAngle: number;
  /** The interior angle at the mid joint, in radians. */
  readonly midInterior: number;
  /** The distance the solve actually used, after clamping. */
  readonly solvedDistance: number;
  /** Requested distance over limb length. */
  readonly stretch: number;
  readonly onTarget: boolean;
}

function distanceBetween(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function angleBetween(left: Point, right: Point): number {
  return Math.atan2(right.y - left.y, right.x - left.x);
}

function pointOn(angle: number, radius: number): Point {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * `acos` that cannot leave its domain.
 *
 * Every `acos` in this file goes through here. The failure it prevents is not a
 * wrong number, it is a `NaN` that propagates into every region transform
 * downstream and makes the character disappear — and the pose snapshot refuses
 * non-finite values precisely so that a rig which reaches this state fails at
 * the solve rather than at a golden comparison three stages later.
 */
function safeAcos(cosine: number): number {
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

/**
 * Where a two-bone limb has to point to put its tip on a target.
 *
 * Two applications of the law of cosines. The first gives the angle at the root
 * between the root-to-target ray and the upper bone; the second gives the
 * interior angle at the knee.
 *
 * The target is clamped to `[|u - l|, u + l]`. The upper clamp is the obvious
 * one — a target beyond the limb's reach has no solution. The lower one is not:
 * a limb can fold until the tip comes back to the distance between its two
 * bone lengths, and a target closer than that is a request the knee physically
 * cannot obey, so the tip stops at that distance and the diagnostic says
 * `onTarget: false`. Without it the cosine argument leaves its domain and comes
 * back `NaN`.
 */
export function solveTwoBone(
  rootOrigin: Point,
  target: Point,
  upperLength: number,
  lowerLength: number,
  bendDirection: 1 | -1,
): TwoBoneSolution {
  const offset = { x: target.x - rootOrigin.x, y: target.y - rootOrigin.y };
  const requested = Math.hypot(offset.x, offset.y);
  const reach = upperLength + lowerLength;
  const fold = Math.abs(upperLength - lowerLength);
  const solvedDistance = Math.min(reach, Math.max(fold, requested));

  const cosRoot =
    (upperLength * upperLength + solvedDistance * solvedDistance - lowerLength * lowerLength) /
    (2 * upperLength * solvedDistance);
  const rootInterior = safeAcos(cosRoot);
  const cosMid =
    (upperLength * upperLength + lowerLength * lowerLength - solvedDistance * solvedDistance) /
    (2 * upperLength * lowerLength);
  const midInterior = safeAcos(cosMid);

  const targetAngle = requested === 0 ? 0 : Math.atan2(offset.y, offset.x);
  return {
    upperWorldAngle: targetAngle - bendDirection * rootInterior,
    midInterior,
    solvedDistance,
    stretch: requested === 0 ? 0 : requested / reach,
    onTarget: requested <= reach && requested >= fold,
  };
}

/** The three joints a constraint names, placed. Absent if the rig is broken. */
interface Chain {
  readonly root: WorldFrame;
  readonly mid: WorldFrame;
  readonly tip: WorldFrame;
  readonly upperLength: number;
  readonly lowerLength: number;
}

function readChain(
  worlds: ReadonlyMap<Id, WorldFrame>,
  constraint: IkConstraint,
): Chain | undefined {
  const root = worlds.get(constraint.rootBoneId);
  const mid = worlds.get(constraint.midBoneId);
  const tip = worlds.get(constraint.tipBoneId);
  if (root === undefined || mid === undefined || tip === undefined) return undefined;
  const rootOrigin: Point = { x: root.originX, y: root.originY };
  const midOrigin: Point = { x: mid.originX, y: mid.originY };
  const tipOrigin: Point = { x: tip.originX, y: tip.originY };
  const upperLength = distanceBetween(rootOrigin, midOrigin);
  const lowerLength = distanceBetween(midOrigin, tipOrigin);
  if (upperLength === 0 || lowerLength === 0) return undefined;
  return { root, mid, tip, upperLength, lowerLength };
}

function originOf(frame: WorldFrame): Point {
  return { x: frame.originX, y: frame.originY };
}

/**
 * Solves one constraint, mutating the locals and worlds in place.
 *
 * In place, because the stage above built those maps for this evaluation and
 * the stages below read them. Copying them per constraint would make a solve
 * cost a full rig traversal multiplied by the number of constraints, which is
 * the shape of a bug that only shows up once a character grows a second leg.
 *
 * The hip is not moved: the root bone's origin is untouched, and only its
 * ANGLE is rewritten. A solver that translated the root to reach the target
 * would drag the whole character across the map to put a foot in the right
 * place, and the diagnostic would still report success.
 */
export function solveConstraint(
  skeleton: Skeleton,
  constraint: IkConstraint,
  locals: Map<Id, LocalFrame>,
  worlds: MutableWorldFrames,
  children: ReadonlyMap<Id, readonly Bone[]>,
  target: Point,
): IkDiagnostic {
  const chain = readChain(worlds, constraint);
  if (chain === undefined) return degenerateDiagnostic(constraint, target);

  const rootOrigin = originOf(chain.root);
  const solution = solveTwoBone(
    rootOrigin,
    target,
    chain.upperLength,
    chain.lowerLength,
    constraint.bendDirection,
  );

  // Where each of the two bones' REST offsets points, in its parent's local
  // frame. Read out of the rig rather than assumed to be zero, so a limb
  // authored pointing down (a leg) and one authored pointing sideways (an
  // outstretched arm) both solve.
  //
  // `offsetAngle` is where the upper bone points; `tipOffsetAngle` is where the
  // lower bone points when the knee is straight. Both are needed, and leaving
  // the second one out is the bug this comment exists for: the knee is then
  // written as if the lower bone were always along the mid's own +x, so a leg
  // whose shin hangs DOWN has its shin swung 90 degrees and the foot ends up
  // beside the hip. It raises no error, and a golden recorded from it looks like
  // a character doing the splits.
  const offsetAngle = Math.atan2(chain.mid.local.y, chain.mid.local.x);
  const tipOffsetAngle = Math.atan2(chain.tip.local.y, chain.tip.local.x);

  // The root's LOCAL angle, not its world angle: the difference is the parent's
  // world angle, and leaving it out is what makes a limb snap upright when its
  // parent is rotated. A rig hung off a tilted torso is not an exotic case —
  // two of the five animations in the shipped fixture rotate the torso, so this
  // term is on a committed golden and not only in a unit test.
  const parentAngle = parentWorldAngleOf(skeleton, worlds, constraint.rootBoneId);
  rewriteLocalAngle(
    skeleton,
    locals,
    worlds,
    children,
    constraint.rootBoneId,
    solution.upperWorldAngle - offsetAngle - parentAngle,
  );
  // And then the knee, in the root's NEW local frame. Two writes, in this order,
  // because the second depends on the first.
  //
  // The derivation, since the expression does not look like it should. The mid's
  // world angle plus the tip's rest offset is the direction the lower bone runs
  // in, and that has to equal `upperWorldAngle + PI - bend*midInterior`. So:
  //
  //     la(mid) = upperWorldAngle + PI - bend*midInterior - tipOffsetAngle - angle(root)
  //             = upperWorldAngle + PI - bend*midInterior - tipOffsetAngle
  //                 - (upperWorldAngle - offsetAngle)
  //             = offsetAngle - tipOffsetAngle + PI - bend*midInterior
  //
  rewriteLocalAngle(
    skeleton,
    locals,
    worlds,
    children,
    constraint.midBoneId,
    offsetAngle - tipOffsetAngle + Math.PI - constraint.bendDirection * solution.midInterior,
  );

  const reached = originOf(worlds.get(constraint.tipBoneId) ?? chain.tip);
  return {
    constraintId: constraint.id,
    target,
    reached,
    stretch: solution.stretch,
    onTarget: solution.onTarget,
  };
}

/** The world angle of a bone's parent, or zero at the top of the rig. */
function parentWorldAngleOf(
  skeleton: Skeleton,
  worlds: ReadonlyMap<Id, WorldFrame>,
  boneId: Id,
): number {
  const bone = skeleton.bones.find((candidate) => candidate.id === boneId);
  if (bone?.parentId === null || bone?.parentId === undefined) return 0;
  return worlds.get(bone.parentId)?.angle ?? 0;
}

/**
 * A constraint whose chain is missing or degenerate.
 *
 * Reported rather than thrown: a rig that references an unknown bone is already
 * refused by `validateSkeleton`, and a stage that threw as well would be a
 * second opinion. What it must not do is silently place the tip on the target,
 * which is the failure that reads on screen as a foot that is exactly where it
 * should be and is not attached to the leg.
 */
function degenerateDiagnostic(constraint: IkConstraint, target: Point): IkDiagnostic {
  return {
    constraintId: constraint.id,
    target,
    reached: { ...target },
    stretch: Number.POSITIVE_INFINITY,
    onTarget: false,
  };
}

/** The direction a bone's chain currently runs in. For a test and for tooling. */
export function chainDirection(
  rootOrigin: Point,
  midOrigin: Point,
  tipOrigin: Point,
): {
  readonly upper: number;
  readonly lower: number;
} {
  return {
    upper: angleBetween(rootOrigin, midOrigin),
    lower: angleBetween(midOrigin, tipOrigin),
  };
}

/** Where a solved chain's tip should end up. Exported so a test can check the algebra
 *  without going through a whole evaluation. */
export function predictedTip(
  rootOrigin: Point,
  target: Point,
  upperLength: number,
  lowerLength: number,
  bendDirection: 1 | -1,
): Point {
  const solution = solveTwoBone(rootOrigin, target, upperLength, lowerLength, bendDirection);
  const mid = {
    x: rootOrigin.x + pointOn(solution.upperWorldAngle, upperLength).x,
    y: rootOrigin.y + pointOn(solution.upperWorldAngle, upperLength).y,
  };
  // The knee is on the far side of the root-to-target ray from the hip when the
  // bend direction is positive, which is the same sign the solver used.
  const lowerWorldAngle = solution.upperWorldAngle + Math.PI - bendDirection * solution.midInterior;
  return {
    x: mid.x + pointOn(lowerWorldAngle, lowerLength).x,
    y: mid.y + pointOn(lowerWorldAngle, lowerLength).y,
  };
}
