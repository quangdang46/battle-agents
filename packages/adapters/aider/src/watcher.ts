import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import { listTranscriptFiles } from './paths.js';
import { parseTranscriptLine, promptText, readNewTranscriptLines } from './parsers/transcript.js';

/**
 * The transcript watcher: the whole adapter.
 *
 * Structurally this is the Cursor watcher, and the duplication is deliberate for
 * the reason the Cursor parser states: adapters import `core` and `protocol` and
 * nothing else, so a shared file-watching module would have to live in one of
 * those two, where neither belongs. A byte offset is not a primitive and not
 * part of the wire contract. What IS shared — the buffer, the batching limits,
 * the tool map and the zone fallback — is in protocol, and this adapter reaches
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
export type AiderWatcherOptions = {
  readonly send: BatchSender;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
} & (
  | { readonly transcriptPath: string; readonly projectsRoot?: never }
  | { readonly transcriptPath?: never; readonly projectsRoot: string }
);

/**
 * Aider writes a transcript after the fact rather than pushing, so there is no
 * event to lose by waiting, and polling a project twice a second for a tool call
 * every ten seconds is cost with no benefit. The same reasoning, and the same
 * interval, as the Cursor adapter.
 */
const DEFAULT_POLL_INTERVAL_MS = 2_500;

const BATCH_LIMITS = {
  flushIntervalMs: 250,
  maxBatchEvents: 50,
  maxRejectEvents: 100,
  retryAfterSeconds: 1,
} as const;

/**
 * `session.ended` is emitted from exactly one observation, and this is the
 * reason for it.
 *
 * Aider writes no end record — there is no `/exit` line, no close marker, and
 * `/clear` only empties the in-memory message list (`aider/commands.py:435`)
 * while appending a line to a file that never shrinks. What the file does carry
 * is the NEXT run's boundary, and a run that has been followed by another run is
 * over. So `session.ended` fires when a later boundary arrives, and `abandoned`
 * is the reason rather than `completed`: nothing in the format says the earlier
 * run finished its work, and a run that stopped without saying why is what
 * `abandoned` is for. The remaining gap is stated rather than papered over: a
 * session still in progress when the watcher stops produces no end event, because
 * there is no observation to make one from.
 */
const SESSION_END_REASON = 'abandoned' as const;

/**
 * Aider records no agent identity of any kind, so the session is its own agent —
 * the same answer the Cursor parser gives for a transcript with no agent id.
 * Inventing a second identity would put two sessions in a log that cannot tell
 * them apart.
 */
const INSTALLATION_ID = 'aider';

/**
 * `harness` is a frozen enum in the protocol and Aider is not in it. The enum
 * says so itself: `other` is the escape hatch, "a new coding agent ships an
 * adapter before this enum grows an entry, and the core must keep accepting its
 * events meanwhile". That is this adapter, and using `other` is the designed
 * path rather than a shortfall — growing the union is a wire-contract change
 * with a generated schema behind it, and not this adapter's to make.
 */
const HARNESS = 'other' as const;

interface TrackedTranscript {
  readonly path: string;
  readonly projectId: string;
  offset: number;
  /** The run currently open in this file, and the id it was given. */
  sessionId: string | undefined;
  pendingPrompt: string | undefined;
}

