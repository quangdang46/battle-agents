/**
 * The programmatic sprite factory: 16x16@3x placeholders drawn in code.
 *
 * Plan section 25: "programmatic 16x16@3x placeholders (agent-move pattern)
 * until the §14 shortlist lands". Two things about that sentence are worth
 * separating, because they are the two things a future contributor will
 * conflate.
 *
 * **16x16@3x is the PLACEHOLDER grid, not the asset grid.** The vendored
 * `tiny-swords-cc0` pack is 64px tiles in source sheets — measured, not assumed,
 * and `docs/design/asset-shortlist.md` records both the measurement and the
 * wrong "16×16" claim it replaced. A renderer built from the plan sentence alone
 * draws a 48px placeholder and a 64px real tile into the same world, and the
 * mismatch shows up as agents and buildings at subtly different scales, which is
 * the kind of bug nobody files because the screenshot looks fine. So the two
 * grids are separate constants and `TILE_SOURCE_PX` is what a real sheet is
 * scaled FROM.
 *
 * **Do not delete this file when real art lands.** The bead is explicit and the
 * reason outlives the art: it is what keeps V0 unblocked, and — the part that
 * makes the tests below possible — it is what lets the client render with no
 * asset pipeline at all. A cache that can only be exercised after a PNG fetch is
 * a cache nobody tests, and `SpriteCache` below is tested on every run.
 *
 * The CACHE is the hard requirement: two lookups of one key return the same
 * object, and the number of constructed sprites does not grow with frames
 * drawn. A fresh texture per lookup is not a cache, it is a leak with a map in
 * front of it, and it stays invisible until the frame budget goes red.
 */

import type { Texture } from 'pixi.js';

import { PixelCanvas, hex, withAlpha } from './pixel-canvas.js';

/** The placeholder grid: a 16x16 sprite drawn at 3x. */
export const PLACEHOLDER_TILE_PX = 16;
export const PLACEHOLDER_SCALE = 3;

/**
 * The source tile size of the vendored pack, in pixels.
 *
 * 64, and MEASURED by reading the PNG headers of
 * `apps/web/public/assets/tiny-swords-cc0/` — `Deco/*.png` are 64x64 and the
 * buildings run from 210x420 to 400x505. Not the placeholder grid, and not to
 * be used as one.
 */
export const TILE_SOURCE_PX = 64;

/** One world tile in screen pixels, after the placeholder scale. */
export const TILE_WORLD_PX = PLACEHOLDER_TILE_PX * PLACEHOLDER_SCALE;

/**
 * How a real 64px sheet is drawn into the world.
 *
 * Not an integer, and that is the honest cost of the two grids differing: a
 * real sheet is resampled, so it will not be pixel-crisp at this scale. The
 * placeholders stay at an integer scale for exactly that reason, and the day the
 * asset grid is chosen properly this constant becomes 1 and the resampling goes
 * away. Written down rather than left as an inline division so that the
 * non-integer value is a decision somebody can see.
 */
export const REAL_ASSET_SCALE = TILE_WORLD_PX / TILE_SOURCE_PX;

export type SpriteKind = 'agent' | 'building' | 'zone-marker' | 'terrain-tile' | 'subagent';

/** A cache key. Two equal keys must return the same object. */
export interface SpriteKey {
  readonly kind: SpriteKind;
  /** Palette index, so N agents get N distinct colours. */
  readonly variant: number;
}

export function spriteKey(kind: SpriteKind, variant: number): SpriteKey {
  return { kind, variant };
}

/**
 * Agent colours.
 *
 * DESIGN.md section 7 explicitly declines to set a palette, so these are the
 * client's own choice within the settled medium — a dark outline under a bright
 * body, because a 16px figure has to read against a terrain it also draws.
 */
const AGENT_COLORS: readonly number[] = [
  0xe24b4a, 0x378add, 0x1d9e75, 0xef9f27, 0xd4537e, 0x7f77dd, 0x5dcaa5, 0xf0997b,
];

/**
 * How many distinct pictures a kind has, derived rather than restated.
 *
 * Written once from the palette because a hardcoded `8` next to an 8-entry array
 * is a number waiting to drift, and the day it does, `keyOf` collapses two
 * distinct colours onto one cache key and serves the wrong sprite.
 */
const PALETTE_SIZE = AGENT_COLORS.length;

/**
 * The cache key, normalised to the picture the variant actually draws.
 *
 * Normalised, not raw, and that is a bug this file had: with eight palette
 * entries, variant 8 and variant 0 draw the same pixels, so keying on the raw
 * number gave the same image two cache slots and constructed it twice. The key
 * has to be the identity of the image, not the caller's integer — anything else
 * makes the cache hold duplicates and the construction count drift with the
 * number of callers rather than the number of pictures.
 */
