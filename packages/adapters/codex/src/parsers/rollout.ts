import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * The Codex rollout log, and the only plane this adapter has.
 *
 * Codex has no hook surface at all, so everything known about a session comes
 * from the file it appends to. That is not a degraded version of the Claude
 * adapter — it is the proof that the telemetry plane is harness-agnostic rather
 * than a wrapper around one harness's extension points. If a hook-based adapter
 * and this one both work, the same protocol carries two unrelated tools, and
 * section 22's "two harnesses visible at once" is a fact rather than a claim.
 *
 * The cursor is the same shape as the Claude one, and that duplication is
 * deliberate. Adapters import `core` and `protocol` and nothing else, so a
 * shared file-watching module would have to live in one of those two — where
 * neither belongs, since a byte offset is not a primitive and not part of the
 * wire contract. The template says copy this file, and this is that.
 *
 * Every line is read defensively. A rollout format we do not recognise becomes
 * a counted skip rather than a guess, so a Codex upgrade shows up as a number
 * that changed instead of a stream that quietly went quiet.
 */

const CODEX_DIRECTORY = 'sessions';

/** Where Codex keeps its sessions, by year, month and day. */
export function codexSessionsDirectory(home = homedir()): string {
  return join(home, '.codex', CODEX_DIRECTORY);
}

export interface ParsedRolloutLine {
  readonly event: AgentEvent | null;
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
 * Codex timestamps are epoch milliseconds in some records and ISO strings in
 * others, and the protocol requires an explicit offset. An epoch number is
 * unambiguous, so it is the better of the two; a missing timestamp is dropped
 * rather than invented, because an event with a fabricated instant is worse
 * than a missing one on a stream that a client can reconcile.
 */
function instantAt(source: Record<string, unknown>): string | undefined {
  const raw = source.timestamp ?? source.ts;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === 'string' && raw !== '') {
    return Number.isNaN(Date.parse(raw)) ? undefined : new Date(Date.parse(raw)).toISOString();
  }
  return undefined;
}

/** The text of a message's content, whether it arrives as a string or as blocks. */
function textOf(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content === '' ? undefined : content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const parts = content
    .map((block) => stringAt(recordOf(block), 'text'))
    .filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' ');
}

/**
 * One rollout line into at most one event.
 *
 * The session id is read from the envelope first and from the payload second,
 * because Codex stamps it in both places and which one is present depends on
 * the record kind. A line carrying neither cannot produce a valid event — the
 * protocol requires a sessionId on every member of the union — so it is dropped
 * rather than filled in from a default.
 */
export function parseRolloutLine(line: string): ParsedRolloutLine {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { event: null, skipped: 'blank-line' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { event: null, skipped: 'unparseable' };
  }

  const record = recordOf(parsed);
  const payload = recordOf(record.payload);
  const at = instantAt(record) ?? instantAt(payload);
  if (at === undefined) {
    return { event: null, skipped: 'no-timestamp' };
  }

  // Codex stamps the session in three different places depending on the record
  // kind: `session_id` on the envelope for response items, and `id` INSIDE the
  // payload for the session_meta record. Reading only the first two dropped
  // every session's opening event and left a stream that began mid-conversation.
  const sessionId =
    stringAt(record, 'session_id') ?? stringAt(payload, 'session_id') ?? stringAt(payload, 'id');
  if (sessionId === undefined) {
    return { event: null, skipped: 'no-session' };
  }
  const base = { sessionId, at };

  switch (stringAt(record, 'type')) {
    case 'session_meta': {
      const installationId = stringAt(payload, 'installation_id') ?? 'codex';
      const agentId = stringAt(payload, 'agent_id') ?? sessionId;
      const projectId = stringAt(payload, 'cwd') ?? stringAt(payload, 'project_id') ?? sessionId;
      return {
        event: { ...base, type: 'session.started', agentId, installationId, projectId, harness: 'codex' },
        skipped: undefined,
      };
    }
    case 'response_item':
      return parseResponseItem(base, payload);
    default:
      return { event: null, skipped: `unmapped-type:${stringAt(record, 'type') ?? '<none>'}` };
  }
}

