import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import { cursorProjectsDirectory, listTranscriptFiles } from './paths.js';
import { parseTranscriptLine, readNewTranscriptLines } from './parsers/transcript.js';

/**
 * The transcript watcher: the whole adapter.
 *
 * Structurally this is the Codex watcher, and the duplication is deliberate for
 * the reason the Codex parser states: adapters import `core` and `protocol` and
 * nothing else, so a shared file-watching module would have to live in one of
 * those two, where neither belongs. A byte offset is not a primitive and not
 * part of the wire contract. What IS shared — the buffer, the batching limits,
 * the tool-map and the POST client — is in protocol, and this adapter reaches
 * the same copies every other adapter does.
 *
 * The batching limits are the ones the ingest endpoint accepts: 250ms or 50
 * events, well short of the 100-event refusal. An adapter that invented its own
 * policy would be refused by the very endpoint it posts to.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

/**
 * Either a transcript to follow, or a tree to find them in. Never both and
 * never neither, so the compiler forces the choice rather than leaving a watcher
 * that quietly watches nothing.
 */
export type CursorWatcherOptions = {
  readonly send: BatchSender;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
} & (
  | { readonly transcriptPath: string; readonly projectsRoot?: never }
  | { readonly transcriptPath?: never; readonly projectsRoot?: string }
);

/**
 * The agent-quest precedent, for the same reason Codex uses it: a transcript is
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

/**
 * Cursor writes no opening record — no session id, no timestamp, no project
 * path — so there is no line in the transcript that could be read as
 * `session.started`. The session IS the file, and the watcher synthesises the
 * event from what the path carries. This is the one event in this adapter that
 * is not read out of a record, and it is stated here rather than left to be
 * discovered as a mysterious extra event in a stream.
 */
const INSTALLATION_ID = 'cursor';

interface TrackedTranscript {
  readonly path: string;
  offset: number;
  readonly sessionId: string;
  readonly projectId: string;
  /** Set once session.started has been emitted, so it is emitted exactly once. */
  started: boolean;
}

