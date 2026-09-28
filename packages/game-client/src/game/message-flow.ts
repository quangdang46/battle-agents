/**
 * A message crossing the city from one agent to another.
 *
 * Adapted from `.tmp/agent-move/packages/client/src/effects/message-flow.ts`
 * (see THIRD-PARTY-NOTICES.md), which drew an arc plus a travelling token.
 *
 * ## What changed, and it is not a detail
 *
 * The reference samples and redraws on a frame loop, because it was written for
 * a handful of agents. This city had 101 of them, and its sibling effect
 * (`agent-trails.ts`, 20 points per agent redrawn per frame) works out to two
 * thousand circles every frame for a visual that is on screen for four seconds.
 * `delta-cost.test.ts` exists to catch exactly that, and the frame budget it
 * pins is for plan 7.2's 2000 events/s.
 *
 * So the geometry is kept and the loop is not: an arc is created ONCE per
 * `message.sent`, drawn once, and aged out on a timer. The number alive at any
 * moment is capped. A message that arrives after the cap simply draws nothing,
 * which is the right answer -- a burst of traffic should not be able to spend the
 * frame budget of the whole world.
 */

/** How many arcs may be alive at once. */
export const MAX_MESSAGE_ARCS = 24;

/** How long an arc is on screen, in ms. */
export const MESSAGE_ARC_TTL_MS = 2_600;

export interface MessageArc {
  /** Grid-space endpoints, so the arc is independent of the projection. */
  readonly fromG: readonly [number, number];
  readonly toG: readonly [number, number];
  /** The tool or topic, which is also what colours the arc. */
  readonly subject: string | undefined;
  /** 0..1 along the flight, so a renderer can place a token on it. */
  readonly progress: number;
  readonly bornAtMs: number;
}

/**
 * The point on a message's flight at `progress`, in grid space.
 *
 * A quadratic Bézier whose control point is lifted above the midpoint, so the
 * arc goes OVER whatever is between the two agents rather than through the
 * buildings. The lift is proportional to the distance, because a message across
 * the city should not leave the ground and one across the plaza should not
 * become a parabola.
 */
export function arcPoint(arc: MessageArc, at: number = arc.progress): { gx: number; gy: number } {
  const [ax, ay] = arc.fromG;
  const [bx, by] = arc.toG;
  const distance = Math.hypot(bx - ax, by - ay) || 1;
  const lift = Math.min(6, distance * 0.35);
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2 - lift;
  const mt = 1 - at;
  return {
    gx: mt * mt * ax + 2 * mt * at * cx + at * at * bx,
    gy: mt * mt * ay + 2 * mt * at * cy + at * at * by,
  };
}

/**
 * Adds a message, or nothing if the cap is reached or the pair is unusable.
 *
 * `sender` and `recipient` are grid positions, and `undefined` for either is a
 * normal outcome -- an agent that has gone offline mid-send, or a message whose
 * recipient is in another scene. A message with no visible arc is not an error;
 * it is a message between two places this view cannot see, and inventing a
 * destination for it would be a lie in pixels.
 */
export function messageArcs(options: {
  readonly live: readonly MessageArc[];
  readonly fromG: readonly [number, number] | undefined;
  readonly toG: readonly [number, number] | undefined;
  readonly subject: string | undefined;
  readonly nowMs: number;
}): readonly MessageArc[] {
  const kept = options.live.filter(
    (arc) => options.nowMs - arc.bornAtMs < MESSAGE_ARC_TTL_MS,
  );
  if (options.fromG === undefined || options.toG === undefined) return kept;
  if (kept.length >= MAX_MESSAGE_ARCS) return kept;
  return [
    ...kept,
    { fromG: options.fromG, toG: options.toG, subject: options.subject, progress: 0, bornAtMs: options.nowMs },
  ];
}
