/**
 * The frame loop: a delta-capped rAF that coalesces.
 *
 * Plan section 25 asks for a "delta-cap rAF loop (pixel-agents gameLoop.ts
 * pattern)" and, separately, for diff updates. Those are two halves of one
 * problem and the second half is the one that is easy to get wrong twice.
 *
 * **Coalescing.** If a burst of K events lands between two frames, a loop that
 * renders per event runs the renderer K times for one frame of visual change. At
 * the ingest rates this repository targets (plan section 7.2 mentions 2000
 * events/s) that is not a slow frame, it is a stalled tab, and it looks
 * identical to a slow frame in a screenshot. So the loop takes a set of dirty
 * ids, drains it, and renders ONCE. K events, one render.
 *
 * **The cap.** Coalescing alone is unbounded: a client that is slow to drain
 * accumulates work faster than it retires it and the lag grows without limit.
 * `MAX_EVENTS_PER_FRAME` is the ceiling on how much one frame will absorb, and
 * crossing it RESETS rather than continuing. Resetting is the correct response
 * and not a shrug, because it mirrors the server's own rule: a subscriber that
 * falls more than `maxSubscriberLag` frames behind is CLOSED, not skipped. A
 * delta stream cannot survive a gap — a client that missed an event and kept
 * going would be permanently wrong, with nothing to tell it. So the client
 * applies the same rule to itself: too far behind means stop patching and
 * rebuild from the next snapshot.
 *
 * The renderer is injected rather than imported, which is what makes both
 * properties testable. A loop that owned its renderer could only be tested by
 * rendering, and a test that renders proves nothing about how many times the
 * renderer was called.
 */

import type { StoreChange } from '../state/store.js';

/**
 * Frame-time budget for the delta path, in milliseconds.
 *
 * A DECISION, recorded here because the bead is explicit that it must exist and
 * be asserted, and that "fast enough" is the thing the clause was actually
 * trying to say. 60fps is 16.67ms; the delta path is given an eighth of that
 * because it is not the only thing in a frame (the GPU draw is), and a budget
 * that consumed the whole frame would be met only by a client that also drew
 * nothing.
 *
 * If a measurement on the pinned fixture comes in over this, the number is
 * wrong and gets changed — but it does not get deleted, because a budget nobody
 * asserts is a comment.
 */
export const DELTA_FRAME_BUDGET_MS = 2;

/**
 * How many events one frame will absorb before it gives up and resyncs.
 *
 * 1024, because that is the number the server already closes a subscriber at
 * (`DEFAULT_MAX_SUBSCRIBER_LAG`). The two must agree: a client that tolerated
 * more backlog than the server would keep rendering deltas for a stream that
 * had already been closed underneath it, and would be wrong with no signal.
 */
export const MAX_EVENTS_PER_FRAME = 1024;

/** What the loop needs from whoever is rendering. */
export interface FrameRenderer {
  /**
   * Applies the agents that changed since the last frame.
   *
   * Takes ids, never the store, so the renderer physically cannot walk the
   * whole scene even by accident.
   */
  render(agentIds: readonly string[]): void;
  /** Called when the loop has decided the delta stream is untrustworthy. */
  resync(): void;
}

export interface FrameLoopOptions {
  readonly renderer: FrameRenderer;
  /**
   * The scheduler. `requestAnimationFrame` in a browser; injected in a test so
   * a frame is a function call rather than a timer.
   */
  readonly schedule?: (callback: () => void) => void;
}

/**
 * The browser's frame scheduler, reached without naming the global.
 *
 * A local declaration rather than `globalThis.requestAnimationFrame` because the
 * ROOT tsconfig has no DOM lib — it typechecks every package, and a direct
 * reference to a DOM global fails there while passing in this package's own
 * tsconfig, which does include DOM. That asymmetry is the worst kind of
 * typecheck result: green in the package, red in the gate. Going through a
 * narrow local type compiles under both.
 */
const frameScheduler = globalThis as unknown as {
  requestAnimationFrame: (callback: () => void) => void;
};

export class FrameLoop {
  readonly #renderer: FrameRenderer;
  readonly #schedule: (callback: () => void) => void;
  readonly #pending = new Set<string>();
  #resyncRequested = false;
  #frames = 0;
  #overflows = 0;
  #running = false;

  constructor(options: FrameLoopOptions) {
    this.#renderer = options.renderer;
    this.#schedule =
      options.schedule ??
      ((callback) => {
        frameScheduler.requestAnimationFrame(callback);
      });
  }

  /**
   * Records a store change. Safe to call from inside a frame: the ids land in
   * the pending set and are picked up next frame rather than re-entering the
   * renderer, which is what stops a store that publishes during a render from
   * recursing.
   */
  ingest(change: StoreChange): void {
    if (change.kind === 'resync') {
      this.#resyncRequested = true;
      this.#pending.clear();
      return;
    }
    for (const id of change.agentIds) this.#pending.add(id);
  }

  /** Marks the world as needing a fresh snapshot. */
  requestResync(): void {
    this.#resyncRequested = true;
    this.#pending.clear();
  }

  /**
   * Runs one frame: drain, render once, schedule the next.
   *
   * Returns what the frame did, so a test can assert the coalescing without
   * counting renderer calls from the outside.
   */
  frame(): { readonly rendered: number; readonly resynced: boolean } {
    this.#frames += 1;

    if (this.#resyncRequested) {
      this.#resyncRequested = false;
      this.#pending.clear();
      this.#renderer.resync();
      return { rendered: 0, resynced: true };
    }

    if (this.#pending.size > MAX_EVENTS_PER_FRAME) {
      // Past the cap the backlog is not a slow frame, it is a lost stream.
      // Clearing rather than rendering the first N is the whole point: the
      // events being dropped are the ones the cap exists to admit are lost.
      this.#overflows += 1;
      this.#pending.clear();
      this.#renderer.resync();
      return { rendered: 0, resynced: true };
    }

    if (this.#pending.size === 0) return { rendered: 0, resynced: false };

    // Snapshot-and-clear before rendering, so a renderer that ingests more
    // changes does not mutate the set being iterated.
    const batch = [...this.#pending];
    this.#pending.clear();
    this.#renderer.render(batch);
    return { rendered: batch.length, resynced: false };
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    const tick = (): void => {
      this.frame();
      if (this.#running) this.#schedule(tick);
    };
    this.#schedule(tick);
  }

  stop(): void {
    this.#running = false;
  }

  /** Events waiting for the next frame. For tests and diagnostics. */
  get pending(): number {
    return this.#pending.size;
  }

  get frames(): number {
    return this.#frames;
  }

  /** How many times a frame gave up and asked for a snapshot. */
  get overflows(): number {
    return this.#overflows;
  }
}