function keyOf(key: SpriteKey): string {
  const index = ((key.variant % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return `${key.kind}:${index}`;
}

/** The dark line every placeholder is outlined in, so figures read on any tile. */
const OUTLINE = hex(0x14120c);
const SKIN = hex(0xe8d8c0);
const STONE = hex(0x6b6156);

/**
 * Draws one placeholder.
 *
 * Rectangles and one ellipse, deliberately. A placeholder that tries to be a
 * character illustration is a placeholder nobody can distinguish from real art,
 * and the moment real art lands the difference has to be obvious or the
 * placeholders quietly ship.
 */
function drawSprite(key: SpriteKey): PixelCanvas {
  const px = PLACEHOLDER_TILE_PX;
  const canvas = new PixelCanvas(px, px);
  const color = hex(AGENT_COLORS[key.variant % AGENT_COLORS.length] ?? 0x378add);

  switch (key.kind) {
    case 'agent': {
      canvas.fillRect(px * 0.3, px * 0.18, px * 0.4, px * 0.3, SKIN); // head
      canvas.fillRect(px * 0.25, px * 0.46, px * 0.5, px * 0.38, color); // body
      canvas.strokeRect(px * 0.25, px * 0.46, px * 0.5, px * 0.38, OUTLINE);
      break;
    }
    case 'subagent': {
      // Smaller and dimmer: a subagent is on the map but is not the character
      // the scene is about, and a full-size duplicate reads as a second agent
      // of equal importance.
      canvas.fillRect(px * 0.36, px * 0.3, px * 0.28, px * 0.22, withAlpha(SKIN, 0.85));
      canvas.fillRect(px * 0.32, px * 0.5, px * 0.36, px * 0.28, withAlpha(color, 0.8));
      canvas.strokeRect(px * 0.32, px * 0.5, px * 0.36, px * 0.28, OUTLINE);
      break;
    }
    case 'building': {
      canvas.fillRect(px * 0.1, px * 0.28, px * 0.8, px * 0.12, color); // roof band
      canvas.fillRect(px * 0.1, px * 0.4, px * 0.8, px * 0.5, STONE);
      canvas.strokeRect(px * 0.1, px * 0.28, px * 0.8, px * 0.62, OUTLINE);
      break;
    }
    case 'zone-marker': {
      // Flat and translucent, so a zone reads as ground rather than as an
      // object standing on the ground.
      canvas.fillRect(0, 0, px, px, withAlpha(color, 0.3));
      canvas.strokeRect(0, 0, px, px, withAlpha(color, 0.9), 1);
      break;
    }
    case 'terrain-tile': {
      canvas.fillRect(0, 0, px, px, color);
      break;
    }
  }

  return canvas;
}

export interface SpriteCacheStats {
  /** Distinct keys held. */
  readonly size: number;
  /** Textures actually constructed. The number that must not track frames. */
  readonly constructed: number;
  /** Lookups served. Grows forever; `constructed` must not. */
  readonly lookups: number;
}

/**
 * A cache that is a cache.
 *
 * Keyed by kind and variant, because that is the whole identity of a
 * placeholder: two agents with variant 3 are the same picture, and rebuilding
 * it per agent is the cost this exists to remove.
 */
export class SpriteCache {
  readonly #textures = new Map<string, Texture>();
  #constructed = 0;
  #lookups = 0;

  get(key: SpriteKey): Texture {
    this.#lookups += 1;
    const id = keyOf(key);
    const existing = this.#textures.get(id);
    if (existing !== undefined) return existing;
    const texture = drawSprite(key).toTexture();
    this.#constructed += 1;
    this.#textures.set(id, texture);
    return texture;
  }

  has(key: SpriteKey): boolean {
    return this.#textures.has(keyOf(key));
  }

  get stats(): SpriteCacheStats {
    return {
      size: this.#textures.size,
      constructed: this.#constructed,
      lookups: this.#lookups,
    };
  }

  /**
   * Releases the textures.
   *
   * Present because a Pixi texture holds GPU memory, and a client that swaps
   * scenes without this leaks one texture per zone. Not on a hot path.
   */
  destroy(): void {
    for (const texture of this.#textures.values()) texture.destroy(true);
    this.#textures.clear();
  }
}

let sharedCache: SpriteCache | undefined;

/** The cache the view uses. One per client, not one per scene. */
export function spriteCache(): SpriteCache {
  sharedCache ??= new SpriteCache();
  return sharedCache;
}

/** Drops the shared cache. For tests, and for a full teardown. */
export function resetSpriteCache(): void {
  sharedCache?.destroy();
  sharedCache = undefined;
}
