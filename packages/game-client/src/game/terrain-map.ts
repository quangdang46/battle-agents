/**
 * Terrain: a deterministic biome map, and the autotile masks derived from it.
 *
 * Mirrored from age-of-agents `packages/client/src/game/terrain-map.ts` (MIT,
 * see THIRD-PARTY-NOTICES.md). The value-noise sampler, the two-octave fBm and
 * the pond/ridge thresholds are carried over unchanged, for the reason the
 * header of the original gives: coherent ponds and a grass buffer between rock
 * and water are what make the dual-grid autotiling come out clean, and that is a
 * property of the thresholds rather than of the code around them.
 *
 * Two divergences, both because our world is not the reference's world:
 *
 * 1. **Deterministic, and seeded per scene.** The reference closes over a
 *    `ThemeDef`. Ours takes a seed, so the same seed gives the same city and a
 *    different seed gives a different one — which is what makes a scene fixture
 *    in a test reproducible.
 * 2. **No roads.** The reference's dirt follows road curves from `roads.ts`.
 *    We have no road network in M5, so dirt is sampled from noise alone and the
 *    zone placements in `zones.ts` do the spatial work instead. If roads arrive,
 *    this is where they hook in.
 */

import { cornerMask, drawsTile, frameForMask, type IsUpper } from './autotile.js';

export type TerrainId = 'grass' | 'dirt' | 'water' | 'rock';

export const TERRAINS: readonly TerrainId[] = ['grass', 'dirt', 'water', 'rock'];

/** Low-noise depressions become ponds. */
const WATER_BELOW = 0.25;
/** High ridges become rock. */
const ROCK_ABOVE = 0.78;

/** Deterministic lattice-node hash -> [0,1). No Math.random, ever. */
function hash01(ix: number, iy: number, seed: number): number {
  const h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) >>> 0;
  const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function valueNoise(x: number, y: number, frequency: number, seed: number): number {
  const fx = x * frequency;
  const fy = y * frequency;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const top = lerp(hash01(x0, y0, seed), hash01(x0 + 1, y0, seed), tx);
  const bottom = lerp(hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed), tx);
  return lerp(top, bottom, ty);
}

/** Two octaves, so the patches have an irregular edge rather than a blobby one. */
function fbm(x: number, y: number, seed: number): number {
  return valueNoise(x, y, 0.16, seed) * 0.65 + valueNoise(x, y, 0.34, seed + 9973) * 0.35;
}

export interface GridSpec {
  readonly w: number;
  readonly h: number;
}

/** A sampler that answers for any cell, including ones outside the grid. */
export function terrainSampler(seed: number): (gx: number, gy: number) => TerrainId {
  const isWater = (gx: number, gy: number): boolean => fbm(gx, gy, seed) < WATER_BELOW;
  return (gx, gy) => {
    if (isWater(gx, gy)) return 'water';
    if (fbm(gx, gy, seed + 7) > ROCK_ABOVE) {
      // Rock never touches water. A rock/water seam is the one adjacency the
      // 16-frame corner set cannot draw, so the buffer is what keeps the
      // autotiling clean rather than a matter of taste.
      const nearWater =
        isWater(gx - 1, gy) || isWater(gx + 1, gy) || isWater(gx, gy - 1) || isWater(gx, gy + 1);
      if (!nearWater) return 'rock';
    }
    return valueNoise(gx, gy, 0.5, seed + 31) > 0.72 ? 'dirt' : 'grass';
  };
}

/** The biome map for a grid. Deterministic in `seed`. */
export function buildTerrainMap(grid: GridSpec, seed: number): TerrainId[][] {
  const sample = terrainSampler(seed);
  return Array.from({ length: grid.h }, (_, gy) =>
    Array.from({ length: grid.w }, (_, gx) => sample(gx, gy)),
  );
}

export interface TilePlacement {
  readonly gx: number;
  readonly gy: number;
  readonly mask: number;
  readonly frame: number;
}

/**
 * The tiles a terrain layer draws, as a flat list.
 *
 * Flat and computed rather than a grid of optionals, because the consumer is a
 * renderer that wants to iterate what exists. A tile whose mask draws nothing is
 * omitted, so the list is the draw calls and nothing else.
 */
export function tilesForTerrain(
  map: TerrainId[][],
  upper: TerrainId,
  grid: GridSpec,
): TilePlacement[] {
  const inBounds = (gx: number, gy: number): boolean =>
    gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h;
  const isUpper: IsUpper = (gx, gy) => inBounds(gx, gy) && map[gy]?.[gx] === upper;

  const tiles: TilePlacement[] = [];
  // One past the far edge on each axis: a display tile straddling the boundary
  // still has four corners inside the grid, and stopping at w-1 would leave an
  // untransitioned strip along the bottom and right edges.
  for (let dy = 0; dy <= grid.h; dy += 1) {
    for (let dx = 0; dx <= grid.w; dx += 1) {
      const mask = cornerMask(dx, dy, isUpper);
      if (!drawsTile(mask)) continue;
      tiles.push({ gx: dx, gy: dy, mask, frame: frameForMask(mask) });
    }
  }
  return tiles;
}

/**
 * Every upper terrain drawn in priority order, back to front.
 *
 * Water over rock over dirt over grass, so a pond edge draws over a rock edge
 * where they meet. The order is a decision about which transition wins, and it
 * is here rather than in a renderer so that both the flat and the isometric
 * path would read it from one place.
 */
export const TERRAIN_LAYER_ORDER: readonly TerrainId[] = ['dirt', 'rock', 'water'];
