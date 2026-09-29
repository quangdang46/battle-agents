/**
 * The world view: the reconciliation that has to stay O(changes).
 *
 * Mirrored from age-of-agents `packages/client/src/game/view.ts` (MIT, see
 * THIRD-PARTY-NOTICES.md) in its DECOMPOSITION — a Pixi scene with a terrain
 * layer, a unit layer, and a reconcile that maps world state onto units — and
 * deliberately not mirrored in its reconcile. The reference walks every hero and
 * every peon on every state change, because its store is a whole-world snapshot
 * it re-reads. At five units that is free; at five hundred agents receiving two
 * thousand events a second it is the entire frame budget, and it is invisible in
 * a screenshot.
 *
 * So `applyAgentDelta(ids)` here is handed the agents that changed and touches
 * exactly those. It never reads the store's size and never iterates the
 * container, and it cannot be made to: the store passes a list, not a reference.
 * The two places that genuinely must look at everything — `sweep` and
 * `rebuild` — are separate methods with names that say so, and neither is
 * reachable from a delta.
 */

import { Container, Graphics, Sprite } from 'pixi.js';

import { ZONE_PLACEMENT, placementFor } from '../zones.js';
import { advanceMotion, motionAt, type CharacterMotion } from './motion.js';
import { ART_NATIVE_ZOOM, stableHash, DECORATION_KINDS,} from '../sprites/sprite-factory.js';
import { skyTint } from './sky.js';
import { terrainSampler } from './terrain-map.js';
import { scatterDecorations } from './decorations.js';
import { pointOnRoad, roadCurves, type RoadNode } from './roads.js';
import type { SceneId } from '../scenes/scene-config.js';
import { MESSAGE_ARC_TTL_MS, type MessageArc } from './message-flow.js';
import { placeProps, SCENE_PROPS } from './props.js';
import { zoneSlot } from './zone-slot.js';
import { wanderOffset } from './idle-wander.js';
import { pickLine } from './dialogue.js';
import { layoutSpeechBubble } from './speech-bubble.js';
import type { AgentView, WorldStore } from '../state/store.js';
import {
  PLACEHOLDER_SCALE,
  TILE_WORLD_PX,
  spriteCache,
  spriteKey,
  TERRAIN_KINDS,
  TERRAIN_VARIANTS,
  type SpriteCache,
  type SpriteKind,
} from '../sprites/sprite-factory.js';
import { PLACEHOLDER_TILE_PX } from '../sprites/sprite-factory.js';
import { topdown, type Projection } from './projection.js';
import type { SceneConfig } from '../scenes/scene-config.js';

/**
 * The view contract, so a test can substitute a counting implementation.
 *
 * Deliberately tiny. The moment it grows a method the reconciler needs, the
 * question "could this walk the whole scene?" has to be asked again, and the
 * property under test is that the answer stays no.
 */
export interface WorldViewLike {
  /** Applies a delta for exactly these agents. */
  applyAgentDelta(agentIds: readonly string[]): void;
  /** Removes agents the store no longer has. Resync only. */
  sweep(): void;
  /** Rebuilds everything from the store. Hydrate and resync only. */
  rebuild(): void;
  /** How many display nodes exist. Diagnostics and tests. */
  readonly nodeCount: number;
  /**
   * Advances the animation by `elapsedMs`.
   *
   * ON THE SEAM, deliberately. The argument for keeping this four members wide
   * was that a resize method would make it five and re-open the question of
   * whether a renderer could walk the whole scene — and `animate` does walk the
   * scene, once per frame, by its nature.
   *
   * So it is on the seam WITH the reason attached rather than smuggled onto the
   * concrete class: a view that cannot animate is a view whose host has to
   * reach past `WorldViewLike` to do it, and that reach is where the next
   * silent-empty-world bug lives. The O(scene) rule survives intact where it was
   * always meant to apply — the delta path still takes ids and never iterates —
   * and the one method that is O(scene) says so in its own name.
   */
  animate?(elapsedMs: number): void;
}

interface UnitNode {
  readonly sprite: Sprite;
  zone: string;
  online: boolean;
  /**
   * The agent this node draws, for the animation.
   *
   * Held rather than re-read from the store because `animate` runs every frame
   * and the store lookup is a map access per agent per frame for a value that
   * only changes on a delta. Storing the last known view is a cache with a known
   * invalidation point — the delta path writes it — rather than one with a TTL.
   */
  agent: AgentView | undefined;
  /**
   * Where this character actually IS, as opposed to the zone it is bound for.
   *
   * The distinction is the difference between a map and a teleport. The zone is
   * the game's decision — an event said this agent is at the Terminal — and the
   * position is that decision being carried out by a pair of legs at a walking
   * speed. Both are kept because the replay and the store need the zone and the
   * renderer needs the position, and conflating them is what made a character
   * blink across the city.
   */
  motion: CharacterMotion;
  /**
   * Milliseconds this character has spent in its CURRENT animation.
   *
   * Per node, and reset when the animation changes. A scene-wide clock was the
   * first version and it cannot express "start again from the beginning".
   */
  frameMs: number;
  /** Index of the frame currently assigned, or -1 before the first advance. */
  frame: number;
  /** True while the character has a tool and is playing `work`. */
  working: boolean;
  /** True while the character is between zones, and should play `walk`. */
  walking: boolean;
  /** The sprite's screen position, kept for the label and the bubble. */
  screenX: number;
  screenY: number;
  /** The line this character is saying, recomputed when their state changes. */
  line: string;
  /** A container holding the bubble panel and its text run. */
  readonly bubble: Container;
  /** The backdrop behind the bubble, so a line is readable on any tile. */
  readonly bubbleBackdrop: Graphics;
  /** The text inside the bubble, drawn as glyph dots. */
  readonly bubbleText: Graphics;
  /** Where the bubble sits, in the layer's coordinates. */
  bubbleX: number;
  bubbleY: number;
  /** The control-group ring. Hidden unless the character is in a recalled group. */
  readonly halo: Graphics;
}

/**
 * How wide one character of the game's pixel font is.
 *
 * The font is a monospace pixel face, so a fixed advance is the truth rather
 * than an approximation of it, and it is the same number in a browser and in a
 * Node test. Measuring through Pixi's `Text` would be exact and would also need
 * a DOM to be exact in — which is why the bubble does not use it.
 */
const GLYPH_ADVANCE_PX = 6;
const GLYPH_DOT_PX = 4;
const BUBBLE_LINE_PX = 8;

