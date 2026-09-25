import { homedir } from 'node:os';

import { EventBuffer } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import type { AgentWatcher } from '@battle-agents/core';

import {
  geminiInstallationId,
  geminiProjectsDirectory,
  listChatFiles,
  type GeminiChatFile,
} from './paths.js';
import {
  createChatState,
  parseChatLine,
  parseChatMessage,
  readChatDocumentFile,
  readNewChatLines,
  type ChatState,
} from './parsers/chats.js';

/**
 * The chat watcher, over every Gemini session on the machine.
 *
 * Two things here are not the Codex watcher, and both are consequences of the
 * store rather than choices.
 *
 * ONE BUFFER PER FILE. The ingest endpoint refuses a batch spanning two
 * sessions with a 400, and `EventBuffer` now closes its window on a session
 * change — but it is still a single flat window, so a poll that interleaves two
 * chat files would still produce a batch that has to be refused at the boundary
 * and would deliver two partial windows instead of one. One buffer per file is
 * the arrangement where the central rule has nothing left to catch. This is the
 * same reason the Pi watcher keys its buffers by file, arrived at from the other
 * direction: that one predates the central rule and says so in a comment which is
 * now stale. The conclusion is the same and the mechanism is the same.
 *
 * TWO READERS. `.jsonl` is append-only and gets a byte cursor. `.json` is
 * rewritten whole every turn and gets re-read with a message count as the
 * cursor. `paths.ts` and `parsers/chats.ts` say why, and the one-line version is
 * that a byte offset into a rewritten document is not a cursor.
 */

export type BatchSender = (batch: readonly AgentEvent[]) => Promise<void>;

export interface GeminiWatcherOptions {
  readonly send: BatchSender;
  /** Defaults to `~/.gemini/tmp`. Injectable so a test needs no home. */
  readonly projectsRoot?: string;
  /** Injectable so a test needs no home either. */
  readonly home?: string;
  readonly pollIntervalMs?: number;
  /** Injectable so a test does not wait on the flush interval for real. */
  readonly now?: () => number;
}

/**
 * The agent-quest precedent, for the same reason Codex uses it: a chat store is
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

interface TrackedChat {
  readonly path: string;
  readonly shape: GeminiChatFile['shape'];
  /** Byte cursor, for the append-only store. Unused for the rewritten one. */
  offset: number;
  /** Message cursor, for the rewritten store. Unused for the append-only one. */
  emitted: number;
  /** mtime and size, so an unchanged `.json` file is not re-parsed. */
  seenAt: { size: number; modified: string } | undefined;
  readonly buffer: EventBuffer;
  readonly state: ChatState;
  readonly toolNames: Map<string, string>;
  started: boolean;
}

export class GeminiWatcher implements AgentWatcher {
  readonly #send: BatchSender;
  readonly #projectsRoot: string;
  readonly #home: string;
  readonly #pollIntervalMs: number;
  readonly #now: () => number;
  readonly #files = new Map<string, TrackedChat>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #skipped = 0;
  #installationId: string | undefined;
  /** Whether a listing has already happened; the first one is a snapshot. */
  #listed = false;

  constructor(options: GeminiWatcherOptions) {
    this.#send = options.send;
    this.#home = options.home ?? homedir();
    this.#projectsRoot = options.projectsRoot ?? geminiProjectsDirectory(this.#home);
    this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#now = options.now ?? Date.now;
  }

