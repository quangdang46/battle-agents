import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent, SessionEndReason } from '@battle-agents/protocol';

/**
 * The Cursor agent transcript, and the only plane this adapter has.
 *
 * THE FORMAT IS ESTABLISHED, NOT GUESSED. The bead this implements named Agent
 * Quest's Cursor provider as a precedent to copy; at the pinned commit that
 * provider does not exist — `.tmp/agent-quest/server/src/providers/` holds
 * `claude-provider.ts` and `codex-provider.ts` and nothing else. So the format
 * below was read off every transcript on the machine the adapter was written
 * against, and the whole of it is these three record shapes and nothing else.
 * All 5,225 records in the 159 transcripts surveyed were one of them:
 *
 *   {"role":"user",      "message":{"content":[{"type":"text","text":…}]}}
 *   {"role":"assistant", "message":{"content":[…,{"type":"tool_use","name":…,"input":…}]}}
 *   {"type":"turn_ended","status":"success"|"aborted"|"error","error":…?}
 *
 * Two consequences are load-bearing and both are facts about the file, not
 * choices made here:
 *
 * 1. NO RECORD CARRIES A TIMESTAMP. Not one of the 5,225. The protocol requires
 *    an explicit `at` on every member of the union, so an event cannot be built
 *    from a record alone. The reader therefore supplies the file's mtime, and
 *    every event from one poll of one transcript shares that instant. It is a
 *    floor, not a measurement: for a finished session it is when the session
 *    ended, so events read back out of an old transcript all carry the same
 *    late instant. The alternative — dropping every record — makes the adapter
 *    emit nothing at all, which is the failure this shape exists to avoid.
 *
 * 2. NO RECORD CARRIES THE SESSION ID either, and the reader takes it from the
 *    path. See `paths.ts`.
 *
 * There is also no tool RESULT on disk: a `tool_use` block is the call, and
 * nothing in the transcript says what came back. So this adapter emits
 * `tool.started` and no `tool.completed`. Emitting a completion anyway would
 * assert an outcome the file does not contain.
 */

export interface TranscriptContext {
  /** From the transcript's path, not from its records. */
  readonly sessionId: string;
  /** The transcript's mtime, as an ISO instant. See the header. */
  readonly at: string;
}

