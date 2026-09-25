import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import { openCodeDatabasePath, OpenCodeStore } from './parsers/sqlite.js';
import type { OpenCodeStoreOptions } from './parsers/sqlite.js';

/**
 * The poll loop, and the backoff that decides how often it runs.
 *
 * This is the one requirement on the OpenCode adapter that nothing in the tree
 * implements: the template, the claude adapter and the codex adapter all use a
 * fixed `setInterval`, and the plan names high-frequency SQLite WAL polling as
 * the thing to avoid (section 1.2 item 4, and section 28.2 repeats it as a lesson
 * from the port's own watcher). A fixed interval is the wrong shape twice over.
 * When the database is quiet — an idle OpenCode writes nothing at all — it pays
 * for reads that find nothing, against a file the user's editor also owns. And
 * it cannot get faster either, so a burst of activity is met at whatever rate
 * the idle case was tuned for.
 *
 * So the delay is a function of the last poll: activity tightens it to the floor,
 * silence widens it by the factor up to a ceiling, and the loop is a chained
 * `setTimeout` rather than an interval, because the delay after poll N depends
 * on what poll N found. `rowsRead` rather than `events.length` is the input,
 * because a turn of assistant prose is a busy database that happens to produce
 * one event.
 *
 * What wakes the loop is deliberately NOT a filesystem watch. The port watches
 * the `-wal` sidecar with chokidar's `usePolling: true, interval: 500`, which is
 * precisely the high-frequency WAL polling the plan warns about, and its own
 * comment says `fs.watch` is unreliable for SQLite WAL on Windows. A watch that
 * has to be polled to be reliable is the poll, done twice and with a worse
 * answer. So this is one loop, on a timer, whose rate is the thing being managed.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

/**
 * Schedules the next poll and returns the canceller.
 *
 * A canceller rather than a timer handle, because a handle is a value whose type
 * depends on the scheduler and this one is injected. A test hands in a scheduler
 * that records the delay it was asked for and keeps the task, which is how the
 * backoff is asserted without waiting through it.
 */
export type PollSchedule = (task: () => void, delayMs: number) => () => void;

/** Cancels a poll a {@link PollSchedule} armed. */
export type PollCancel = (canceller: () => void) => void;

export interface OpenCodeWatcherOptions {
  /** Where batches go. The only thing this watcher does with the network. */
  readonly send: BatchSender;
  /** Defaults to the XDG path OpenCode uses. Injectable so a test needs no home. */
  readonly databasePath?: string;
  /** Skips the reader's schema probe. */
  readonly store?: OpenCodeStoreOptions;
  /** Injectable so a test moves the 250ms flush boundary instead of sleeping. */
  readonly now?: () => number;
  readonly schedule?: PollSchedule;
  readonly cancel?: PollCancel;
  readonly minPollIntervalMs?: number;
  readonly maxPollIntervalMs?: number;
  readonly backoffFactor?: number;
  /** How long a session may be silent before it is declared abandoned. */
  readonly sessionEndIdleMs?: number;
}

/**
 * The floor, and it is tied to the flush window rather than picked.
 *
 * `EventBuffer` is flushed from this loop, so the poll interval IS the upper
 * bound on how long a buffered event waits before it is posted. A floor above
 * the 250ms flush window would mean the window is never the thing that
 * decides, and the buffer's own limit would be decorative. Below it there is
 * nothing to gain: OpenCode stamps rows in milliseconds but a poll that reads a
 * WAL file two hundred times a second is the behaviour the plan warns about.
 */
const DEFAULT_MIN_POLL_INTERVAL_MS = 500;

/**
 * The ceiling. Five seconds of latency to notice a session that has just begun
 * is imperceptible, and six polls a minute against an idle database is a cost
 * nobody can see on a disk.
 */
const DEFAULT_MAX_POLL_INTERVAL_MS = 5_000;

/** Doubling. The least surprising growth rate, and the one with a fixed bound. */
const DEFAULT_BACKOFF_FACTOR = 2;

/**
 * The batching limits the ingest endpoint accepts: 250ms or 50 events, well
 * short of the 100 the endpoint refuses outright. An adapter that invented its
 * own policy would be refused by the very endpoint it posts to.
 */
const BATCH_LIMITS = {
  flushIntervalMs: 250,
  maxBatchEvents: 50,
  maxRejectEvents: 100,
  retryAfterSeconds: 1,
} as const;

