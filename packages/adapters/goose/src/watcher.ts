import type { AgentWatcher } from '@battle-agents/core';
import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { gooseSessionRoots, listSessionFiles } from './paths.js';
import { createLogState, parseSessionLine, type GooseLogState } from './parser.js';
import { readNewLines, type ReadAt } from './reader.js';

/**
 * The session-log watcher, over every JSONL session on the machine.
 *
 * The one thing that is not a copy of the Pi watcher is the reader, and the
 * reason is in `reader.ts`: the byte/character split has to happen in one place
 * that owns the whole cursor, because a copy that gets the order wrong is
 * silently correct on an ASCII session and visibly wrong on the first prompt
 * with an accent in it.
 *
 * The buffering is a copy of Pi's, and the honest account of what it is worth:
 * `EventBuffer` is ALREADY session-aware. Its `push()` compares the incoming
 * event's sessionId against the current window's and, on a change, flushes the
 * completed window and opens a new one. So a batch never spans two sessions
 * whichever way this watcher keys its buffers — replacing the per-file keying
 * with a single shared buffer was measured here and left the suite at 8/8.
 *
 * The per-file keying is therefore defence in depth. What it does buy is
 * isolation at shutdown: each session's residue is flushed on its own, so
 * stopping does not depend on the buffer having noticed a session boundary.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

export interface GooseWatcherOptions {
  readonly send: BatchSender;
  /**
   * The session directory to watch. Defaults to every candidate in
   * `gooseSessionRoots()`, because Goose's own data path is not one fixed
   * location and none of them could be verified on the machine this was written
   * on. See paths.ts.
   */
  readonly sessionsDirectory?: string;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
  /** Injectable so the short-read loop can be tested. See reader.ts. */
  readonly read?: ReadAt;
}

/**
 * The agent-quest precedent, for the same reason Pi uses it: a session log is
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
  log: GooseLogState;
}

export class GooseWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #roots: readonly string[];
  readonly #pollIntervalMs: number;
  readonly #now: () => number;
  readonly #read: ReadAt | undefined;
  readonly #files = new Map<string, SessionFile>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;

  constructor(options: GooseWatcherOptions) {
    this.#send = options.send;
    this.#roots =
      options.sessionsDirectory === undefined
        ? gooseSessionRoots()
        : [options.sessionsDirectory];
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#now = options.now ?? Date.now;
    this.#read = options.read;
  }

  /**
   * How many records produced no event.
   *
   * Counted rather than logged, because a Goose upgrade that changes the session
   * format should be a number somebody notices, not a stream that quietly went
   * quiet and looked like an idle agent. The count is the whole diagnostic
   * surface for a file the parser does not understand — and given that current
   * Goose writes SQLite, this counter is the thing that will tell an operator
   * why a Gooses produces nothing.
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
    const present = await listSessionFiles(this.#roots);
    const live = new Set(present);

    for (const path of present) {
      let file = this.#files.get(path);
      if (file === undefined) {
        file = { offset: 0, buffer: this.#newBuffer(), log: createLogState() };
        this.#files.set(path, file);
      }
      await this.#read1(path, file);
    }

    this.#forget(live);
  }

  #newBuffer(): EventBuffer {
    return new EventBuffer(BATCH_LIMITS, { now: this.#now });
  }

  async #read1(path: string, file: SessionFile): Promise<void> {
    const { lines, offset } = await readNewLines(path, file.offset, this.#read);
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