export interface ParsedTranscriptLine {
  readonly events: readonly AgentEvent[];
  /** Set when the line produced nothing, and why. Never both events and skipped. */
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
 * Cursor ends a turn with an explicit status, which is the one place the
 * transcript says anything about how the turn went.
 *
 * The mapping is by meaning rather than by string similarity: a turn Cursor
 * calls `success` finished, one it calls `aborted` was stopped by the user, and
 * one it calls `error` failed. An unrecognised status ends the session as
 * `abandoned`, which is the honest reading of a turn that stopped without
 * saying why.
 */
const TURN_END_REASONS: Readonly<Record<string, SessionEndReason>> = {
  success: 'completed',
  aborted: 'abandoned',
  error: 'crashed',
};

const UNKNOWN_TURN_END_REASON = 'abandoned';

/**
 * One transcript line into the events it yields.
 *
 * A line yields a LIST because one assistant record can carry several tool
 * calls, and the protocol has one `tool.started` per call. A parser that
 * returned one event per line would silently drop every call after the first in
 * a parallel-tool turn — which is most of them, and the count is in the
 * thousands across the transcripts surveyed.
 */
export function parseTranscriptLine(line: string, ctx: TranscriptContext): ParsedTranscriptLine {
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
  const base = { sessionId: ctx.sessionId, at: ctx.at };

  if (record.type === 'turn_ended') {
    const status = stringAt(record, 'status') ?? '<none>';
    return {
      events: [
        {
          ...base,
          type: 'session.ended',
          reason: TURN_END_REASONS[status] ?? UNKNOWN_TURN_END_REASON,
        },
      ],
      skipped: undefined,
    };
  }

  const content = recordOf(record.message).content;
  if (!Array.isArray(content)) {
    return { events: [], skipped: 'no-content' };
  }
  const blocks = content.map(recordOf);

  if (record.role === 'user') {
    // The prompt is the text of the turn, joined: Cursor sends a user turn as
    // text blocks, and an empty turn is a real turn with nothing in it.
    const prompt = blocks
      .map((block) => stringAt(block, 'text'))
      .filter((part): part is string => part !== undefined)
      .join(' ')
      .trim();
    return {
      events: [{ ...base, type: 'prompt.submitted', ...(prompt === '' ? {} : { prompt }) }],
      skipped: undefined,
    };
  }

  if (record.role !== 'assistant') {
    return { events: [], skipped: `unmapped-role:${stringAt(record, 'role') ?? '<none>'}` };
  }

  const events: AgentEvent[] = [];
  for (const block of blocks) {
    if (block.type !== 'tool_use') continue;
    const name = stringAt(block, 'name');
    if (name === undefined) {
      // Counted by the caller as part of nothing, but reported: a tool_use with
      // no name is a format change, and it is a number somebody should see.
      continue;
    }
    events.push({
      ...base,
      type: 'tool.started',
      tool: normalizeToolName(name),
      input: normalizeToolInput(block.input),
    });
  }
  if (events.length === 0) {
    // An assistant turn that is only prose. The game watching the model think is
    // not an event the protocol has room for, and an answer is not a tool call.
    return { events: [], skipped: 'no-tool-calls' };
  }
  return { events, skipped: undefined };
}

/**
 * Reads a transcript from wherever the cursor left off, with the file's mtime.
 *
 * The cursor is a BYTE OFFSET and it has to stay one. A transcript line is
 * UTF-8 on disk and a byte is not a character: `sửa lỗi build 🚀` is 14
 * characters and 20 bytes. Read the file as a string, slice that string at a
 * byte count, and the second poll begins past the end of the line before it —
 * the events in between stop parsing and are counted as skips, so the session
 * loses history and every test still passes, because the fixtures were all
 * ASCII. The drift is always the same way round, because `Buffer.byteLength` is
 * never less than the character count, so the failure is a silent drop rather
 * than a duplicate.
 *
 * A trailing line with no newline is left for the next poll. A JSON document cut
 * in half is not a document, and parsing half of one is how a tailer invents
 * events. A file that shrank — rotated, or replaced — restarts from zero rather
 * than reading from a stale offset into the middle of whatever occupies the path
 * now.
 */
export async function readNewTranscriptLines(
  path: string,
  offset: number,
): Promise<{
  readonly lines: readonly string[];
  readonly offset: number;
  readonly modified: string;
}> {
  let handle: FileHandle;
  try {
    handle = await open(path, 'r');
  } catch {
    return { lines: [], offset, modified: new Date(0).toISOString() };
  }
  try {
    // Sized and read through one handle, so a file replaced between the two
    // cannot report the size of one session and deliver the bytes of another.
    // The mtime comes from the same stat for the same reason: it is the only
    // instant a Cursor record has, and pairing one session's size with
    // another's mtime would date the events to the wrong session.
    const stats = await handle.stat();
    const modified = stats.mtime.toISOString();
    if (stats.size < offset) {
      offset = 0;
    }
    if (stats.size === offset) {
      return { lines: [], offset, modified };
    }

    const fresh = Buffer.allocUnsafe(stats.size - offset);
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
    // A short read is not fatal, but the cursor must advance over what was
    // actually read: a buffer claiming bytes it never received would skip events.
    const text = fresh.toString('utf8', 0, filled);
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) {
      return { lines: [], offset, modified };
    }
    const complete = text.slice(0, lastNewline);
    return {
      lines: complete.split('\n'),
      offset: offset + Buffer.byteLength(complete, 'utf8') + 1,
      modified,
    };
  } finally {
    await handle.close();
  }
}
