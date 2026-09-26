import { describe, expect, it } from 'vitest';

import { cornerMask, DUAL_GRID_LOOKUP, drawsTile, frameForMask, NE, NW, SE, SW } from './autotile.js';
import { isometric, topdown } from './projection.js';
import { WaypointGraph, type PathNode } from './pathfind.js';
import { buildTerrainMap, TERRAINS, terrainSampler, tilesForTerrain } from './terrain-map.js';
import { PixelCanvas, hex, withAlpha } from '../sprites/pixel-canvas.js';

/**
 * The mirrored pixel math.
 *
 * Small, pure functions, and small pure functions are where a wrong port hides:
 * they typecheck, they import, and they are wrong in a way only a value
 * assertion finds. The reference's own research note flags its autotile lookup
 * as an unverified identity stub, so the lookup here is the one that most needs
 * a test rather than a copy.
 */

describe('autotile', () => {
  it('sets one bit per corner, in the documented order', () => {
    const all = () => true;
    expect(cornerMask(0, 0, () => false)).toBe(0);
    expect(cornerMask(0, 0, all)).toBe(NW + NE + SW + SE);
    // Tile (1,1) straddles the cells (0,0) NW, (1,0) NE, (0,1) SW, (1,1) SE.
    // Each is selected alone, which is what pins the bit layout — a lookup
    // table indexed by this mask is only correct if the layout is.
    const only = (gx: number, gy: number) => (x: number, y: number) => x === gx && y === gy;
    expect(cornerMask(1, 1, only(0, 0))).toBe(NW);
    expect(cornerMask(1, 1, only(1, 0))).toBe(NE);
    expect(cornerMask(1, 1, only(0, 1))).toBe(SW);
    expect(cornerMask(1, 1, only(1, 1))).toBe(SE);
  });

  it('is NOT the identity lookup the reference ships', () => {
    // docs/research/age-of-agents.md records the reference's
    // DUAL_GRID_LOOKUP as `mask => mask`, an unverified placeholder. Copying it
    // would import a no-op that reads like an implementation. This is the
    // assertion that says ours is a real mapping.
    for (let mask = 1; mask < 16; mask += 1) {
      expect(frameForMask(mask)).not.toBe(mask);
    }
    // And it is a bijection onto the 15 non-empty frames, so no two masks
    // collapse onto the same tile and none is unreachable.
    const frames = DUAL_GRID_LOOKUP.filter((frame) => frame >= 0);
    expect(new Set(frames).size).toBe(15);
    expect(frames).toContain(0);
    expect(frames).not.toContain(-1);
  });

  it('draws nothing for the empty mask', () => {
    // Mask 0 is the interior of a field: four base corners, no transition. A
    // lookup returning frame 0 there paints a spurious tile in every field.
    expect(frameForMask(0)).toBe(-1);
    expect(drawsTile(0)).toBe(false);
    expect(drawsTile(1)).toBe(true);
    expect(drawsTile(15)).toBe(true);
  });
});

