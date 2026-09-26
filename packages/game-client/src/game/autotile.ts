/**
 * Dual-grid autotiling: the corner mask, and a lookup that is a lookup.
 *
 * The `cornerMask` half is mirrored from age-of-agents (MIT, see
 * THIRD-PARTY-NOTICES.md) and is correct as it stands: four bits, NW=1, NE=2,
 * SW=4, SE=8, outside the grid counts as base.
 *
 * The lookup half is NOT mirrored, and `docs/research/age-of-agents.md` says
 * why: the reference's `DUAL_GRID_LOOKUP` is an identity function
 * (`mask => mask`) with a comment admitting it is a placeholder until a real
 * tileset exists. Copying it file-for-file imports a no-op that reads like an
 * implementation — the worst of both, because the next agent cannot tell
 * whether the autotiler works.
 *
 * So ours states the property instead. A dual-grid tileset is conventionally
 * laid out in a fixed order, and the order this client generates is the
 * standard 16-frame corner set: mask 0 (no upper terrain at all) is the empty
 * slot, and masks 1..15 are the drawn frames. `frameForMask` returns
 * `mask - 1` and the empty case is handled by the caller, which is a real
 * mapping, not an identity.
 *
 * The honest limit: the mapping is only correct for a tileset laid out in this
 * order. When a real pack's frame order is known, this table changes with it —
 * which is why it is a named table with one entry per mask rather than an
 * arithmetic trick buried in a return statement. A test can then pin it.
 */

/** Predicate: whether logical cell (gx,gy) belongs to the pair's "upper" terrain. */
export type IsUpper = (gx: number, gy: number) => boolean;

/** Bits set by `cornerMask`. */
export const NW = 1;
export const NE = 2;
export const SW = 4;
export const SE = 8;

/**
 * 4-corner mask for display-grid render tile (dx,dy).
 *
 * The render tile lies at the junction of 4 logical cells shifted by -1 in NW.
 */
export function cornerMask(dx: number, dy: number, isUpper: IsUpper): number {
  return (
    (isUpper(dx - 1, dy - 1) ? NW : 0) +
    (isUpper(dx, dy - 1) ? NE : 0) +
    (isUpper(dx - 1, dy) ? SW : 0) +
    (isUpper(dx, dy) ? SE : 0)
  );
}

/**
 * Mask -> frame index in a standard dual-grid tileset, or -1 for "draw nothing".
 *
 * Sixteen entries for sixteen masks. Mask 0 is the interior case: the display
 * tile is entirely surrounded by base terrain, so there is no transition to draw
 * and the base layer shows through. A lookup that returned 0 there would paint
 * a spurious tile in the middle of every field.
 */
export const DUAL_GRID_LOOKUP: readonly number[] = Object.freeze([
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
]);

/**
 * The frame for a mask.
 *
 * -1 means "no tile", and is returned rather than coerced to 0 because a caller
 * that draws frame 0 for an empty mask produces a visible artefact, and the
 * difference between the two is exactly the kind of thing a placeholder
 * identity lookup hides.
 */
export function frameForMask(mask: number): number {
  return DUAL_GRID_LOOKUP[mask] ?? -1;
}

/** Whether a mask draws a tile at all. */
export function drawsTile(mask: number): boolean {
  return frameForMask(mask) >= 0;
}
