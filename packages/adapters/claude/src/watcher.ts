import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import {
  createHookLedger,
  isAlreadyReported,
  parseJsonlLine,
  readNewLines,
  recordReported,
  type HookLedger,
} from './parsers/jsonl.js';

/**
 * Both planes, one buffer, one stream.
 *
 * The hook plane pushes in as it happens; the JSONL tail polls for whatever the
 * hooks missed. They share a buffer so the batching policy is the one the
 * ingest endpoint actually accepts — 250ms or 50 events, well short of the
 * 100-event refusal — and an adapter that invented a second policy would be
 * refused by the very endpoint it is posting to.
 *
 * The dedup ledger is the seam between them, and it belongs here rather than in
 * either plane. The hook plane records what it emitted; the tail asks whether
 * the line it just read was already reported. Deciding that inside the parser
 * would make the same transcript line correct in one deployment and a
 * duplicate in another depending on whether hooks were healthy, and the policy
 * would be unreachable from a test.
 *
 * The tail wins ties in the other direction: when hooks were not running at
 * all, the ledger is empty and every line through it reaches the stream, which
 * is the whole point of keeping a net.
 */

/** Where a watcher sends a batch. Injected so a test does not need a server. */
export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

export interface ClaudeWatcherOptions {
  readonly send: BatchSender;
  /** The transcript this session is appended to. */
  readonly transcriptPath: string;
  /** Shared with the hook plane, so the two defer to each other. */
  readonly ledger?: HookLedger;
  readonly pollIntervalMs?: number;
  /** Injectable so a test can pin the dedup window instead of sleeping through it. */
  readonly now?: () => number;
}

const DEFAULT_POLL_INTERVAL_MS = 500;

export class ClaudeWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #ledger: HookLedger;
  readonly #pollIntervalMs: number;
  readonly #now: () => number;
  readonly #buffer: EventBuffer;
  readonly #transcriptPath: string;
  #offset = 0;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: ClaudeWatcherOptions) {
    this.#send = options.send;
    this.#ledger = options.ledger ?? createHookLedger();
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#now = options.now ?? Date.now;
    this.#transcriptPath = options.transcriptPath;
    this.#buffer = new EventBuffer(
      {
        flushIntervalMs: 250,
        maxBatchEvents: 50,
        maxRejectEvents: 100,
        retryAfterSeconds: 1,
      },
      // The buffer gets the same clock, or a test pinning `now` for the dedup
      // window would still be waiting on real time for the 250ms flush and the
      // two halves of the watcher would disagree about what "now" means.
      { now: this.#now },
    );
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
   * The flush is awaited. A void stop makes it fire-and-forget, and the session
   * then ends with events either dropped or delivered after the runtime has
   * torn down — which is the same class of bug the tail exists to catch.
   */
  async stop(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    const remaining = this.#buffer.flush();
    if (remaining.length > 0) await this.#send(remaining);
  }

  /**
   * Accepts an event the hook plane produced.
   *
   * Recorded in the ledger BEFORE it is buffered, so a log line describing the
   * same tool call is deferred to this one even if the buffer has not flushed
   * it yet. The alternative is a duplicate that depends on flush timing.
   */
  async recordHookEvent(event: AgentEvent): Promise<void> {
    recordReported(this.#ledger, event, this.#now());
    await this.#bufferAndMaybeFlush(event);
  }

  /** One poll: read what is new, translate it, drop what the hooks already said. */
  async tick(): Promise<void> {
    const { lines, offset } = await readNewLines(this.#transcriptPath, this.#offset);
    this.#offset = offset;
    const nowMs = this.#now();

    for (const line of lines) {
      const { event } = parseJsonlLine(line);
      if (event === null) {
        continue;
      }
      if (isAlreadyReported(this.#ledger, event, nowMs)) {
        continue;
      }
      await this.#bufferAndMaybeFlush(event);
    }

    const due = this.#buffer.flushIfDue();
    if (due !== undefined) await this.#send(due);
  }

  /**
   * push() hands back a batch by itself the moment the buffer is full, so the
   * size limit does not need its own check here.
   */
  async #bufferAndMaybeFlush(event: AgentEvent): Promise<void> {
    const batch = this.#buffer.push(event);
    if (batch !== undefined) await this.#send(batch);
  }
}
