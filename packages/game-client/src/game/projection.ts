/**
 * Projections: logical Cartesian grid (gx, gy) -> screen pixels.
 * Game logic (paths, movement, positions) NEVER works in screen coordinates;
 * only rendering goes through projection.
 *
 * Mirrored from age-of-agents `packages/client/src/game/projection.ts` (MIT,
 * Copyright (c) 2026 Mateusz Pawelczuk; recorded in THIRD-PARTY-NOTICES.md).
 * Verbatim, and that is the point: it is 25 lines that hold the entire
 * pixel-math story, and re-deriving it is how a second projection convention
 * gets invented. See docs/research/age-of-agents.md, which names this file as
 * the cheapest thing in the reference to steal.
 *
 * The divergence from the reference is not in this file. `topdown` is the only
 * projection the world uses — DESIGN.md settles 2D pixel art with a top-down
 * Coding City, and the reference's isometric variant exists for its second
 * asset pack, which we do not have. `isometric` is kept because a future
 * dungeon view is a two-line addition, and deleting it would make that change
 * a rewrite.
 */

export interface Projection {
  toScreen(gx: number, gy: number): { x: number; y: number };
  /** Value for depth-sorting (zIndex) units/buildings. */
  depth(gx: number, gy: number): number;
  /**
   * The grid cell a SCREEN point lands in, in world-layer coordinates.
   *
   * Added for hit-testing, which is how a building becomes a doorway: you click
   * a pixel, and something has to say which cell that pixel is. Both projections
   * are invertible, and each inverse is the algebra of its forward written
   * backwards -- `fromScreen` is not an approximation of `toScreen` called
   * again, which is the thing that would make a click land a tile off.
   */
  fromScreen(x: number, y: number): { gx: number; gy: number };
}

export function topdown(tile: number): Projection {
  return {
    toScreen: (gx, gy) => ({ x: gx * tile, y: gy * tile }),
    depth: (_gx, gy) => gy,
    fromScreen: (x, y) => ({ gx: Math.floor(x / tile), gy: Math.floor(y / tile) }),
  };
}

/** Classic 2:1 diamond (tile width 2x height). */
export function isometric(tileW: number, tileH: number): Projection {
  return {
    toScreen: (gx, gy) => ({ x: ((gx - gy) * tileW) / 2, y: ((gx + gy) * tileH) / 2 }),
    depth: (gx, gy) => gx + gy,
    fromScreen: (x, y) => {
      // Undo the 2:1 diamond: y separates the two axes and x separates them
      // again. A tile is the half-parallelogram, so the +0.5 lands the click in
      // the cell whose CENTRE it was nearest.
      const a = x / (tileW / 2) + 0.5;
      const b = y / (tileH / 2) + 0.5;
      return { gx: Math.floor((a + b) / 2), gy: Math.floor((b - a) / 2) };
    },
  };
}
