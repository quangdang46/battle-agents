import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import { listSessionFiles, piSessionsDirectory } from './paths.js';
import {
  createLogState,
  parseSessionLine,
  readNewSessionLines,
  type PiLogState,
} from './parsers/session.js';

/**
 * The session-log watcher, over every session Pi has on the machine.
 *
 * The one thing that is not a copy of the Codex watcher is the buffering, and
 * that is the bug this shape exists to prevent.
 *
 * `EventBuffer` holds a flat list of events and does not partition it, and the
 * ingest endpoint refuses a batch spanning two sessions with a 400 — one
 * session per batch, because the response names a single session and ownership
 * is resolved for one. Codex gets away with one watcher-level buffer because a
 * rollout file IS one session. Pi's sessions directory holds many files across
 * many project directories at once, so a single buffer there interleaves
 * sessions and every batch crossing a file boundary is refused. The failure
 * looks like a flaky ingest path rather than an adapter bug, which is why the
 * buffer is keyed by file here and the keying is asserted by a test.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

export interface PiWatcherOptions {
  readonly send: BatchSender;
  /** Defaults to `~/.pi/agent/sessions`. Injectable so a test needs no home. */
  readonly sessionsDirectory?: string;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
}

/**
 * The agent-quest precedent, for the same reason Codex uses it: a session log is
 * written after the fact rather than pushed, so there is no event to lose by
 * waiting, and polling a directory twice a second for a tool call every ten
 * seconds is cost with no benefit.
 */
const DEFAULT_POLL_INTERVAL_MS = 2_500;

const BATCH_LIMITS = {
  flushIntervalMs: 250,
  maxBatchEvents: 50,
  maxRejectEvents: 100,
  retryAfterSeconds: 1,
} as const;

interface SessionFile {
  offset: number;
  buffer: EventBuffer;
  log: PiLogState;
}

export class PiWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #sessionsDirectory: string;
  readonly #pollIntervalMs: number;
  readonly #now: () => number;
  readonly #files = new Map<string, SessionFile>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;

  constructor(options: PiWatcherOptions) {
    this.#send = options.send;
    this.#sessionsDirectory = options.sessionsDirectory ?? piSessionsDirectory();
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#now = options.now ?? Date.now;
  }

  /**
   * How many records produced no event.
   *
   * Counted rather than logged, because a Pi upgrade that changes the session
   * format should be a number somebody notices, not a stream that quietly went
   * quiet and looked like an idle agent. The count is the whole diagnostic
   * surface for a file the parser does not understand.
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
   * Every buffer is flushed and sent on its own, for the same reason they are
   * kept apart: merging two sessions' leftovers into one last batch would be
   * refused by the endpoint, at shutdown, after the events had already been
   * read.
   */
  async stop(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    for (const file of this.#files.values()) {
      const remaining = file.buffer.flush();
      if (remaining.length > 0) await this.#send(remaining);
    }
  }

  /** One poll: discover the sessions, then read what each of them has added. */
  async tick(): Promise<void> {
    const present = await listSessionFiles(this.#sessionsDirectory);
    const live = new Set(present);

    for (const path of present) {
      let file = this.#files.get(path);
      if (file === undefined) {
        file = { offset: 0, buffer: this.#newBuffer(), log: createLogState() };
        this.#files.set(path, file);
      }
      await this.#read(path, file);
    }

    this.#forget(live);
  }

  #newBuffer(): EventBuffer {
    return new EventBuffer(BATCH_LIMITS, { now: this.#now });
  }

  async #read(path: string, file: SessionFile): Promise<void> {
    const { lines, offset } = await readNewSessionLines(path, file.offset);
    file.offset = offset;

    for (const line of lines) {
      const { events, skipped } = parseSessionLine(line, file.log);
      if (skipped !== undefined) {
        this.#skipped += 1;
        continue;
      }
      for (const event of events) {
        // push() hands back a batch by itself the moment that file's buffer is
        // full, so the size limit needs no separate check here.
        const batch = file.buffer.push(event);
        if (batch !== undefined) await this.#send(batch);
      }
    }

    const due = file.buffer.flushIfDue();
    if (due !== undefined) await this.#send(due);
  }

  /**
   * Drops the bookkeeping for sessions whose file is gone.
   *
   * Only once the file's buffer is empty. A session file that was rotated away
   * mid-poll may still have a partial batch owed, and forgetting it would drop
   * events that were already read — which is the one thing a cursor is for.
   */
  #forget(live: ReadonlySet<string>): void {
    for (const [path, file] of this.#files) {
      if (!live.has(path) && file.buffer.size === 0) this.#files.delete(path);
    }
  }
}
