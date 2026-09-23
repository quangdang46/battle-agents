# age-of-agents — PixiJS v8 world layer study

- **Repo:** https://github.com/agentsmill/age-of-agents
- **Commit studied:** `a6f22316e36b43b1e136029d7b972731e352ad19` (2026-07-22)
- **Date studied:** 2026-09-24
- **License:** MIT — `LICENSE` file present, "Copyright (c) 2026 Mateusz Pawelczuk".
  (GitHub's API reports `NOASSERTION` for this repo; that is a detection quirk, the file
  is a standard MIT text.)
- **Relevant bead:** `ba-game-client-pixijs-riw`
- **Status: RAN.** Installed, built, tested (229 passing), and the demo server was booted
  and served HTTP 200. See §0 for the recorded output.
- **Stack confirmed from `packages/client/package.json`:** `pixi.js ^8.16.0`,
  `pixi-viewport ^6.0.0`, `@pixi/tilemap ^5.0.2`, `@pixi/react ^8.0.0`,
  `react ^19`, `zustand ^5`. Exactly the combination the plan names.

---

## 0. Verification performed

This one I could run end to end, and I did.

```
npm install                → clean (exit 0)
npm run build              → tsc --noEmit clean, vite build "✓ built in 2.35s",
                            server+CLI bundled to dist/cli.js 183.2kb
npm test                   → Test Files 36 passed (36)
                            Tests      229 passed (229)
                            Duration   1.84s
node dist/cli.js --demo    → "Server listening at http://127.0.0.1:8123"
                            curl / → HTTP 200, serves the built SPA
```

Requires **Node >= 22** (`engines.node`). Note the demo CLI binds its own port (8123) and
ignores a `PORT` env var — if you script it, read the port from stdout rather than setting
it.

The `game/` directory is **2,527 lines across 24 files** — a useful reminder that this is
not a large codebase:

```
  25  projection.ts        97  pathfind.ts        58  decorations.ts
  29  autotile.ts          83  tilemap.ts         75  sprites.ts
  33  camera-guards.ts    142  tilemap-iso.ts      52  flip.ts
  34  emblems.ts          305  unit.ts            828  view.ts   <-- the monolith
  36  home-building.ts    226  placeholders.ts     81  building-fx.ts
  39  scatter.ts          105  terrain-map.ts       97  roads.ts
```

## 1. `projection.ts` — the whole reason to read this repo

25 lines, and it is the most valuable thing here. **The entire pixel-math abstraction:**

```ts
export interface Projection {
  toScreen(gx: number, gy: number): { x: number; y: number };
  /** Value for depth-sorting (zIndex) units/buildings. */
  depth(gx: number, gy: number): number;
}

export function topdown(tile: number): Projection {
  return {
    toScreen: (gx, gy) => ({ x: gx * tile, y: gy * tile }),
    depth: (_gx, gy) => gy,
  };
}

/** Classic 2:1 diamond (tile width 2x height). */
export function isometric(tileW: number, tileH: number): Projection {
  return {
    toScreen: (gx, gy) => ({ x: ((gx - gy) * tileW) / 2, y: ((gx + gy) * tileH) / 2 }),
    depth: (gx, gy) => gx + gy,
  };
}
```

The file's own header states the rule that makes it work:

> Game logic (paths, movement, positions) NEVER works in screen coordinates; only
> rendering goes through projection.

Everything above this line — `pathfind.ts`, `unit.ts`, `terrain-map.ts`, the store,
the server — is pure integer grid `(gx, gy)`. Swapping top-down for isometric is one
constructor argument and zero changes elsewhere. `depth()` folds depth-sorting into the
same abstraction, so the renderer's z-index is derived from the projection rather than
duplicated as its own formula.

**PORT.** `ba-game-client-pixijs-riw` should adopt this shape early, before any rendering
code exists, because retrofitting it afterwards means auditing every coordinate in the
tree. Two methods, both total, both pure.

**Why `depth` is a `gy` and not a `gx + gy` in top-down:** an off-by-one in depth-sorting
shows up as a unit walking _behind_ a building it is clearly in front of, and only on one
axis. Keeping the rule inside the projection makes it one line to get wrong instead of one
per renderer.

## 2. `pathfind.ts` — a road graph, not a grid search

`WaypointGraph` builds a graph from the _theme definition_ — building doors, crossroads,
and explicit edges — then runs Dijkstra over it.

The rationale is in the source and it is the whole design:

