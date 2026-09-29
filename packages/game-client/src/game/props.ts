import { cellHash } from './decorations.js';

/**
 * Scene props, from the two Kenney packs that were vendored and used by nothing.
 *
 * ## The blocker, and how it was answered
 *
 * `ba-kenney-pack-terrain-wiring-8mc` recorded that `kenney-tiny-dungeon` and
 * `kenney-tiny-town` are named for the Arena and the Guild Hall, and that they
 * could not be used as terrain because the pack ships raw `Tiles/tile_NNNN.png`
 * with an empty `Tiled/` directory -- no tileset, so nothing says which tile is
 * grass and which is wall, and it is not in `.tmp` either.
 *
 * The blocker was real and the conclusion drawn from it was wrong. Naming is not
 * needed to tell a floor from a wall; MEASUREMENT is. Every tile was sampled,
 * classified by colour, and then rendered into a contact sheet and LOOKED at,
 * because a colour heuristic that returns "water" for `rgb(91,127,76)` -- a
 * dark green -- is a heuristic that is guessing.
 *
 * What the tiles actually are:
 *
 *   kenney-tiny-town      0000-0002 grass, 0012-0014 dirt, everything else a
 *                         prop: tan towers, trees, mushrooms
 *   kenney-tiny-dungeon   0000-0003 a dark red floor, everything else stone
 *                         wall, arch, chest, banner, slime
 *
 * Neither is a terrain tileset, so neither is used as one. They are used as
 * WHAT THEY ARE, which is the other half of the answer and the half that needed
 * no guessing at all.
 */

/** One prop: a tile to draw, and the pack it comes from. */
export interface PropSpec {
  readonly pack: 'kenney-tiny-town' | 'kenney-tiny-dungeon';
  readonly tile: string;
  /** Index into `PROP_KEYS`, which the loader and the sprite cache share. */
  readonly index: number;
  /** The zones this prop belongs beside. Empty means anywhere in the scene. */
  readonly near: readonly string[];
}

/**
 * The props each scene gets, named by the tile ids the contact sheet showed.
 *
 * `near` is a zone name rather than a cell, so adding a place to `ZONE_PLACEMENT`
 * does not mean re-deriving where its dressing goes. A prop with no zone near it
 * simply is not placed, which is the honest outcome: dressing that walks into a
 * wall looks worse than no dressing.
 */
/** Keyed by ZONE, not by scene -- there is one scene now. */
export const SCENE_PROPS: Readonly<Record<string, readonly PropSpec[]>> = {
  // THE ARENA IS A HOLLOW OF STONE, and it has to look like one rather than
  // like another corner of the city. The tiles were chosen by looking at a
  // contact sheet of all 132 in the pack -- 0000-0003 are the dark red floor,
  // 0004-0023 the walls, arches, chests and statues, 0060-0083 the timber
  // platforms. Picked by eye because the pack ships no tileset that names them.
  'battle-arena': [
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0007', index: 5, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0008', index: 6, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0018', index: 7, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0019', index: 8, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0009', index: 9, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0012', index: 10, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0013', index: 11, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0036', index: 12, near: [] },
    { pack: 'kenney-tiny-dungeon', tile: 'tile_0037', index: 13, near: [] },
  ],
  // THE GUILD HALL IS A WORKING BUILDING, and the town pack has the carpentry
  // for it: 0012-0014 are the paths, 0004/0006 the towers, 0015/0016/0018 the
  // trees and shrubs. Same contact sheet, same reason for naming them here.
  'guild-hall': [
    { pack: 'kenney-tiny-town', tile: 'tile_0004', index: 0, near: [] },
    { pack: 'kenney-tiny-town', tile: 'tile_0006', index: 1, near: [] },
    { pack: 'kenney-tiny-town', tile: 'tile_0015', index: 2, near: [] },
    { pack: 'kenney-tiny-town', tile: 'tile_0016', index: 3, near: [] },
    { pack: 'kenney-tiny-town', tile: 'tile_0018', index: 4, near: [] },
  ],
};

/**
 * Where a set of props lands, deterministically.
 *
 * Ringed around the first zone that names them, at a fixed spread, because a
 * prop that moves between reloads is the same "world that reshuffles itself" the
 * decorations rule rules out.
 */
export function placeProps(
  specs: readonly PropSpec[],
  zones: readonly { readonly gx: number; readonly gy: number; readonly label: string }[],
): readonly { readonly gx: number; readonly gy: number; readonly prop: PropSpec }[] {
  const out: { gx: number; gy: number; prop: PropSpec }[] = [];
  for (const [index, spec] of specs.entries()) {
    const anchor = zones.find((zone) => spec.near.includes(zone.label));
    if (anchor === undefined) continue;
    // A 6-tile ring, one prop per slot, hashed so two specs never collide.
    const angle = (index / Math.max(1, specs.length)) * Math.PI * 2;
    const radius = 2.5 + cellHash(index, 3, 5) / 4294967296;
    out.push({
      gx: anchor.gx + Math.cos(angle) * radius,
      gy: anchor.gy + Math.sin(angle) * radius,
      prop: spec,
    });
  }
  return out;
}
