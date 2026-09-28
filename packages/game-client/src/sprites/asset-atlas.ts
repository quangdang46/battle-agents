/**
 * The vendored art, loaded.
 *
 * ## What this is for
 *
 * The 3,436 files under `apps/web/public/art/` sat on disk, licensed, recorded
 * in `THIRD-PARTY-NOTICES.md` and referenced only from comments. The renderer
 * drew rectangles out of `PixelCanvas` instead, and the file that drew them said
 * why that was acceptable:
 *
 * > A placeholder that tries to be a character illustration is a placeholder
 * > nobody can distinguish from real art, and the moment real art lands the
 * > difference has to be obvious or the placeholders quietly ship.
 *
 * The placeholders shipped. That is the whole reason this module exists, and the
 * reason the art it loads is plan §28.1 item 6 — the `age-of-agents` `fantasy` and
 * `scifi` packs, which are MIT *including their art*, and whose building names
 * already match DESIGN.md §4's Coding City: `guild` is the Guild Hall, `library`
 * the Research Lab, `forge` the Workshop, `market` the Bounty Board, `arena` the
 * Arena.
 *
 * ## The sheets come with their own manifests
 *
 * Each PNG has a TexturePacker JSON beside it — for the animated ones — so a
 * frame is LOOKED UP by name rather than computed from a frame count somebody
 * typed. The single-frame buildings have no manifest because they need none, and
 * `buildingIds` is the pack's own `index.json` rather than a list kept here,
 * which is the same reason: adding a building to the pack adds it to the city.
 *
 * ## Failure is a fallback, not a throw
 *
 * A missing sheet, an unreadable manifest or a 404 leaves the programmatic
 * factory in charge. The client must still render, because a client that renders
 * nothing tells a developer nothing, and the one thing a broken asset path must
 * not do is take the game down with it. `loadSpriteAssets` therefore resolves
 * with whatever it managed to read and records what it did not, so the caller
 * can say so rather than discovering it as an empty city.
 */
import { Assets, Texture } from 'pixi.js';

import { ZONE_PLACEMENT } from '../zones.js';
import type { TerrainId } from '../game/terrain-map.js';
import type { ZoneId } from '@battle-agents/protocol';

/** Where the pack lives, relative to the app root. */
export const ART_BASE = '/art/age-of-agents';

/** The two themes §28.1 item 6 vendors. */
export type ArtTheme = 'fantasy' | 'scifi';

export interface HeroSheet {
  readonly name: string;
  /** Idle frames, in order. Four per hero in the vendored pack. */
  readonly idle: readonly Texture[];
  /** Six frames. A character that is somewhere it is not standing still. */
  readonly walk: readonly Texture[];
  /**
   * Nine frames, and the reason this is animation rather than decoration.
   *
   * The pack ships a `work` animation per hero, and the game already knows the
   * difference between an agent doing something and an agent idle — `AgentView`
   * carries the tool. So the frames the game plays are chosen by the same state
   * that chooses a zone: an agent with a tool works, and one without breathes.
   */
  readonly work: readonly Texture[];
}

/** The animations a hero sheet carries, in the order they are preferred. */
const ANIMATIONS = ['idle', 'walk', 'work'] as const;

export interface SpriteAssets {
  readonly theme: ArtTheme;
  readonly heroes: readonly HeroSheet[];
  /** By building id — `guild`, `arena`, `forge`, and so on. */
  readonly buildings: ReadonlyMap<string, Texture>;
  /** Ground tiles, in sheet order. */
  /** Ground, BY KIND, because a flat list of tiles is a list you cannot choose from. */
  readonly terrain: Readonly<Record<string, readonly Texture[]>>;
  /** Ids that were named but could not be loaded. */
  readonly missing: readonly string[];
}

/** Buildings the Coding City is drawn from, and the zone each one stands on. */
const ZONE_BUILDING: Readonly<Record<string, string>> = {
  'battle-arena': 'arena',
  'guild-hall': 'guild',
  thinking: 'library',
  files: 'forge',
  'bounty-board': 'market',
  messaging: 'tavern',
  terminal: 'tower',
  search: 'shrine',
  spawn: 'barracks',
};

/** Terrain, in the order the client walks it. Named here, not discovered. */
const TERRAIN_IDS: readonly TerrainId[] = ['dirt', 'rock', 'water', 'grass'];

/**
 * A Kenney tileset, loaded as a grid of 16px tiles.
 *
 * The age-of-agents terrain sheets are TexturePacker JSON; the Kenney ones are a
 * plain PNG at an exact tile size, measured from the file rather than assumed
 * (`kenney-rpg-urban-pack` is 432x288 = 27x18 tiles of 16). Splitting the sheet
 * here rather than handing the client a 432px image is what makes it a GROUND
 * the city stands on rather than a picture of one.
 */
interface RawSheet {
  readonly textures?: Readonly<Record<string, Texture>>;
}