> Units walk along "roads"; it looks natural and avoids full A* over the grid at the
> ambient scale of 5-20 units.

Edge cost is euclidean distance between the two door/intersection nodes
(`Math.hypot(na.gx - nb.gx, na.gy - nb.gy)`), added symmetrically so the graph is
undirected. `nearest(gx, gy)` snaps any grid position to the closest graph node, so a
unit can be placed anywhere and still route.

**PORT:** the _idea_ — route over an authored sparse graph rather than a dense grid, and
make the roads a visual and a logical feature at once. The buildings and the roads agree
because they come from the same theme definition.

**AVOID:** the implementation is naive Dijkstra with a linear scan:

```ts
while (open.size > 0) {
  let current, currentDist = Infinity;
  for (const id of open) {                       // O(V) every iteration
    const d = dist.get(id) ?? Infinity;
    if (d < currentDist) { currentDist = d; current = id; }
  }
  ...
}
```

That is O(V²). At the stated 5–20 units over a graph of doors and crossroads it is
completely fine. It is **not** fine if you ever scale to hundreds of agents, and there is
no priority queue. Copy the design, not the loop.

Also note `addEdge` throws on an unknown node (`Edge to unknown node: ${a} - ${b}`) —
good, that is theme data validated at load rather than a silent broken route at runtime.

## 3. `autotile.ts` — the abstraction is right, the data is a stub

The dual-grid corner-mask technique, 29 lines, textbook:

```ts
/** Bits: NW=1, NE=2, SW=4, SE=8. Outside grid = base (false). */
export function cornerMask(dx: number, dy: number, isUpper: IsUpper): number {
  const nw = isUpper(dx - 1, dy - 1) ? 1 : 0;
  const ne = isUpper(dx, dy - 1) ? 2 : 0;
  const sw = isUpper(dx - 1, dy) ? 4 : 0;
  const se = isUpper(dx, dy) ? 8 : 0;
  return nw + ne + sw + se;
}
```

`IsUpper` is a predicate injected by the caller, so the mask function knows nothing about
water or dirt — it just asks "is this cell in the upper terrain?". Clean, testable, and it
is exactly the kind of pure function worth having.

**AVOID — the lookup table is an acknowledged placeholder:**

```ts
/**
 * Lookup maska(0..15) → indeks klatki w atlasie tilesetu.
 * Identity by DEFAULT (frame == mask), assuming an atlas arranged by mask.
 * Po wygenerowaniu prawdziwego tilesetu PixelLab (Task 6) podmieniany na
 * realne mapowanie i ZAMYKANY testem na faktycznym sheecie.
 */
export const DUAL_GRID_LOOKUP: readonly number[] = Object.freeze(
  Array.from({ length: 16 }, (_, m) => m),
);
```

The Polish comment says it plainly: the real PixelLab mapping is to be substituted and
locked with a test against the actual sheet — **and that has not happened at this SHA.**
The code only works if the tileset happens to be laid out in mask order, which is an
assumption about an art asset, not a fact about the code.

This is precisely the class of thing you cannot catch by reading source: the type is right,
the tests pass, and the terrain transitions are quietly wrong for 15 of 16 configurations.
**If you port this you must generate the real 16-entry permutation or verify the sheet
layout — do not assume identity.**

The 4 tests in `tests/` do cover `isoFillRange` and terrain-map, but there is no test
asserting that `frameForMask` matches a real tilesheet. Confirmed by reading the test
list at `a6f2231`.

## 4. `tilemap.ts` — layering, and silent degradation

Uses `@pixi/tilemap`'s `CompositeTilemap`, one dual-grid layer per terrain pair, in
priority order (`tilemap.ts:12-16`):

```ts
const PAIRS: { pair: string; upper: TerrainId }[] = [
  { pair: 'water', upper: 'water' },
  { pair: 'dirt', upper: 'dirt' },
  { pair: 'rock', upper: 'rock' },
];
// later = higher
```

Terrain is a **flat background**, added to `worldLayer` _before_ `unitLayer`, and — per the
comment — **never enters depth-sort**. The base layer paints `t_0` from an arbitrary pair
across the whole grid so terrain always fills the screen.

**AVOID — assets fail silently.** Three bare `catch {}` blocks:

```ts
try { sheets.set(pair, await Assets.load<Spritesheet>(...)); }
catch { /* single missing pair: skip it */ }
...
} catch { /* no tilesets -> drawTerrain fallback in view.ts */ }
```

