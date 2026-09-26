/**
 * The authored rig: what a skeleton IS, as data.
 *
 * Plan section 9.4 adopts one idea from the reference study and this file is
 * where it lives: **bones are identified by a stable id, never by a name.**
 * Every link in this file — a bone's parent, a slot's bone, a slot's
 * attachment, a channel's bone, a constraint's joints — is an id. A `name` is
 * carried alongside for tools and for the editor's benefit and nothing reads
 * it, which is the point: renaming a bone is a cosmetic edit and a rig that
 * resolves bones by name turns a cosmetic edit into a broken frame. The
 * stable-id test in `skeleton.test.ts` is the check, and it is a golden test
 * that must not move.
 *
 * What this file deliberately does NOT have, because the bead scopes out the
 * editor: a format version, a revision counter, a command layer, an undo
 * stack, a serializer. Those belong to an authoring tool (plan section 9.4
 * lists them under the reference's AVOID column) and a runtime that grows them
 * has started becoming the editor. The id discipline survives that scoping
 * because it is a property of the DATA, not of an editing workflow.
 */

import type { LocalFrame, Point } from './pose.js';

/** An id. A plain string at runtime; the alias exists so a signature can say what it is. */
export type Id = string;

/** A bone: a joint with a rest transform, parented to another joint or to nothing. */
export interface Bone {
  /** Stable. Survives renaming, re-parenting and reordering. */
  readonly id: Id;
  /** Display only. Nothing in this package reads it. */
  readonly name: string;
  /** `null` for a root. */
  readonly parentId: Id | null;
  /** The transform this bone has when no animation is playing. */
  readonly setup: LocalFrame;
}

/**
 * A rectangle of art, bound to a bone.
 *
 * A region rather than a texture: this package has no idea what a texture is,
 * because the thing that knows about textures is a renderer and the renderer's
 * whole job is to be downstream of here. `width`/`height` are the art's size in
 * world units and `pivot` is where the bone sits within it, which is enough to
 * place a 16x16 placeholder and a 64px sheet with the same data.
 */
export interface RegionAttachment {
  readonly id: Id;
  readonly kind: 'region';
  /** What to sample. The renderer resolves it; nothing here can. */
  readonly regionId: Id;
  readonly width: number;
  readonly height: number;
  /** Bone-local offset of the rectangle's bottom-left corner. */
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  /** Bone-local pivot as a fraction of width/height. Half and half is centred. */
  readonly pivotX: number;
  readonly pivotY: number;
}

/**
 * A deformable mesh, skinned to several bones at once.
 *
 * A rectangle is a mesh with one vertex and one influence, so this is the
 * general case rather than a second concept. `vertices` are in MODEL space —
 * one space for the whole mesh, the world positions the mesh had when it was
 * authored — and `bindings` is per-vertex: vertex `i` is placed by the weighted
 * sum of the bones' motion since bind. See `skinning.ts` for why the bind world
 * is the part that cannot be left out.
 */
export interface MeshAttachment {
  readonly id: Id;
  readonly kind: 'mesh';
  readonly meshId: Id;
  /** Rest positions, in the world the mesh was authored in. */
  readonly vertices: readonly Point[];
  readonly triangles: readonly number[];
  /** One influence list per vertex, parallel to `vertices`. */
  readonly bindings: readonly MeshBinding[][];
}

/** One vertex's share of one bone, in the pose the mesh was authored in. */
export interface MeshBinding {
  readonly boneId: Id;
  /** 0..1. Normalised per vertex by `validateSkeleton`, which refuses a bad one. */
  readonly weight: number;
  readonly bindWorld: Readonly<{
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  }>;
}

export type Attachment = RegionAttachment | MeshAttachment;

/** Narrows an attachment to a rectangle. What the region stage consumes. */
export function isRegionAttachment(attachment: Attachment): attachment is RegionAttachment {
  return attachment.kind === 'region';
}

/** Narrows an attachment to a mesh. What the skinning stage consumes. */
export function isMeshAttachment(attachment: Attachment): attachment is MeshAttachment {
  return attachment.kind === 'mesh';
}

/**
 * A draw slot: which attachment, on which bone, in which order.
 *
 * A slot is separate from the bone because the same bone can hold different art
 * at different times — a sword or no sword, a hurt face or a calm one — without
 * the rig itself changing. The indirection is also what lets a slot be empty:
 * `attachmentId: null` draws nothing, which is how a character with no weapon
 * is expressed rather than by deleting the slot.
 */
export interface Slot {
  readonly id: Id;
  readonly name: string;
  readonly boneId: Id;
  readonly attachmentId: Id | null;
}

/**
 * A two-bone IK constraint: "keep this foot on this point".
 *
 * Deliberately the two-bone case and nothing else. Three-bone analytic IK and
 * a FABRIK iteration loop are the two things a skeletal runtime grows next, and
 * both belong to the moment something needs them — which for this package is
 * the moment a rig has a limb that is not a straight chain of two joints.
 */