/**
 * The frames of a sheet whose manifest NAME carries this animation.
 *
 * TexturePacker names them `<sheet>__<animation>_<nn>` — `fable-default__idle_00`
 * — and Pixi's spritesheet parser keys the loaded textures by exactly that. So
 * the animation is a filter on the KEY, which is why this reads the record
 * rather than the texture list: an earlier version went looking for the names
 * inside `texture.source.data.frames`, which is not a thing Pixi exposes, and
 * would have silently fallen through to "whichever frames sort first" — an
 * animation named idle that is really somebody walking.
 */
function framesOf(loaded: unknown, animation?: string): readonly Texture[] {
  const sheet = loaded as RawSheet;
  if (sheet.textures === undefined) return [];
  const entries = Object.entries(sheet.textures);
  if (animation === undefined) return entries.map(([, texture]) => texture);
  const suffix = `__${animation}_`;
  const matching = entries.filter(([name]) => name.includes(suffix));
  // An animation the sheet does not carry yields the whole sheet rather than
  // nothing: a hero with no idle frames is a hero that cannot be drawn, and the
  // first frame of the sheet is a better answer than no sprite at all.
  const chosen = matching.length > 0 ? matching : entries;
  return chosen.map(([, texture]) => texture);
}

async function loadOne(path: string, animation?: string): Promise<readonly Texture[] | undefined> {
  try {
    return framesOf(await Assets.load(`${path}.json`), animation);
  } catch {
    return undefined;
  }
}

/** Loads one PNG as a single texture — the path for the manifest-less buildings. */
async function loadTexture(path: string): Promise<Texture | undefined> {
  try {
    return await Assets.load<Texture>(path);
  } catch {
    return undefined;
  }
}

export interface LoadSpriteAssetsOptions {
  readonly theme?: ArtTheme;
  /** Prepended to every path. Set it when the app is served under a sub-path. */
  readonly baseUrl?: string;
  /**
   * How long the whole pack may take before it is called a failure.
   *
   * Not a nicety. A load that never settles is a world that never appears, and
   * a promise that hangs looks exactly like a slow network from the outside —
   * so a wrong path, an uninitialised asset system and a slow disk are the same
   * silent failure. Timing out turns all three into an error a caller can see,
   * and the caller already renders one.
   */
  readonly timeoutMs?: number;
  /**
   * Which ground the pack should load. The pack ships both, and they are not
   * interchangeable.
   *
   * `topdown` reads `tilemap/`, a flat 2D grid. `isometric` reads
   * `tilemap-iso/`, a single 32x32 diamond per terrain.
   *
   * The default is `topdown` only because it was the only thing that was ever
   * asked for, and it is the wrong answer for a city drawn in isometric: the
   * 2D grass tile does not exist in that directory at all, so every grass cell
   * silently drew nothing, and the dirt and rock cells that did resolve were
   * flat squares lying under isometric buildings. The city had no floor, and the
   * `missing` count said "1" without saying which one or why.
   */
  readonly terrainStyle?: 'topdown' | 'isometric';
}

/** The pack is a few dozen local files fetched from the same origin. */
const DEFAULT_LOAD_TIMEOUT_MS = 5_000;

/**
 * Loads the pack, or as much of it as answers.
 *
 * Never throws. Every sheet is loaded independently and a failure is recorded in
 * `missing`, because the alternative — refusing to start the world because one
 * building 404s — trades a small hole for a blank screen.
 */
export async function loadSpriteAssets(
  options: LoadSpriteAssetsOptions = {},
): Promise<SpriteAssets> {
  // Pixi's asset system has to be initialised before anything loads, and
  // `Assets.load` does NOT initialise it for you: without this the promise
  // never settles. It never rejects either, so a caller awaiting it waits for
  // ever and the world simply never appears — the canvas is never created, the
  // status line stays at "starting", and nothing anywhere reports an error.
  //
  // That is the whole of why this looked like a working game with an invisible
  // world: every test that mattered here called `attach()` with a fake atlas and
  // never went near the network path, and a screenshot was the only thing that
  // could have caught it.
  await Assets.init();

  const theme = options.theme ?? 'fantasy';
  const root = `${options.baseUrl ?? ''}${ART_BASE}/${theme}`;
  const missing: string[] = [];

  // Race the whole pack against a deadline, so a load that hangs becomes an
  // error the caller renders rather than a world that never arrives.
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`the ${theme} art pack did not load in time`)),
      options.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
    );
  });
  return Promise.race([loadEverything(theme, root, missing, options.terrainStyle ?? 'topdown'), deadline]);
}

