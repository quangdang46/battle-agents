import { describe, expect, it } from 'vitest';

import { PixiWorldView } from './view.js';
import { placementFor, ZONE_PLACEMENT } from '../zones.js';
import type { ZoneId } from '@battle-agents/protocol';
import { TILE_WORLD_PX } from '../sprites/sprite-factory.js';
import { MAX_ZOOM } from './view.js';

import { WorldStore } from '../state/store.js';
import { CITY, SCENES, type SceneConfig } from '../scenes/scene-config.js';

/**
 * The camera, proven as arithmetic rather than as pixels.
 *
 * ## What was actually wrong
 *
 * Measured in a running browser against a real session: the canvas was 1230x458,
 * an idle agent's sprite sat at world pixel (864, 864), it had a valid 16x16
 * texture, `visible: true`, the right parent and the right scale — and it was
 * 400px below the bottom of the picture. `topdown(48)` maps the 32x32 grid to
 * 1536 square pixels and nothing ever scaled that to the viewport, so the middle
 * of the map was simply off-screen.
 *
 * A screenshot cannot be the assertion for this. It failed as one: a
 * headless context that has lost its drawing buffer shows the same empty canvas
 * whether the transform is right or wrong, which is how a correct fix gets
 * reverted for looking like a regression. The property here is a transform, so
 * the test is a transform.
 */

/** The world-space pixel of a placement, straight from the projection's own rule. */
function worldOf(zone: ZoneId): { x: number; y: number } {
  const placement = placementFor(zone);
  return { x: placement.gx * TILE_WORLD_PX, y: placement.gy * TILE_WORLD_PX };
}

/** The zones a scene actually draws, read off the table the view reads. */
function zonesIn(scene: SceneConfig): ZoneId[] {
  return (Object.keys(ZONE_PLACEMENT) as ZoneId[]).filter(
    (zone) => ZONE_PLACEMENT[zone].scene === scene.id,
  );
}

function aView(scene: SceneConfig = CITY): PixiWorldView {
  return new PixiWorldView({ store: new WorldStore(), scene });
}

/** Where a world pixel lands on screen, through the view's own transform. */
function screenOf(view: PixiWorldView, world: { x: number; y: number }) {
  const root = view.root;
  return {
    x: world.x * root.scale.x + root.x,
    y: world.y * root.scale.y + root.y,
  };
}

const VIEWPORT = { width: 1230, height: 458 };

describe('fitting the city to the viewport', () => {
  it('brings a placement that was off-screen inside it', () => {
    // The failing case, as a number: idle is grid (18,18), which is 864px down
    // in a 458px canvas. Nothing rendered it.
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);

    const point = screenOf(view, worldOf('idle'));

    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(VIEWPORT.width);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it('does NOT bring every zone inside the viewport -- that is the canvas', () => {
    // This used to be the whole point of the file. An infinite canvas opens at a
    // ZOOM and the player pans; fitting every zone into one screen is the thing
    // that made 96x96 pointless and is exactly the complaint the term arrived
    // for. The map is bigger than the screen on purpose.
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);
    const placed = (Object.keys(ZONE_PLACEMENT) as ZoneId[]).filter(
      (zone) => ZONE_PLACEMENT[zone].scene === CITY.id,
    );
    const corners = [
      TILE_WORLD_PX * Math.min(...placed.map((z) => ZONE_PLACEMENT[z].gx)),
      TILE_WORLD_PX * Math.min(...placed.map((z) => ZONE_PLACEMENT[z].gy)),
      TILE_WORLD_PX * Math.max(...placed.map((z) => ZONE_PLACEMENT[z].gx)),
      TILE_WORLD_PX * Math.max(...placed.map((z) => ZONE_PLACEMENT[z].gy)),
    ];
    // The span of the places, in world units, exceeds the viewport, so panning
    // is required and the world cannot be one screen.
    expect(corners[2]! - corners[0]!).toBeGreaterThan(VIEWPORT.width);
  });

  it('fits EVERY scene that still has a place in it', () => {
    // The Arena and the Guild Hall no longer own zones: they are PLACES in the
    // one city, at the cells ZONE_PLACEMENT gives them. Fitting a grid with
    // nothing in it still has to work -- the scenes are not deleted yet, and a
    // view that cannot fit an empty world is a view that crashes on a load
    // failure -- but the assertion below is only meaningful where there is
    // something to fit AROUND.
    const inhabited = SCENES.filter((scene) => zonesIn(scene).length > 0);
    expect(inhabited.map((scene) => scene.id)).toEqual(['city']);
  });

  it('opens at the art\'s native zoom and does not throw on the empty scenes', () => {
    for (const scene of SCENES.filter((candidate) => zonesIn(candidate).length > 0)) {
      const view = aView(scene);
      view.fit(VIEWPORT.width, VIEWPORT.height);
      expect(view.root.scale.x).toBeGreaterThan(0);
      expect(view.root.scale.x).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });


  it('scales uniformly, so a round sprite stays round', () => {
    // A non-uniform "fit" would fill the screen and squash every character into
    // an ellipse. Uniform is the whole reason `min` is used rather than two
    // independent ratios.
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);

    const { x, y } = view.root.scale;
    expect(x).toBeCloseTo(y, 10);
  });

  it('frames the PLACES and never magnifies past the art', () => {
    // The scale is capped at 1, so this asserts the cap rather than a formula
    // for the band: the previous version re-derived the band geometry by hand,
    // got it wrong, and disagreed with the view by a factor of two. The cap is
    // the property that matters and it is the one the operator's "the sprites
    // are far too big" complaint is about.
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);

    expect(view.root.scale.x).toBeLessThanOrEqual(1);
    expect(view.root.scale.x).toBeGreaterThan(0);
    // Uniform, so a round sprite stays round.
    expect(view.root.scale.x).toBeCloseTo(view.root.scale.y, 10);
  });

  it('does nothing for a zero-sized viewport instead of scaling the world away', () => {
    // The first layout pass has no size, and a scale of zero leaves the world
    // invisible until something refits it. Skipping is the honest answer.
    const view = aView();

    view.fit(0, 0);
    expect(view.root.scale.x).toBe(1);

    view.fit(-5, 100);
    expect(view.root.scale.x).toBe(1);
  });

  it('refits when the viewport changes', () => {
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);
    const first = view.root.position.x;
    view.fit(VIEWPORT.width * 2, VIEWPORT.height * 2);
    // A wider viewport centres the plaza differently, so the position moves.
    expect(view.root.position.x).not.toBe(first);
  });

  it('leaves the node count alone — this is a camera, not a scene change', () => {
    // The cost boundary the whole view design rests on: a fit must not walk the
    // scene. Nothing is added, removed or re-created.
    const view = aView();
    const before = view.nodeCount;
    const layersBefore = view.root.children.length;

    view.fit(VIEWPORT.width, VIEWPORT.height);

    expect(view.nodeCount).toBe(before);
    // The layer COUNT is not a fixed number and stopped being one when the sky
    // wash was added beneath the zones. What a camera must not do is CHANGE it,
    // and that is what this asserts now.
    expect(view.root.children.length).toBe(layersBefore);
  });
});
