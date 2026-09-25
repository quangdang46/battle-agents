import { readFile, stat } from 'node:fs/promises';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * The Pi session log, and the only plane this adapter has.
 *
 * Pi has no hook surface, so everything known about a session comes from the
 * JSONL file it appends to. That makes this the same shape as the Codex
 * adapter, and the duplication between them is deliberate: adapters import
 * `core` and `protocol` and nothing else, so shared file-watching code would
 * have to live in one of those two, where a cursor and a record shape neither
 * belong. The template says copy the parser; this is that.
 *
 * What Pi does differently from Codex, and the three places a copy gets it
 * wrong:
 *
 * 1. **Only the first line of a file knows the session id.** Codex stamps
 *    `session_id` on every record; Pi stamps it on the `session` header and
 *    nowhere else, so a message record has to be told which file it came from.
 *    That is `PiLogState`, and a parser that ignores it either drops every
 *    message or invents a session id.
 * 2. **A tool result is a message ROLE, not a content block.** Searching the
 *    content blocks for a result type finds none at all — every observed result
 *    is `message.role === 'toolResult'` — so an implementer who looked there
 *    concludes the harness cannot report completion and ships without it.
 * 3. **Most `toolResult` records are not tool results.** 1266 of the 1289
 *    observed carry the role and nothing that identifies a tool: no name, no
 *    call id, no error flag, just text and a usage record. Emitting
 *    `tool.completed` for those would invent 1266 completions of tools that
 *    were never called.
 *
 * Every line is read defensively. A record shape Pi has not shipped becomes a
 * counted skip rather than a guess, so a Pi upgrade shows up as a number that
 * changed instead of a stream that quietly went quiet.
 */

const HARNESS = 'pi';

/** The byte a JSONL record ends with, as a Buffer searches for it: a value, not a string. */
const NEWLINE = 0x0a;

/** The offsets a record timestamp is allowed to carry, and nothing else. */
const HAS_EXPLICIT_OFFSET = /(?:Z|z|[+-]\d{2}:\d{2})$/;

export interface ParsedPiLine {
  readonly events: readonly AgentEvent[];
  /** Why this line produced nothing. Undefined when it produced something. */
  readonly skipped: string | undefined;
}

/**
 * What a session file knows that a single line does not.
 *
 * Owned by the watcher, one per file, because it IS the per-file state: the
 * session id read from the header, and the start time of every tool call still
 * waiting for its result. Both are learned from earlier lines in the same file,
 * which is why the parser takes this rather than reading a line in isolation.
 */
export interface PiLogState {
  /** Set once the header has been read. Every later event needs it. */
  sessionId: string | undefined;
  /** toolCallId -> the instant the call was announced, for durationMs. */
  readonly startedAt: Map<string, number>;
}

