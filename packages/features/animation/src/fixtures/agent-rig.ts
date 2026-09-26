/**
 * A named rig, authored rather than derived, with the numbers written out.
 *
 * This is the fixture every golden in `goldens.ts` is recorded against, and it
 * is a real 16x16-at-3x character rather than a stack of boxes picked for easy
 * arithmetic: the plan's medium is a 16px sprite grid (`sprite-factory.ts` in
 * the game client), and a rig that only works at convenient coordinates proves
 * nothing about the one it has to pose.
 *
 * ## The shape, and where each bone stands at rest
 *
 *     root (8,13) ── torso (8,13) ── head (8,7)
 *                                  ├── arm-l (5,10)
 *                                  ├── arm-r (11,10)
 *                                  ├── hip-l (7,13) ── leg-l (7,16) ── foot-l (7,19)
 *                                  └── hip-r (9,13) ── leg-r (9,16) ── foot-r (9,19)
 *
 * Screen coordinates: x right, **y down**, ground at y = 19, so the figure is
 * sixteen wide. y down is not an accident — it is the convention the game
 * client projects in, and a rig authored y-up has to be flipped somewhere, and
 * the somewhere is always a bug report.
 *
 * Three decisions in here are load-bearing, and each one is there to catch a
 * specific wrong answer rather than to be tidy:
 *
 * - **Two legs, each with its own hip bone.** One hip shared by two constraints
 *   is a rig where the second solve rotates the hip out from under the first leg
 *   and the first leg stops reaching its target — a real failure, and not one a
 *   one-legged fixture could ever show. Two hips also make the two constraints
 *   independent, so one wrong answer does not mask the other.
 * - **The left foot's IK target is its rest position, and the right foot's is
 *   not.** A target the limb already satisfies is a solve that does nothing, so
 *   the left leg's golden is a record of the rest shape reached THROUGH the full
 *   pipeline rather than of a shortcut — a golden taken without the solve looks
 *   identical, and the difference appears only once a target moves. The right
 *   foot reaches a target 1px to its right, which makes the solve do real work
 *   and makes the two bend directions produce visibly different legs.
 * - **The bend directions are opposite.** With both the same, a solver that
 *   ignored the field would produce the correct answer and the field would be
 *   untested.
 *
 * Every rest angle is a whole number of degrees converted to radians ONCE, by
 * `deg()`. Writing `Math.PI / 4` at eleven call sites is how a rig ends up with
 * two different "45 degrees" that differ in the last bit, and a golden then fails
 * for a reason no change to the evaluator caused.
 */

import { forwardKinematics } from '../fk.js';
import type { WorldFrames } from '../fk.js';
import { bindWorldOf, rigidBinding } from '../skinning.js';
import type { Affine, LocalFrame, Point } from '../pose.js';
import type { Animation, Bone, Skeleton } from '../skeleton.js';