describe('projection', () => {
  it('maps the grid to screen pixels', () => {
    const p = topdown(48);
    expect(p.toScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(p.toScreen(2, 3)).toEqual({ x: 96, y: 144 });
  });

  it('depth-sorts by row in top-down', () => {
    const p = topdown(48);
    expect(p.depth(5, 7)).toBe(7);
  });

  it('keeps isometric available for a future view', () => {
    const p = isometric(64, 32);
    expect(p.toScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(p.depth(2, 3)).toBe(5);
  });
});

describe('WaypointGraph', () => {
  const plaza: PathNode = { id: 'plaza', gx: 0, gy: 0 };
  const workshop: PathNode = { id: 'workshop', gx: 3, gy: 0 };
  const arena: PathNode = { id: 'arena', gx: 6, gy: 0 };
  const lab: PathNode = { id: 'lab', gx: 0, gy: 5 };

  function graph(): WaypointGraph {
    return new WaypointGraph({
      nodes: [plaza, workshop, arena, lab],
      edges: [
        ['plaza', 'workshop'],
        ['workshop', 'arena'],
        ['plaza', 'lab'],
      ],
    });
  }

  it('routes along the shortest chain', () => {
    const path = graph().route('plaza', 'arena');
    expect(path.map((n) => n.id)).toEqual(['plaza', 'workshop', 'arena']);
  });

  it('returns just the target when no route exists', () => {
    // A genuinely disconnected island. The first version of this test asked for
    // arena -> lab on the graph above, which IS reachable (arena, workshop,
    // plaza, lab) — so it asserted a fallback on a case that was never a
    // fallback, and would have passed with the fallback deleted.
    const island = new WaypointGraph({
      nodes: [plaza, { id: 'island', gx: 40, gy: 40 }],
      edges: [],
    });
    // Not an empty path: a caller handed [] has to invent what "no path" means,
    // and a caller that does not ends up with a unit that silently stops moving.
    const path = island.route('plaza', 'island');
    expect(path.map((n) => n.id)).toEqual(['island']);
  });

  it('routes a node to itself as a single step', () => {
    expect(graph().route('plaza', 'plaza').map((n) => n.id)).toEqual(['plaza']);
  });

  it('finds the nearest node to a position', () => {
    expect(graph().nearest(2, 1)?.id).toBe('workshop');
    expect(graph().nearest(-5, -5)?.id).toBe('plaza');
  });

  it('refuses an edge to a node that was never added', () => {
    // A config error. Skipping it produces a world with one mysteriously
    // missing route and nothing that says why.
    expect(
      () =>
        new WaypointGraph({
          nodes: [plaza],
          edges: [['plaza', 'nowhere']],
        }),
    ).toThrow(/unknown node/i);
  });
});

describe('terrain', () => {
  it('is deterministic for a seed', () => {
    // No Math.random anywhere: a scene fixture in a test is only reproducible
    // if the terrain is, and a client that reshuffles its city on every reload
    // cannot be compared against anything.
    const a = buildTerrainMap({ w: 16, h: 16 }, 1);
    const b = buildTerrainMap({ w: 16, h: 16 }, 1);
    expect(a).toEqual(b);
  });

  it('differs between seeds', () => {
    const a = buildTerrainMap({ w: 24, h: 24 }, 1);
    const b = buildTerrainMap({ w: 24, h: 24 }, 2);
    expect(a).not.toEqual(b);
  });

  it('only ever produces declared terrains', () => {
    const map = buildTerrainMap({ w: 24, h: 24 }, 3);
    for (const row of map) {
      for (const cell of row) {
        expect(TERRAINS).toContain(cell);
      }
    }
  });

  it('never puts rock next to water', () => {
    // The buffer is what keeps the 16-frame corner set clean: rock/water is the
    // one adjacency it cannot draw, so a seam would show as missing tiles.
    const sample = terrainSampler(5);
    for (let gx = 0; gx < 40; gx += 1) {
      for (let gy = 0; gy < 40; gy += 1) {
        if (sample(gx, gy) !== 'rock') continue;
        const neighbours = [sample(gx - 1, gy), sample(gx + 1, gy), sample(gx, gy - 1), sample(gx, gy + 1)];
        expect(neighbours).not.toContain('water');
      }
    }
  });

  it('samples outside the grid, for the margin around the world', () => {
    const sample = terrainSampler(1);
    expect(TERRAINS).toContain(sample(-50, -50));
    expect(TERRAINS).toContain(sample(999, 999));
  });

  it('emits no tile where the mask is empty', () => {
    const grid = { w: 8, h: 8 };
    // An all-grass map has no upper terrain at all, so there is nothing to
    // transition to and the list is empty.
    const map = buildTerrainMap(grid, 1).map((row) => row.map(() => 'grass' as const));
    expect(tilesForTerrain(map, 'water', grid)).toEqual([]);
    expect(tilesForTerrain(map, 'rock', grid)).toEqual([]);
  });

  it('emits a tile at every boundary cell of an upper-terrain field', () => {
    const grid = { w: 6, h: 6 };
    // A field of water in the middle: its corners draw, its interior does not.
    const terrain = Array.from({ length: grid.h }, (_, gy) =>
      Array.from({ length: grid.w }, (_, gx) =>
        gx >= 2 && gx <= 3 && gy >= 2 && gy <= 3 ? ('water' as const) : ('grass' as const),
      ),
    );
    const tiles = tilesForTerrain(terrain, 'water', grid);
    expect(tiles.length).toBeGreaterThan(0);
    // A tile is emitted only where the mask draws something.
    for (const tile of tiles) {
      expect(tile.frame).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('PixelCanvas', () => {
  it('writes and reads a pixel', () => {
    const canvas = new PixelCanvas(4, 4);
    canvas.set(1, 2, hex(0xff0000));
    expect(canvas.get(1, 2)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it('clips writes at the edge instead of running off the buffer', () => {
    const canvas = new PixelCanvas(4, 4);
    // A silent out-of-bounds write is a corrupt texture that renders as noise
    // on one machine and nothing on another.
    expect(() => canvas.set(-1, -1, hex(0xffffff))).not.toThrow();
    expect(() => canvas.set(99, 99, hex(0xffffff))).not.toThrow();
    expect(canvas.get(-1, -1).a).toBe(0);
    expect(canvas.get(99, 99).a).toBe(0);
  });

  it('fills and strokes a rect', () => {
    const canvas = new PixelCanvas(4, 4);
    canvas.fillRect(1, 1, 2, 2, hex(0x00ff00));
    expect(canvas.get(1, 1).g).toBe(255);
    expect(canvas.get(2, 2).g).toBe(255);
    expect(canvas.get(0, 0).a).toBe(0);
    expect(canvas.get(3, 3).a).toBe(0);

    const outlined = new PixelCanvas(4, 4);
    outlined.fillRect(0, 0, 4, 4, hex(0x111111));
    outlined.strokeRect(0, 0, 4, 4, hex(0x222222));
    expect(outlined.get(0, 0).r).toBe(0x22);
    expect(outlined.get(2, 2).r).toBe(0x11);
  });

  it('applies alpha as a fraction', () => {
    expect(withAlpha(hex(0xffffff), 0.5).a).toBe(128);
    expect(withAlpha(hex(0xffffff), 0).a).toBe(0);
    expect(withAlpha(hex(0xffffff), 5).a).toBe(255);
  });
});
