/**
 * Roads: the ground between the places.
 *
 * Mirrored from age-of-agents `packages/client/src/game/roads.ts` (MIT, see
 * THIRD-PARTY-NOTICES.md), including its German comment, because the geometry is
 * the whole point and a translation would have lost it.
 *
 * ## The gap this closes was written down before it was filled
 *
 * `terrain-map.ts` said, in its own header: "**No roads.** The reference's dirt
 * follows road curves from `roads.ts`. We have no road network in M5, so dirt
 * is sampled from noise alone and the zone placements in `zones.ts` do the
 * spatial work instead. If roads arrive, this is where they hook in."
 *
 * A comment in shipped code naming its own missing half is the strongest
 * evidence there is, which is why this is a straight port rather than a
 * redesign: the dirt band and the drawn road are both a function of these
 * curves, so they cannot drift apart the way two separately-authored versions
 * would.
 *
 * ## One divergence
 *
 * The reference resolves curve endpoints by ID through a `ThemeDef` -- its
 * buildings have doors and its map has named crossroads. Ours has neither: a
 * zone is a point in `ZONE_PLACEMENT`. So the network is built from an explicit
 * node list instead, which is the same divergence `pathfind.ts` already took
 * and for the same reason -- a rendering concern does not belong in the
 * geometry.
 *
 * No `Math.random`, like everything else here: the same seed is the same city
 * on every reload and in every browser.
 */

/** A point on a road axis, and the half-width of the band there, in tiles. */
export interface RoadPoint {
  readonly gx: number;
  readonly gy: number;
  readonly hw: number;
}

const BASE_HW = 0.5;
const JUNCTION_BONUS = 0.5;
const WOBBLE_HW = 0.12;
const MAX_BOW = 1.5;

function hash01(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const signed = (a: number, b: number, seed: number): number => hash01(a, b, seed) * 2 - 1;

/**
 * One deterministic arc between two nodes, and its width profile.
 *
 * The Bézier PASSES THROUGH its endpoints at t=0 and t=1, so roads meet exactly
 * at nodes even though every segment bows by its own hashed amount. That is the
 * property that makes a network look laid out rather than sprayed.
 */
export function roadCurve(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  seed: number,
): RoadPoint[] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow =
    signed(Math.round(ax * 8 + bx), Math.round(ay * 8 + by), seed * 131 + 7) *
    Math.min(MAX_BOW, len * 0.16);
  const cx = (ax + bx) / 2 + nx * bow;
  const cy = (ay + by) / 2 + ny * bow;
  const wobFreq = 2 + Math.floor(hash01(seed, Math.round(len), 53) * 3);
  const wobPhase = hash01(seed, 99, 17) * Math.PI * 2;
  const steps = Math.max(8, Math.round(len * 2));
  const points: RoadPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      gx: mt * mt * ax + 2 * mt * t * cx + t * t * bx,
      gy: mt * mt * ay + 2 * mt * t * cy + t * t * by,
      // Wide at the nodes, narrow in the middle, with a wave on top: the three
      // together are what makes a road read as a road and not a stripe.
      hw: BASE_HW + JUNCTION_BONUS * Math.abs(Math.cos(Math.PI * t)) + WOBBLE_HW * Math.sin(t * Math.PI * wobFreq + wobPhase),
    });
  }
  return points;
}

/** One polyline per edge, in the order the edges were given. */
export function roadCurves(nodes: readonly RoadNode[], edges: readonly (readonly [number, number])[]): RoadPoint[][] {
  return edges.flatMap(([a, b], index) => {
    const from = nodes[a];
    const to = nodes[b];
    if (from === undefined || to === undefined) return [];
    return [roadCurve(from.gx, from.gy, to.gx, to.gy, index + 1)];
  });
}

export interface RoadNode {
  readonly gx: number;
  readonly gy: number;
}

/** Whether a point in grid space lies on any road. */
export function pointOnRoad(curves: readonly (readonly RoadPoint[])[], px: number, py: number): boolean {
  for (const curve of curves) {
    for (let i = 0; i < curve.length - 1; i += 1) {
      const a = curve[i]!;
      const b = curve[i + 1]!;
      const sx = b.gx - a.gx;
      const sy = b.gy - a.gy;
      const len2 = sx * sx + sy * sy || 1;
      let t = ((px - a.gx) * sx + (py - a.gy) * sy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = a.gx + t * sx;
      const cy = a.gy + t * sy;
      const hw = a.hw + (b.hw - a.hw) * t;
      if (Math.hypot(px - cx, py - cy) < hw) return true;
    }
  }
  return false;
}