/** Degrees to radians, at authoring time only. */
function deg(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function frame(x: number, y: number, angleDegrees = 0): LocalFrame {
  return { x, y, angle: deg(angleDegrees), scaleX: 1, scaleY: 1 };
}

const SKELETON_ID = 'agent-16';

const BONES: readonly Bone[] = [
  { id: 'bone.root', name: 'root', parentId: null, setup: frame(8, 13) },
  { id: 'bone.torso', name: 'torso', parentId: 'bone.root', setup: frame(0, 0) },
  { id: 'bone.head', name: 'head', parentId: 'bone.torso', setup: frame(0, -6) },
  { id: 'bone.arm-l', name: 'arm (left)', parentId: 'bone.torso', setup: frame(-3, -3) },
  { id: 'bone.arm-r', name: 'arm (right)', parentId: 'bone.torso', setup: frame(3, -3) },
  { id: 'bone.hip-l', name: 'hip (left)', parentId: 'bone.torso', setup: frame(-1, 0) },
  { id: 'bone.leg-l', name: 'leg (left)', parentId: 'bone.hip-l', setup: frame(0, 3.5) },
  { id: 'bone.foot-l', name: 'foot (left)', parentId: 'bone.leg-l', setup: frame(0, 3.5) },
  { id: 'bone.hip-r', name: 'hip (right)', parentId: 'bone.torso', setup: frame(1, 0) },
  { id: 'bone.leg-r', name: 'leg (right)', parentId: 'bone.hip-r', setup: frame(0, 3.5) },
  { id: 'bone.foot-r', name: 'foot (right)', parentId: 'bone.leg-r', setup: frame(0, 3.5) },
];

/** A rectangle of art, pivoted about its middle so a bone sits inside it. */
function region(id: string, regionId: string, width: number, height: number, x: number, y: number) {
  return {
    id,
    kind: 'region' as const,
    regionId,
    width,
    height,
    x,
    y,
    angle: 0,
    pivotX: 0.5,
    pivotY: 0.5,
  };
}

/** A mesh influence: `weight` of one bone's world transform. */
function influence(boneId: string, bindWorld: Affine, weight: number) {
  return { ...rigidBinding(boneId, bindWorld), weight };
}

/**
 * The scarf: a quad whose lower row follows the torso and whose upper row
 * straddles the torso and the head, so tipping the head swings its free end.
 *
 * The vertices are in MODEL space — where they sit with the rig at rest — and
 * the bind worlds come from running the rest pose through this package's own FK
 * rather than from four hand-written matrices. A fixture that computes its own
 * bind pose cannot drift from the rig it belongs to, which is exactly what a
 * hand-written one does the first time somebody nudges a bone.
 */
function buildScarf(): Skeleton['attachments'][number] {
  const restOnly: Skeleton = {
    id: SKELETON_ID,
    name: 'agent-16 (rest)',
    bones: BONES,
    slots: [],
    attachments: [],
    ik: [],
    animations: [],
  };
  const rest: WorldFrames = forwardKinematics(
    restOnly,
    new Map(BONES.map((bone) => [bone.id, bone.setup] as const)),
  );
  const torso = bindWorldOf('bone.torso', rest);
  const head = bindWorldOf('bone.head', rest);

  const vertices: readonly Point[] = [
    { x: 6, y: 10 },
    { x: 10, y: 10 },
    { x: 10.5, y: 7.5 },
    { x: 5.5, y: 7.5 },
  ];
  return {
    id: 'attachment.scarf',
    kind: 'mesh',
    meshId: 'mesh.scarf',
    vertices,
    triangles: [0, 1, 2, 0, 2, 3],
    bindings: [
      [influence('bone.torso', torso, 1)],
      [influence('bone.torso', torso, 1)],
      [influence('bone.head', head, 1)],
      [influence('bone.torso', torso, 0.35), influence('bone.head', head, 0.65)],
    ],
  };
}

/**
 * The five animations, one per state, in the order `AGENT_STATES` names them.
 *
 * Each is a short loop with one or two animated channels, which is the whole
 * vocabulary this spike supports. `reading` and `terminal` move one channel
 * because a character at work is mostly still; `attack`, `damage` and `victory`
 * move the torso and an arm because those are the states a player is watching.
 *
 * `damage` and `attack` are `loop: false` on purpose — a hit that loops looks
 * like a character twitching forever — which makes the sampler's hold-at-the-end
 * and the `atMs` the pose reports differ for them, and that difference is a
 * golden worth having rather than a detail.
 *
 * Two of these — `damage` and `attack` — rotate the TORSO, which is what puts
 * the IK solver's parent-angle term on a golden rather than leaving it a code
 * path nothing walks. Deliberate: the solver has to subtract the parent's world
 * angle to land a foot on its target, and `reading`, `terminal` and `victory`
 * move a head or an arm and leave both hips still, so without those two the term
 * would only ever be exercised by a rig nobody ships.
 */
const ANIMATIONS: readonly Animation[] = [
  {
    id: 'reading',
    name: 'reading',
    durationMs: 1600,
    loop: true,
    channels: [
      {
        boneId: 'bone.head',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(-4) },
          { atMs: 800, value: deg(6) },
          { atMs: 1600, value: deg(-4) },
        ],
      },
    ],
  },
  {
    id: 'terminal',
    name: 'terminal',
    durationMs: 900,
    loop: true,
    channels: [
      {
        boneId: 'bone.arm-r',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(-25) },
          { atMs: 450, value: deg(-8) },
          { atMs: 900, value: deg(-25) },
        ],
      },
    ],
  },
  {
    id: 'damage',
    name: 'damage',
    durationMs: 400,
    loop: false,
    channels: [
      {
        boneId: 'bone.torso',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(0) },
          { atMs: 100, value: deg(14) },
          { atMs: 400, value: deg(0) },
        ],
      },
    ],
  },
  {
    id: 'victory',
    name: 'victory',
    durationMs: 1200,
    loop: true,
    channels: [
      {
        boneId: 'bone.arm-l',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(18) },
          { atMs: 600, value: deg(48) },
          { atMs: 1200, value: deg(18) },
        ],
      },
      {
        boneId: 'bone.arm-r',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(-18) },
          { atMs: 600, value: deg(-48) },
          { atMs: 1200, value: deg(-18) },
        ],
      },
    ],
  },
  {
    id: 'attack',
    name: 'attack',
    durationMs: 500,
    loop: false,
    channels: [
      {
        boneId: 'bone.arm-r',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(0) },
          { atMs: 120, value: deg(-110) },
          { atMs: 500, value: deg(0) },
        ],
      },
      {
        boneId: 'bone.torso',
        property: 'angle',
        keys: [
          { atMs: 0, value: deg(0) },
          { atMs: 120, value: deg(-8) },
          { atMs: 500, value: deg(0) },
        ],
      },
    ],
  },
];

