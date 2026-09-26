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

export const CITY: SceneConfig = { id: 'city', label: 'Coding City', w: 32, h: 32, seed: 1 };
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
