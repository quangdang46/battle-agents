import type { AgentWatcher } from '@battle-agents/core';
import { EventBuffer, type AgentEvent } from '@battle-agents/protocol';

/**
 * A watcher skeleton: watch a harness, normalise, buffer, post.
 *
 * `AgentWatcher` is two methods and this is the whole shape of an adapter. What
 * makes it real is the loop underneath, and that loop is four steps in the same
 * order every time: read whatever the harness wrote, translate it, buffer it,
 * and flush on whichever of the two limits arrives first.
 *
 * `stop()` returns a Promise because a watcher has a flush to await on the way
 * down. A `void` stop makes that flush fire-and-forget, and the session then
 * ends with events either dropped or delivered after the runtime has torn
 * down. That was a deliberate departure from the reference implementation,
 * which returns void; the reasoning is recorded in `hook-provider.ts` in core.
 */

/** Where a watcher sends a batch. Injected so a test does not need a server. */
export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

export interface WatcherOptions {
  /** Called with each batch. The only thing a watcher does with the network. */
  readonly send: BatchSender;
  /** How often to check the harness's files, in milliseconds. */
  readonly pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 500;

/**
 * The loop, without a harness-specific reader.
 *
 * `readNewRecords` is the one function a new adapter has to supply. Everything
 * below it is already correct, which is the point: an adapter should be the
 * shape of a harness, not a reimplementation of batching.
 */
export class TemplateWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #buffer: EventBuffer;
  readonly #pollIntervalMs: number;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly readNewRecords: () => readonly AgentEvent[],
    options: WatcherOptions,
  ) {
    this.#send = options.send;
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#buffer = new EventBuffer(defaults());
  }

  async start(): Promise<void> {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => {
      void this.tick();
    }, this.#pollIntervalMs);
    await this.tick();
  }

  /**
   * Stops and flushes.
   *
   * The flush is awaited, and the buffer is flushed unconditionally rather than
   * only when due: a shutdown is exactly the case where a partial batch still
   * belongs in the record.
   */
  async stop(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    await this.flush();
  }

  private async tick(): Promise<void> {
    for (const event of this.readNewRecords()) {
      // push() hands back a batch by itself the moment the buffer is full, so
      // the size limit does not need its own check here.
      const batch = this.#buffer.push(event);
      if (batch !== undefined) await this.#send(batch);
    }
    const due = this.#buffer.flushIfDue();
    if (due !== undefined) await this.#send(due);
  }

  private async flush(): Promise<void> {
    const remaining = this.#buffer.flush();
    if (remaining.length > 0) await this.#send(remaining);
  }
}

/** The shared defaults, so an adapter does not invent its own. */
function defaults() {
  return {
    flushIntervalMs: 250,
    maxBatchEvents: 50,
    maxRejectEvents: 100,
    retryAfterSeconds: 1,
  };
}