export class AiderWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #pinnedPath: string | undefined;
  readonly #projectsRoot: string;
  readonly #pollIntervalMs: number;
  readonly #buffer: EventBuffer;
  /** One cursor per transcript, because several projects can be open at once. */
  readonly #tracked = new Map<string, TrackedTranscript>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;
  #failedBatches = 0;
  #lastFailure: string | undefined;
  #discovered = false;

  constructor(options: AiderWatcherOptions) {
    this.#send = options.send;
    this.#pinnedPath = options.transcriptPath;
    this.#projectsRoot = options.projectsRoot ?? '';
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#buffer = new EventBuffer(
      BATCH_LIMITS,
      options.now === undefined ? {} : { now: options.now },
    );
  }

  /**
   * How many lines produced no event.
   *
   * Counted rather than logged, because the majority of a real Aider transcript
   * is model prose and unattributed tool output, and a release that changes the
   * activity lines should be a number somebody notices rather than a stream that
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
   * rejected promise nobody awaits, which in Node takes the process down. A
   * caller that wants the exception composes the sender itself; `createIngestSender`
   * throws, and only the poll loop here declines to.
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

    for (const line of lines) {
      // A transcript holds every run ever had in that project, and the turns
      // before the first boundary belong to one that opened before this watcher
      // did. The parser is told so by an absent ctx and counts them; the
      // boundary itself is still recognised, because a boundary is not a turn of
      // the earlier run.
      const ctx =
        file.sessionId === undefined ? undefined : { sessionId: file.sessionId, at: modified };
      const parsed = parseTranscriptLine(line, ctx, file.pendingPrompt);
      file.pendingPrompt = parsed.pendingPrompt;
      if (parsed.skipped !== undefined) this.#skipped += 1;

      if (parsed.marker !== undefined) {
        await this.#openSession(file, parsed.marker.startedAt);
        continue;
      }
      await this.#emit(parsed.events);
    }
  }

  /**
   * Opens a session at a run boundary, closing the one before it.
   *
   * The events are pushed in one go, so a boundary yields `session.ended` and
   * `session.started` back to back and in that order: the run that is over is
   * recorded as over before the run that replaced it is announced, and a replay
   * that reads them in order never sees a session that starts after the one
   * after it ended.
   */
  async #openSession(file: TrackedTranscript, startedAt: string): Promise<void> {
    const events: AgentEvent[] = [];

    // A prompt block open across a run boundary belongs to the run that was
    // writing it, so it is emitted before that run is closed.
    if (file.pendingPrompt !== undefined && file.sessionId !== undefined) {
      events.push({
        type: 'prompt.submitted',
        sessionId: file.sessionId,
        at: startedAt,
        prompt: promptText(file.pendingPrompt),
      });
      file.pendingPrompt = undefined;
    }

    if (file.sessionId !== undefined) {
      events.push({
        type: 'session.ended',
        sessionId: file.sessionId,
        at: startedAt,
        reason: SESSION_END_REASON,
      });
    }

    const sessionId = sessionIdOf(file.path, startedAt);
    file.sessionId = sessionId;
    events.push({
      type: 'session.started',
      sessionId,
      at: startedAt,
      agentId: sessionId,
      installationId: INSTALLATION_ID,
      projectId: file.projectId,
      harness: HARNESS,
    });

    await this.#emit(events);
  }

  async #emit(events: readonly AgentEvent[]): Promise<void> {
    for (const event of events) {
      // push() hands back a batch by itself the moment the buffer is full or the
      // session changes, so neither limit needs its own check here.
      const batch = this.#buffer.push(event);
      if (batch !== undefined) await this.#deliver(batch);
    }
  }

  /**
   * The transcripts this poll reads.
   *
   * A cursor per file rather than one for the watcher, because several projects
   * can be open at once and all of them are still being appended to. Restarting
   * a single cursor at the newer file would re-read the older one from the
   * beginning the moment it was written to again.
   */
  async #transcripts(): Promise<readonly TrackedTranscript[]> {
    if (this.#pinnedPath !== undefined) {
      const existing = this.#tracked.get(this.#pinnedPath);
      if (existing !== undefined) return [existing];
      const adopted: TrackedTranscript = {
        path: this.#pinnedPath,
        projectId: this.#pinnedPath,
        offset: 0,
        sessionId: undefined,
        pendingPrompt: undefined,
      };
      this.#tracked.set(this.#pinnedPath, adopted);
      return [adopted];
    }

    const found = await listTranscriptFiles(this.#projectsRoot);
    const present = new Set(found.map((file) => file.path));
    if (!this.#discovered) {
      // The first listing is a snapshot of transcripts that were already over.
      // Adopting each one at its end is what `tail -f` does to a file that
      // existed before it started, and the alternative — replaying months of
      // finished runs as live activity — is worse than losing the opening turns
      // of the run already in progress.
      for (const file of found) {
        this.#tracked.set(file.path, {
          path: file.path,
          projectId: file.projectId,
          offset: file.size,
          sessionId: undefined,
          pendingPrompt: undefined,
        });
      }
      this.#discovered = true;
    } else {
      // A transcript that appeared since is a run that began while this watcher
      // was running, so all of it is news and its cursor starts at zero. Zero
      // and not the listing size, because the first poll of a brand-new
      // transcript has to read its opening boundary to open a session at all.
      for (const file of found) {
        if (!this.#tracked.has(file.path)) {
          this.#tracked.set(file.path, {
            path: file.path,
            projectId: file.projectId,
            offset: 0,
            sessionId: undefined,
            pendingPrompt: undefined,
          });
        }
      }
    }
    // Forget a transcript that is gone. The bytes its cursor points at are not
    // coming back, and keeping the cursor means reading a future project that
    // happens to be created at the same path from wherever the old one ended.
    for (const path of [...this.#tracked.keys()]) {
      if (!present.has(path)) this.#tracked.delete(path);
    }
    return [...this.#tracked.values()];
  }
}

/**
 * The session id a run boundary in a file names.
 *
 * The file records no session id, so it is composed from the two things that do
 * identify a run: which transcript it is in, and the local wall-clock instant
 * its boundary line carries. Aider writes that instant to the second, so two
 * runs started in the same project within the same second would collide. That is
 * left as it is rather than padded with a counter: a run involves a model call,
 * and inventing a disambiguator here would be a uniqueness scheme in a module
 * whose job is to report what the file says.
 */
function sessionIdOf(path: string, startedAt: string): string {
  return `${path}#${startedAt}`;
}