async function loadEverything(
  theme: ArtTheme,
  root: string,
  missing: string[],
  terrainStyle: 'topdown' | 'isometric',
): Promise<SpriteAssets> {
  const buildingIds = await loadBuildingIds(root, missing);
  const heroes = await loadHeroes(root, missing);
  const terrain = await loadTerrain(root, missing, terrainStyle);

  const buildings = new Map<string, Texture>();
  await Promise.all(
    buildingIds.map(async (id) => {
      // Manifest first: an animated building is a spritesheet and loading the PNG
      // alone would give one frame stretched across a sheet.
      const sheet = await loadOne(`${root}/buildings/${id}`);
      const first = sheet?.[0];
      if (first !== undefined) {
        buildings.set(id, first);
        return;
      }
      const single = await loadTexture(`${root}/buildings/${id}.png`);
      if (single === undefined) missing.push(`buildings/${id}`);
      else buildings.set(id, single);
    }),
  );

  return { theme, heroes, buildings, terrain, missing };
}

/**
 * The building ids, from the pack's own `index.json`.
 *
 * Read rather than hardcoded so a building added upstream is a building in the
 * city. A list kept in this file is a list that drifts from the art next to it.
 */
async function loadBuildingIds(root: string, missing: string[]): Promise<readonly string[]> {
  try {
    const index = await Assets.load<{ readonly ids?: readonly string[] }>(
      `${root}/buildings/index.json`,
    );
    if (index.ids !== undefined && index.ids.length > 0) return index.ids;
  } catch {
    // Fall through: the fallback below is the pack as vendored, not an error.
  }
  missing.push('buildings/index.json');
  return ['arena', 'barracks', 'citadel', 'forge', 'guild', 'library', 'market', 'mine', 'shrine', 'tavern', 'tower'];
}

async function loadHeroes(root: string, missing: string[]): Promise<readonly HeroSheet[]> {
  const names = [
    'fable-default',
    'familiar-default',
    'golem-default',
    'haiku-default',
    'local-default',
    'opus-default',
    'oracle-default',
    'sonnet-default',
  ];
  const loaded = await Promise.all(
    names.map(async (name) => {
      // Every animation, in one load pass. A hero missing one animation is
      // still a hero — the cache falls back down the list — so an absent
      // animation is a shorter cycle, not a hole in the world.
      const byAnimation = await Promise.all(
        ANIMATIONS.map((animation) => loadOne(`${root}/heroes/${name}`, animation)),
      );
      const idle = byAnimation[0] ?? [];
      if (idle.length === 0) {
        missing.push(`heroes/${name}`);
        return undefined;
      }
      return {
        name,
        idle,
        walk: byAnimation[1] ?? idle,
        work: byAnimation[2] ?? byAnimation[1] ?? idle,
      } satisfies HeroSheet;
    }),
  );
  return loaded.filter((hero): hero is HeroSheet => hero !== undefined) as readonly HeroSheet[];
}

/**
 * Ground, keyed by the terrain it is.
 *
 * It was one flat array, which is a list of tiles and not a map of them: a
 * renderer that wanted GRASS had to know that grass was somewhere in the middle
 * of a concatenation of three other terrains. Nothing could ask for ground
 * without knowing the load order, so nothing asked — the tiles were fetched and
 * never drawn, and the city had no floor.
 *
 * Keyed, a caller asks for grass and gets grass.
 */
async function loadTerrain(
  root: string,
  missing: string[],
  style: 'topdown' | 'isometric',
): Promise<Readonly<Record<string, readonly Texture[]>>> {
  // The directory carries the projection in its name, which is why these cannot
  // be one folder with two layouts inside it: the frame manifest has to match
  // the sheet it describes.
  const dir = style === 'isometric' ? 'tilemap-iso' : 'tilemap';
  const entries = await Promise.all(
    TERRAIN_IDS.map(async (id) => {
      const frames = await loadOne(`${root}/${dir}/${id}`);
      if (frames === undefined || frames.length === 0) {
        // Named with the directory, because "1 missing" against a city with no
        // floor is not a diagnosis.
        missing.push(`${dir}/${id}`);
        return undefined;
      }
      return [id, frames] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined));
}

/**
 * The building a zone stands on, or undefined when this pack has none for it.
 *
 * Undefined is a real answer and the caller draws a marker instead. The first
 * version fell back to the tower, on the reasoning that a zone with no building
 * would otherwise go missing — and that put a tower on the PLAZA, which every
 * idle agent in the world stands on. Open ground with a monument on it reads as
 * a building the designer chose; open ground reads as open ground, and a reader
 * can tell which one the game meant.
 */
export function buildingForZone(
  buildings: ReadonlyMap<string, Texture>,
  zone: ZoneId,
): Texture | undefined {
  const id = ZONE_BUILDING[zone];
  return id === undefined ? undefined : buildings.get(id);
}

/** The zones this pack can draw a building for, for a test to walk. */
export const ZONES_WITH_BUILDINGS: readonly ZoneId[] = Object.keys(
  ZONE_BUILDING,
) as ZoneId[];

/** Every placeable zone, so a test can assert none of them is left unbuilt. */
export const ALL_ZONES: readonly ZoneId[] = Object.keys(ZONE_PLACEMENT) as ZoneId[];
