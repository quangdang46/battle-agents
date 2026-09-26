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
}

export function topdown(tile: number): Projection {
  return {
    toScreen: (gx, gy) => ({ x: gx * tile, y: gy * tile }),
    depth: (_gx, gy) => gy,
  };
}

/** Classic 2:1 diamond (tile width 2x height). */
export function isometric(tileW: number, tileH: number): Projection {
  return {
    toScreen: (gx, gy) => ({ x: ((gx - gy) * tileW) / 2, y: ((gx + gy) * tileH) / 2 }),
    depth: (gx, gy) => gx + gy,
  };
}
