import { open, readFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * Gemini's chat store, in the two shapes it is actually written in.
 *
 * THE FORMAT IS ESTABLISHED, NOT GUESSED. The bead said "JSON logs under
 * ~/.gemini" and named no file, so the shapes below were read off every chat
 * file on the machine the adapter was written against — 42 `.jsonl` files and
 * one `.json`. `paths.ts` explains why both exist.
 *
 * FORMAT 1 — `.jsonl`, append-only. Line 0 is a header and the only place the
 * session id appears anywhere in the file:
 *
 *   {"sessionId":…,"projectHash":…,"startTime":…,"lastUpdated":…,"kind":"main"}
 *   {"$set":{"lastUpdated":…}}                                  a patch, not a message
 *   {"id":…,"timestamp":…,"type":"user","content":…}            a prompt
 *   {"id":…,"timestamp":…,"type":"gemini","content":…,"thoughts":[…]}
 *
 * NOT ONE of the 42 files contains a tool call. That is a fact about the sample
 * and it is stated rather than designed around: this format yields session
 * lifecycle, prompts and thinking, and a tool event only if a future Gemini
 * writes one.
 *
 * FORMAT 2 — `.json`, a whole-document rewrite with a `messages` array whose
 * entries carry `{type:'user'|'model'|'tool'|'system', id, timestamp, content}`
 * and a nested `message.content` holding `thinking` and `toolCall` blocks. Its
 * top-level `content` is the same information in wire shape: an array of
 * `{type:'text'|'tool_use'|'tool_result'}` blocks, or a bare string. The single
 * file on this machine has 1,266 tool calls in it, so this is the format that
 * carries tools.
 *
 * `content` is a STRING on some messages and an ARRAY on others, in the same
 * file and the same version. A parser that assumed either one reads zero events
 * from half the store, which is exactly the kind of failure that looks like an
 * idle agent.
 */

/** What the watcher has to know about the file a line came from. */
export interface ChatContext {
  readonly sessionId: string;
  readonly installationId: string;
  /**
   * Call id to canonical tool name, filled in as `tool.started` events are
   * emitted and read back when a result arrives.
   *
   * A `.json` tool_result names its call by id and by nothing else — the tool
   * name is not on the record. So without this a completion would have to carry
   * the id in the `tool` field, and the activity log would show `call_fdd61b53`
   * as though that were a tool. The map is per file, because ids are per file.
   */
  readonly toolNames: Map<string, string>;
}

/**
 * Threaded across the lines of one `.jsonl` file.
 *
 * It exists for one reason: the session id is on the header line ONLY. No
 * message record carries it, and the file name truncates the uuid to eight
 * characters, so a watcher that started reading at a non-zero offset could not
 * build a valid event and had nothing to fall back on. Hence the reader starts
 * a `.jsonl` file at zero, and the header is parsed into this state.
 */
export interface ChatState {
  sessionId: string | undefined;
  projectHash: string | undefined;
  /** True once the header's session.started has been emitted. */
  started: boolean;
  /**
   * Which installation this session belongs to, from `~/.gemini/installation_id`.
   *
   * It lives here rather than in the watcher because the HEADER is what produces
   * `session.started` in this format, and the header carries no installation: a
   * parser that named the harness instead would file every session under a
   * placeholder while the real id sat unread a directory away. The watcher sets
   * it before the first line is parsed.
   */
  installationId: string;
}

export function createChatState(installationId = 'gemini'): ChatState {
  return { sessionId: undefined, projectHash: undefined, started: false, installationId };
}

export interface ParsedChatLine {
  readonly events: readonly AgentEvent[];
  readonly skipped: string | undefined;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringAt(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * The text of a message's content, whether it is a bare string or a list of
 * blocks. Both occur in the same file, in the same version.
 */
function textOf(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content.trim() === '' ? undefined : content;
  }
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .map((block) => stringAt(recordOf(block), 'text'))
    .filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' ');
}

/**
 * One `.jsonl` line into the events it yields.
 *
 * A missing or unparseable timestamp is a skip, not an invention: the protocol
 * requires an explicit `at` and a client cannot tell a fabricated instant from
 * a real one. A missing session id is a skip for the same reason — the protocol
 * requires a sessionId on every member of the union, and filling it from a
 * default would attribute another session's events to this one.
 */
export function parseChatLine(line: string, state: ChatState): ParsedChatLine {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { events: [], skipped: 'blank-line' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { events: [], skipped: 'unparseable' };
  }
  const record = recordOf(parsed);

  // The header. It carries the session id, so it is also the only record that
  // can produce a session.started in this format.
  if (stringAt(record, 'sessionId') !== undefined) {
    const sessionId = stringAt(record, 'sessionId') as string;
    const at = instantAt(record.startTime) ?? new Date(0).toISOString();
    state.sessionId = sessionId;
    state.projectHash = stringAt(record, 'projectHash');
    if (state.started) {
      // A header repeated in one file is a rewritten header, not a new session.
      return { events: [], skipped: 'repeated-header' };
    }
    state.started = true;
    return {
      events: [
        {
          type: 'session.started',
          sessionId,
          at,
          // Gemini records no separate agent identity, so the session is its own
          // agent. The same answer the Codex parser gives for a rollout with no
          // agent_id: two sessions in a log that cannot tell them apart is worse
          // than one session identified by its own id.
          agentId: sessionId,
          installationId: stringAt(record, 'installationId') ?? state.installationId,
          projectId: state.projectHash ?? sessionId,
          harness: 'gemini',
        },
      ],
      skipped: undefined,
    };
  }

  // Gemini writes `{"$set":{"lastUpdated":…}}` between messages. They are real
  // records and they carry no event; counting them is what turns "the parser
  // stopped understanding the file" into a number somebody notices.
  if ('$set' in record) {
    return { events: [], skipped: 'set-patch' };
  }

  const at = instantAt(record.timestamp);
  if (at === undefined) {
    return { events: [], skipped: 'no-timestamp' };
  }
  const sessionId = state.sessionId;
  if (sessionId === undefined) {
    return { events: [], skipped: 'no-session' };
  }
  const base = { sessionId, at };

  switch (stringAt(record, 'type')) {
    case 'user': {
      const prompt = textOf(record.content);
      return {
        events: [
          { ...base, type: 'prompt.submitted', ...(prompt === undefined ? {} : { prompt }) },
        ],
        skipped: undefined,
      };
    }
    case 'gemini': {
      // The model's own turn. A `thoughts` array is Gemini's reasoning trace and
      // the protocol has an event for it; a record with an empty one is just an
      // answer, and the game watching the model think is not an event it has
      // room for.
      const thoughts = record.thoughts;
      if (!Array.isArray(thoughts) || thoughts.length === 0) {
        return { events: [], skipped: 'no-thoughts' };
      }
      return { events: [{ ...base, type: 'thinking' }], skipped: undefined };
    }
    default:
      return { events: [], skipped: `unmapped-type:${stringAt(record, 'type') ?? '<none>'}` };
  }
}

/** A whole `.json` chat document, as far as the watcher needs to know it. */
export interface ChatDocument {
  readonly sessionId: string;
  readonly at: string;
  readonly projectId: string;
  readonly messages: readonly unknown[];
}

/**
 * The identity of a `.json` document, or undefined when the file is not one.
 *
 * Separated from the message walk because the session id has to be known BEFORE
 * any event can be built — the protocol requires it on every member — and a
 * walker that discovered it partway through would have nothing to attach its
 * first events to.
 */
export function readChatDocument(value: unknown): ChatDocument | undefined {
  const record = recordOf(value);
  const sessionId = stringAt(record, 'sessionId');
  const messages = record.messages;
  if (sessionId === undefined || !Array.isArray(messages)) return undefined;
  return {
    sessionId,
    // startTime is the session's opening instant, which is the honest `at` for a
    // session.started synthesised from a document. lastUpdated is when the file
    // was last written, which would date the session's own beginning to its end.
    at: instantAt(record.startTime) ?? new Date(0).toISOString(),
    projectId: stringAt(record, 'projectHash') ?? sessionId,
    messages,
  };
}

/**
 * One `.json` message into the events it yields.
 *
 * The top-level `content` is walked rather than the nested `message.content`,
 * because the top level is the one shape that is uniform across all four message
 * types and the one Gemini itself uses to reconstruct a conversation. The nested
 * copy carries the same blocks under different type names (`toolCall` for
 * `tool_use`), and reading it would mean a second vocabulary for the same
 * events.
 *
 * `tool_result` names its call by id and not by tool, so the name is remembered
 * from the `tool_use` that opened it. A result whose call was never seen is
 * still emitted, under the id, because the alternative is losing the completion
 * of a call that the watcher started watching mid-session.
 */
export function parseChatMessage(message: unknown, ctx: ChatContext): ParsedChatLine {
  const record = recordOf(message);
  const at = instantAt(record.timestamp);
  if (at === undefined) {
    return { events: [], skipped: 'no-timestamp' };
  }
  const base = { sessionId: ctx.sessionId, at };

  switch (stringAt(record, 'type')) {
    case 'user': {
      const prompt = textOf(record.content);
      return {
        events: [
          { ...base, type: 'prompt.submitted', ...(prompt === undefined ? {} : { prompt }) },
        ],
        skipped: undefined,
      };
    }
    case 'model': {
      const nested = recordOf(record.message).content;
      const events: AgentEvent[] = [];
      if (Array.isArray(nested)) {
        for (const raw of nested) {
          const block = recordOf(raw);
          if (block.type === 'thinking') events.push({ ...base, type: 'thinking' });
        }
      }
      const tools = toolBlocksOf(record.content);
      for (const block of tools) {
        const name = stringAt(block, 'name');
        if (name === undefined) continue;
        const canonical = normalizeToolName(name);
        const callId = stringAt(block, 'id');
        if (callId !== undefined) ctx.toolNames.set(callId, canonical);
        events.push({
          ...base,
          type: 'tool.started',
          tool: canonical,
          input: normalizeToolInput(block.input),
        });
      }
      if (events.length === 0) {
        return { events: [], skipped: 'no-thinking-no-tools' };
      }
      return { events, skipped: undefined };
    }
    case 'tool': {
      const events: AgentEvent[] = [];
      for (const block of toolBlocksOf(record.content)) {
        if (block.type !== 'tool_result') continue;
        const callId = stringAt(block, 'tool_use_id');
        if (callId === undefined) continue;
        // The tool is named from the call that opened it. A result whose call
        // was never seen — a watcher that adopted the document mid-session —
        // carries the call id instead, because the completion really happened
        // and dropping it would leave a tool.started with no ending. An id in
        // the tool field is visibly an id, which is the honest outcome.
        events.push({
          ...base,
          type: 'tool.completed',
          tool: ctx.toolNames.get(callId) ?? callId,
          ok: block.is_error !== true,
          // The document records when the whole model turn finished, not when
          // this call returned, so the interval is not knowable from it. The
          // protocol requires the field and rejects a missing one, so 0 is a
          // floor rather than a measurement — a client reading it as "this call
          // was instant" is reading more than the file knows. Same answer the
          // Codex parser gives for a rollout that stamps no duration.
          durationMs: 0,
        });
      }
      if (events.length === 0) {
        return { events: [], skipped: 'no-tool-results' };
      }
      return { events, skipped: undefined };
    }
    case 'system':
      // The harness reminding itself about unfinished todos. Not agent activity,
      // and a `prompt.submitted` for it would put words in the user's mouth.
      return { events: [], skipped: 'system-reminder' };
    default:
      return { events: [], skipped: `unmapped-type:${stringAt(record, 'type') ?? '<none>'}` };
  }
}

function toolBlocksOf(content: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(content)) return [];
  return content.map(recordOf);
}

