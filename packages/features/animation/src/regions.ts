/**
 * Stage 4: region transform. A rectangle of art, placed in the world.
 *
 * The second attachment path, and the one a game client's sprite factory
 * actually wants: a world matrix and a size is everything a textured quad
 * needs, and it is the shape a 16x16 placeholder and a 64px sheet share.
 *
 * Like `skinning.ts`, this stage runs AFTER the IK stage and takes world
 * transforms as given. It never looks at a constraint, a bone length or a rest
 * pose, which is what makes it safe for a renderer to depend on and unsafe for
 * anyone to move earlier in the pipeline.
 */

import {
  affine,
  affineCorners,
  applyPoint,
  composeAffine,
  localFrameToAffine,
} from './geometry.js';
import type { Affine, PosedRegion } from './pose.js';
import type { BoneWorlds } from './fk.js';
import type { RegionAttachment, Slot } from './skeleton.js';

/**
 * The world transform of one region.
 *
 * Two matrices, in this order: the bone's world composed with the attachment's
 * own offset and angle in bone space, and then the rectangle itself.
 *
 * ## The pivot, and why it is multiplied by the size
 *
 * `pivotX`/`pivotY` are FRACTIONS of the art, so the shift has to be in art
 * units: a 6x7 rectangle pivoted at its middle shifts by 3 and 3.5, not by 0.5.
 * Composing a `scale` with a `translate(-pivot)` the intuitive way — translate
 * first, scale second — gets this right, and composing them the other way does
 * not. The first version of this function did it the other way, and the symptom
 * was a bone sitting half a pixel from where the art was: every rectangle
 * centred a little right of and below its own bone, by an amount proportional
 * to nothing the author could see. `regionMatrix` writes the product out in one
 * matrix so the multiplication is visible rather than a composition order
 * somebody has to hold in their head.
 */
export function regionMatrix(attachment: RegionAttachment, boneWorld: Affine): Affine {
  const offset = localFrameToAffine({
    x: attachment.x,
    y: attachment.y,
    angle: attachment.angle,
    scaleX: 1,
    scaleY: 1,
  });
  const sized = composeAffine(boneWorld, offset);
  return composeAffine(
    sized,
    affine(
      attachment.width,
      0,
      0,
      attachment.height,
      -attachment.pivotX * attachment.width,
      -attachment.pivotY * attachment.height,
    ),
  );
}

/**
 * The four corners of a placed region, in draw order.
 *
 * Bottom-left, bottom-right, top-right, top-left — the order a triangle strip
 * and a texture's own corner order both expect, and the order a golden is
 * readable in.
 */
export function regionCorners(
  matrix: Affine,
): readonly [
  ReturnType<typeof applyPoint>,
  ReturnType<typeof applyPoint>,
  ReturnType<typeof applyPoint>,
  ReturnType<typeof applyPoint>,
] {
  return affineCorners(matrix);
}

/** Assembles the posed form of one slot's region attachment. */
export function poseRegion(
  slot: Slot,
  attachment: RegionAttachment,
  worlds: BoneWorlds,
  z: number,
): PosedRegion {
  const boneWorld = worlds.get(slot.boneId)?.world;
  if (boneWorld === undefined) {
    throw new Error(
      `slot "${slot.id}" is bound to bone "${slot.boneId}", which has no world transform. ` +
        'validateSkeleton refuses a rig that reaches this state.',
    );
  }
  const matrix = regionMatrix(attachment, boneWorld);
  return Object.freeze({
    slotId: slot.id,
    attachmentId: attachment.id,
    regionId: attachment.regionId,
    matrix,
    corners: regionCorners(matrix),
    z,
  });
}

/** The size a region draws at, for a renderer that lays regions out rather than sampling them. */
export function regionSize(
  attachment: RegionAttachment,
): Readonly<{ width: number; height: number }> {
  return Object.freeze({ width: attachment.width, height: attachment.height });
}