/**
 * How long a session may go without a row before the watcher calls it abandoned.
 *
 * The port's number, kept because it is the only one anybody has watched against
 * a real OpenCode. It is a heuristic and the honest reason is in
 * `OpenCodeStore.endAbandoned`: the database has no "the user quit" field, so
 * silence is all there is. It is deliberately long. A false `session.ended` puts
 * a boundary in the activity log that did not happen, and a boundary that
 * arrives too early is the version of this bug that is hard to notice.
 */
const DEFAULT_SESSION_END_IDLE_MS = 180_000;

export type OpenCodeWatcherStatus = 'idle' | 'watching' | 'stopped';

export class OpenCodeWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #schedule: PollSchedule;
  readonly #cancel: PollCancel;
  readonly #buffer: EventBuffer;
  readonly #store: OpenCodeStore;
  readonly #minPollIntervalMs: number;
  readonly #maxPollIntervalMs: number;
  readonly #backoffFactor: number;
  readonly #sessionEndIdleMs: number;
  /** sessionId -> when its idle timer was armed. */
  readonly #idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #cancelPoll: (() => void) | undefined;
  #intervalMs: number;
  #status: OpenCodeWatcherStatus = 'idle';
  #polls = 0;
  #failedPolls = 0;
  #failedBatches = 0;
  #lastFailure: string | undefined;

  constructor(options: OpenCodeWatcherOptions) {
    this.#send = options.send;
    const path = options.databasePath ?? openCodeDatabasePath();
    if (path === undefined) {
      throw new Error(
        'no OpenCode database found: run OpenCode once, or pass databasePath. Looked in ' +
          '~/.local/share/opencode/opencode.db, %LOCALAPPDATA%/opencode/opencode.db and ' +
          '~/.opencode/opencode.db.',
      );
    }
    this.#store = new OpenCodeStore(path, options.store ?? {});
    this.#minPollIntervalMs = options.minPollIntervalMs ?? DEFAULT_MIN_POLL_INTERVAL_MS;
    this.#maxPollIntervalMs = options.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS;
    this.#backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    this.#sessionEndIdleMs = options.sessionEndIdleMs ?? DEFAULT_SESSION_END_IDLE_MS;
    this.#intervalMs = this.#minPollIntervalMs;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#cancel = options.cancel ?? defaultCancel;
    this.#buffer = new EventBuffer(
      BATCH_LIMITS,
      options.now === undefined ? {} : { now: options.now },
    );
  }

  /**
   * Why this watcher is or is not producing.
   *
   * An explicit state rather than a silent one, because the research doc
   * records the port's real operational finding: "the dashboard is empty" and
   * "no watcher matched" look identical from the outside, which is how four
   * watchers ended up silently disabled in that codebase. A watcher that has
   * stopped watching says so.
   */
  get status(): OpenCodeWatcherStatus {
    return this.#status;
  }

  /** The delay the next poll will wait. The backoff is only visible through this. */
  get pollIntervalMs(): number {
    return this.#intervalMs;
  }

  get databasePath(): string {
    return this.#store.path;
  }

  get schema(): string {
    return this.#store.schema;
  }

  get skippedCount(): number {
    return this.#store.skippedCount;
  }

  get skipReasons(): Readonly<Record<string, number>> {
    return this.#store.skipReasons;
  }

  /**
   * How many polls failed, and why the last one did.
   *
   * Counted rather than thrown, for the reason the codex watcher counts the same
   * thing: a poll that dies on the first refused query is a stream that stops and
   * looks like an idle agent. A locked database and a schema this reader does not
   * understand are different problems with different fixes, so the message is
   * kept.
   */
  get failedPollCount(): number {
    return this.#failedPolls;
  }

  get lastFailure(): string | undefined {
    return this.#lastFailure;
  }

  /** How many batches the ingest endpoint refused. */
  get failedBatchCount(): number {
    return this.#failedBatches;
  }

  get pollCount(): number {
    return this.#polls;
  }

  async start(): Promise<void> {
    if (this.#status === 'watching') return;
    this.#status = 'watching';
    await this.tick();
  }

  /**
   * Stops and flushes.
   *
   * The flush is awaited and the buffer is flushed unconditionally rather than
   * only when due, because a shutdown is exactly the case where a partial batch
   * still belongs in the record. `Promise<void>` and not `void`: the reference
   * implementation returns `void`, which makes that flush fire-and-forget, and
   * the session then ends with events delivered after the runtime has torn down.
   */
  async stop(): Promise<void> {
    this.#stopPolling();
    for (const timer of this.#idleTimers.values()) clearTimeout(timer);
    this.#idleTimers.clear();
    this.#store.close();
    this.#status = 'stopped';
    const remaining = this.#buffer.flush();
    if (remaining.length > 0) await this.#deliver(remaining);
  }

  /**
   * One poll, and the backoff that follows it.
   *
   * The delay is chosen from what the poll FOUND and the next poll is scheduled
   * after the events are on their way, so a slow send cannot stack polls on top
   * of each other. A poll that throws counts as silence — from the loop's point
   * of view a locked database and a schema that moved are both "nothing came
   * back" — and the widening is what stops a permanently broken database from
   * being retried twice a second forever. `watcher.test.ts` breaks the table out
   * from under a running watcher and watches the interval widen.
   */
  async tick(): Promise<void> {
    if (this.#status === 'stopped') return;
    this.#polls += 1;
    let rowsRead = 0;
    try {
      const poll = this.#store.poll();
      rowsRead = poll.rowsRead;
      for (const event of poll.events) {
        this.#armIdleTimer(event.sessionId);
        // push() hands back a batch by itself the moment the buffer is full or
        // the session changes, so the size limit needs no separate check here.
        // EventBuffer partitions by session, which is what keeps a batch from
        // carrying two sessionIds — the ingest endpoint 400s that.
        const batch = this.#buffer.push(event);
        if (batch !== undefined) await this.#deliver(batch);
      }
    } catch (error) {
      this.#failedPolls += 1;
      this.#lastFailure = error instanceof Error ? error.message : String(error);
    }

    const due = this.#buffer.flushIfDue();
    if (due !== undefined) await this.#deliver(due);

    this.#intervalMs = this.#nextInterval(rowsRead);
    this.#stopPolling();
    this.#cancelPoll = this.#schedule(() => {
      void this.tick();
    }, this.#intervalMs);
  }

  /**
   * The delay for the next poll.
   *
   * `rowsRead`, not `events.length`: a turn that is nothing but the assistant's
   * answer is a row the reader consumed, a skip it counted, and ZERO events, and
   * the database is plainly busy. Treating that as quiet would back off to the
   * ceiling in the middle of a step, which is the opposite of what the delay is
   * for.
   */
  #nextInterval(rowsRead: number): number {
    if (rowsRead > 0) return this.#minPollIntervalMs;
    const widened = Math.round(this.#intervalMs * this.#backoffFactor);
    return Math.min(this.#maxPollIntervalMs, Math.max(this.#minPollIntervalMs, widened));
  }

  #stopPolling(): void {
    if (this.#cancelPoll === undefined) return;
    this.#cancel(this.#cancelPoll);
    this.#cancelPoll = undefined;
  }

  /**
   * Restarts a session's idle countdown, and ends it if the countdown ran out.
   *
   * Keyed on any event for the session, so a model step is liveness and a long
   * bash call is liveness. The store is asked whether the harness archived the
   * session first: `time_archived` is a real column and a real end, and a
   * heuristic that fires alongside one would put two ends in the log.
   */
  #armIdleTimer(sessionId: string): void {
    const armed = this.#idleTimers.get(sessionId);
    if (armed !== undefined) clearTimeout(armed);
    if (this.#sessionEndIdleMs < 0) return;
    this.#idleTimers.set(
      sessionId,
      setTimeout(() => {
        this.#idleTimers.delete(sessionId);
        if (this.#status === 'stopped') return;
        if (this.#store.isArchived(sessionId)) return;
        const events: AgentEvent[] = [];
        this.#store.endAbandoned(events, sessionId);
        for (const event of events) {
          const batch = this.#buffer.push(event);
          if (batch !== undefined) void this.#deliver(batch);
        }
      }, this.#sessionEndIdleMs),
    );
  }

  /**
   * Posts one batch, absorbing a refusal.
   *
   * The only place this adapter swallows an error, and the alternative is an
   * interval whose rejected promise nobody awaits, which in Node takes the
   * process down — a telemetry adapter that dies because one POST was refused
   * costs more than the batch it lost. A caller that wants the exception
   * composes the sender itself; only the loop here declines to.
   */
  async #deliver(batch: readonly AgentEvent[]): Promise<void> {
    try {
      await this.#send(batch);
    } catch (error) {
      this.#failedBatches += 1;
      this.#lastFailure = error instanceof Error ? error.message : String(error);
    }
  }
}

const defaultSchedule: PollSchedule = (task, delayMs) => {
  const timer = setTimeout(task, delayMs);
  return () => {
    clearTimeout(timer);
  };
};

const defaultCancel: PollCancel = (canceller) => {
  canceller();
};
