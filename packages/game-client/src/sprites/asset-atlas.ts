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
import { Assets, Rectangle, Texture } from 'pixi.js';

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
  /**
   * The particle sheet, for the FX layer.
   *
   * Optional, and so are the decorations below. Both were made REQUIRED first,
   * which is defensible until the second one arrives: every caller that builds a
   * SpriteAssets -- including two tests that are a seam, not a caller -- then has
   * to write `particle: undefined` for a pack that simply has no particles, and
   * a field that must be spelled out to mean "absent" is a field whose absence
   * nobody notices. A theme without a particle sheet is a real state.
   *
   * `| undefined` as well as `?`, because this repository compiles with
   * `exactOptionalPropertyTypes`: a bare `?` means "may be OMITTED", which the
   * loader above cannot honour because it always assigns the result.
   *
   * `kenney-particle-pack` is 194 vendored CC0 files that nothing loaded. It was
   * named at `apps/web/src/ui/game-chrome.tsx:26` in a JSDoc line asserting it
   * was "loaded for the event layer that draws them" -- and no such layer
   * existed, which is the AGENTS.md failure in its purest form: a comment making
   * a claim about code that was never written. `check-game-first.sh` rule 3 now
   * strips comments before asking, and it is why this line is code now.
   */
  readonly particle?: Texture | undefined;
  /**
   * Decorations, by kind. Four TexturePacker sheets the pack has shipped since
   * day one and nothing loaded, so the city had no trees in it.
   */
  readonly decorations?: Readonly<Record<string, readonly Texture[]>> | undefined;
  /**
   * Scene props, by `pack/tile`.
   *
   * The two Kenney packs the plan wanted used as TERRAIN are neither terrain:
   * measured and then looked at, `kenney-tiny-town` is grass, dirt and a shelf
   * of tan towers and trees, and `kenney-tiny-dungeon` is a dark red floor and
   * a wall of stone, chests and banners. So they are loaded as what they are --
   * see `props.ts`, which carries the evidence and the contact sheet.
   */
  readonly props?: Readonly<Record<string, Texture>> | undefined;
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

/**
 * The tiny-swords troop sheets, as heroes.
 *
 * ## Why this pack is loaded at all
 *
 * `check-game-first.sh` rule 3 asks whether every pack on disk is named by CODE,
 * and `tiny-swords-cc0` was not. It was named twice, both times in a JSDoc
 * comment, which is how a pack of 205 licensed files sat in the tree looking
 * vendored and used. The rule is right and the pack was wrong; the resolution
 * is to use it, not to delete the rule.
 *
 * ## Why THESE files
 *
 * The city had 101 agents drawn from eight heroes, so a crowd was one character
 * repeated until it read as a crowd. The `Troops` directory under each
 * `Factions` entry is four unit types per
 * faction on a fixed 64px grid -- the same cell size the rest of the world
 * already uses -- and it is CC0.
 *
 * The sheets have no TexturePacker manifest, so they cannot go through
 * `loadOne`, which reads frames from JSON. They are sliced here instead: a
 * regular grid, so `framesOf` on a synthetic descriptor is less code than a
 * second loader and keeps one definition of what a hero sheet is.
 */
/**
 * The tiny-swords knight sheets, as heroes. Paths VERIFIED against the running
 * server, all of which matters because two of them are not what the layout
 * suggests.
 *
 * The layout is `Factions/Knights/Troops/<Unit>/<Colour>/<Unit>_<Colour>.png`,
 * and the convention holds for seven of the eight. The eighth is
 * `Archer/Purple/Archer_Purlple.png` -- "Purlple", misspelled in the upstream
 * pack, and `Archer_Purple.png` is a 404. Writing the conventional path would
 * have dropped a troop into `missing` with nothing to say why.
 *
 * Goblins has Barrel, TNT and Torch and no characters, so the cast is Knights.
 * Every path below was fetched and answered 200 before being written here.
 */
const TINY_SWORDS_TROOPS: readonly { readonly file: string; readonly name: string }[] = [
  { name: 'knight-warrior-blue', file: 'Warrior/Blue/Warrior_Blue.png' },
  { name: 'knight-warrior-red', file: 'Warrior/Red/Warrior_Red.png' },
  { name: 'knight-warrior-purple', file: 'Warrior/Purple/Warrior_Purple.png' },
  { name: 'knight-warrior-yellow', file: 'Warrior/Yellow/Warrior_Yellow.png' },
  { name: 'knight-archer-blue', file: 'Archer/Blue/Archer_Blue.png' },
  { name: 'knight-archer-red', file: 'Archer/Red/Archer_Red.png' },
  { name: 'knight-archer-purple', file: 'Archer/Purple/Archer_Purlple.png' },
  { name: 'knight-archer-yellow', file: 'Archer/Yellow/Archer_Yellow.png' },
];

