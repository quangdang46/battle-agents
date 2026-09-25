/**
 * Batching on the way in, and the buffer that does it.
 *
 * These four shapes moved here from apps/web/src/event-batch.ts, and the move
 * is not tidiness. An adapter has to buffer events before it posts a batch, and
 * the dependency rules forbid an adapter importing apps/web, so the buffer was
 * either lifted here or reimplemented per adapter. Reimplementing is how two
 * copies drift, and the drift shows up as a batching bug that looks like a
 * flaky ingest path.
 *
 * What stayed in apps/web is the half that is server concern: reading the limits
 * out of the environment, and parsing a request body. The buffer, the limits
 * and their defaults are shared vocabulary, and shared vocabulary belongs in the
 * package both sides may import.
 *
 * The buffer is pure by construction and owns no timer. The caller drives it
 * with `flushIfDue()` on whatever cadence it already has, and `push()` returns
 * a batch by itself the moment the buffer is full. That split keeps the timing
 * decision with the caller and the batching decision here, and it lets a test
 * prove the 250ms boundary by moving an injected clock rather than by sleeping.
 */

import type { AgentEvent } from './agent-event.js';

/** The three batching limits plus the backoff the refusal advertises. */
export interface BatchLimits {
  /** How long the client waits for more events before flushing. */
  readonly flushIntervalMs: number;
  /** How many events the client puts in one batch before flushing early. */
  readonly maxBatchEvents: number;
  /** Above this the server refuses the batch outright (413 + Retry-After). */
  readonly maxRejectEvents: number;
  /** The `Retry-After` a refused batch advertises, in whole seconds. */
  readonly retryAfterSeconds: number;
}

export const DEFAULT_BATCH_LIMITS: BatchLimits = {
  flushIntervalMs: 250,
  maxBatchEvents: 50,
  maxRejectEvents: 100,
  retryAfterSeconds: 1,
};

export interface EventBufferOptions {
  /** Injectable so a test can advance time without sleeping. */
  readonly now?: () => number;
}

export class EventBuffer {
  readonly #limits: BatchLimits;
  readonly #now: () => number;
  #events: AgentEvent[] = [];
  #firstBufferedAt: number | undefined;
  /**
   * The session the current window belongs to.
   *
   * A batch carries events for exactly ONE session, and the server refuses a
   * mixed batch with a 400 naming the offending id. The buffer had no notion of
   * a session, so an adapter watching more than one harness session — which is
   * the normal case the moment a second file is discovered — produced a batch
   * that was refused outright, losing up to maxBatchEvents events per occurrence.
   *
   * Codex was safe only by accident: one rollout file is one session. Pi, gemini
   * and opencode are not. Four adapter beads found this independently and each
   * proposed fixing it in its own watcher, which is precisely the two-copies-
   * drift failure that moving this buffer into protocol was meant to prevent.
   * Fixed here, once, so every adapter inherits it.
   */
  #sessionId: string | undefined;

  constructor(limits: BatchLimits, options: EventBufferOptions = {}) {
    this.#limits = limits;
    this.#now = options.now ?? (() => Date.now());
  }

  /**
   * Adds an event, returning a batch if this push filled the buffer or
   * completed a session.
   *
   * On a session change the batch returned is the COMPLETED one and the incoming
   * event starts the next window. The incoming event is buffered rather than
   * dropped: returning early without adding it would lose it whenever no further
   * push arrived, which is the normal state of an idle session.
   */
  push(event: AgentEvent): readonly AgentEvent[] | undefined {
    const completesSession =
      this.#events.length > 0 &&
      this.#sessionId !== undefined &&
      event.sessionId !== this.#sessionId;

    if (completesSession) {
      // Split BEFORE the incoming event is added. flush() hands back the
      // finished window and resets the state, and #add then opens a new one
      // around the event the caller just handed over — so nothing is dropped
      // when no further push ever arrives, which is the normal state of an idle
      // session. Doing it the other way round has to take the event back out
      // again, and popping in place aliases the array the caller is about to
      // receive.
      const completed = this.flush();
      this.#add(event);
      return completed;
    }

    this.#add(event);
    return this.#events.length >= this.#limits.maxBatchEvents ? this.flush() : undefined;
  }

  /** Adds an event, starting the timer window when the buffer was empty. */
  #add(event: AgentEvent): void {
    if (this.#events.length === 0) {
      this.#firstBufferedAt = this.#now();
      this.#sessionId = event.sessionId;
    }
    this.#events.push(event);
  }

  /** Returns a batch if the flush interval has elapsed since the first event. */
  flushIfDue(): readonly AgentEvent[] | undefined {
    if (this.#events.length === 0 || this.#firstBufferedAt === undefined) {
      return undefined;
    }
    return this.#now() - this.#firstBufferedAt >= this.#limits.flushIntervalMs
      ? this.flush()
      : undefined;
  }

  /** Returns whatever is buffered, empty or not, and resets the window. */
  flush(): readonly AgentEvent[] {
    const batch = this.#events;
    this.#events = [];
    this.#firstBufferedAt = undefined;
    this.#sessionId = undefined;
    return batch;
  }

  /** How many events are waiting. */
  get size(): number {
    return this.#events.length;
  }

  /** The session the current window belongs to, for a caller that wants to know. */
  get sessionId(): string | undefined {
    return this.#sessionId;
  }
}