function measurePixelText(text: string): number {
  return text.length * GLYPH_ADVANCE_PX;
}

/**
 * Milliseconds per animation frame.
 *
 * 140ms is about 7fps, which is right for this art: the vendored sheets are
 * small pixel figures, and at 60fps the four idle frames read as a flicker
 * rather than a breath. Named rather than inlined because the two animations
 * that use it have to agree, and a number written twice is a number that drifts.
 */
const FRAME_MS = 140;

/** The sprite kind an agent draws as. A spawning subagent is drawn smaller. */function spriteKindFor(agent: AgentView): SpriteKind {
  return agent.children.length > 0 ? 'subagent' : 'agent';
}

/**
 * A stable palette index per agent id.
 *
 * Hashed rather than counted, so an agent that reconnects keeps its colour. A
 * counter assigns a different colour on every reconnect, and a city whose
 * characters change colour when you look away is worse than one with too few
 * colours.
 */
function paletteIndexFor(agentId: string): number {
  return stableHash(agentId);
}

export interface PixiViewOptions {
  readonly store: WorldStore;
  /**
   * Which of the three scenes this view draws.
   *
   * Required, with no default, and that is the fix for a defect this file had.
   * The view read a hardcoded 32x32 grid and drew EVERY zone in
   * `ZONE_PLACEMENT` regardless of which scene that zone belonged to, so the
   * arena and the guild hall were drawn on top of the Coding City and no two
   * scenes could ever differ. `SceneConfig` already answered "how big is this
   * scene" and the answer was being ignored — the three `scenes/*.ts` files were
   * config nothing consumed.
   *
   * Optional would keep that: a host that omitted it would get the old behaviour
   * with no error, and a map that quietly contains a second city's landmarks.
   */
  readonly scene: SceneConfig;
  readonly projection?: Projection;
  readonly cache?: SpriteCache;
}

/**
 * The Pixi-backed world view.
 *
 * One `Sprite` per agent, plus one zone marker per placed zone built once at
 * construction and never rebuilt on a delta.
 */
/**
 * The zoom range, as a fraction of the 1:1 fit.
 *
 * The top is 1 because that is where pixels stop being pixel art: past 1:1 a
 * 64px tile is a 128px tile and the city stops looking drawn. The bottom is a
 * quarter, because under that you are looking at a texture, not a place.
 */
/** How long a camera move takes. Long enough to read as travel. */
export const CAMERA_SLEW_MS = 220;

export const MIN_ZOOM = 0.25;
/**
 * The ceiling is the ART's native size, not the grid's. A 64px sheet on a 48px
 * grid means a scale of 1 is already a third too big -- see ART_NATIVE_ZOOM in
 * sprite-factory. The operator's "the sprites are far too large" was this
 * number in the wrong unit, and no amount of looking at the city would have said
 * so: the sprites were exactly the size the code asked for.
 */
export const MAX_ZOOM = ART_NATIVE_ZOOM;

export function clampZoom(scale: number, fitScale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return fitScale;
  return Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * MIN_ZOOM, scale));
}

export class PixiWorldView implements WorldViewLike {
  readonly #store: WorldStore;
  readonly #projection: Projection;
  readonly #cache: SpriteCache;
  readonly #scene: SceneConfig;

  /** Everything the host draws into. */
  readonly worldLayer = new Container();
  /** Zone markers. Static: added once, never touched by a delta. */
  /**
   * The activity layer, between the sky and the zones.
   *
   * A building with agents working in it used to look exactly like a building
   * with nobody in it, which is the one signal a coding city cannot afford to
   * lose: the whole point of the world is to watch agents doing real work, and
   * the art for saying so was vendored and unused.
   */
  readonly fxLayer = new Container();
  readonly zoneLayer = new Container();
  /** Agent sprites, added and removed as agents come and go. */
  readonly unitLayer = new Container();
  /**
   * The day/night wash, BELOW everything.
   *
   * A tint over the world rather than a background behind it, so the sky changes
   * the light everything is standing in rather than showing through the gaps in
   * it. It is a plain Graphics rect covering the scene, so it does not depend on
   * the terrain having a tile for every cell.
   */
  readonly skyLayer = new Container();
  /**
   * The ground.
   *
   * It was missing, and that is what made the city look like components stacked on
   * a flat colour: the tiles were FETCHED — a 27x18 sheet, plus three per-terrain
   * sheets from age-of-agents — and nothing ever asked for one, so the world had
   * no floor. A character standing on nothing reads as a sprite on a page.
   *
   * Built once, at construction, because terrain does not change with a delta and
   * re-laying 32x32 sprites per event is the O(scene) cost this view exists to
   * avoid.
   */
  readonly terrainLayer = new Container();
  /**
   * The dressing for this scene, from whichever Kenney pack matches it.
   *
   * Drawn into the decoration layer rather than a new one: a prop is standing
   * on the ground, and putting it above the units would float it over their
   * heads.
   */
  #buildProps(): Sprite[] {
    const zones = (Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[])
      .map((zone) => ZONE_PLACEMENT[zone])
      .filter((placement) => placement.scene === this.#scene.id);
    // Every zone's own dressing, not one scene's: there is one scene, and the
    // Arena's stone props sit at the Arena because that is where the Arena is.
    const specs = zones.flatMap((placement) => {
      const byZone = SCENE_PROPS[
        (Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[]).find(
          (zone) => ZONE_PLACEMENT[zone] === placement,
        ) as string
      ];
      return byZone === undefined ? [] : byZone.map((prop) => ({ ...prop, near: [] }));
    });
    if (specs.length === 0) return [];

    return placeProps(specs, zones).flatMap(({ gx, gy, prop }) => {
      const texture = this.#cache.get(spriteKey('prop', prop.index));
      // A prop that did not load draws nothing, for the same reason a tree does.
      if (texture === undefined) return [];
      const at = this.#projection.toScreen(gx, gy);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(PLACEHOLDER_SCALE);
      sprite.position.set(at.x, at.y);
      sprite.zIndex = this.#projection.depth(gx, gy);
      return [sprite];
    });
  }

