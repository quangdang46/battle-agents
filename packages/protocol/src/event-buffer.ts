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

  constructor(limits: BatchLimits, options: EventBufferOptions = {}) {
    this.#limits = limits;
    this.#now = options.now ?? (() => Date.now());
  }

  /** Adds an event, returning a batch if this push filled the buffer. */
  push(event: AgentEvent): readonly AgentEvent[] | undefined {
    if (this.#events.length === 0) {
      this.#firstBufferedAt = this.#now();
    }
    this.#events.push(event);
    return this.#events.length >= this.#limits.maxBatchEvents ? this.flush() : undefined;
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
    return batch;
  }

  /** How many events are waiting. */
  get size(): number {
    return this.#events.length;
  }
}
