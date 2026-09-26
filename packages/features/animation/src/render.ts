/**
 * The other half of the split: something that draws a pose.
 *
 * ## What this file is allowed to know
 *
 * Exactly the types in `pose.ts`, and nothing else. The import below is
 * `import type`, so the compiled module has no dependency at all on anything —
 * there is no code path from here to the IK solver, the bone rest poses or the
 * channel sampler, because the code does not exist on this side of the line.
 *
 * That is the point, and it is worth being explicit about why it is built this
 * way rather than by convention. A renderer that solved IK looks identical on
 * screen: same pixels, same frame, same screenshot. What it destroys is the
 * property that an editor and a player can share a core, because the second
 * consumer of a pose would then be free to disagree with the first about where
 * a foot goes, and the disagreement would only ever surface as a visual bug
 * somebody reports as "the animation looks off in the editor".
 *
 * So the separation is structural, and the test that holds it
 * (`tests/unit/animation-core-boundaries.test.ts`) walks the module graph rather
 * than reading this file. A convention would need a reviewer who remembers it;
 * this needs a test that runs.
 *
 * ## What a draw list is
 *
 * Plain data, deliberately. Not PixiJS objects, not a canvas, not a texture
 * handle: this package has no idea what a GPU is and the thing that does is a
 * consumer. `drawList` is the last shape in this package, and everything after
 * it belongs to somebody else.
 */

import type { Point, Pose, PosedMesh, PosedRegion } from './pose.js';

/** Draw a rectangle of art. `matrix` is its world transform, already solved. */
export interface RegionDraw {
  readonly kind: 'region';
  /** Slot order, so a consumer can sort or batch without re-deriving it. */
  readonly z: number;
  readonly slotId: string;
  readonly regionId: string;
  readonly matrix: Readonly<{ a: number; b: number; c: number; d: number; tx: number; ty: number }>;
  readonly corners: readonly Point[];
}

/** Draw a deformed mesh. The vertices are already in world space. */
export interface MeshDraw {
  readonly kind: 'mesh';
  readonly z: number;
  readonly slotId: string;
  readonly meshId: string;
  readonly vertices: readonly Point[];
  readonly triangles: readonly number[];
}

export type DrawCommand = RegionDraw | MeshDraw;

/** What a consumer of a pose needs, and nothing more. */
export interface DrawList {
  readonly skeletonId: string;
  readonly animationId: string | null;
  readonly atMs: number;
  /** Back to front. Sorted once here so no consumer has to. */
  readonly commands: readonly DrawCommand[];
  /** The axis-aligned box containing every drawn point. Null for an empty pose. */
  readonly bounds: Bounds | null;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function regionCommand(region: PosedRegion): RegionDraw {
  return Object.freeze({
    kind: 'region' as const,
    z: region.z,
    slotId: region.slotId,
    regionId: region.regionId,
    matrix: region.matrix,
    corners: region.corners,
  });
}

function meshCommand(mesh: PosedMesh): MeshDraw {
  return Object.freeze({
    kind: 'mesh' as const,
    z: mesh.z,
    slotId: mesh.slotId,
    meshId: mesh.meshId,
    vertices: mesh.vertices,
    triangles: mesh.triangles,
  });
}

function grow(box: Bounds | null, point: Point): Bounds {
  if (box === null) return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  return {
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y),
  };
}

/**
 * Turns a pose into an ordered list of things to draw.
 *
 * The whole function. A consumer of this package is expected to call it and then
 * hand `commands` to whatever it draws with, and the reason this is a pure
 * function of a pose is that a consumer can hold a pose, compare two poses, and
 * know that any difference in the output came from the rig and not from here.
 */
export function drawList(pose: Pose): DrawList {
  const commands: DrawCommand[] = [
    ...pose.regions.map(regionCommand),
    ...pose.meshes.map(meshCommand),
  ].sort((left, right) => left.z - right.z || left.slotId.localeCompare(right.slotId));

  let bounds: Bounds | null = null;
  for (const command of commands) {
    if (command.kind === 'region') {
      for (const corner of command.corners) bounds = grow(bounds, corner);
    } else {
      for (const vertex of command.vertices) bounds = grow(bounds, vertex);
    }
  }

  return Object.freeze({
    skeletonId: pose.skeletonId,
    animationId: pose.animationId,
    atMs: pose.atMs,
    commands: Object.freeze(commands),
    bounds,
  });
}

/** How many things a pose draws. A cheap check that a rig is not silently empty. */
export function drawCount(list: DrawList): number {
  return list.commands.length;
}