  /**
   * Ages the message arcs and redraws them. Called from `animate`, which runs
   * on the existing frame loop -- so there is no second loop, and the cost is
   * bounded by `MAX_MESSAGE_ARCS` rather than by the number of agents.
   */
  #redrawArcs(): void {
    this.messageLayer.removeChildren();
    for (const arc of this.#arcs) {
      const from = this.#projection.toScreen(arc.fromG[0], arc.fromG[1]);
      const to = this.#projection.toScreen(arc.toG[0], arc.toG[1]);
      const line = new Graphics();
      line
        .moveTo(from.x, from.y)
        .quadraticCurveTo((from.x + to.x) / 2, Math.min(from.y, to.y) - 26, to.x, to.y)
        .stroke({ color: 0x8ab4f8, width: 1, alpha: 0.5 });
      this.messageLayer.addChild(line);
    }
  }

  /**
   * The arcs a message draws between two agents.
   *
   * Event-driven and bounded, not per-frame: one arc per `message.sent`, aged
   * out on a timer, capped at `MAX_MESSAGE_ARCS`. The reference's trails were
   * redrawn every frame for every agent, which is 2020 circles a frame at this
   * population -- the exact shape `delta-cost.test.ts` exists to catch.
   */
  readonly messageLayer = new Container();
  #arcs: MessageArc[] = [];
  /** Trees, rocks, bushes and flowers, between the ground and the sky. */
  readonly decoLayer = new Container();

  readonly #units = new Map<string, UnitNode>();
  /** Elapsed world time in ms, driving both the animation cycle and the sky. */
  #elapsedMs = 0;
  #roadCache: ReturnType<typeof roadCurves> | undefined;
  /** The scale `fit` chose. Zoom bounds are relative to it, not to 1. */
  #zoom = 1;
  #slew: { fromX: number; fromY: number; toX: number; toY: number; startedAt: number } | undefined;
  readonly #sky: Graphics;

  constructor(options: PixiViewOptions) {
    this.#store = options.store;
    this.#scene = options.scene;
    this.#projection = options.projection ?? topdown(TILE_WORLD_PX);
    this.#cache = options.cache ?? spriteCache();
    this.#sky = new Graphics();
    this.skyLayer.addChild(this.#sky);
    this.worldLayer.addChild(this.terrainLayer, this.decoLayer, this.skyLayer, this.fxLayer, this.messageLayer, this.zoneLayer, this.unitLayer);
    this.#drawTerrain();
    this.decoLayer.addChild(...this.#buildDecorations(), ...this.#buildProps());
    this.fxLayer.addChild(this.#buildActivityFx());
    this.#drawZones();
    this.#paintSky();
  }

  get nodeCount(): number {
    return this.#units.size;
  }

  get root(): Container {
    return this.worldLayer;
  }

  /**
   * Lights the characters in a control group, and dims the rest.
   *
   * A halo rather than a colour swap, because recolouring a sprite means
   * re-tinting a texture — which for the vendored sheets means losing the art
   * and drawing a rectangle instead. A ring is a separate object, so the sprite
   * underneath stays the sprite.
   *
   * An EMPTY list is a real answer and clears the highlight rather than doing
   * nothing, so recalling an empty group releases the previous one.
   */
  /**
   * Zoom, in a range that stops at 1:1.
   *
   * The upper bound is the fit scale rather than a constant, because that is
   * where pixels stop being pixel art: past 1:1 a 64px tile is a 128px tile
   * and the city stops looking drawn. The lower bound is a quarter, because
   * below that you are looking at a texture, not a place.
   *
   * `factor` is multiplicative and the anchor is the viewport centre, so the
   * middle of the screen stays put while the edges move -- which is what makes
   * a zoom feel like a camera rather than a slider.
   */
  /**
   * Move the camera to a grid cell. This is what walking is, now.
   *
   * There is one city, so going to the Guild Hall is not a different world to
   * load -- it is this world with the camera somewhere else. Nothing is torn
   * down: the store, the socket, the asset cache, the 101 agents and the zoom
   * the player chose all survive, which is the whole of what doctrine section 2
   * was asking for and the three tabs were not delivering.
   *
   * The ease is `slew`, and it is 220ms rather than instant because an instant
   * cut is what a tab does. Moving is what a camera does.
   */
  focusOn(gx: number, gy: number, viewport: { width: number; height: number }): void {
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const target = this.#projection.toScreen(gx, gy);
    const zoom = this.worldLayer.scale.x;
    this.#slew = {
      fromX: this.worldLayer.position.x,
      fromY: this.worldLayer.position.y,
      toX: viewport.width / 2 - target.x * zoom,
      toY: viewport.height / 2 - target.y * zoom,
      startedAt: this.#elapsedMs,
    };
  }

  /** The camera moves itself. Called from animate, so there is no second loop. */
  advanceCamera(): void {
    const slew = this.#slew;
    if (slew === undefined) return;
    const t = Math.min(1, (this.#elapsedMs - slew.startedAt) / CAMERA_SLEW_MS);
    // Smoothstep, so it starts and stops rather than snapping at both ends.
    const eased = t * t * (3 - 2 * t);
    this.worldLayer.position.set(
      slew.fromX + (slew.toX - slew.fromX) * eased,
      slew.fromY + (slew.toY - slew.fromY) * eased,
    );
    if (t >= 1) this.#slew = undefined;
  }

  zoomBy(factor: number, viewport?: { width: number; height: number }): void {
    // From the scale that is ACTUALLY on the layer, not from a remembered
    // ratio. The remembered one drifted: a screenshot at minimum zoom showed the
    // city pushed to the right of the frame, because `#userZoom` is relative to
    // `#zoom`, and `#zoom` is rewritten by every `fit` -- so after the first
    // resize the ratio no longer described the world and every wheel tick
    // multiplied a wrong number.
    const from = this.worldLayer.scale.x;
    const to = clampZoom(from * factor, this.#zoom);
    if (to === from) return;
    this.worldLayer.scale.set(to);
    if (viewport === undefined) return;
    // Keep whatever was under the centre under the centre: the world point there
    // is unchanged, so the screen position is `centre - worldPoint * scale`.
    const ratio = to / from;
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    this.worldLayer.position.set(
      cx + (this.worldLayer.position.x - cx) * ratio,
      cy + (this.worldLayer.position.y - cy) * ratio,
    );
  }

  /**
   * The zone a click at this world-layer point lands on, or undefined.
   *
   * This is the whole of "the Arena is a building you walk into" rather than a
   * tab: the world is already drawing a marker for every zone in this scene, and
   * all that was missing was a way to ask which one a pixel is in.
   *
   * The reach is in TILES and it is NOT generous. 2.5 looked generous and was
   * wrong: the city places zones four to eight cells apart, and the isometric
   * projection puts adjacent cells only `tileW / 2` apart on screen, so a
   * 2.5-tile box covered three grid cells and a click on the Plaza resolved to
   * the Workshop beside it. Half a tile of slack is enough to forgive a stray
   * pixel and not enough to steal a neighbour's building.
   */
  /**
   * The zone a CONTAINER point lands on, undoing this view's own transforms.
   *
   * The layer stack is root -> worldLayer(position, scale) -> the sprites, and
   * the caller only knows where it clicked on screen. Doing the conversion here
   * is the point: an earlier version took the container point minus `root.x` and
   * called it world space, which ignores the worldLayer's own pan AND its zoom,
   * so a click landed a whole tile off the moment either was anything but
   * identity. The one caller got it wrong in one place; a view that exposes only
   * its own coordinates cannot get it wrong at all.
   */
  zoneAtScreen(
    containerX: number,
    containerY: number,
    reachTiles = 1.25,
  ): { zone: keyof typeof ZONE_PLACEMENT; label: string; scene: SceneId } | undefined {
    const scale = this.worldLayer.scale.x || 1;
    const worldX = (containerX - this.root.position.x - this.worldLayer.position.x) / scale;
    const worldY = (containerY - this.root.position.y - this.worldLayer.position.y) / scale;
    return this.zoneAt(worldX, worldY, reachTiles / scale);
  }

  zoneAt(x: number, y: number, reachTiles = 1.25): { zone: keyof typeof ZONE_PLACEMENT; label: string; scene: SceneId } | undefined {
    let best: { zone: keyof typeof ZONE_PLACEMENT; label: string; scene: SceneId; distance: number } | undefined;
    // Every cell this scene can be clicked on: its own zones, plus a doorway per
    // other scene at that door's OWN cell.
    //
    // The doorway is NOT at the zone's own coordinates, and that is the whole
    // fix. `guild-hall` sits at (12,10) and the city's `messaging` at (10,12) --
    // two cells apart on a diagonal, which the isometric projection squeezes to
    // a few pixels -- so the city's own zone always won the hit test and the
    // doorway was never clickable. A place you cannot reach is a label, and this
    // was one wearing a building's sprite.
    type ZoneKey = keyof typeof ZONE_PLACEMENT;
    type Cell = { gx: number; gy: number };
    // Every cell this scene can be clicked on: its own zones. There is no second
    // list any more -- a doorway was a place in another scene, and there is only
    // one scene, so a door to a place in the same room is a signpost.
    const clickable: [ZoneKey, Cell][] = (
      Object.keys(ZONE_PLACEMENT) as ZoneKey[]
    )
      .filter((zone) => ZONE_PLACEMENT[zone].scene === this.#scene.id)
      .map((zone): [ZoneKey, Cell] => [zone, { gx: ZONE_PLACEMENT[zone].gx, gy: ZONE_PLACEMENT[zone].gy }]);
    for (const [zone, cell] of clickable) {
      const placement = ZONE_PLACEMENT[zone];
      if (placement === undefined) continue;
      const at = this.#projection.toScreen(cell.gx, cell.gy);
      // Compared in SCREEN distance, not grid distance: the two scales the
      // projection uses differ by a factor of two, and a grid comparison would
      // make a hit box twice as tall as it is wide.
      const distance = Math.hypot(x - at.x, y - at.y);
      if (distance > reachTiles * TILE_WORLD_PX) continue;
      if (best === undefined || distance < best.distance) {
        best = { zone, label: placement.label, scene: placement.scene, distance };
      }
    }
    return best === undefined ? undefined : { zone: best.zone, label: best.label, scene: best.scene };
  }

  setHighlighted(agentIds: readonly string[]): void {
    const lit = new Set(agentIds);
    for (const node of this.#units.values()) {
      const id = node.agent?.agentId;
      const on = id !== undefined && lit.has(id);
      node.halo.visible = on;
      if (on) {
        node.halo.position.set(node.sprite.position.x, node.sprite.position.y);
        node.halo.zIndex = node.sprite.zIndex + 1;
      }
    }
  }

  /**
   * Fits the whole grid into a viewport of this size, and centres it.
   *
   * ## Why this exists
   *
   * `topdown(TILE_WORLD_PX)` maps the 32x32 grid to 32 * 48 = 1536 square
   * pixels and nothing scaled that to the canvas, so the world stayed 1536x1536
   * inside a viewport a few hundred pixels tall. Measured in a running browser:
   * canvas 1230x458, an idle agent's sprite at world (864, 864). The sprite
   * existed, its texture was a valid 16x16, it was visible, correctly parented
   * and correctly scaled — and it was 400px below the bottom of the picture.
   *
   * There is no camera, so this is the camera. Uniform on both axes and
   * centred, not stretched to fill: a non-uniform scale turns a round sprite
   * into an ellipse, and letterboxing keeps the whole map readable instead of
   * filling the screen with a third of it.
   *
   * ## Why it is here and not on `WorldViewLike`
   *
   * That seam is four members wide on purpose, and a resize method is exactly
   * the kind of thing that makes it a fifth: every host would be handed a
   * viewport question it cannot answer without knowing the grid. The grid and
   * the tile size are this class's own, and `CountingView` has neither.
   */
  fit(width: number, height: number): void {
    // A zero-sized viewport happens on the first layout pass, and a scale of
    // zero would leave the world invisible until something refitted it. Skipping
    // is the honest answer: there is nothing to fit INTO yet.
    if (width <= 0 || height <= 0) return;
    // The scene's own width, not a constant. The arena is 24 tiles and the
    // guild hall 24x20 while the city is 32, and fitting all three to a 32-wide
    // world left the smaller scenes showing a third of a map and a band of
    // nothing.
    // The projected bounds, not `scene.w * TILE_WORLD_PX`.
    //
    // That was a square, which is right for `topdown` and wrong by a factor of
    // two for `isometric`: a 2:1 diamond maps the map's corners to a span of
    // `(w + h) * tileW / 2` across, so fitting a square put the whole city in
    // one corner of the canvas and left the rest empty. Measured from the
    // projection itself, so it is correct for whichever one this view was built
    // with rather than correct for the one that was there first.
    // The built-up band, not the whole grid. The grid is 48x48 so the districts
    // have room; fitting THAT made a district six cells across a sliver in the
    // corner, and walking to it moved the camera by a few pixels. Fitting the
    // span of the ZONES -- the actual places -- is what makes a district
    // somewhere you can be.
    const placed = (Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[])
      .filter((zone) => ZONE_PLACEMENT[zone].scene === this.#scene.id)
      .map((zone) => ZONE_PLACEMENT[zone]);
    const pad = 3;
    const corners =
      placed.length === 0
        ? [
            this.#projection.toScreen(0, 0),
            this.#projection.toScreen(this.#scene.w, this.#scene.h),
          ]
        : [
            this.#projection.toScreen(
              Math.max(0, Math.min(...placed.map((p) => p.gx)) - pad),
              Math.max(0, Math.min(...placed.map((p) => p.gy)) - pad),
            ),
            this.#projection.toScreen(
              Math.min(this.#scene.w, Math.max(...placed.map((p) => p.gx)) + pad),
              Math.min(this.#scene.h, Math.max(...placed.map((p) => p.gy)) + pad),
            ),
            this.#projection.toScreen(
              Math.max(0, Math.min(...placed.map((p) => p.gx)) - pad),
              Math.min(this.#scene.h, Math.max(...placed.map((p) => p.gy)) + pad),
            ),
            this.#projection.toScreen(
              Math.min(this.#scene.w, Math.max(...placed.map((p) => p.gx)) + pad),
              Math.max(0, Math.min(...placed.map((p) => p.gy)) - pad),
            ),
          ];
    const minX = Math.min(...corners.map((point) => point.x));
    const maxX = Math.max(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxY = Math.max(...corners.map((point) => point.y));
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 || worldH <= 0) return;

    // NEVER UPSCALE past the art's native size. The city is smaller than the
    // canvas, so an uncapped fit magnifies it, and the sheets are 64px on a
    // 48px grid, so even 1:1 was a third too big. `ART_NATIVE_ZOOM` is 0.75 --
    // one art pixel per world pixel -- and that is the ceiling.
    //
    // A world smaller than its window shows its edges. That is what a
    // borderless canvas is FOR; filling it with magnified art is not.
    const scale = Math.min(MAX_ZOOM, width / worldW, height / worldH);
    this.#zoom = scale;
    this.worldLayer.scale.set(this.#zoom);
    // Centred on the bounds, and shifted by `-min` because the isometric origin
    // puts cell (0,0) at a negative x: without it the world is centred on the
    // origin rather than on the map, which is a half-map offset to the right.
    this.worldLayer.position.set(
      (width - worldW * this.#zoom) / 2 - minX * this.#zoom,
      (height - worldH * this.#zoom) / 2 - minY * this.#zoom,
    );
  }

  /**
   * Applies a delta for the named agents, and nothing else.
   *
   * The loop is over `agentIds` and there is no second loop. A view that needed
   * to know whether some OTHER agent also changed would have to iterate the
   * store, and that is the O(scene) cost this design exists to make
   * unrepresentable — so the signature takes ids and there is nothing to
   * iterate.
   */
  applyAgentDelta(agentIds: readonly string[]): void {
    for (const id of agentIds) {
      const agent = this.#store.get(id);
      if (agent === undefined) {
        this.#remove(id);
        continue;
      }
      this.#applyOne(agent);
    }
  }

  /**
   * Removes agents the store no longer holds.
   *
   * Separate from the delta path because the store never removes an agent: one
   * that stops reporting stays on the map as OFFLINE, since DESIGN.md section 4
   * is explicit that a dead session must not make a character vanish. This is
   * for the resync case, where a fresh snapshot is authoritative and an agent it
   * does not list is genuinely gone.
   */
  sweep(): void {
    for (const id of [...this.#units.keys()]) {
      if (this.#store.get(id) === undefined) this.#remove(id);
    }
  }

  /** Full rebuild. The one O(scene) path, and it is not reachable from a delta. */
  rebuild(): void {
    for (const id of [...this.#units.keys()]) this.#remove(id);
    for (const agent of this.#store.allAgents()) this.#applyOne(agent);
  }

  #applyOne(agent: AgentView): void {
    const placement = placementFor(agent.zone);
    const screen = this.#projection.toScreen(placement.gx, placement.gy);
    const depth = this.#projection.depth(placement.gx, placement.gy);
    const existing = this.#units.get(agent.agentId);

    if (existing === undefined) {
      const sprite = new Sprite(
        this.#cache.get(spriteKey(spriteKindFor(agent), paletteIndexFor(agent.agentId))),
      );
      sprite.anchor.set(0.5, 0.5);
      sprite.scale.set(PLACEHOLDER_SCALE);
      sprite.position.set(screen.x, screen.y);
      sprite.zIndex = depth;
      sprite.alpha = agent.online ? 1 : 0.45;
      this.unitLayer.addChild(sprite);
      // The control-group ring, built once and hidden. It is a separate object
      // rather than a tint on the sprite so the vendored art is never re-tinted
      // into a rectangle.
      const halo = new Graphics()
        .circle(0, 0, PLACEHOLDER_TILE_PX * 0.75)
        .stroke({ color: 0xf0c674, width: 2, alpha: 0.9 });
      halo.visible = false;
      this.unitLayer.addChild(halo);
      // The bubble is a CHILD of this unit's layer and moves with it, so a line
      // stays over the head that is saying it. It is built empty and filled on
      // the first frame, because laying it out needs the sprite's screen
      // position, which only exists after the projection has run.
      const bubbleBackdrop = new Graphics();
      const bubbleText = new Graphics();
      const bubble = new Container();
      bubble.addChild(bubbleBackdrop, bubbleText);
      bubble.visible = false;
      this.unitLayer.addChild(bubble);
      this.#units.set(agent.agentId, {
        sprite,
        zone: agent.zone,
        online: agent.online,
        agent,
        motion: motionAt(agent.zone),
        frameMs: 0,
        frame: -1,
        working: false,
        walking: false,
        screenX: screen.x,
        screenY: screen.y,
        line: '',
        bubble,
        bubbleBackdrop,
        bubbleText,
        bubbleX: 0,
        bubbleY: 0,
        halo,
      });
      return;
    }

    // Cached for the animation, which cannot ask the store per frame.
    existing.agent = agent;

    // Field by field, each write guarded by the value it changes. Reassigning
    // the whole node on every event is the O(scene) cost in a small hat, and
    // the store's `sameView` comparison exists to stop a delta arriving here
    // that has nothing to draw.
    if (existing.zone !== agent.zone) {
      existing.zone = agent.zone;
      // The sprite is NOT moved here. A zone change is the game saying where
      // the character is BOUND; the position is carried there by `advanceMotion`
      // over the following frames, which is the difference between a character
      // walking to the Workshop and a character blinking into it. `animate`
      // owns both the position and the depth sort, because depth follows the
      // character as it moves rather than snapping when the zone changes.
    }
    if (existing.online !== agent.online) {
      existing.online = agent.online;
      // Dimmed, not removed. DESIGN.md section 4.
      existing.sprite.alpha = agent.online ? 1 : 0.45;
    }
  }

  /**
   * Advances every character's animation.
   *
   * ## Why the vendored sheets and not the skeletal runtime
   *
   * `features/animation` is a real skeletal pipeline — FK, IK, mesh skinning, a
   * golden-frame suite — and it is the plan §9 answer. It is also a system that
   * renders to its own canvas and is not wired to this client, and wiring it is
   * a different piece of work from making the game move.
   *
   * The pack already ships `idle`, `walk` and `work` per hero. A character that
   * plays them is a character that moves, on the art the project already
   * vendored and attributed, this week. So that is what this does, and the
   * skeletal runtime stays the upgrade it is rather than the thing standing
   * between the game and being a game.
   *
   * ## What drives it
   *
   * The agent's own state, not a timer: `AgentView.tool` present means working.
   * So a character walks to the terminal when a tool moves it there, and works
   * there, and breathes again when the tool ends — the game's data deciding the
   * picture, which is the same contract the zone table already follows.
   *
   * ## What it costs
   *
   * O(agents on screen), once per frame, assigning a texture. That is the one
   * place the O(scene) rule does not apply and the interface says so. It does
   * NOT re-create anything: `animationFor` returns the frames the cache already
   * holds, and the assignment is a pointer swap.
   */
  /**
   * Lays the ground for this scene, one sprite per cell.
   *
   * The kind of ground comes from `terrainSampler` on the scene seed, so it is
   * the SAME ground on every reload and in every browser — a world that reshuffles
   * its own floor is not a place, it is noise. The tile WITHIN a kind is varied by
   * a second hash of the cell, so a field of grass is not one tile stamped 1024
   * times, which is the other way this looks like a spreadsheet.
   *
   * A cell whose sheet did not load draws nothing rather than a fallback colour,
   * because a flat square of `#2a3a2a` is more obviously wrong than absence is.
   */
  #drawTerrain(): void {
    const sample = terrainSampler(this.#scene.seed, (gx, gy) => pointOnRoad(this.#roads(), gx, gy));
    for (let gy = 0; gy < this.#scene.h; gy += 1) {
      for (let gx = 0; gx < this.#scene.w; gx += 1) {
        const kind = sample(gx, gy);
        // The variant carries BOTH the kind and the choice within it, so a
        // caller with one integer can ask for a specific piece of ground.
        const variety = (gx * 7 + gy * 13) % 3;
        const kindIndex = Math.max(0, TERRAIN_KINDS.indexOf(kind));
        const texture = this.#cache.get(
          spriteKey('terrain-tile', kindIndex * TERRAIN_VARIANTS + variety),
        );
        if (texture === undefined) continue;
        const at = this.#projection.toScreen(gx, gy);
        const tile = new Sprite(texture);
        tile.position.set(at.x, at.y);
        tile.zIndex = -1;
        this.terrainLayer.addChild(tile);
      }
    }
  }

  /**
   * Lays down the day's light over the scene.
   *
   * A `Graphics` rect rather than a tinted background, so the wash sits OVER the
   * terrain and the units and reads as light rather than as a colour behind
   * them. It is cleared and redrawn each time rather than adjusted, because the
   * tint is a function of the hour and the hour is a function of elapsed time,
   * and a shape that has to be recomputed anyway is cheaper to replace than to
   * keep in sync.
   */
  #paintSky(): void {
    const tint = skyTint(this.#elapsedMs);
    const worldPx = this.#scene.w * TILE_WORLD_PX;
    this.#sky.clear();
    this.#sky.rect(0, 0, worldPx, worldPx).fill({
      color: (tint.color.r << 16) | (tint.color.g << 8) | tint.color.b,
      alpha: tint.opacity,
    });
  }

  animate(elapsedMs: number): void {
    if (this.#units.size === 0) {
      // The sky runs even with nobody in the world. A city that stops having a
      // time of day the moment the last agent leaves is not a place.
      this.#elapsedMs += Math.max(0, elapsedMs);
      this.#paintSky();
      return;
    }
    const step = Math.max(0, elapsedMs);
    this.#elapsedMs += step;
    this.#paintSky();

    for (const node of this.#units.values()) {
      const agent = node.agent;
      if (agent === undefined) continue;

      // Move FIRST, then decide the animation from where the character ended
      // up. The other order picks `walk` on the frame a character is still
      // standing at its origin, and stands at the destination for one frame
      // after it stopped — the lag is exactly one frame, which is exactly long
      // enough to read as the character hesitating.
      const wasWalking = node.motion.moving;
      advanceMotion(node.motion, agent.zone, step);
      const isWalking = node.motion.moving;

      // The sprite follows the MOTION, not the zone. This is the line that
      // makes the city a place: every position in the picture is one a
      // character walked to.
      //
      // On top of the walked-to tile, two more things decide the exact spot:
      // the STANDING SLOT among whoever else is at this zone, so a crowd fans
      // out instead of stacking into one figure, and the IDLE WANDER, so a
      // character with nothing to do drifts a little rather than being a
      // statue. Both are deterministic on the agent id, so a character keeps
      // its place and its drift across frames.
      const occupants = this.#occupantsAt(node);
      const slot = zoneSlot(
        { gx: node.motion.gx, gy: node.motion.gy },
        agent.agentId,
        occupants,
      );
      const wander = node.motion.moving
        ? { gx: 0, gy: 0 }
        : wanderOffset(agent.agentId, this.#elapsedMs, { gx: node.motion.gx, gy: node.motion.gy });
      const finalGx = slot.position.gx + wander.gx;
      const finalGy = slot.position.gy + wander.gy;
      const moved = this.#projection.toScreen(finalGx, finalGy);
      node.screenX = moved.x;
      node.screenY = moved.y;
      node.sprite.position.set(moved.x, moved.y);
      node.sprite.zIndex = this.#projection.depth(finalGx, finalGy);
      // The ring follows the sprite, or a lit character leaves its own halo
      // behind as it walks.
      if (node.halo.visible) {
        node.halo.position.set(moved.x, moved.y);
        node.halo.zIndex = node.sprite.zIndex + 1;
      }

      // Walking outranks working. A character on its way to a job is on its
      // way, and playing `work` while sliding across the map is the one
      // combination that looks like a bug rather than a choice.
      const working = agent.tool !== undefined && !isWalking;

      if (working !== node.working) {
        node.working = working;
        node.frameMs = 0;
        node.frame = -1;
      } else {
        node.frameMs += step;
      }
      // `wasWalking` is read so a character that has just stopped restarts its
      // cycle: a pose frozen mid-stride is worse than one that is merely
      // stationary. The flag itself is kept on the node for the tests and the
      // diagnostics that say "how many are walking", not for this decision.
      if (wasWalking && !isWalking) {
        node.frameMs = 0;
        node.frame = -1;
      }
      node.walking = isWalking;

      // The line, and the bubble over the head that says it. Updated BEFORE the
      // texture work below, which `continue`s on a frame the art did not change —
      // a character whose pose is held still still has things to say.
      this.#updateBubble(node, working ? 'working' : isWalking ? 'walking' : 'idle');

      const frames = this.#cache.animationFor(agent.agentId, working, isWalking);
      if (frames === undefined || frames.length === 0) continue;

      const index = Math.floor(node.frameMs / FRAME_MS) % frames.length;
      if (index === node.frame) continue;
      node.frame = index;
      node.sprite.texture = frames[index]!;
    }

    // Message arcs age out here rather than on a loop of their own: this method
    // already runs on the frame loop, so a second one would be a second tick
    // per frame for a visual that lives 2.6 seconds. Bounded by
    // MAX_MESSAGE_ARCS, not by the number of agents.
    const alive = this.#arcs.filter((arc) => elapsedMs - arc.bornAtMs < MESSAGE_ARC_TTL_MS);
    if (alive.length !== this.#arcs.length) {
      this.#arcs = alive;
      this.#redrawArcs();
    }
  }

  /**
   * The line a character is saying, and the bubble that carries it.
   *
   * The bubble is a GRAPHICS panel with the words measured by a fixed-width
   * estimate, not a Pixi `Text`. That is a deliberate retreat from the obvious
   * implementation and the reason is the test environment: `new Text()` measures
   * by creating a canvas through the browser adapter, so constructing one in a
   * Node test throws `document is not defined` the moment anything reads its
   * width — which the layout does, to centre the panel.
   *
   * The estimate is a fixed advance per character in the game's pixel font. It
   * is not exact, and a font with proportional glyphs would make it wrong; this
   * one is a monospace pixel face, so a per-character advance IS the truth, and
   * a bubble laid out from it is the same width every time rather than a
   * measurement that changes with the font having loaded.
   */
  #updateBubble(node: UnitNode, activity: 'working' | 'idle' | 'walking'): void {
    const agent = node.agent;
    if (agent === undefined) return;
    const line = pickLine(agent.agentId, activity);
    if (line !== node.line) {
      node.line = line;
      const layout = layoutSpeechBubble(
        line,
        measurePixelText,
        { x: node.screenX, y: node.screenY },
        PLACEHOLDER_TILE_PX,
      );
      node.bubbleBackdrop
        .clear()
        .roundRect(0, 0, layout.panel.width, layout.panel.height, 4)
        .fill({ color: 0x0d1119, alpha: 0.92 })
        .stroke({ color: 0x3c4d75, width: 1 });
      // Each line is a row of small squares — bitmap-ish text built from the
      // same Graphics, so the bubble needs no font loaded and no DOM.
      node.bubbleText.clear();
      layout.lines.forEach((textLine, row) => {
        let x = layout.tailTip.x;
        for (const character of textLine) {
          // A dense dot-run standing in for a glyph run. Deliberately not text:
          // this must render in a Node test and in a browser identically.
          node.bubbleText.rect(x, layout.tailTip.y + row * BUBBLE_LINE_PX, GLYPH_DOT_PX, GLYPH_DOT_PX).fill({ color: 0xcfe0ff, alpha: 0.9 });
          x += measurePixelText(character);
        }
      });
      node.bubble.position.set(0, 0);
      node.bubbleX = layout.left;
      node.bubbleY = layout.top;
    }
    node.bubble.position.set(node.bubbleX, node.bubbleY);
    node.bubble.visible = agent.online;
  }

  /** Who else is standing at this unit's zone, for the fan-out. */
  #occupantsAt(node: UnitNode): readonly string[] {
    const agent = node.agent;
    if (agent === undefined) return [];
    return [...this.#units.values()]
      .filter((other) => other !== node && other.agent !== undefined && other.agent.zone === agent.zone)
      .map((other) => other.agent?.agentId)
      .filter((id): id is string => id !== undefined);
  }

  #remove(id: string): void {
    const node = this.#units.get(id);
    if (node === undefined) return;
    this.unitLayer.removeChild(node.sprite);
    this.unitLayer.removeChild(node.bubble);
    this.unitLayer.removeChild(node.halo);
    node.sprite.destroy();
    node.bubble.destroy({ children: true });
    node.halo.destroy();
    this.#units.delete(id);
  }

  /**
   * One marker per placed zone IN THIS SCENE, built once.
   *
   * Driven off the placement table so a zone added to `ZONE_PLACEMENT` appears
   * without a change here. The dependency runs one way — `zones.ts` decides
   * where things are, this draws them — which is why the view reads the table
   * instead of the view owning a list of buildings.
   *
   * The scene filter is the reason the three scenes are three. `ZONE_PLACEMENT`
   * is one table covering all of them, and each row says which scene it belongs
   * to; drawing the table unfiltered put the Arena and the Guild Hall on top of
   * the Coding City, so `/arena` and `/city` rendered the same picture.
   */
  /**
   * The road network for this scene, built once and reused.
   *
   * Nodes are the ZONES. A city where the workshop, the lab and the quest board
   * are joined by a road is a place with a layout; three of them in a field is
   * a map with props on it. The edge list is a ring plus two chords, which is
   * the smallest graph that gives a square more than four streets.
   *
   * Cached because `terrainSampler` asks about every cell of the grid, and
   * rebuilding the network per cell would be the same curve walked 1024 times.
   */
  #roads(): readonly (readonly { readonly gx: number; readonly gy: number; readonly hw: number }[])[] {
    if (this.#roadCache !== undefined) return this.#roadCache;
    const nodes: RoadNode[] = (Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[])
      .map((zone) => ZONE_PLACEMENT[zone])
      .filter((placement) => placement.scene === this.#scene.id)
      .map((placement) => ({ gx: placement.gx, gy: placement.gy }));
    const edges: [number, number][] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      edges.push([i, (i + 1) % nodes.length]);
      if (i + 2 < nodes.length) edges.push([i, i + 2]);
    }
    this.#roadCache = roadCurves(nodes, edges);
    return this.#roadCache;
  }

  /**
   * A sprite per scattered decoration, in this scene.
   *
   * The scatter itself is a pure function in `decorations.ts`; this is the part
   * that needs a projection and a cache. One sprite per placement, drawn once --
   * the same restraint as the FX layer, and for the same reason: `frame-loop`
   * has a budget and 1024 cells of scatter is a lot of children to add to it.
   */
  #buildDecorations(): Sprite[] {
    const placements = scatterDecorations({
      w: this.#scene.w,
      h: this.#scene.h,
      kindAt: terrainSampler(this.#scene.seed, (gx, gy) => pointOnRoad(this.#roads(), gx, gy)),
      clearOf: (Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[])
        .map((zone) => ZONE_PLACEMENT[zone])
        .filter((placement) => placement.scene === this.#scene.id),
    });

    return placements.flatMap((placement) => {
      const texture = this.#cache.get(
        spriteKey('deco', DECORATION_KINDS.indexOf(placement.kind)),
      );
      // A sheet that did not load draws nothing, which is more obviously right
      // than a coloured square pretending to be a tree.
      if (texture === undefined) return [];
      const at = this.#projection.toScreen(placement.gx, placement.gy);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      sprite.scale.set(PLACEHOLDER_SCALE);
      sprite.position.set(at.x, at.y);
      sprite.zIndex = this.#projection.depth(placement.gx, placement.gy);
      return [sprite];
    });
  }

  /**
   * A puff of particles over every zone in this scene that currently holds
   * agents.
   *
   * Deliberately not a per-frame emitter. This is drawn once per rebuild, so it
   * costs one container per zone and no update loop at all -- `delta-cost.test.ts`
   * already pins a frame budget for the 2000 events/s target in plan 7.2, and
   * the first thing in the client that updated particles every frame is exactly
   * how that budget gets spent by accident.
   */
  #buildActivityFx(): Container {
    const group = new Container();
    const texture = this.#cache.get(spriteKey('particle', 0));
    if (texture === undefined) return group;

    const busy = new Set<string>();
    for (const agent of this.#store.allAgents()) busy.add(agent.zone);

    for (const zone of Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[]) {
      const placement = ZONE_PLACEMENT[zone];
      if (placement.scene !== this.#scene.id) continue;
      if (!busy.has(zone)) continue;
      const at = this.#projection.toScreen(placement.gx, placement.gy);
      // Three puffs, fanned above the roofline. A fixed count, not a random
      // one: Math.random here would give every rebuild a different city, and
      // `terrain-map.ts` already set the precedent that a world which reshuffles
      // itself is noise rather than a place.
      for (const [index, offset] of [-14, 0, 14].entries()) {
        const puff = new Sprite(texture);
        puff.anchor.set(0.5);
        puff.alpha = 0.5 - index * 0.12;
        puff.scale.set(0.4);
        puff.position.set(at.x + offset, at.y - 26 - index * 7);
        puff.zIndex = this.#projection.depth(placement.gx, placement.gy) + 1;
        group.addChild(puff);
      }
    }
    return group;
  }

  /**
   * The doorways: one marker per zone that lives in ANOTHER scene.
   *
   * Without these the city has no visible Guild Hall and no visible Arena, and
   * a building you cannot see is not a building you can walk into. They are
   * drawn smaller and behind the in-scene markers, so the places of THIS scene
   * still read first and a doorway reads as "somewhere else" rather than as a
   * zone that happens to be far away.
   */
  #drawZones(): void {
    for (const zone of Object.keys(ZONE_PLACEMENT) as (keyof typeof ZONE_PLACEMENT)[]) {
      const placement = ZONE_PLACEMENT[zone];
      if (placement.scene !== this.#scene.id) continue;
      const screen = this.#projection.toScreen(placement.gx, placement.gy);
      // The zone rides in the key so the vendored art can answer "which
      // building" rather than "which colour": the Arena draws the arena and the
      // Guild Hall draws the guild. Without it every zone was the same tinted
      // square, keyed on a hash, and the Coding City had no landmarks in it.
      const marker = new Sprite(
        this.#cache.get(spriteKey('zone-marker', paletteIndexFor(zone), zone)),
      );
      marker.anchor.set(0.5, 0.5);
      marker.scale.set(PLACEHOLDER_SCALE);
      marker.position.set(screen.x, screen.y);
      // One behind the units, so an agent standing on a zone is in front of it.
      marker.zIndex = this.#projection.depth(placement.gx, placement.gy) - 1;
      this.zoneLayer.addChild(marker);
    }
  }
}

/**
 * A view that counts what it touches.
 *
 * The seam that makes the O(changes) property testable without a GPU, and the
 * reason `WorldViewLike` exists. `touches` accumulates every agent this view
 * applied, so a test asserts the number directly instead of inferring cost from
 * a frame time.
 */
export class CountingView implements WorldViewLike {
  readonly #store: WorldStore;
  readonly #live = new Set<string>();
  touches = 0;
  sweeps = 0;
  rebuilds = 0;
  resyncs = 0;

  constructor(store: WorldStore) {
    this.#store = store;
  }

  get nodeCount(): number {
    return this.#live.size;
  }

  applyAgentDelta(agentIds: readonly string[]): void {
    for (const id of agentIds) {
      this.touches += 1;
      if (this.#store.get(id) === undefined) this.#live.delete(id);
      else this.#live.add(id);
    }
  }

  sweep(): void {
    this.sweeps += 1;
    for (const id of [...this.#live]) {
      if (this.#store.get(id) === undefined) this.#live.delete(id);
    }
  }

  rebuild(): void {
    this.rebuilds += 1;
    this.touches += this.#store.size;
    this.#live.clear();
    for (const agent of this.#store.allAgents()) this.#live.add(agent.agentId);
  }
}