function parseResponseItem(
  base: { sessionId: string; at: string },
  payload: Record<string, unknown>,
): ParsedRolloutLine {
  switch (stringAt(payload, 'type')) {
    case 'message': {
      if (stringAt(payload, 'role') !== 'user') {
        // The assistant's own messages are the game watching itself think, and
        // the protocol has a `thinking` event for that only if a harness can
        // distinguish reasoning from an answer. A user turn is unambiguous.
        return { event: null, skipped: 'not-a-user-message' };
      }
      const prompt = textOf(payload.content);
      return {
        event: { ...base, type: 'prompt.submitted', ...(prompt === undefined ? {} : { prompt }) },
        skipped: undefined,
      };
    }
    case 'function_call': {
      const name = stringAt(payload, 'name');
      if (name === undefined) {
        return { event: null, skipped: 'tool-without-name' };
      }
      return {
        event: {
          ...base,
          type: 'tool.started',
          tool: normalizeToolName(name),
          // Codex ships arguments as a JSON STRING, not an object. Parsed here
          // so a consumer reads one shape; an unparseable string is passed
          // through as the raw text rather than dropped, because the tool still
          // ran and losing the event would hide that.
          input: normalizeToolInput(parseArguments(payload.arguments)),
        },
        skipped: undefined,
      };
    }
    case 'function_call_output': {
      const name = stringAt(payload, 'name');
      if (name === undefined) {
        return { event: null, skipped: 'output-without-name' };
      }
      const output = payload.output ?? payload.result;
      return {
        event: { ...base, type: 'tool.completed', tool: normalizeToolName(name), ok: !isFailure(output), durationMs: 0 },
        skipped: undefined,
      };
    }
    default:
      return { event: null, skipped: `unmapped-item:${stringAt(payload, 'type') ?? '<none>'}` };
  }
}

/**
 * Codex ships call arguments as a JSON STRING.
 *
 * Parsed so a consumer reads one shape. A string that will not parse is wrapped
 * as `{ raw }` rather than passed through or dropped: `normalizeToolInput`
 * reduces a non-object to `{}`, so a bare string would arrive as an empty input
 * and the command the agent actually ran would be gone — while the tool.started
 * that reported it stayed, which is the worst combination.
 */
function parseArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/** Whether a call output reports an error, in either of the two shapes seen. */
function isFailure(output: unknown): boolean {
  if (typeof output !== 'object' || output === null) {
    return false;
  }
  const record = output as Record<string, unknown>;
  if (record.ok === false || record.success === false) {
    return true;
  }
  if (typeof record.output === 'string') {
    return record.output.startsWith('Error') || record.output.startsWith('error:');
  }
  return 'error' in record && record.error !== undefined && record.error !== null;
}

/**
 * Reads a rollout from wherever the cursor left off.
 *
 * Incremental, and a trailing line with no newline is left for the next poll: a
 * JSON document cut in half is not a document, and parsing half of one is how a
 * tailer invents events. A file that shrank — rotated, or replaced — resets the
 * cursor rather than reading from a stale offset into the middle of whatever
 * now occupies the path.
 */
export async function readNewRolloutLines(
  path: string,
  offset: number,
): Promise<{ readonly lines: readonly string[]; readonly offset: number }> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { lines: [], offset };
  }
  if (size < offset) {
    // The file shrank, so it was rotated or replaced. Reading from the stale
    // offset would start wherever it happened to land in a DIFFERENT session's
    // file. Restart from zero and read what is there now, rather than resetting
    // the cursor and making the caller poll once more to find out.
    return readNewRolloutLines(path, 0);
  }
  if (size === offset) {
    return { lines: [], offset };
  }

  const fresh = (await readFile(path, 'utf8')).slice(offset);
  const lastNewline = fresh.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { lines: [], offset };
  }
  const complete = fresh.slice(0, lastNewline);
  return {
    lines: complete.split('\n'),
    offset: offset + Buffer.byteLength(complete, 'utf8') + 1,
  };
}