A missing or corrupt tilesheet degrades to a programmatic fallback with **no log, no
counter, no user-visible signal**. You find out because the map looks slightly wrong.
Combined with the `hasTilemaps()` predicate, "styled" and "unstyled" are
indistinguishable from the outside. If you port this, log the miss and surface it.

## 5. `view.ts` — the PixiJS v8 settings that matter

828 lines, the one genuinely large file. The reusable decisions:

**Renderer init** (`view.ts:124-131`):

```ts
TextureStyle.defaultOptions.scaleMode = 'nearest';
await this.app.init({
  background: 0x1a1a17,
  resizeTo: host,
  antialias: false, // pixel art: never smooth
  roundPixels: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
```

Note `scaleMode = 'nearest'` is set **globally** before init, because Pixi v8 defaults to
linear filtering and every pixel-art sprite would be blurry without it. This is the single
most commonly missed line in a Pixi v8 pixel-art port.

**Layer order and depth sorting** (`view.ts:91-92, 236, 260`):

```ts
private unitLayer = new Container();
private fxLayer   = new Container();
...
this.unitLayer.sortableChildren = true;
...
sprite.zIndex = projection.depth(p.gx, p.gy);
```

`worldLayer` holds terrain + buildings, `unitLayer` holds depth-sorted sprites, `fxLayer`
holds effects on top and unsorted. As noted, `zIndex` comes _from the projection_.

**Viewport** (`view.ts:165-173`):

```ts
this.viewport = new Viewport({ events, worldWidth, worldHeight, screenWidth, screenHeight });
this.viewport.drag().pinch().wheel().decelerate();
this.viewport.clamp({ direction: 'all', underflow: 'center' });
```

**The autofollow hand-off — a genuinely good UX behaviour.** Any manual camera input
permanently disables auto-fit:

```ts
this.viewport.on('wheel-scroll', () => {
  this.userZoomed = true;
  useWorld.getState().setAutofollow(false);
});
this.viewport.on('pinch-start', () => {
  this.userZoomed = true;
  useWorld.getState().setAutofollow(false);
});
this.viewport.on('drag-start', () => useWorld.getState().setAutofollow(false));
```

with the rationale in the comment: "Manual camera control takes over and breaks autofollow.
Otherwise followSelected would undo pan-to-cursor on every zoom frame and stick the map
during drag." **PORT** — auto-recentering out from under someone who just panned is one of
the most irritating things a map view can do, and the fix is three lines.

**"Cover" fit, not "contain"** (`view.ts:194-202`):

```ts
const cover = Math.max(screenW / worldWidth, screenH / worldHeight);
this.viewport.clampZoom({ minScale: cover, maxScale: Math.max(MAX_ZOOM, cover * 1.2) });
if (!this.userZoomed) {
  this.viewport.setZoom(cover, true);
  this.viewport.moveCenter(w / 2, h / 2);
}
```

`Math.max` (not `Math.min`) means terrain **always** fills the viewport and you get
letterboxing cropped, never black corners. The `userZoomed` guard preserves the user's zoom
across a window resize. **PORT** — cheap, and "why is there black in the corner" is a
tangibly worse experience than slight cropping.

**The asset-load ordering constraint, documented** (`view.ts:245-250`):

> PixelLab assets/tilesets MUST be loaded BEFORE building terrain/buildings/decorations.
> Otherwise hasTilemaps()/getBuildingSprite() return empty -> placeholders at startup, and on
> theme change the scene builds from the old cache before it is cleared.

There is an explicit `init()`/`destroy()` race guard for theme switching mid-load
(`ready` / `destroyed` flags, `view.ts:108-109`). **PORT the guard** — async init plus
user-initiated teardown is a real race, and the fix here is a two-flag pattern that is easy
to copy.

## 6. `archetype.ts` — how to avoid an N×M asset explosion

A hero is drawn from an atlas keyed `'<model>-<mode>'`. Without help that is 4 models ×
4 permission modes = 16 atlases. The solution is a **degradation chain**:

```ts
export const ARCHETYPE_FALLBACK = 'sonnet-default';

export function archetypeKeyChain(key: string): string[] {
  const model = key.split('-')[0];
  return [...new Set([key, `${model}-default`, ARCHETYPE_FALLBACK])];
}
```

exact → `<model>-default` → global fallback, deduped. A hero in `plan` mode with no
`opus-plan` atlas still draws as **opus**, not as the generic placeholder. The comment
explains why this is load-bearing: "without this degradation a hero in non-default mode
would fall to the placeholder. This keeps ITS model sprite."