/** The named rig. The fixture every golden is recorded against. */
export const AGENT_16: Skeleton = Object.freeze({
  id: SKELETON_ID,
  name: 'agent-16',
  bones: BONES,
  slots: [
    {
      id: 'slot.leg-l',
      name: 'leg (left)',
      boneId: 'bone.leg-l',
      attachmentId: 'attachment.leg-l',
    },
    {
      id: 'slot.leg-r',
      name: 'leg (right)',
      boneId: 'bone.leg-r',
      attachmentId: 'attachment.leg-r',
    },
    { id: 'slot.scarf', name: 'scarf', boneId: 'bone.head', attachmentId: 'attachment.scarf' },
    { id: 'slot.torso', name: 'torso', boneId: 'bone.torso', attachmentId: 'attachment.torso' },
    { id: 'slot.head', name: 'head', boneId: 'bone.head', attachmentId: 'attachment.head' },
    {
      id: 'slot.arm-l',
      name: 'arm (left)',
      boneId: 'bone.arm-l',
      attachmentId: 'attachment.arm-l',
    },
    {
      id: 'slot.arm-r',
      name: 'arm (right)',
      boneId: 'bone.arm-r',
      attachmentId: 'attachment.arm-r',
    },
  ],
  attachments: [
    region('attachment.leg-l', 'sprite.leg', 2, 6, 0, 1),
    region('attachment.leg-r', 'sprite.leg', 2, 6, 0, 1),
    region('attachment.torso', 'sprite.torso', 6, 7, 0, -2),
    region('attachment.head', 'sprite.head', 5, 5, 0, 0),
    region('attachment.arm-l', 'sprite.arm', 2, 5, 0, 1),
    region('attachment.arm-r', 'sprite.arm', 2, 5, 0, 1),
    buildScarf(),
  ],
  ik: [
    {
      id: 'ik.leg-l',
      rootBoneId: 'bone.hip-l',
      midBoneId: 'bone.leg-l',
      tipBoneId: 'bone.foot-l',
      // Splayed one and a half pixels to the left of the hip, on the ground.
      // The legs are 7 long and the hip is 6 above the ground, so BOTH feet are
      // reachable with a bent knee — which means every animation's golden can
      // assert that a foot lands on its target, and a solver that quietly gave
      // up (the clamp path) would show up as a moved foot rather than as a
      // diagnostic nobody read.
      target: { x: 5.5, y: 19 },
      bendDirection: -1 as const,
      order: 0,
    },
    {
      id: 'ik.leg-r',
      rootBoneId: 'bone.hip-r',
      midBoneId: 'bone.leg-r',
      tipBoneId: 'bone.foot-r',
      // Mirrored to the right of the right hip, with the OPPOSITE bend
      // direction. With both the same, a solver that ignored the field would
      // produce the right answer and the field would be untested.
      target: { x: 10.5, y: 19 },
      bendDirection: 1 as const,
      order: 1,
    },
  ],
  animations: ANIMATIONS,
});

/** The rig's id, for a caller holding the fixture and needing to name it. */
export const AGENT_16_ID = SKELETON_ID;
