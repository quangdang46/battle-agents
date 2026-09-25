import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import {
  codexSessionsDirectory,
  listRolloutFiles,
  parseRolloutLine,
  readNewRolloutLines,
} from './parsers/rollout.js';

/**
 * The rollout watcher: the whole adapter.
 *
 * There is no hook plane here, so there is one source of truth, one cursor per
 * rollout and no deduplication — which is the whole difference from the Claude
 * adapter and also the point. This file exists to prove the telemetry plane does
 * not secretly require a harness with an extension point.
 *
 * The batching limits are the ones the ingest endpoint accepts: 250ms or 50
 * events, well short of the 100-event refusal. An adapter that invented its own
 * policy would be refused by the very endpoint it posts to.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

/**
 * Either a rollout to follow, or a tree to find one in. Never both and never
 * neither, so the compiler forces the choice rather than leaving a watcher that
 * quietly watches nothing.
 */
export type CodexWatcherOptions = {
  readonly send: BatchSender;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
} & (
  | { readonly rolloutPath: string; readonly sessionsRoot?: never }
  | { readonly rolloutPath?: never; readonly sessionsRoot?: string }
);

/**
 * The agent-quest precedent is two to three seconds, not the template's 500ms.
 * A rollout is written after the fact rather than pushed, so there is no event
 * to lose by waiting — and polling a file twice a second for a session that
 * produces a tool call every ten seconds is cost with no benefit.
 */
const DEFAULT_POLL_INTERVAL_MS = 2_500;

export class CodexWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  /** Set when a caller names the file; then nothing is discovered. */
  readonly #pinnedPath: string | undefined;
  readonly #sessionsRoot: string;
  readonly #pollIntervalMs: number;
  readonly #buffer: EventBuffer;
  /** One byte cursor per rollout, because several can be open at once. */
  readonly #cursors = new Map<string, number>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;
  #failedBatches = 0;
  #lastFailure: string | undefined;
  #discovered = false;

  constructor(options: CodexWatcherOptions) {
    this.#send = options.send;
    this.#pinnedPath = options.rolloutPath;
    this.#sessionsRoot = options.sessionsRoot ?? codexSessionsDirectory();
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

  /**
   * How many batches the ingest endpoint refused, and why the last one did.
   *
   * Counted rather than thrown, for the same reason `skippedCount` counts: a
   * watcher whose poll dies on the first refused POST is a stream that stops and
   * looks like an idle agent. The events in a refused batch are gone either way,
   * so the honest record is a number somebody can see and a reason that says
   * which of the three failures it was — a 401 and a 404 are a credential
   * problem and a registration problem, and they are not the same fix.
   */
  get failedBatchCount(): number {
    return this.#failedBatches;
  }

  get lastFailure(): string | undefined {
    return this.#lastFailure;
  }

  /**
   * Posts one batch, absorbing a refusal.
   *
   * Absorbing it is a decision, not an oversight, and it is the only place in
   * this adapter that swallows an error. The alternative is an interval whose
   * rejected promise nobody awaits, which in Node takes the process down — a
   * telemetry adapter that dies because one POST was refused costs more than
   * the batch it lost. A caller that wants the exception composes the sender
   * itself; `createIngestSender` throws, and only the poll loop here declines to.
   */
  async #deliver(batch: readonly AgentEvent[]): Promise<void> {
    try {
      await this.#send(batch);
    } catch (error) {
      this.#failedBatches += 1;
      this.#lastFailure = error instanceof Error ? error.message : String(error);
    }
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
    if (remaining.length > 0) await this.#deliver(remaining);
  }

  async tick(): Promise<void> {
    for (const [path, cursor] of await this.#tracked()) {
      const { lines, offset } = await readNewRolloutLines(path, cursor);
      this.#cursors.set(path, offset);

      for (const line of lines) {
        const { event } = parseRolloutLine(line);
        if (event === null) {
          this.#skipped += 1;
          continue;
        }
        const batch = this.#buffer.push(event);
        if (batch !== undefined) await this.#deliver(batch);
      }
    }

    const due = this.#buffer.flushIfDue();
    if (due !== undefined) await this.#deliver(due);
  }

  /**
   * The rollouts this poll reads, each with the cursor it stopped at.
   *
   * A cursor per file rather than one for the watcher, because a second `codex`
   * can start while the first is still running and both are still being
   * appended to. Restarting a single cursor at the newer file would re-read the
   * older one from the beginning the moment it was written to again, which is
   * the duplicate the brief warns a naive reader produces.
   */
  async #tracked(): Promise<ReadonlyMap<string, number>> {
    if (this.#pinnedPath !== undefined) {
      if (!this.#cursors.has(this.#pinnedPath)) this.#cursors.set(this.#pinnedPath, 0);
      return this.#cursors;
    }

    const found = await listRolloutFiles(this.#sessionsRoot);
    const present = new Set(found.map((file) => file.path));
    if (!this.#discovered) {
      // The first listing is a snapshot of sessions that were already over.
      // Adopting each one at its end is what `tail -f` does to a file that
      // existed before it started, and the alternative — replaying a year of
      // finished sessions as live activity — is worse than losing the opening
      // turns of the one session that was already in progress.
      for (const file of found) this.#cursors.set(file.path, file.size);
      this.#discovered = true;
    } else {
      // A rollout that appeared since is a session that began while this watcher
      // was running, so all of it is news and its cursor starts at zero.
      for (const file of found) {
        if (!this.#cursors.has(file.path)) this.#cursors.set(file.path, 0);
      }
    }
    // Forget a rollout that is gone. The bytes its cursor points at are not
    // coming back, and keeping the cursor means reading a future session that
    // happens to be created at the same path from wherever the old one ended.
    for (const path of [...this.#cursors.keys()]) {
      if (!present.has(path)) this.#cursors.delete(path);
    }
    return this.#cursors;
  }
}
