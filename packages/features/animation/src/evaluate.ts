/**
 * The pipeline. One function, five stages, in this order:
 *
 *     sample locals  →  forward kinematics  →  inverse kinematics
 *                   →  mesh skinning  →  region transform
 *
 * and then a `Pose` goes out. Nothing downstream of here knows the stages exist.
 *
 * ## Why the order is the order
 *
 * Sampling is trivially first. FK has to precede IK because IK measures a limb
 * from world positions it has not computed yet. IK has to precede both
 * attachment stages because an attachment inherits its bone's transform, and an
 * attachment placed before the solve is attached to a hip that then moves under
 * it. Skinning and region transform are independent of each other and come last
 * because they are the only stages that turn bones into something drawable.
 *
 * The order that matters is not this one, though, but the one thing it is FOR:
 * **IK happens here and nowhere else.** A renderer that solved IK would produce
 * the same picture — until the day a second consumer of a pose disagreed with
 * the first about where a foot goes, and nothing in the build would say so.
 * `tests/unit/animation-core-boundaries.test.ts` reads this file's import list
 * from the module graph and fails if any file other than this one reaches
 * `ik.ts`.
 */

import { childIndexOf, forwardKinematics, posedBoneOf, worldAngle } from './fk.js';
import type { WorldFrame } from './fk.js';
import { solveConstraint } from './ik.js';
import type { IkDiagnostic } from './ik.js';
import { skinMesh } from './skinning.js';
import { poseRegion } from './regions.js';
import { UnknownIkConstraintError } from './pose.js';
import type { LocalFrame, Pose, PoseRequest, PosedBone, PosedMesh, PosedRegion } from './pose.js';
import { sampleLocals, sampleTime } from './sampling.js';
import { UnknownAnimationError } from './pose.js';
import { animationsOf, ikOf, validateSkeleton } from './skeleton.js';
import type { Id, MeshAttachment, Skeleton, Slot } from './skeleton.js';

/** A pose plus the things an evaluation learned on the way there. */
export interface Evaluation {
  readonly pose: Pose;
  /** One per constraint, in the order they were solved. */
  readonly ik: readonly IkDiagnostic[];
}

/**
 * Evaluates a rig at a moment.
 *
 * The only entry point in the package that touches more than one stage, and the
 * only importer of `ik.ts`. Everything it needs it has in its arguments: no
 * clock, no randomness, no registry, no I/O. That is what makes the determinism
 * test a test rather than a hope — the same rig and the same request produce the
 * same doubles because there is nothing else that could vary.
 *
 * `validateSkeleton` runs here rather than at load time so a rig cannot reach
 * the stages half-checked. It costs a pass over the rig per evaluation, which at
 * the rig sizes this package poses is not a cost worth a second entry point and
 * a way to forget to call it.
 */
export function evaluate(skeleton: Skeleton, request: PoseRequest): Evaluation {
  validateSkeleton(skeleton);

  // Stage 0. One local frame per bone, from the rest pose through the
  // animation's channels to whatever the request overrode.
  const locals = new Map<Id, LocalFrame>(sampleLocals(skeleton, request));

  // Stage 1. Every bone placed in the world, parents first.
  const worlds = forwardKinematics(skeleton, locals);
  const children = childIndexOf(skeleton);

  // Stage 2. The only solver in the package. Ordered by the constraint's own
  // `order` and then by id, so two constraints on the same limb have a defined
  // sequence rather than whichever the array happened to be written in — a rig
  // whose output depends on authoring order is a rig whose goldens move when
  // someone alphabetises a file.
  const diagnostics: IkDiagnostic[] = [];
  const known = ikOf(skeleton);
  // Every id a request NAMES must exist. A caller that moves one foot is
  // ordinary, so a constraint the map does not mention is solved at its authored
  // target and that is not an error. The failure worth failing on is the other
  // direction: an id that resolves to nothing, which is what a rename leaves
  // behind, and where the silent answer is a foot that stays on its old target
  // while the caller watches for it to move. An earlier version of this check
  // had the two backwards — it demanded the map be total, which made overriding
  // one foot impossible — and a test that overrode a single constraint is what
  // found it.
  for (const constraintId of Object.keys(request.ikTargets ?? {})) {
    if (!known.has(constraintId)) {
      throw new UnknownIkConstraintError(skeleton.id, constraintId);
    }
  }
  const constraints = [...skeleton.ik].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  for (const constraint of constraints) {
    diagnostics.push(
      solveConstraint(
        skeleton,
        constraint,
        locals,
        worlds,
        children,
        request.ikTargets?.[constraint.id] ?? constraint.target,
      ),
    );
  }

  // Stages 3 and 4. Attachments, in slot order so the draw order is the slot
  // order and neither stage has to sort afterwards.
  const regions: PosedRegion[] = [];
  const meshes: PosedMesh[] = [];
  const attachments = new Map(
    skeleton.attachments.map((attachment) => [attachment.id, attachment]),
  );

  skeleton.slots.forEach((slot: Slot, z: number) => {
    if (slot.attachmentId === null) return;
    const attachment = attachments.get(slot.attachmentId);
    if (attachment === undefined) return;
    if (attachment.kind === 'region') {
      regions.push(poseRegion(slot, attachment, worlds, z));
      return;
    }
    meshes.push(poseMesh(slot, attachment, worlds, z));
  });

  const bones: ReadonlyMap<Id, PosedBone> = new Map(
    skeleton.bones.map((bone) => [bone.id, posedBoneOf(bone.id, frameOf(worlds, bone.id))]),
  );

  const animation = animationsOf(skeleton).get(request.animationId);
  return {
    pose: Object.freeze({
      skeletonId: skeleton.id,
      animationId: request.animationId,
      // The SAMPLED time, not the requested one. A request for 1250ms on a
      // 1000ms loop lands at 250ms, and a pose that claimed otherwise would
      // make every golden ambiguous about which moment it recorded.
      atMs: animation === undefined ? request.atMs : sampleTime(animation, request.atMs),
      bones,
      regions: Object.freeze(regions),
      meshes: Object.freeze(meshes),
    }),
    ik: Object.freeze(diagnostics),
  };
}

/** The pose alone, for a caller that does not want the solver's diagnostics. */
export function evaluatePose(skeleton: Skeleton, request: PoseRequest): Pose {
  return evaluate(skeleton, request).pose;
}

/** Stage 3's output for one slot. */
function poseMesh(
  slot: Slot,
  attachment: MeshAttachment,
  worlds: ReadonlyMap<Id, WorldFrame>,
  z: number,
): PosedMesh {
  return Object.freeze({
    slotId: slot.id,
    attachmentId: attachment.id,
    meshId: attachment.meshId,
    vertices: Object.freeze([...skinMesh(attachment, worlds)]),
    triangles: Object.freeze([...attachment.triangles]),
    z,
  });
}

function frameOf(worlds: ReadonlyMap<Id, WorldFrame>, boneId: Id): WorldFrame {
  const frame = worlds.get(boneId);
  if (frame !== undefined) return frame;
  // validateSkeleton has already refused a rig whose bones do not resolve, so a
  // miss here means a bone was added to the rig after validation ran inside
  // this same call. Reporting it beats handing back a frame of NaN.
  throw new Error(`bone "${boneId}" was placed by no stage of the evaluation`);
}

/** Exposed so a caller can check a request before paying for an evaluation. */
export { animationsOf, UnknownAnimationError, worldAngle };