export interface IkConstraint {
  readonly id: Id;
  /** Upper joint. Its position is fixed by the solve. */
  readonly rootBoneId: Id;
  /** The joint the solve rotates. */
  readonly midBoneId: Id;
  /** Lower joint, rigidly following the mid. */
  readonly tipBoneId: Id;
  /** Where the tip should be, in world space. */
  readonly target: Point;
  /** `1` or `-1`. Which way the mid joint is allowed to bend. */
  readonly bendDirection: 1 | -1;
  /** Applied after the animations, so a request can move the foot. */
  readonly order: number;
}

/** One keyframe on one property of one bone. Linear only — see the note below. */
export interface Keyframe {
  readonly atMs: number;
  readonly value: number;
}

/**
 * One property of one bone, over time.
 *
 * `property` is a `LocalFrame` key, so a channel can only animate the five
 * things a local frame has. There is no curve type on purpose: a bezier editor
 * and a stepped curve are authoring tools, and the bead's scope trap is exactly
 * the shape they come in. Linear interpolation plus a looping sample is enough
 * to pose a sprite for the five animations plan section 9.2 names.
 */
export interface Channel {
  readonly boneId: Id;
  readonly property: keyof LocalFrame;
  readonly keys: readonly Keyframe[];
}

/** A named pose. A duration, and the channels that move the rig through it. */
export interface Animation {
  readonly id: Id;
  readonly name: string;
  readonly durationMs: number;
  /** When true, sampling past the end wraps. When false it holds the last value. */
  readonly loop: boolean;
  readonly channels: readonly Channel[];
}

/**
 * A whole character: bones, what hangs off them, and how they move.
 *
 * Called a skeleton because that is the word the plan uses and the word the
 * ecosystem uses (plan section 9.1, "Skeleton -> Bones -> Slots/Attachments ->
 * Skins -> Animation"). It holds more than bones for the same reason a spine
 * holds more than vertebrae.
 */
export interface Skeleton {
  readonly id: Id;
  readonly name: string;
  /** Author order, parent before child. An evaluation walks it, so it is an order. */
  readonly bones: readonly Bone[];
  readonly slots: readonly Slot[];
  readonly attachments: readonly Attachment[];
  readonly ik: readonly IkConstraint[];
  readonly animations: readonly Animation[];
}

/** The rest pose of a bone that has never been posed. */
export const REST_FRAME: LocalFrame = Object.freeze({ x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 });

/** A bone that does not exist. Named, because a lookup miss is a bug worth reading. */
export class UnknownBoneError extends Error {
  constructor(
    readonly skeletonId: Id,
    readonly boneId: Id,
  ) {
    super(`skeleton "${skeletonId}" has no bone "${boneId}"`);
    this.name = 'UnknownBoneError';
  }
}

/** A rig whose ids do not resolve. Thrown before evaluation rather than during. */
export class InvalidSkeletonError extends Error {
  constructor(
    readonly skeletonId: Id,
    readonly problems: readonly string[],
  ) {
    super(`skeleton "${skeletonId}" is not usable: ${problems.join('; ')}`);
    this.name = 'InvalidSkeletonError';
  }
}

function indexById<T extends { readonly id: Id }>(items: readonly T[]): ReadonlyMap<Id, T> {
  const byId = new Map<Id, T>();
  for (const item of items) byId.set(item.id, item);
  return byId;
}

export function bonesOf(skeleton: Skeleton): ReadonlyMap<Id, Bone> {
  return indexById(skeleton.bones);
}

export function slotsOf(skeleton: Skeleton): ReadonlyMap<Id, Slot> {
  return indexById(skeleton.slots);
}

export function attachmentsOf(skeleton: Skeleton): ReadonlyMap<Id, Attachment> {
  return indexById(skeleton.attachments);
}

export function animationsOf(skeleton: Skeleton): ReadonlyMap<Id, Animation> {
  return indexById(skeleton.animations);
}

export function ikOf(skeleton: Skeleton): ReadonlyMap<Id, IkConstraint> {
  return indexById(skeleton.ik);
}

/** The bones under one bone, in author order. Used to re-derive a subtree after an IK solve. */
export function childrenOf(skeleton: Skeleton, boneId: Id): readonly Bone[] {
  return skeleton.bones.filter((bone) => bone.parentId === boneId);
}

/**
 * Refuses a rig that would produce a wrong frame for a reason no arithmetic can
 * report.
 *
 * Every id reference is checked, because a dangling one would otherwise be an
 * `undefined` read deep inside a stage and the symptom would be a character
 * missing a hand. Bones are checked for author order too: the evaluation walks
 * `skeleton.bones` once, parent before child, because a topological sort per
 * evaluation would be work to avoid a constraint that a data file satisfies for
 * free. Author order is checked in the same pass as the ids, so a rig that is
 * wrong in both ways is reported for both rather than one at a time.
 *
 * Callers do not have to invoke this — `evaluatePose` does — but it is exported
 * because a tool that loads rigs from somewhere else needs the same answer, and
 * duplicating the checks is how two loaders end up disagreeing about which rigs
 * are valid.
 */
