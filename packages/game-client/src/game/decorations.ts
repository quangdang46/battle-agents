import type { TerrainId } from './terrain-map.js';

/**
 * Decoration scatter: what stands on the grass between the buildings.
 *
 * Mirrored from age-of-agents `packages/client/src/game/decorations.ts` (MIT,
 * see THIRD-PARTY-NOTICES.md) including its "USER CONTRIBUTION (learning)" note,
 * because the note is the design: groves from a COARSE hash so trees cluster,
 * flowers that are frequent and tiny, boulders that are rare everywhere. The
 * alternative -- one hash per cell -- gives an even sprinkle that reads as
 * noise rather than as woodland.
 *
 * ## Where this diverges, and why
 *
 * The reference takes a `ThemeDef` and asks `inBuilding(theme, gx, gy)`, because
 * its buildings are rectangles with a width and a height. Ours are points:
 * `ZONE_PLACEMENT` says WHERE a zone stands and nothing about its footprint, so
 * there is no rectangle to be inside. The rule therefore keeps a clearance
 * radius around each zone's cell, which is the same intent -- a tree against a
 * wall is the thing being prevented -- expressed in the vocabulary this repo
 * actually has.
 *
 * Everything else is the reference's arithmetic, unchanged, because it is the
 * part that makes a place look like a place.
 */

/** The four decorations this pack ships. */
export type DecoKind = 'tree' | 'rock' | 'bush' | 'flower';

export interface DecoPlacement {
  readonly gx: number;
  readonly gy: number;
  readonly kind: DecoKind;
}

/**
 * A deterministic cell hash. No `Math.random`, anywhere, ever.
 *
 * `terrain-map.ts` set the precedent and the reason in one line: "a world that
 * reshuffles its own floor is not a place, it is noise". A decoration that
 * moved on every reload would be the same defect wearing a hat.
 */
export function cellHash(gx: number, gy: number, salt: number): number {
  let h = ((salt * 2654435761) ^ (gx * 73856093) ^ (gy * 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The decision for one cell: whether to place, and what. */
export function decoRule(gx: number, gy: number): { readonly place: boolean; readonly kind: DecoKind } {
  // `gx >> 2` collapses each 4x4 block to one value, so neighbouring cells
  // agree and the trees come out in groves instead of an even sprinkle.
  const grove = cellHash(gx >> 2, gy >> 2, 11) / 4294967296;
  const r = cellHash(gx, gy, 0) / 4294967296;
  if (grove > 0.7) {
    if (r < 0.35) return { place: true, kind: 'tree' };
    if (r < 0.42) return { place: true, kind: 'bush' };
  } else if (r < 0.06) {
    return { place: true, kind: 'flower' };
  }
  if (r > 0.99) return { place: true, kind: 'rock' };
  return { place: false, kind: 'tree' };
}

/**
 * Scatters decorations over the grass, clear of the zones.
 *
 * `clearOf` is given rather than looked up so this stays a pure function over its
 * arguments -- no store, no canvas, no projection. `terrain-map.ts` and
 * `zone-slot.ts` are both kept that way on purpose, and a rule that can only be
 * tested with a running world is a rule that is not tested.
 */
export function scatterDecorations(options: {
  readonly w: number;
  readonly h: number;
  readonly kindAt: (gx: number, gy: number) => TerrainId;
  /** Zone cells, so nothing grows through a doorway. */
  readonly clearOf: readonly { readonly gx: number; readonly gy: number }[];
  readonly clearance?: number;
}): readonly DecoPlacement[] {
  const clearance = options.clearance ?? 2;
  const out: DecoPlacement[] = [];
  for (let gy = 0; gy < options.h; gy += 1) {
    for (let gx = 0; gx < options.w; gx += 1) {
      if (options.kindAt(gx, gy) !== 'grass') continue;
      if (
        options.clearOf.some(
          (zone) => Math.abs(zone.gx - gx) <= clearance && Math.abs(zone.gy - gy) <= clearance,
        )
      ) {
        continue;
      }
      const { place, kind } = decoRule(gx, gy);
      if (!place) continue;
      // Sub-cell jitter, so a grove is not a grid of trees on the same pixel.
      const jx = (cellHash(gx, gy, 2) % 100) / 100 - 0.5;
      const jy = (cellHash(gx, gy, 3) % 100) / 100 - 0.5;
      out.push({ gx: gx + 0.5 + jx * 0.6, gy: gy + 0.5 + jy * 0.6, kind });
    }
  }
  return out;
}
