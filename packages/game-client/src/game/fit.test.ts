import { describe, expect, it } from 'vitest';

import { PixiWorldView } from './view.js';
import { placementFor, ZONE_PLACEMENT } from '../zones.js';
import { DOORWAY_PLACEMENT } from './doorways.js';
import type { ZoneId } from '@battle-agents/protocol';
import { PLACEHOLDER_SCALE, TILE_WORLD_PX } from '../sprites/sprite-factory.js';
import { WorldStore } from '../state/store.js';
import { ARENA, CITY, GUILD_HALL, SCENES, type SceneConfig } from '../scenes/scene-config.js';

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

  it('brings EVERY placed zone inside it, not just the one that was reported', () => {
    // The reported symptom was one agent; the defect is the whole map, and a
    // fix aimed at the one placement would leave `battle-arena` off-screen.
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);

    // Driven off the placement TABLE rather than a hand-written list, for the
    // reason view.ts gives: a zone added to the table must appear without a
    // change here, and a list here would be a second copy that drifts.
    //
    // Scoped to the city, which is the change this test records: the table
    // covers all three scenes, and a zone belonging to the arena is not on the
    // city map to be brought into view.
    for (const zone of zonesIn(CITY)) {
      const point = screenOf(view, worldOf(zone));
      expect(
        point.x >= 0 && point.x <= VIEWPORT.width && point.y >= 0 && point.y <= VIEWPORT.height,
        `${zone} lands at (${Math.round(point.x)}, ${Math.round(point.y)}), outside ${VIEWPORT.width}x${VIEWPORT.height}`,
      ).toBe(true);
    }
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

  it('fits the one city, whatever its size, and does not throw on the empty ones', () => {
    // The defect this whole change exists for was that the view ignored its
    // scene. ONE city now, so the assertion is that it is fitted -- and that a
    // grid with nothing in it does not throw, because the two dead scenes are
    // still constructible until the next commit deletes them.
    for (const scene of SCENES.filter((candidate) => zonesIn(candidate).length > 0)) {
      const zones = zonesIn(scene);
      expect(zones.length, `${scene.id} has no zones in the placement table`).toBeGreaterThan(0);

      const view = aView(scene);
      view.fit(VIEWPORT.width, VIEWPORT.height);

      for (const zone of zones) {
        const point = screenOf(view, worldOf(zone));
        expect(
          point.x >= 0 &&
            point.x <= VIEWPORT.width &&
            point.y >= 0 &&
            point.y <= VIEWPORT.height,
          `${scene.id}/${zone} lands at (${Math.round(point.x)}, ${Math.round(point.y)}), outside ${VIEWPORT.width}x${VIEWPORT.height}`,
        ).toBe(true);
      }
    }
  });

  it('draws its own zones PLUS a doorway to each other scene', () => {
    // This asserted the opposite once, and the opposite is what was wrong.
    //
    // It used to read "draws only its own zones, so the arena is not the city
    // with an extra marker" -- a correct rule for a world whose scenes were
    // switched by pressing a tab, where the city showing the arena's marker was
    // a leak. It is not a leak any more: the city draws a doorway to the arena
    // and the guild hall BECAUSE they are buildings you walk to, and a place you
    // cannot see is not a place you can reach.
    //
    // So the property now is: every scene draws its own zones, plus one marker
    // per zone belonging to another scene, and the counts still differ between
    // scenes -- the arena is not the city, it is just reachable from it.
    const city = aView(CITY);
    const arena = aView(ARENA);
    const guild = aView(GUILD_HALL);
    // A doorway per OTHER SCENE, not per other-scene ZONE: `DOORWAY_PLACEMENT`
    // holds one cell per place you can travel to, and a scene with five zones
    // has one door, not five. Asserting against the zone table is what made this
    // read 12 when the truth is 2.
    // A doorway per place you can TRAVEL TO. A scene's own door is skipped --
    // you are already inside it -- which is why the guild hall has one doorway
    // and the city has two, and why counting the scene table gave 3 and 12.
    const other = (scene: (typeof SCENES)[number]): number =>
      zonesIn(scene).length +
      Object.entries(DOORWAY_PLACEMENT).filter(([zone]) => {
        const placement = ZONE_PLACEMENT[zone as ZoneId];
        return placement !== undefined && placement.scene !== scene.id;
      }).length;

    expect(city.zoneLayer.children.length).toBe(other(CITY));
    expect(arena.zoneLayer.children.length).toBe(other(ARENA));
    expect(guild.zoneLayer.children.length).toBe(other(GUILD_HALL));
    // The counts are now EQUAL, and that is the point: every scene draws its
    // own zones plus a doorway to every other scene, so the marker count is the
    // whole table. What still differs is WHICH are real, and that is the thing
    // worth asserting -- otherwise this test would pass for three views that
    // render identically.
    //
    // A doorway is drawn at 80% scale. So the guild hall, with one zone of its
    // own, has exactly one full-size marker, and the city has ten.
    const fullSize = (view: PixiWorldView): number =>
      view.zoneLayer.children.filter((child) => Math.abs(child.scale.x - PLACEHOLDER_SCALE) < 0.001).length;
    expect(fullSize(guild)).toBe(zonesIn(GUILD_HALL).length);
    expect(fullSize(city)).toBe(zonesIn(CITY).length);
    expect(fullSize(arena)).toBe(zonesIn(ARENA).length);
    expect(fullSize(city)).toBeGreaterThan(fullSize(guild));
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

  it('centres, so the map is not pinned to a corner', () => {
    const view = aView();
    view.fit(VIEWPORT.width, VIEWPORT.height);

    const worldPx = CITY.w * TILE_WORLD_PX * view.root.scale.x;
    expect(view.root.x).toBeCloseTo((VIEWPORT.width - worldPx) / 2, 6);
    expect(view.root.y).toBeCloseTo((VIEWPORT.height - worldPx) / 2, 6);
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

  it('refits when the viewport changes, rather than fitting once and staying wrong', () => {
    // The page resizes its canvas to its container, so a single fit at mount is
    // correct only until the window moves.
    const view = aView();
    view.fit(600, 300);
    const small = view.root.scale.x;
    view.fit(1200, 900);
    const large = view.root.scale.x;

    expect(large).toBeGreaterThan(small);
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
