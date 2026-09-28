import { describe, expect, it } from 'vitest';

import { CITY } from '../../packages/game-client/src/scenes/scene-config.js';
import { PixiWorldView } from '../../packages/game-client/src/game/view.js';
import { SpriteCache } from '../../packages/game-client/src/sprites/sprite-factory.js';
import { TERRAIN_KINDS } from '../../packages/game-client/src/sprites/sprite-factory.js';
import { WorldStore } from '../../packages/game-client/src/state/store.js';
import { terrainSampler } from '../../packages/game-client/src/game/terrain-map.js';
import type { SpriteAssets } from '../../packages/game-client/src/sprites/asset-atlas.js';
import type { Texture } from 'pixi.js';

/**
 * The city has a floor.
 *
 * ## What was actually true
 *
 * The vendored ground — a 27x18 Kenney sheet and three per-terrain sheets from
 * age-of-agents — was fetched, held in the atlas, counted, and reported in the
 * status line as "27 terrain". Nothing ever asked for a tile. `worldLayer` had
 * three children: the sky, the zones, and the units. There was no ground, so a
 * character stood on a flat `#0b0e14` and the whole thing read as components
 * stacked on a background, which is what it was.
 *
 * Every test in this repository passed throughout. The art was loaded, so a test
 * that asserted "the atlas has terrain" was green, and no test asserted that
 * anything was DRAWN.
 *
 * ## Why the assertions are about what exists in the graph
 *
 * Not about how it looks — a screenshot cannot tell a floor from a floor that is
 * the right colour. What it can say is whether a sprite exists for every cell of
 * the scene, and that is the property that a missing layer cannot fake.
 */
function aTexture(label: string): Texture {
  return { label } as unknown as Texture;
}

/** An atlas with ground and nothing else — the world without characters. */
function anAtlasWithGround(): SpriteCache {
  const cache = new SpriteCache();
  const terrain: Record<string, Texture[]> = {
    grass: [aTexture('grass-0'), aTexture('grass-1')],
    dirt: [aTexture('dirt-0')],
    rock: [aTexture('rock-0')],
    water: [aTexture('water-0')],
  };
  cache.attach({
    theme: 'fantasy',
    heroes: [],
    buildings: new Map(),
    terrain,
    missing: [],
  } as unknown as SpriteAssets);
  return cache;
}

function aCity(): PixiWorldView {
  return new PixiWorldView({
    store: new WorldStore(),
    scene: CITY,
    cache: anAtlasWithGround(),
  });
}

function childrenOf(container: unknown): unknown[] {
  return (container as { readonly children: readonly unknown[] }).children;
}

describe('the ground', () => {
  it('draws a sprite for every cell of the scene', () => {
    // The assertion the whole thing is for. A missing layer has zero, and every
    // other test in the repository was happy with that.
    const view = aCity();
    expect(childrenOf(view.terrainLayer).length).toBe(CITY.w * CITY.h);
  });

  it('sits BELOW the sky, the zones and the units', () => {
    // Order is what makes it a floor. Above the units, a ground layer is a
    // coloured sheet laid over the people standing on it.
    // ONE view. The first version called aCity() four times and compared layers
    // from four DIFFERENT views, so every index was -1 and the assertion passed
    // on -1 < -1 being false by accident.
    const view = aCity();
    const layers = childrenOf(view.root);
    const terrain = layers.indexOf(view.terrainLayer);
    const sky = layers.indexOf(view.skyLayer);
    const zones = layers.indexOf(view.zoneLayer);
    const units = layers.indexOf(view.unitLayer);

    expect(terrain).toBeLessThan(sky);
    expect(sky).toBeLessThan(zones);
    expect(zones).toBeLessThan(units);
  });

  it('puts every kind of ground the sampler can produce on the map', () => {
    // A field that is one kind of tile everywhere is a texture, not a place. The
    // sampler's four kinds have to all be reachable or the noise is decoration.
    const sample = terrainSampler(CITY.seed);
    const kinds = new Set<string>();
    for (let gy = 0; gy < CITY.h; gy += 1) {
      for (let gx = 0; gx < CITY.w; gx += 1) kinds.add(sample(gx, gy));
    }

    expect([...kinds].sort()).toEqual([...TERRAIN_KINDS].sort());
  });

  it('lays the SAME ground every time, because a world that reshuffles its floor is noise', () => {
    const first = labelAt(aCity(), 5, 7);
    const second = labelAt(aCity(), 5, 7);
    expect(first).toBe(second);
  });
});

/** The label of the sprite at a grid cell, read from the layer in draw order. */
function labelAt(view: PixiWorldView, gx: number, gy: number): string | undefined {
  const sprites = childrenOf(view.terrainLayer) as { readonly label?: string }[];
  // The layer is filled row-major, so the cell is at its own index. That is an
  // assumption the test states rather than hides, and a change in the draw order
  // would fail it loudly rather than quietly compare two different cells.
  return sprites[gy * CITY.w + gx]?.label;
}
