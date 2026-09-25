import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import { parseRolloutLine, readNewRolloutLines } from './parsers/rollout.js';

/**
 * The rollout watcher: the whole adapter.
 *
 * There is no hook plane here, so there is one source of truth, one cursor and
 * no deduplication — which is the whole difference from the Claude adapter and
 * also the point. This file exists to prove the telemetry plane does not
 * secretly require a harness with an extension point.
 *
 * The batching limits are the ones the ingest endpoint accepts: 250ms or 50
 * events, well short of the 100-event refusal. An adapter that invented its own
 * policy would be refused by the very endpoint it posts to.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

export interface CodexWatcherOptions {
  readonly send: BatchSender;
  readonly rolloutPath: string;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
}

/**
 * The agent-quest precedent is two to three seconds, not the template's 500ms.
 * A rollout is written after the fact rather than pushed, so there is no event
 * to lose by waiting — and polling a file twice a second for a session that
 * produces a tool call every ten seconds is cost with no benefit.
 */
const DEFAULT_POLL_INTERVAL_MS = 2_500;

export class CodexWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #rolloutPath: string;
  readonly #pollIntervalMs: number;
  readonly #buffer: EventBuffer;
  #offset = 0;
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;

  constructor(options: CodexWatcherOptions) {
    this.#send = options.send;
    this.#rolloutPath = options.rolloutPath;
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#buffer = new EventBuffer(
      { flushIntervalMs: 250, maxBatchEvents: 50, maxRejectEvents: 100, retryAfterSeconds: 1 },
      options.now === undefined ? {} : { now: options.now },
    );
  }

  /**
   * How many lines produced no event.
   *
   * Counted rather than logged, because a Codex upgrade that changes the
   * rollout format should be a number somebody notices, not a stream that
   * quietly went quiet and looked like an idle agent.
   */
  get skippedCount(): number {
    return this.#skipped;
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
   * The flush is awaited. A void stop makes the last batch fire-and-forget, and
   * the session ends with events delivered after the runtime has torn down.
   */
  async stop(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    const remaining = this.#buffer.flush();
    if (remaining.length > 0) await this.#send(remaining);
  }

  async tick(): Promise<void> {
    const { lines, offset } = await readNewRolloutLines(this.#rolloutPath, this.#offset);
    this.#offset = offset;

    for (const line of lines) {
      const { event } = parseRolloutLine(line);
      if (event === null) {
        this.#skipped += 1;
        continue;
      }
      const batch = this.#buffer.push(event);
      if (batch !== undefined) await this.#send(batch);
    }

    const due = this.#buffer.flushIfDue();
    if (due !== undefined) await this.#send(due);
  }
}