export function createLogState(): PiLogState {
  return { sessionId: undefined, startedAt: new Map() };
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringAt(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function blocksOf(message: Record<string, unknown>): readonly Record<string, unknown>[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is Record<string, unknown> =>
      typeof block === 'object' && block !== null && !Array.isArray(block),
  );
}

/**
 * A record's own timestamp, as the canonical instant the protocol accepts.
 *
 * Stricter than `Date.parse` in the one way that matters here. `Date.parse` on
 * a string with no offset reads it as LOCAL time, and the reader's zone is not
 * something an event is allowed to carry: the protocol rejects a zoneless
 * instant because it denotes a different moment on every machine. A zoneless
 * timestamp is skipped rather than silently localized.
 *
 * The message's own `timestamp` is deliberately not a fallback. Where it exists
 * at all it is epoch milliseconds rather than a string — a different form — and
 * it is absent from all but 69 of the observed records, so reading the record's
 * timestamp is right for every record rather than for the minority that
 * happens to carry the other form.
 */
function instantAt(source: Record<string, unknown>): string | undefined {
  const raw = source.timestamp;
  if (typeof raw !== 'string' || raw === '' || !HAS_EXPLICIT_OFFSET.test(raw)) return undefined;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function skipped(reason: string): ParsedPiLine {
  return { events: [], skipped: reason };
}

/**
 * One Pi record into the events it actually asserts.
 *
 * A record can carry more than one event. An assistant message that thinks and
 * then calls a tool is two real things that happened, and collapsing them to
 * one — whichever the parser happened to prefer — would drop an event the
 * protocol has a type for.
 */
export function parseSessionLine(line: string, state: PiLogState): ParsedPiLine {
  const trimmed = line.trim();
  if (trimmed === '') return skipped('blank-line');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return skipped('unparseable');
  }

  const record = recordOf(parsed);
  const at = instantAt(record);
  if (at === undefined) return skipped('no-timestamp');

  const type = stringAt(record, 'type');
  if (type === 'session') return parseHeader(record, at, state);
  if (type === 'message') return parseMessage(record, at, state);
  // `model_change`, `thinking_level_change` and `compaction` are Pi's own
  // bookkeeping. The protocol has no event for a model swap or a compaction,
  // and `thinking` is the reasoning block below, not this — so a line arrives
  // here with a real meaning and nowhere to put it. Counting it is honest;
  // mapping it onto the nearest event type would not be.
  return skipped(`unmapped-type:${type ?? '<none>'}`);
}

function parseHeader(record: Record<string, unknown>, at: string, state: PiLogState): ParsedPiLine {
  const sessionId = stringAt(record, 'id');
  if (sessionId === undefined) return skipped('no-session');

  // Recorded before the event is built rather than after, so a message record
  // that somehow arrived first is still read against the right session.
  state.sessionId = sessionId;

  return {
    events: [
      {
        type: 'session.started',
        sessionId,
        at,
        // Pi names no agent, so the run is the character. That is the Codex
        // adapter's answer to the same absence, and a Pi session in two project
        // directories is two runs.
        agentId: sessionId,
        // The harness name, and not Pi's `provider`: that is which model vendor
        // answered, which changes when the user switches models and is not an
        // identity at all. An installation is the machine.
        installationId: HARNESS,
        // The header's cwd, which is the real path. The directory the file sits
        // in is a lossy encoding of it; see paths.ts.
        projectId: stringAt(record, 'cwd') ?? sessionId,
        harness: HARNESS,
      },
    ],
    skipped: undefined,
  };
}

function parseMessage(
  record: Record<string, unknown>,
  at: string,
  state: PiLogState,
): ParsedPiLine {
  const message = recordOf(record.message);
  const sessionId = state.sessionId;
  // The session id lives only on the header, so a message read before it is a
  // line with no session attached rather than one to attach a guess to.
  if (sessionId === undefined) return skipped('no-session');
  const base = { sessionId, at };

  switch (stringAt(message, 'role')) {
    case 'user': {
      const prompt = textOf(blocksOf(message));
      return {
        events: [
          { ...base, type: 'prompt.submitted', ...(prompt === undefined ? {} : { prompt }) },
        ],
        skipped: undefined,
      };
    }
    case 'assistant':
      return parseAssistant(message, base, state);
    case 'toolResult':
      return parseToolResult(message, base, state);
    default:
      return skipped(`unmapped-role:${stringAt(message, 'role') ?? '<none>'}`);
  }
}

interface EventBase {
  readonly sessionId: string;
  readonly at: string;
}

/**
 * An assistant turn: reasoning and tool calls, and neither its prose.
 *
 * The prose is dropped the way the Codex adapter drops an assistant's answer,
 * because a `prompt.submitted` is a thing the person did and an answer is the
 * game watching itself talk. A `thinking` block is different in kind and is
 * emitted: Pi labels reasoning as such, which is exactly the distinction the
 * Codex adapter could not draw.
 */
function parseAssistant(
  message: Record<string, unknown>,
  base: EventBase,
  state: PiLogState,
): ParsedPiLine {
  const events: AgentEvent[] = [];
  for (const block of blocksOf(message)) {
    if (block.type === 'thinking') {
      events.push({ ...base, type: 'thinking' });
      continue;
    }
    if (block.type !== 'toolCall') continue;

    const tool = stringAt(block, 'name');
    if (tool === undefined) continue;
    const callId = stringAt(block, 'id');
    if (callId !== undefined) state.startedAt.set(callId, Date.parse(base.at));
    events.push({
      ...base,
      type: 'tool.started',
      tool: normalizeToolName(tool),
      input: normalizeToolInput(block.arguments),
    });
  }

  if (events.length > 0) return { events, skipped: undefined };
  return skipped('assistant-without-activity');
}

function parseToolResult(
  message: Record<string, unknown>,
  base: EventBase,
  state: PiLogState,
): ParsedPiLine {
  const tool = stringAt(message, 'toolName');
  if (tool === undefined) {
    // The role without a name is not a failed parse; it is the shape Pi uses for
    // a turn that is not about a tool, and it is the overwhelming majority of
    // records carrying this role.
    return skipped('result-without-tool');
  }

  const callId = stringAt(message, 'toolCallId');
  const startedAt = callId === undefined ? undefined : state.startedAt.get(callId);
  // Deleted either way: a call has one result, and holding the id after it
  // would make the map grow for the length of the session.
  if (callId !== undefined) state.startedAt.delete(callId);

  const canonical = normalizeToolName(tool);
  if (message.isError === true) {
    return {
      events: [{ ...base, type: 'tool.failed', tool: canonical, reason: TOOL_ERROR_REASON }],
      skipped: undefined,
    };
  }

  return {
    events: [
      {
        ...base,
        type: 'tool.completed',
        tool: canonical,
        ok: true,
        // Zero means "not measurable", not "instantaneous": a result whose call
        // was never seen — a file the watcher joined mid-stream, or a call in a
        // line torn by the cursor — has no start to measure from. Every observed
        // result does have one, and gets the real number.
        durationMs: startedAt === undefined ? 0 : elapsedMs(startedAt, base.at),
      },
    ],
    skipped: undefined,
  };
}

/** A stable token, not Pi's error text: the text is the tool's output, not a reason. */
const TOOL_ERROR_REASON = 'pi-tool-reported-error';

function elapsedMs(startedAt: number, at: string): number {
  // Clamped, because a result timestamped before its call is a clock problem in
  // the harness and the schema refuses a negative duration — so the value is
  // dropped to zero rather than to an event the server would reject whole.
  return Math.max(0, Date.parse(at) - startedAt);
}

/** The text of a message, whether it arrives as one block or several. */
function textOf(blocks: readonly Record<string, unknown>[]): string | undefined {
  const parts = blocks
    .filter((block) => block.type === 'text')
    .map((block) => stringAt(block, 'text'))
    .filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' ');
}