const TINY_SWORDS_BASE = 'tiny-swords-cc0/Factions/Knights/Troops';

/** One cell of a tiny-swords sheet, which is a plain grid with no manifest. */
const TINY_SWORDS_CELL_PX = 64;

async function loadTroops(baseUrl: string, missing: string[]): Promise<HeroSheet[]> {
  const sheets = await Promise.all(
    TINY_SWORDS_TROOPS.map(async ({ file, name }) => {
      const path = `${baseUrl}/art/${TINY_SWORDS_BASE}/${file}`;
      let texture: Texture;
      try {
        texture = await Assets.load<Texture>(path);
      } catch {
        // Named in full, because a troop that silently fails is a hole in the
        // crowd that nothing else reports.
        missing.push(`${TINY_SWORDS_BASE}/${file}`);
        return undefined;
      }
      const columns = Math.max(1, Math.floor(texture.width / TINY_SWORDS_CELL_PX));
      const rows = Math.max(1, Math.floor(texture.height / TINY_SWORDS_CELL_PX));
      const frames: Texture[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          frames.push(
            new Texture({
              source: texture.source,
              frame: new Rectangle(
                column * TINY_SWORDS_CELL_PX,
                row * TINY_SWORDS_CELL_PX,
                TINY_SWORDS_CELL_PX,
                TINY_SWORDS_CELL_PX,
              ),
            }),
          );
        }
      }
      // The sheet is one run, not three named animations, so the same frames
      // back all three. `animationFor` falls back down its list, and a knight
      // that walks while idle is a smaller lie than a knight that never moves.
      return { name, idle: frames, walk: frames, work: frames } satisfies HeroSheet;
    }),
  );
  return sheets.filter((sheet) => sheet !== undefined);
}

/**
 * The decoration sheets, by kind.
 *
 * The names are listed rather than read from the pack's `index.json` because
 * `loadOne` needs a path and nothing else here does: an id the pack does not
 * have simply lands in `missing`, named, which is the behaviour that is wanted.
 */
const DECORATION_KINDS = ['bush', 'flower', 'rock', 'tree'] as const;

async function loadDecorations(
  root: string,
  missing: string[],
): Promise<Readonly<Record<string, readonly Texture[]>>> {
  const entries = await Promise.all(
    DECORATION_KINDS.map(async (id) => {
      const frames = await loadOne(`${root}/decorations/${id}`);
      if (frames === undefined || frames.length === 0) {
        missing.push(`decorations/${id}`);
        return undefined;
      }
      return [id, frames] as const;
    }),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined),
  );
}

