/**
 * The seam: what the engine emits and a renderer consumes.
 *
 * Plan section 25 puts the skeletal spike behind exactly this file — "engine
 * emits Pose, renderer consumes" — and the whole point of the split is that the
 * renderer CANNOT do the engine's work. So this file is written to make that
 * structural rather than a matter of discipline, and the two properties below
 * are what do it:
 *
 * 1. **It imports nothing.** No skeleton, no evaluator, no maths. A renderer
 *    that depends on this file therefore cannot reach the IK solver, the bone
 *    rest poses, or the channel sampler, no matter how it is written — the
 *    dependencies do not exist on its side of the boundary. That is checked by
 *    `tests/unit/animation-core-boundaries.test.ts`, which walks the module
 *    graph rather than reading a file.
 *
 * 2. **A pose is finished geometry.** Everything here is in world space and
 *    already solved. There is no bone length, no rest transform, no constraint
 *    and no parent link anywhere in these types, because a value that carried
 *    one would be an invitation to re-solve IK downstream, and the symptom of
 *    that is an editor and a player that look identical until the day they
 *    disagree.
 *
 * The vocabulary is Spine's (bone, slot, attachment, mesh, pose), which the plan
 * asks for by name in sections 9.1 and 9.4. The shapes are this repository's.
 */

/** A point in whatever space its owning type says it is in. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A 2D affine, `x' = a*x + c*y + tx`, `y' = b*x + d*y + ty`.
 *
 * A column-vector affine composed left to right, so `compose(parent, child)`
 * places a child inside a parent. `geometry.ts` is the only thing in the
 * package that builds one.
 */
export interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

/**
 * One bone's transform in its PARENT's space.
 *
 * `angle` rather than `rotation` because the unit is radians and the word
 * should not invite degrees; a rig authored in degrees and evaluated in
 * radians is a character lying on its side, and nothing reports it.
 */
export interface LocalFrame {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** The five things about a bone that an animation can move over time. */
export type ChannelProperty = keyof LocalFrame;

/** Every one of them, as a value — the list a fixture iterates. */
export const CHANNEL_PROPERTIES: readonly ChannelProperty[] = Object.freeze([
  'x',
  'y',
  'angle',
  'scaleX',
  'scaleY',
]);

/** A bone's finished transform, in world space. */
export interface PosedBone {
  readonly boneId: string;
  readonly world: Affine;
  /** `world` with the matrix dropped, for a caller that only wants to place something. */
  readonly origin: Point;
  readonly angle: number;
}

/**
 * A rectangle attachment, already placed.
 *
 * `matrix` is the full world transform of the rectangle's bottom-left unit
 * corner: a renderer multiplies its texture by this and gets the right pixels
 * in the right place. `corners` is the same answer with the multiplication
 * already done, for a renderer that wants to rasterise the quad itself — and
 * for a golden, which must not depend on the renderer's arithmetic.
 */
export interface PosedRegion {
  readonly slotId: string;
  readonly attachmentId: string;
  /** What to sample. Ids, not names, so a rename never changes a frame. */
  readonly regionId: string;
  readonly matrix: Affine;
  readonly corners: readonly [Point, Point, Point, Point];
  /** Draw order. Lower is further back, matching the slot order in the rig. */
  readonly z: number;
}

/** A deformed mesh attachment, already skinned and in world space. */
export interface PosedMesh {
  readonly slotId: string;
  readonly attachmentId: string;
  readonly meshId: string;
  readonly vertices: readonly Point[];
  readonly triangles: readonly number[];
  readonly z: number;
}

/**
 * What an evaluation produces.
 *
 * Finished and self-contained: given one of these and the art, a renderer has
 * everything it needs, and it needs nothing else. `bones` is keyed by id for
 * the same reason the rest of the package is — see `skeleton.ts`.
 */
export interface Pose {
  readonly skeletonId: string;
  /** The named pose this was sampled from, or `null` for a bare rest pose. */
  readonly animationId: string | null;
  /** Where in that pose the sample landed, after looping. */
  readonly atMs: number;
  readonly bones: ReadonlyMap<string, PosedBone>;
  /** In slot draw order, which is also the order a renderer wants them in. */
  readonly regions: readonly PosedRegion[];
  readonly meshes: readonly PosedMesh[];
}

/**
 * What to evaluate, and at what moment.
 *
 * `boneOverrides` and `ikTargets` are keyed by STABLE ID, like everything else
 * here. A request that named a bone instead would make a cosmetic change to the
 * rig a change to every frame, which is the failure stable ids exist to prevent.
 */
export interface PoseRequest {
  readonly animationId: string;
  readonly atMs: number;
  /** Per-bone values applied after sampling, for a pose the animation does not have. */
  readonly boneOverrides?: Readonly<Record<string, Partial<LocalFrame>>>;
  /** Per-constraint world targets, for a foot the animation does not place. */
  readonly ikTargets?: Readonly<Record<string, Point>>;
}

/** Thrown when a request names a pose the skeleton does not have. */
export class UnknownAnimationError extends Error {
  constructor(
    readonly skeletonId: string,
    readonly animationId: string,
  ) {
    super(`skeleton "${skeletonId}" has no animation "${animationId}"`);
    this.name = 'UnknownAnimationError';
  }
}

/** Thrown when a request names a constraint the skeleton does not have. */
export class UnknownIkConstraintError extends Error {
  constructor(
    readonly skeletonId: string,
    readonly constraintId: string,
  ) {
    super(`skeleton "${skeletonId}" has no IK constraint "${constraintId}"`);
    this.name = 'UnknownIkConstraintError';
  }
}

/* ── the snapshot ──────────────────────────────────────────────────────────
 *
 * A golden's instrument, and the reason this is here rather than in a test.
 *
 * Two poses can be numerically identical and still differ as JSON: `-0` and `0`
 * print the same way and are different values, `NaN` prints as `null` and
 * survives an equality check as "not equal to everything", and a Map iterates
 * in insertion order, which is a function of the order a rig happened to be
 * authored in rather than of the pose. A golden compared against raw doubles
 * would then fail for reasons no change to the evaluator caused, and the fix
 * everybody reaches for is to loosen the comparison.
 *
 * So: rounded to a declared number of decimals, negative zero folded to zero,
 * non-finite values REFUSED rather than serialised, and every collection
 * sorted by id. Two things follow, and both matter. The goldens are stable
 * enough to review in a diff. And a pose that produced a non-finite number
 * fails loudly here instead of quietly becoming `null` in a committed file.
 */

const SNAPSHOT_DECIMALS = 6;
const SNAPSHOT_SCALE = 10 ** SNAPSHOT_DECIMALS;

/** How many decimals a snapshot keeps. Half a millionth of a pixel at our scale. */
export const SNAPSHOT_RESOLUTION = SNAPSHOT_DECIMALS;

function snapshotNumber(value: number, where: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      `pose snapshot: ${where} is ${String(value)}. A non-finite number in a pose means a ` +
        'degenerate rig — a zero-length bone, an unreachable IK target, a scale of zero — and ' +
        'serialising it would write null into a golden and make the golden wrong.',
    );
  }
  const rounded = Math.round(value * SNAPSHOT_SCALE) / SNAPSHOT_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function snapshotPoint(p: Point, where: string): { readonly x: number; readonly y: number } {
  return { x: snapshotNumber(p.x, `${where}.x`), y: snapshotNumber(p.y, `${where}.y`) };
}