/**
 * Reads a session log from wherever the cursor left off.
 *
 * Incremental, and a trailing line with no newline is left for the next poll: a
 * JSON document cut in half is not a document, and parsing half of one is how a
 * tailer invents events. That matters more here than for a single-file watcher,
 * because a Pi session file is created by writing the header and then appended
 * to, so the very first poll of a brand new session is the poll most likely to
 * catch a half-written line.
 *
 * A file that shrank — rotated, or replaced — restarts the cursor rather than
 * reading from a stale offset into whatever now occupies the path.
 *
 * The offset is a BYTE offset, because that is what `stat` reports and the only
 * measure that survives a file being appended to between two polls. So the slice
 * has to happen on bytes too, and the decode has to happen after it. Decoding
 * first and slicing the decoded string at a byte offset reads too far in: a
 * character outside ASCII is one code unit but two or more bytes, so the two
 * indices drift apart by one per such character the reader has already passed,
 * and each poll starts its next record that many characters late. Records then
 * arrive as fragments, fail to parse, and are counted as unreadable — measured
 * on a real 750-record session, 33 of them, silently, with the session still
 * looking alive. Any prompt, diff or path with an accent, an emoji or a CJK
 * character in it is enough to start it. Slicing before decoding is also what
 * keeps a multi-byte character half-written at the tail from corrupting a line
 * that did arrive whole.
 */
export async function readNewSessionLines(
  path: string,
  offset: number,
): Promise<{ readonly lines: readonly string[]; readonly offset: number }> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { lines: [], offset };
  }
  if (size < offset) return readNewSessionLines(path, 0);
  if (size === offset) return { lines: [], offset };

  const fresh = (await readFile(path)).subarray(offset);
  const lastNewline = fresh.lastIndexOf(NEWLINE);
  if (lastNewline === -1) return { lines: [], offset };
  return {
    lines: fresh.toString('utf8', 0, lastNewline).split('\n'),
    offset: offset + lastNewline + 1,
  };
}