const PROP_TILES: readonly { readonly pack: string; readonly tile: string }[] = [
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0007' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0008' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0018' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0019' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0009' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0012' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0013' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0036' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0037' },
  { pack: 'kenney-tiny-town', tile: 'tile_0004' },
  { pack: 'kenney-tiny-town', tile: 'tile_0006' },
  { pack: 'kenney-tiny-town', tile: 'tile_0015' },
  { pack: 'kenney-tiny-town', tile: 'tile_0016' },
  { pack: 'kenney-tiny-town', tile: 'tile_0018' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0002' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0006' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0009' },
  { pack: 'kenney-tiny-dungeon', tile: 'tile_0029' },
];

/**
 * The arcane-agents characters, as heroes with a WORKING cycle.
 *
 * ## Why these six
 *
 * The pack is MIT and ships twenty characters, 52 frames each. Six are vendored
 * because a cast of six that varies reads as a crowd and twenty reads as a
 * loading screen -- the same reasoning that chose twelve bases and rejected four
 * hundred. What makes them worth the six is `animations/working/`: a frame set
 * for an agent with a tool in its hand, which is exactly the state `HeroSheet`
 * already models and exactly what `AgentView.tool` selects. Every other
 * character pack vendored here has idle and walk and nothing for work.
 *
 * ## Single frames, not sheets
 *
 * `rotations/<dir>.png` is one file and `animations/walk/<dir>/<n>.png` is a
 * directory of numbered frames -- so `loadOne` cannot read them, being built for
 * TexturePacker manifests. They are listed by a small fetch instead. Six
 * characters times eight frames is 48 requests, which is a lot for a local dev
 * server on a cold compile; that is the price and it is a one-off at load.
 */
const ARCANE_CHARACTERS: readonly string[] = [
  'assassin-shadow',
  'barbarian-wild',
  'blood-elf-spellarcher',
  'chronomancer',
  'crystal-mage',
  'dwarf-warrior-short',
];
const ARCANE_DIRECTION = 'west';
const ARCANE_FRAME_COUNT = 8;

async function loadArcane(baseUrl: string, missing: string[]): Promise<readonly HeroSheet[]> {
  const sheets = await Promise.all(
    ARCANE_CHARACTERS.map(async (name) => {
      const root = `${baseUrl}/art/arcane-agents-characters/${name}`;
      const grab = async (dir: string): Promise<Texture[]> => {
        const frames: Texture[] = [];
        for (let index = 0; index < ARCANE_FRAME_COUNT; index += 1) {
          try {
            frames.push(await Assets.load<Texture>(`${root}/${dir}/${index}.png`));
          } catch {
            missing.push(`arcane-agents-characters/${name}/${dir}/${index}.png`);
          }
        }
        return frames;
      };
      // The idle is the single south-facing still, so it is loaded on its own
      // rather than repeated out of the walk cycle: a character that breathes by
      // playing its walk loop twice a second is worse than one that stands.
      let idle: Texture[] = [];
      try {
        idle = [await Assets.load<Texture>(`${root}/rotations/south.png`)];
      } catch {
        missing.push(`arcane-agents-characters/${name}/rotations/south.png`);
      }
      const walk = await grab(`animations/walk/${ARCANE_DIRECTION}`);
      const work = await grab('animations/working');
      if (idle.length === 0 && walk.length === 0 && work.length === 0) return undefined;
      return { name: `arcane-${name}`, idle, walk, work } satisfies HeroSheet;
    }),
  );
  return sheets.filter((sheet) => sheet !== undefined);
}

async function loadProps(
  baseUrl: string,
  missing: string[],
): Promise<Readonly<Record<string, Texture>>> {
  const entries = await Promise.all(
    PROP_TILES.map(async ({ pack, tile }) => {
      const key = `${pack}/${tile}`;
      try {
        return [key, await Assets.load<Texture>(`${baseUrl}/art/${pack}/Tiles/${tile}.png`)] as const;
      } catch {
        missing.push(key);
        return undefined;
      }
    }),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined),
  );
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
  const baseUrl = options.baseUrl ?? '';
  return Promise.race([loadEverything(theme, root, baseUrl, missing, options.terrainStyle ?? 'topdown'), deadline]);
}

async function loadEverything(
  theme: ArtTheme,
  root: string,
  baseUrl: string,
  missing: string[],
  terrainStyle: 'topdown' | 'isometric',
): Promise<SpriteAssets> {
  const buildingIds = await loadBuildingIds(root, missing);
  // One sprite, not a sheet: the pack ships single frames, and the FX layer
  // wants one round puff it can tint and fade.
  let particle: Texture | undefined;
  try {
    particle = await Assets.load<Texture>(`${baseUrl}/art/kenney-particle-pack/PNG (Transparent)/circle_05.png`);
  } catch {
    missing.push('kenney-particle-pack/PNG (Transparent)/circle_05.png');
  }

  // The four decoration sheets. They have TexturePacker manifests like the
  // buildings do, so they go through `loadOne` rather than a second loader --
  // and the index.json is read rather than the four names hardcoded, so a pack
  // that adds a fifth decoration does not need a change here to show it.
  const decorations = await loadDecorations(root, missing);
  const props = await loadProps(baseUrl, missing);

  // Widened, not replaced. The age-of-agents heroes carry three NAMED
  // animations and the tool-aware `work` state reads them, so the tiny-swords
  // troops join the cast rather than take it over -- and they are appended
  // after, so the palette index every existing agent already has does not
  // move underneath it.
  const heroes = [
    ...(await loadHeroes(root, missing)),
    ...(await loadTroops(baseUrl, missing)),
    ...(await loadArcane(baseUrl, missing)),
  ];
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

  return { theme, heroes, buildings, terrain, particle, decorations, props, missing };
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