export class CursorWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #pinnedPath: string | undefined;
  readonly #projectsRoot: string;
  readonly #pollIntervalMs: number;
  readonly #buffer: EventBuffer;
  /** One cursor per transcript, because several Cursor sessions can be open. */
  readonly #tracked = new Map<string, TrackedTranscript>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;
  #failedBatches = 0;
  #lastFailure: string | undefined;
  #discovered = false;

  constructor(options: CursorWatcherOptions) {
    this.#send = options.send;
    this.#pinnedPath = options.transcriptPath;
    this.#projectsRoot = options.projectsRoot ?? cursorProjectsDirectory();
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#buffer = new EventBuffer(
      BATCH_LIMITS,
      options.now === undefined ? {} : { now: options.now },
    );
  }

  /**
   * How many lines produced no event.
   *
   * Counted rather than logged, because a Cursor release that changes the
   * transcript format should be a number somebody notices, not a stream that
   * quietly went quiet and looked like an idle agent.
   */
  get skippedCount(): number {
    return this.#skipped;
  }

  /**
   * How many batches the ingest endpoint refused, and why the last one did.
   *
   * Counted rather than thrown: a watcher whose poll dies on the first refused
   * POST is a stream that stops and looks like an idle agent. A 401 and a 404
   * are a credential problem and a registration problem, and they are not the
   * same fix.
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
   * telemetry adapter that dies because one POST was refused costs more than the
   * batch it lost. A caller that wants the exception composes the sender itself;
   * `createIngestSender` throws, and only the poll loop here declines to.
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
    for (const file of await this.#transcripts()) {
      await this.#read(file);
    }
    const due = this.#buffer.flushIfDue();
    if (due !== undefined) await this.#deliver(due);
  }

  async #read(file: TrackedTranscript): Promise<void> {
    const { lines, offset, modified } = await readNewTranscriptLines(file.path, file.offset);
    file.offset = offset;

    if (!file.started) {
      // Emitted before the file's own records rather than after, so the session
      // its events belong to exists first. A transcript Cursor opened before
      // this watcher started has none of its opening turn — see #transcripts —
      // and the event is still owed, because a stream of tool calls with no
      // session is a stream the server has nothing to attach them to.
      file.started = true;
      const started: AgentEvent = {
        type: 'session.started',
        sessionId: file.sessionId,
        at: modified,
        // The session is its own agent: Cursor records no separate identity,
        // and inventing one would put two sessions in a log that cannot tell
        // them apart. Same answer the Codex parser gives for a rollout with no
        // agent_id.
        agentId: file.sessionId,
        installationId: INSTALLATION_ID,
        projectId: file.projectId,
        harness: 'cursor',
      };
      const batch = this.#buffer.push(started);
      if (batch !== undefined) await this.#deliver(batch);
    }

    for (const line of lines) {
      const { events, skipped } = parseTranscriptLine(line, {
        sessionId: file.sessionId,
        at: modified,
      });
      if (skipped !== undefined) {
        this.#skipped += 1;
        continue;
      }
      for (const event of events) {
        // push() hands back a batch by itself the moment the buffer is full or
        // the session changes, so neither limit needs its own check here.
        const batch = this.#buffer.push(event);
        if (batch !== undefined) await this.#deliver(batch);
      }
    }
  }

  /**
   * The transcripts this poll reads.
   *
   * A cursor per file rather than one for the watcher, because several Cursor
   * sessions can be open at once and all of them are still being appended to.
   * Restarting a single cursor at the newer file would re-read the older one
   * from the beginning the moment it was written to again, which is the
   * duplicate the bead warns a naive reader produces.
   */
  async #transcripts(): Promise<readonly TrackedTranscript[]> {
    if (this.#pinnedPath !== undefined) {
      const existing = this.#tracked.get(this.#pinnedPath);
      if (existing !== undefined) return [existing];
      const adopted: TrackedTranscript = {
        path: this.#pinnedPath,
        offset: 0,
        sessionId: pathSessionId(this.#pinnedPath),
        projectId: this.#pinnedPath,
        started: false,
      };
      this.#tracked.set(this.#pinnedPath, adopted);
      return [adopted];
    }

    const found = await listTranscriptFiles(this.#projectsRoot);
    const present = new Set(found.map((file) => file.path));
    if (!this.#discovered) {
      // The first listing is a snapshot of sessions that were already over.
      // Adopting each one at its end is what `tail -f` does to a file that
      // existed before it started, and the alternative — replaying months of
      // finished sessions as live activity — is worse than losing the opening
      // turns of the one session already in progress.
      for (const file of found) {
        this.#tracked.set(file.path, {
          path: file.path,
          offset: file.size,
          sessionId: file.sessionId,
          projectId: file.projectId,
          started: false,
        });
      }
      this.#discovered = true;
    } else {
      // A transcript that appeared since is a session that began while this
      // watcher was running, so all of it is news and its cursor starts at zero.
      // Zero and not the listing size, because the first poll of a brand-new
      // transcript has to read its opening turn to emit its prompt.
      for (const file of found) {
        if (!this.#tracked.has(file.path)) {
          this.#tracked.set(file.path, {
            path: file.path,
            offset: 0,
            sessionId: file.sessionId,
            projectId: file.projectId,
            started: false,
          });
        }
      }
    }
    // Forget a transcript that is gone. The bytes its cursor points at are not
    // coming back, and keeping the cursor means reading a future session that
    // happens to be created at the same path from wherever the old one ended.
    for (const path of [...this.#tracked.keys()]) {
      if (!present.has(path)) this.#tracked.delete(path);
    }
    return [...this.#tracked.values()];
  }
}

const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The session id a transcript path names, falling back to the path itself.
 *
 * A file not named for a uuid is not one of Cursor's transcripts, but a caller
 * that pins a path asked for exactly that file, and refusing to watch it would
 * make the pinned mode silently watch nothing. The path is a valid non-empty
 * identifier, so the event it produces is well-formed and honestly labelled by
 * being visibly a path.
 */
function pathSessionId(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  if (base.endsWith('.jsonl')) {
    const stem = base.slice(0, -'.jsonl'.length);
    if (SESSION_UUID.test(stem)) return stem;
  }
  return path;
}