  /**
   * How many records produced no event.
   *
   * Counted rather than logged, because a Gemini release that changes the chat
   * format should be a number somebody notices, not a stream that quietly went
   * quiet and looked like an idle agent.
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
   * refused by the endpoint, at shutdown, after the events had already been read.
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

  async tick(): Promise<void> {
    const present = await listChatFiles(this.#projectsRoot);
    const live = new Set(present.map((file) => file.path));
    // Captured before the loop, so every file this poll adopts agrees about
    // whether it existed when the watcher started.
    const preExisting = this.#listed;

    for (const found of present) {
      let file = this.#files.get(found.path);
      if (file === undefined) {
        file = this.#newFile(found, preExisting);
        this.#files.set(found.path, file);
      }
      await this.#read(file, found);
    }
    this.#listed = true;

    this.#forget(live);
  }

  /**
   * A newly discovered chat file, and where its cursor starts.
   *
   * A `.json` file that existed at the first listing is adopted at its END,
   * which is what `tail -f` does to a file that was already there: the
   * alternative is replaying every finished session on the machine as live
   * activity, and for this store that is a 4.5MB document and 1,266 tool calls
   * per session. A file that appeared afterwards began while this watcher was
   * running, so all of it is news.
   *
   * A `.jsonl` file is the exception that proves the rule, and so is every
   * file that appeared later. Both are read from ZERO, because the session id
   * appears on the header line and nowhere else — the file name truncates the
   * uuid to eight characters — so a reader that skipped the header has no
   * session to attribute anything to and every event it produced would be
   * unusable. A store that changed format is a store that changed what its
   * records mean; both are read from the start.
   */
  #newFile(found: GeminiChatFile, preExisting: boolean): TrackedChat {
    const adoptAtEnd = preExisting && found.shape === 'json';
    return {
      path: found.path,
      shape: found.shape,
      offset: adoptAtEnd ? found.size : 0,
      emitted: 0,
      seenAt: adoptAtEnd ? { size: found.size, modified: found.modified } : undefined,
      buffer: new EventBuffer(BATCH_LIMITS, { now: this.#now }),
      state: createChatState(),
      toolNames: new Map<string, string>(),
      started: false,
    };
  }

  async #read(file: TrackedChat, found: GeminiChatFile): Promise<void> {
    if (file.shape === 'json') {
      await this.#readDocument(file, found);
    } else {
      await this.#readLines(file);
    }
    const due = file.buffer.flushIfDue();
    if (due !== undefined) await this.#send(due);
  }

  async #readLines(file: TrackedChat): Promise<void> {
    // Before the first line, because the header is what produces the
    // session.started and the header names no installation.
    file.state.installationId = await this.#installation();
    const { lines, offset } = await readNewChatLines(file.path, file.offset);
    file.offset = offset;
    for (const line of lines) {
      const { events, skipped } = parseChatLine(line, file.state);
      if (skipped !== undefined) {
        this.#skipped += 1;
        continue;
      }
      // The header is what carries the session.started in this format, so the
      // flag is the parser's to set rather than the watcher's to guess.
      for (const event of events) {
        if (event.type === 'session.started') file.started = true;
        const batch = file.buffer.push(event);
        if (batch !== undefined) await this.#send(batch);
      }
    }
  }

  /**
   * Reads a rewritten `.json` store by re-reading it and walking the messages it
   * has not emitted yet.
   *
   * The size/mtime check is what keeps this affordable: a 4.5MB document parsed
   * on a 2.5-second poll is most of a core spent on nothing, and Gemini rewrites
   * the file only when the session turns. It is a cache, and the thing it
   * caches is "the file has not changed", so a write that does not change either
   * value is a write that produced no new message.
   */
  async #readDocument(file: TrackedChat, found: GeminiChatFile): Promise<void> {
    if (
      file.seenAt !== undefined &&
      file.seenAt.size === found.size &&
      file.seenAt.modified === found.modified
    ) {
      return;
    }
    const document = await readChatDocumentFile(file.path);
    if (document === undefined) {
      // Half-written, or rewritten out from under the read. `seenAt` is left
      // alone, so the next poll tries again rather than caching the failure as
      // a state the file is in.
      return;
    }
    file.seenAt = { size: found.size, modified: found.modified };

    const installationId = await this.#installation();
    const ctx = {
      sessionId: document.sessionId,
      installationId,
      toolNames: file.toolNames,
    };

    if (!file.started) {
      file.started = true;
      const started: AgentEvent = {
        type: 'session.started',
        sessionId: document.sessionId,
        at: document.at,
        agentId: document.sessionId,
        installationId,
        projectId: document.projectId,
        harness: 'gemini',
      };
      const batch = file.buffer.push(started);
      if (batch !== undefined) await this.#send(batch);
    }

    for (let index = file.emitted; index < document.messages.length; index += 1) {
      const { events, skipped } = parseChatMessage(document.messages[index], ctx);
      if (skipped !== undefined) {
        this.#skipped += 1;
        continue;
      }
      for (const event of events) {
        const batch = file.buffer.push(event);
        if (batch !== undefined) await this.#send(batch);
      }
    }
    file.emitted = document.messages.length;
  }

  /** The installation id, read once. A test can set it by pointing `home` anywhere. */
  async #installation(): Promise<string> {
    this.#installationId ??= await geminiInstallationId(this.#home);
    return this.#installationId;
  }

  /**
   * Drops the bookkeeping for chats whose file is gone.
   *
   * Only once the file's buffer is empty. A file rotated away mid-poll may still
   * have a partial batch owed, and forgetting it would drop events that were
   * already read — which is the one thing a cursor is for.
   */
  #forget(live: ReadonlySet<string>): void {
    for (const [path, file] of this.#files) {
      if (!live.has(path) && file.buffer.size === 0) this.#files.delete(path);
    }
  }
}
