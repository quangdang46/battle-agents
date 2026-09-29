/**
 * Where each other-scene place has its door in THIS scene.
 *
 * ## Why this table exists
 *
 * The doorway to the Guild Hall was drawn at the Guild Hall's own coordinates
 * -- (12, 10) -- because that is where `ZONE_PLACEMENT` puts it. The city's
 * `messaging` zone is at (10, 12): two cells away on a diagonal, which the
 * isometric projection squeezes into a handful of pixels. The city's own zone
 * therefore won every hit test near the door, the doorway was never clickable,
 * and the Guild Hall was a building with a door that opened onto a signpost.
 *
 * The fix is a separate table, not a nudge. A place you cannot reach is a label,
 * and this one was wearing a building's sprite.
 *
 * ## The rule the cells follow
 *
 * Every one of these is at least six cells from every city zone, because the
 * city's zones cluster in the middle of the map and the corners do not. That is
 * measured, not eyeballed: `doorwayCellsAreClearOfCityZones` in
 * `doorways.test.ts` asserts the separation, so moving a city zone toward a door
 * fails a test instead of silently making the door unclickable.
 */
export const DOORWAY_PLACEMENT: Readonly<
  Record<string, { readonly gx: number; readonly gy: number }>
> = {
  // Northwest corner, clear of `spawn` (10,8) and `messaging` (10,12).
  'guild-hall': { gx: 3, gy: 3 },
  // Southeast corner, clear of `search` (26,20) and `bounty-board` (30,18).
  'battle-arena': { gx: 28, gy: 28 },
};