/**
 * An ISO instant, from the two forms Gemini writes. The protocol requires an
 * explicit offset and rejects a local timestamp, so a value that will not parse
 * is dropped rather than passed through.
 */
function instantAt(raw: unknown): string | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === 'string' && raw !== '') {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
  }
  return undefined;
}

/**
 * Reads a `.jsonl` chat from wherever the cursor left off.
 *
 * A trailing line with no newline is left for the next poll: a JSON document cut
 * in half is not a document. A file that shrank restarts from zero rather than
 * reading from a stale offset into the middle of whatever occupies the path now.
 *
 * THE CURSOR IS A BYTE OFFSET, AND IT HAS TO STAY ONE. A chat line is UTF-8 on
 * disk and a byte is not a character: `sửa lỗi build 🚀` is 14 characters, 20
 * bytes. Read the whole file as a string, slice that string at a byte count, and
 * the second poll begins past the end of the line before it — the events in
 * between stop parsing and are counted as skips, so the session loses history
 * and every test still passes, because the fixtures were all ASCII.
 */
export async function readNewChatLines(
  path: string,
  offset: number,
): Promise<{ readonly lines: readonly string[]; readonly offset: number }> {
  let handle: FileHandle;
  try {
    handle = await open(path, 'r');
  } catch {
    return { lines: [], offset };
  }
  try {
    const { size } = await handle.stat();
    if (size < offset) {
      offset = 0;
    }
    if (size === offset) {
      return { lines: [], offset };
    }

    const fresh = Buffer.allocUnsafe(size - offset);
    let filled = 0;
    while (filled < fresh.length) {
      const { bytesRead } = await handle.read(
        fresh,
        filled,
        fresh.length - filled,
        offset + filled,
      );
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    const text = fresh.toString('utf8', 0, filled);
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) {
      return { lines: [], offset };
    }
    const complete = text.slice(0, lastNewline);
    return {
      lines: complete.split('\n'),
      offset: offset + Buffer.byteLength(complete, 'utf8') + 1,
    };
  } finally {
    await handle.close();
  }
}

/**
 * Reads a whole `.json` chat document.
 *
 * There is no cursor here and there cannot be one. This file is REWRITTEN in
 * full every turn — pretty-printed, with the session id, the message array and
 * everything in them replaced — so a byte offset from the previous poll points
 * into the middle of a document whose earlier bytes have been rewritten rather
 * than appended. Reading incrementally here is what produces the double-emit
 * the codex bead warns about.
 *
 * So the caller re-reads the document and tracks how many MESSAGES it has
 * already emitted, not how many bytes. A message id is stable across rewrites
 * and a byte count is not.
 */
export async function readChatDocumentFile(path: string): Promise<ChatDocument | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    // Rewritten into place between the listing and the read. The next poll
    // gets it; this is a normal race, not a failure to report.
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A half-written document. Skipping it is right for the same reason a torn
    // tail is held in the `.jsonl` reader: half a document is not a document.
    return undefined;
  }
  return readChatDocument(parsed);
}
