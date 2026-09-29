/**
 * Scene config: what each of the three scenes is, and how big its grid is.
 *
 * Plan section 25 names exactly three — `scenes/city.ts`, `scenes/arena.ts`,
 * `scenes/guild-hall.ts` — and DESIGN.md section 4 says so in its own words:
 * "There is no fourth scene, and a zone added to that config must land in a
 * place this document already describes." So the scene set is a closed union
 * here for the same reason `ZONE_PLACEMENT` is a `Record<ZoneId, ...>`: adding
 * a scene becomes a typecheck error rather than a screen nobody designed.
 *
 * The city is the second view, not the landing. DESIGN.md section 3 settles the
 * first screen as the Bounty Board, reached from the modern dashboard, and the
 * Coding City arrives at M5 as a second view. Nothing in this package chooses a
 * first screen, and that is deliberate — a client package that navigated to
 * itself on load would silently override that decision the first time someone
 * mounted it.
 */

/** The three scenes. Closed, per DESIGN.md section 4. */
export type SceneId = 'city' | 'arena' | 'guild-hall';

export interface SceneConfig {
  readonly id: SceneId;
  readonly label: string;
  /** Grid dimensions in tiles. */
  readonly w: number;
  readonly h: number;
  /** Terrain seed, so a scene is reproducible across reloads. */
  readonly seed: number;
}

export const CITY: SceneConfig = { id: 'city', label: 'Coding City', w: 48, h: 48, seed: 1 };
export const ARENA: SceneConfig = { id: 'arena', label: 'Arena', w: 24, h: 24, seed: 2 };
export const GUILD_HALL: SceneConfig = {
  id: 'guild-hall',
  label: 'Guild Hall',
  w: 24,
  h: 20,
  seed: 3,
};

/** Every scene, in the order DESIGN.md section 4 lists them. */
export const SCENES: readonly SceneConfig[] = [CITY, ARENA, GUILD_HALL];

export function sceneById(id: SceneId): SceneConfig {
  const found = SCENES.find((scene) => scene.id === id);
  // Total over a closed union of a three-element list, so this cannot be
  // reached. Throwing rather than returning a default: a caller that reached it
  // is rendering the wrong world, and a default would hide that.
  if (found === undefined) throw new Error(`No such scene: ${id}`);
  return found;
}


/**
 * ONE city, three districts. The thing this replaces.
 *
 * ## Why
 *
 * Three `SceneConfig`s meant three worlds that happened to hold the same
 * characters, and the operator read all three as the same screen. They were: the
 * same terrain sampler, the same art, the same 101 agents standing in a ring in
 * each. Switching between them rebuilt a view to show... another copy of the
 * city, at a different grid size. That is a tab wearing a world, and "the Arena
 * looks like the City" was not a bug in a feature, it was a description of the
 * architecture.
 *
 * ## What replaces it
 *
 * ONE grid, 48x48, with the three places laid out spatially inside it. Travelling
 * is a CAMERA MOVE, not a rebuild: the store, the socket, the asset cache and
 * the agent population are the player's, and moving from the Guild Hall to the
 * Plaza does not take any of that away. That is what `docs/design/game-first-
 * doctrine.md` section 2 is for, and the three tabs were reading its letter and
 * not its point.
 *
 * The districts are the three old scenes, translated rather than re-authored:
 *
 *      +-----------------------+------------------------+
 *      |      ARENA (north)    |     GUILD HALL (east)  |
 *      |  kenney-dungeon props |  arcane's six workers  |
 *      +-----------------------+------------------------+
 *      |          CODING CITY, the middle                  |
 *      |   age-of-agents roads, groves, working buildings  |
 *      +-----------------------+------------------------+
 *      |  knights | knights | knights                    |
 *      +-----------------------+------------------------+
 *
 * `DISTRICTS` replaces `SCENES`. The doors in `DOORWAY_PLACEMENT` become
 * ordinary cells in a city that is large enough to have room for them, so the
 * "a doorway you cannot reach because a neighbouring zone wins the hit test"
 * failure cannot recur: there is one coordinate space and one answer, and it is
 * where the building is.
 */
export interface District {
  readonly id: SceneId;
  readonly label: string;
  /** Grid cell this district is entered at. */
  readonly gx: number;
  readonly gy: number;
}

/** The one city. 48x48, because three places need room and one needs a road. */
export const CITY_GRID = { w: 48, h: 48 } as const;

export const DISTRICTS: readonly District[] = [
  { id: 'arena', label: 'Arena', gx: 10, gy: 8 },
  { id: 'guild-hall', label: 'Guild Hall', gx: 34, gy: 8 },
  { id: 'city', label: 'Coding City', gx: 24, gy: 26 },
];

/** The district a cell belongs to, by proximity -- nearest, so roads decide. */
export function districtAt(gx: number, gy: number): District {
  let best: District = DISTRICTS[2]!;
  let nearest = Number.POSITIVE_INFINITY;
  for (const district of DISTRICTS) {
    const distance = Math.hypot(district.gx - gx, district.gy - gy);
    if (distance < nearest) {
      nearest = distance;
      best = district;
    }
  }
  return best;
}