**PORT.** This is the cheapest asset-strategy win in the whole repo — three lines that
turn "16 atlases or a generic blob" into "4 atlases, always recognisable". The
`new Set` dedup matters too: without it a key of `sonnet-default` produces a redundant
duplicate entry.

Two smaller notes in the same file:

- `sessionToArchetypeKey` matches the model by **substring** against a `MODELS` list
  (`(hero.model ?? '').toLowerCase().includes(m)`) — because the real value is a full model
  id like `claude-opus-4-8[1m]`, not a clean token.
- `stateToAnimation(state, moving)` takes movement as a **separate argument**, with the
  reason: "waypoint movement is NOT encoded in HeroStateKind (a unit can be walking while
  'idle' or 'working')". Movement wins: `if (moving) return 'walk'`. **PORT** — collapsing
  "where it is" and "what it is doing" into one enum is a modelling error you will regret.

## 7. `unit.ts` — a presentational entity, nothing more

305 lines, and notably it holds **no game rules**. State: a `path: PathNode[]`, a
`Container` body with an `AnimatedSprite`, four `Graphics` overlays (`aura`, `crate`,
`teamRing`, `selectionRing`), a context bar (`contextTrack` / `contextFill` / a 0–1
`contextProgress`), and three `Text` nodes (`overlay`, `bubble`, `nameTag`).

The one behaviour worth calling out is bubble visibility (`unit.ts:47-48`):

```ts
private bubbleUntil = 0;    // elapsed time until the fresh bubble is shown
private bubbleForced = false; // selected unit -> bubble always visible
```

Two distinct rules — a bubble auto-expires, **unless the unit is selected**, in which case
it is pinned. Selection overrides the timer. Small, but it is the kind of interaction
detail that gets lost in a reimplementation.

`view.ts` also keeps a `retiring: Map<string, {unit, deadline}>` rather than destroying
removed units immediately, so they can animate out.

## 8. State management

zustand, with the store (`useWorld`) as the single source of truth and `GameView`
subscribing and reconciling into Pixi objects — `unsubscribe` / `unsubscribeMapping`
cleanups at `view.ts:105-106`. `setAutofollow(false)` is called _from inside the Pixi
event handler_, i.e. renderer events write back into the store. That two-way coupling is
the main thing to watch when porting: it works, but it is why the `userZoomed` flag has to
be threaded through both.

## 9. Summary for porting

| #   | Behaviour                                                                | Verdict                                        | Feeds                       |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------- |
| 1   | `Projection {toScreen, depth}`; logic in grid coords, render in pixels   | **PORT FIRST** — retrofitting is an audit      | `ba-game-client-pixijs-riw` |
| 2   | Sparse authored road graph + Dijkstra over doors/crossroads              | **PORT the design**                            | `ba-game-client-pixijs-riw` |
| 3   | O(V²) linear-scan Dijkstra                                               | **AVOID at scale**                             | —                           |
| 4   | Dual-grid 4-corner mask with injected `IsUpper` predicate                | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 5   | `DUAL_GRID_LOOKUP` is an identity stub, no real-sheet test               | **AVOID — generate or verify the permutation** | `ba-game-client-pixijs-riw` |
| 6   | `scaleMode='nearest'` set globally before `app.init`                     | **PORT — the classic v8 miss**                 | `ba-game-client-pixijs-riw` |
| 7   | `antialias:false`, `roundPixels:true`, `autoDensity` + devicePixelRatio  | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 8   | `unitLayer.sortableChildren` + `zIndex = projection.depth()`             | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 9   | Manual camera input permanently disables autofollow (`userZoomed`)       | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 10  | `cover = max(...)` fit; preserve user zoom across resize                 | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 11  | `archetypeKeyChain` 3-step degradation; only 4 atlases needed            | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 12  | `stateToAnimation(state, moving)` — movement is a separate axis          | **PORT**                                       | `ba-game-client-pixijs-riw` |
| 13  | Assets must load before scene build; `ready`/`destroyed` init race guard | **PORT the guard**                             | `ba-game-client-pixijs-riw` |
| 14  | Silent `catch {}` on missing tilesets                                    | **AVOID — log the miss**                       | `ba-game-client-pixijs-riw` |
| 15  | 828-line `view.ts` mixing viewport, layers, FX, and store bridge         | **AVOID** — split on port                      | `ba-game-client-pixijs-riw` |