export function validateSkeleton(skeleton: Skeleton): void {
  const problems: string[] = [];
  const bones = bonesOf(skeleton);
  const attachments = attachmentsOf(skeleton);

  const seenBoneIds = new Set<Id>();
  for (const bone of skeleton.bones) {
    if (seenBoneIds.has(bone.id)) problems.push(`duplicate bone id "${bone.id}"`);
    seenBoneIds.add(bone.id);
    if (bone.parentId !== null && !bones.has(bone.parentId)) {
      problems.push(`bone "${bone.id}" has unknown parent "${bone.parentId}"`);
    }
  }

  for (const bone of skeleton.bones) {
    if (bone.parentId === null) continue;
    if (bones.get(bone.parentId) === undefined) continue;
    if (skeleton.bones.indexOf(bone) < skeleton.bones.indexOf(bones.get(bone.parentId)!)) {
      problems.push(`bone "${bone.id}" is authored before its parent "${bone.parentId}"`);
    }
  }

  const seenSlotIds = new Set<Id>();
  for (const slot of skeleton.slots) {
    if (seenSlotIds.has(slot.id)) problems.push(`duplicate slot id "${slot.id}"`);
    seenSlotIds.add(slot.id);
    if (!bones.has(slot.boneId))
      problems.push(`slot "${slot.id}" names unknown bone "${slot.boneId}"`);
    if (slot.attachmentId !== null && !attachments.has(slot.attachmentId)) {
      problems.push(`slot "${slot.id}" names unknown attachment "${slot.attachmentId}"`);
    }
  }

  for (const attachment of skeleton.attachments) {
    if (attachment.kind === 'mesh') {
      if (attachment.bindings.length !== attachment.vertices.length) {
        problems.push(
          `mesh "${attachment.id}" has ${attachment.vertices.length} vertices but ` +
            `${attachment.bindings.length} influence lists`,
        );
      }
      if (attachment.triangles.length % 3 !== 0) {
        problems.push(
          `mesh "${attachment.id}" has a triangle list that is not a multiple of three`,
        );
      }
      attachment.triangles.forEach((index, position) => {
        if (!Number.isInteger(index) || index < 0 || index >= attachment.vertices.length) {
          problems.push(
            `mesh "${attachment.id}" triangle index ${position} is ${index}, not a vertex`,
          );
        }
      });
      attachment.bindings.forEach((bindings, vertexIndex) => {
        let total = 0;
        for (const binding of bindings) {
          if (!bones.has(binding.boneId)) {
            problems.push(
              `mesh "${attachment.id}" vertex ${vertexIndex} is weighted to unknown bone "${binding.boneId}"`,
            );
          }
          total += binding.weight;
        }
        if (bindings.length === 0) {
          problems.push(`mesh "${attachment.id}" vertex ${vertexIndex} has no influence`);
        } else if (Math.abs(total - 1) > SKINNING_WEIGHT_TOLERANCE) {
          // Un-normalised weights produce a mesh that shrinks as it deforms, and
          // the shrink is proportional to the error, so a rig that is "nearly
          // right" renders slightly wrong at every frame and nowhere else.
          problems.push(
            `mesh "${attachment.id}" vertex ${vertexIndex} weights sum to ${total}, not 1`,
          );
        }
      });
    }
  }

  const seenIkIds = new Set<Id>();
  for (const constraint of skeleton.ik) {
    if (seenIkIds.has(constraint.id))
      problems.push(`duplicate IK constraint id "${constraint.id}"`);
    seenIkIds.add(constraint.id);
    for (const [label, boneId] of [
      ['root', constraint.rootBoneId],
      ['mid', constraint.midBoneId],
      ['tip', constraint.tipBoneId],
    ] as const) {
      if (!bones.has(boneId)) {
        problems.push(`IK "${constraint.id}" names unknown ${label} bone "${boneId}"`);
      }
    }
  }

  for (const animation of skeleton.animations) {
    if (animation.durationMs <= 0) {
      problems.push(`animation "${animation.id}" has duration ${animation.durationMs}`);
    }
    for (const channel of animation.channels) {
      if (!bones.has(channel.boneId)) {
        problems.push(`animation "${animation.id}" animates unknown bone "${channel.boneId}"`);
      }
      for (const key of channel.keys) {
        if (key.atMs < 0 || key.atMs > animation.durationMs) {
          problems.push(
            `animation "${animation.id}" has a key at ${key.atMs}ms, outside 0..${animation.durationMs}`,
          );
        }
      }
    }
  }

  if (problems.length > 0) throw new InvalidSkeletonError(skeleton.id, problems);
}

/**
 * How far a vertex's influence weights may miss 1 before the mesh is refused.
 *
 * Wide enough for the rounding a hand-authored rig accumulates and narrow enough
 * that a real second influence being dropped is a build failure rather than a
 * frame that is subtly thin.
 */
export const SKINNING_WEIGHT_TOLERANCE = 0.001;