function snapshotAffine(m: Affine, where: string): Record<string, number> {
  return {
    a: snapshotNumber(m.a, `${where}.a`),
    b: snapshotNumber(m.b, `${where}.b`),
    c: snapshotNumber(m.c, `${where}.c`),
    d: snapshotNumber(m.d, `${where}.d`),
    tx: snapshotNumber(m.tx, `${where}.tx`),
    ty: snapshotNumber(m.ty, `${where}.ty`),
  };
}

/** A JSON-safe, order-stable projection of a pose. The shape a golden stores. */
export interface PoseSnapshot {
  readonly skeletonId: string;
  readonly animationId: string | null;
  readonly atMs: number;
  readonly bones: readonly {
    readonly boneId: string;
    readonly world: Record<string, number>;
    readonly origin: { readonly x: number; readonly y: number };
    readonly angle: number;
  }[];
  readonly regions: readonly {
    readonly slotId: string;
    readonly attachmentId: string;
    readonly regionId: string;
    readonly matrix: Record<string, number>;
    readonly corners: readonly { readonly x: number; readonly y: number }[];
    readonly z: number;
  }[];
  readonly meshes: readonly {
    readonly slotId: string;
    readonly attachmentId: string;
    readonly meshId: string;
    readonly vertices: readonly { readonly x: number; readonly y: number }[];
    readonly triangles: readonly number[];
    readonly z: number;
  }[];
}

/**
 * The projection, and the only comparison a golden test should make.
 *
 * Sorted by id everywhere, so two runs that agree produce byte-identical JSON
 * and `JSON.stringify` of the result is a legitimate equality check — which is
 * what the determinism test uses.
 */
export function poseSnapshot(pose: Pose): PoseSnapshot {
  return {
    skeletonId: pose.skeletonId,
    animationId: pose.animationId,
    atMs: snapshotNumber(pose.atMs, 'atMs'),
    bones: [...pose.bones.values()]
      .map((bone) => ({
        boneId: bone.boneId,
        world: snapshotAffine(bone.world, `bones.${bone.boneId}.world`),
        origin: snapshotPoint(bone.origin, `bones.${bone.boneId}.origin`),
        angle: snapshotNumber(bone.angle, `bones.${bone.boneId}.angle`),
      }))
      .sort((left, right) =>
        left.boneId < right.boneId ? -1 : left.boneId > right.boneId ? 1 : 0,
      ),
    regions: [...pose.regions]
      .map((region) => ({
        slotId: region.slotId,
        attachmentId: region.attachmentId,
        regionId: region.regionId,
        matrix: snapshotAffine(region.matrix, `regions.${region.attachmentId}.matrix`),
        corners: region.corners.map((corner, index) =>
          snapshotPoint(corner, `regions.${region.attachmentId}.corners[${index}]`),
        ),
        z: region.z,
      }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId)),
    meshes: [...pose.meshes]
      .map((mesh) => ({
        slotId: mesh.slotId,
        attachmentId: mesh.attachmentId,
        meshId: mesh.meshId,
        vertices: mesh.vertices.map((vertex, index) =>
          snapshotPoint(vertex, `meshes.${mesh.attachmentId}.vertices[${index}]`),
        ),
        triangles: [...mesh.triangles],
        z: mesh.z,
      }))
      .sort((left, right) => left.slotId.localeCompare(right.slotId)),
  };
}
