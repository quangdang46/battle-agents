/**
 * Stage 1: forward kinematics. Local frames in, world transforms out.
 *
 * The simplest stage, and the only one with no choice in it: a bone's world
 * transform is its parent's composed with its own local frame, and the rig is
 * authored parent-before-child so one pass down the list is the whole traversal.
 *
 * No recursion, for the traversal above. A recursive walk is the prettier
 * version and it is the one that turns a rig with a cycle into a stack overflow.
 * `validateSkeleton` already refuses a bone that lists a later bone as its
 * parent, so the cycle cannot reach here — a recursive walk would then be the
 * second place that fact is enforced, in a form that cannot report WHICH cycle
 * it found.
 *
 * The one recursion that survives is `refreshSubtree` below, over a child index
 * the caller builds once, because a subtree is exactly a tree and a cycle in it
 * is already impossible.
 */

import { IDENTITY, composeAffine, localFrameToAffine } from './geometry.js';
import type { Affine, LocalFrame, PosedBone } from './pose.js';
import type { Bone, Id, Skeleton } from './skeleton.js';

/** A bone placed in the world, plus the two derived numbers a consumer wants. */
export interface WorldFrame {
  readonly world: Affine;
  readonly local: LocalFrame;
  readonly originX: number;
  readonly originY: number;
  /** The world's rotation, recovered rather than stored. See `worldAngle`. */
  readonly angle: number;
}

export type WorldFrames = ReadonlyMap<Id, WorldFrame>;
export type MutableWorldFrames = Map<Id, WorldFrame>;

/**
 * The least a stage can ask for and still place something.
 *
 * `WorldFrame` and `PosedBone` both satisfy it, which is the point: the two
 * attachment stages read a bone's WORLD MATRIX and nothing else, and saying so
 * here means a caller holding a finished pose can re-run either of them without
 * rebuilding a rig. Written as a structural type rather than a union of the two
 * so a third producer of world transforms is not locked out.
 */
export interface BoneWorld {
  readonly world: Affine;
}

export type BoneWorlds = ReadonlyMap<Id, BoneWorld>;

/** Children by parent id, in author order. Built once per evaluation. */
export function childIndexOf(skeleton: Skeleton): ReadonlyMap<Id, readonly Bone[]> {
  const byParent = new Map<Id, Bone[]>();
  for (const bone of skeleton.bones) {
    if (bone.parentId === null) continue;
    const existing = byParent.get(bone.parentId);
    if (existing === undefined) byParent.set(bone.parentId, [bone]);
    else existing.push(bone);
  }
  return byParent;
}

/**
 * A transform's rotation, in radians.
 *
 * Recovered from the matrix rather than carried beside it, because the IK stage
 * rewrites a joint's world transform in place and a separately stored angle
 * would still be holding the pre-solve value. The symptom of that is an
 * attachment placed correctly and rotated wrongly, which no test on the
 * transform alone would see.
 */
export function worldAngle(world: Affine): number {
  return Math.atan2(world.b, world.a);
}

/**
 * Places every bone, parents before children.
 *
 * A bone whose parent is missing falls back to the identity rather than
 * throwing: a rig with a broken parent link is refused by `validateSkeleton`,
 * and a stage that checked again would be a second opinion nobody asked for.
 * The fallback is a root, which is what the author almost certainly meant.
 */
export function forwardKinematics(
  skeleton: Skeleton,
  locals: ReadonlyMap<Id, LocalFrame>,
): MutableWorldFrames {
  const worlds = new Map<Id, WorldFrame>();
  for (const bone of skeleton.bones) {
    const local = locals.get(bone.id) ?? bone.setup;
    const parentWorld = bone.parentId === null ? undefined : worlds.get(bone.parentId);
    const world = composeAffine(parentWorld?.world ?? IDENTITY, localFrameToAffine(local));
    worlds.set(bone.id, {
      world,
      local,
      originX: world.tx,
      originY: world.ty,
      angle: worldAngle(world),
    });
  }
  return worlds;
}

/**
 * Recomputes one bone and everything below it, in place.
 *
 * This is what an IK solve calls after rewriting a joint, and recomputing only
 * the subtree is what keeps a solve from redoing the whole rig per constraint.
 * The alternative costs O(bones) per constraint, which is the shape of a bug
 * that only appears once a character grows a second leg.
 *
 * The map is mutated. It is the map `forwardKinematics` just built and nobody
 * else holds it yet.
 */
export function refreshSubtree(
  skeleton: Skeleton,
  locals: ReadonlyMap<Id, LocalFrame>,
  worlds: MutableWorldFrames,
  children: ReadonlyMap<Id, readonly Bone[]>,
  boneId: Id,
): void {
  for (const child of children.get(boneId) ?? []) {
    const local = locals.get(child.id) ?? child.setup;
    const parentWorld = worlds.get(child.parentId as Id);
    const world = composeAffine(parentWorld?.world ?? IDENTITY, localFrameToAffine(local));
    worlds.set(child.id, {
      world,
      local,
      originX: world.tx,
      originY: world.ty,
      angle: worldAngle(world),
    });
    refreshSubtree(skeleton, locals, worlds, children, child.id);
  }
}

/**
 * Rewrites one bone's local angle and re-derives its subtree.
 *
 * The only way this package changes a rig after sampling, and it exists as a
 * function rather than as a map assignment because a bone's world transform is
 * not its local frame: writing the angle and stopping leaves the bone's
 * children where they were, and a limb that solved correctly and then snapped
 * back is the classic symptom of that.
 */
export function rewriteLocalAngle(
  skeleton: Skeleton,
  locals: Map<Id, LocalFrame>,
  worlds: MutableWorldFrames,
  children: ReadonlyMap<Id, readonly Bone[]>,
  boneId: Id,
  angle: number,
): void {
  const bone = skeleton.bones.find((candidate) => candidate.id === boneId);
  if (bone === undefined) return;
  const local: LocalFrame = { ...(locals.get(boneId) ?? bone.setup), angle };
  locals.set(boneId, local);
  const parentWorld = bone.parentId === null ? undefined : worlds.get(bone.parentId);
  const world = composeAffine(parentWorld?.world ?? IDENTITY, localFrameToAffine(local));
  worlds.set(boneId, {
    world,
    local,
    originX: world.tx,
    originY: world.ty,
    angle: worldAngle(world),
  });
  refreshSubtree(skeleton, locals, worlds, children, boneId);
}

/** The `PosedBone` shape for a caller that wants one bone without a whole frame. */
export function posedBoneOf(boneId: Id, frame: WorldFrame): PosedBone {
  return Object.freeze({
    boneId,
    world: frame.world,
    origin: Object.freeze({ x: frame.originX, y: frame.originY }),
    angle: frame.angle,
  });
}
