import { open, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { deriveCallEvents } from '../derive.js';

/**
 * The JSONL tail: the safety net under the hook plane.
 *
 * Hooks give structured, timely events, and they only fire while the agent
 * cooperates. A crash, a forced quit, a killed terminal or a hook that never
 * installed leaves the session log as the only record that anything happened at
 * all, so without this tail those runs are simply invisible.
 *
 * Reading is incremental by byte offset. A transcript is appended to for the
 * whole life of a session and can reach tens of megabytes, so re-reading it on
 * every poll would be quadratic in the cost of watching an agent. Only the
 * bytes past the cursor are ever read, and a partial trailing line is left for
 * the next poll rather than parsed — a JSON document cut in half is not a
 * document, and parsing half of one is how a tailer invents events.
 *
 * The deduplication is the part worth reading twice. Both planes see the same
 * tool call, and a stream that reports it twice is worse than a stream that
 * misses it: the game shows the agent doing the work twice, and every count
 * downstream is wrong. The hook plane wins, because it is the one that knows a
 * tool ran even when the log line is still being written.
 *
 * The two planes do not share an id — a Claude hook payload names the tool, and
 * a transcript line names a uuid, and there is no field in either that appears
 * in both — so the key here is the pair (event kind, the tool the event came
 * FROM) within a short window. "Came from" and not "names" because one tool
 * call produces several events: an Edit is a `tool.started` and a `file.write`,
 * and keying the second on its own absent `tool` field would leave it matching
 * nothing, so the tail would re-report every file write the hooks had already
 * announced. That is a heuristic and it is named as one: a session that runs
 * the same tool twice inside the window loses the second, and a session that
 * runs two different tools is never affected. The alternative, dropping the
 * tail whenever hooks are healthy, loses a crash's entire record to avoid the
 * problem, which is the worse trade for a net whose job is catching crashes.
 */

const PROJECTS_DIRECTORY = 'projects';

/**
 * How long a hook-reported event suppresses the same event from the log.
 *
 * Long enough to cover the gap between a tool running and its line being
 * written, short enough that a deliberate second use of the same tool is
 * reported. Every value here is a guess about Claude's write timing; it is a
 * named constant so the guess is visible and adjustable rather than buried.
 */
const HOOK_SUPPRESSION_MS = 2_000;

/** How many recent keys to remember, so a busy session cannot grow without bound. */
const DEDUP_MEMORY = 512;

/**
 * What one observed tool call became.
 *
 * The tool is carried alongside the events because the deduplication key is the
 * CALL, not the event. An `Edit` yields a `tool.started` that names `Edit` and a
 * `file.write` that names a path instead, and a ledger keyed on each event's
 * own fields would match the first and miss the second — so a healthy hook
 * plane would still leave every file write to be reported twice.
 */
export interface Observation {
  readonly sessionId: string;
  /** The canonical tool both planes can name. Undefined for a bare prompt. */
  readonly tool: string | undefined;
  readonly events: readonly AgentEvent[];
}

export interface ParsedLine {
  readonly observation: Observation | null;
  /**
   * The line's own uuid, which is the only identifier both planes could ever
   * agree on. Carried so a caller can persist it; not used for cross-plane
   * matching, because the hook payloads do not carry it.
   */
  readonly sourceUuid: string | undefined;
  readonly skipped: string | undefined;
}

/**
 * What the hook plane already reported, recently.
 *
 * Injected rather than shared so the JSONL reader has no dependency on the hook
 * normalizer's internals, and so a test can say exactly what "already
 * reported" means.
 */
export interface HookLedger {
  /** Whether the hook plane saw this kind of event for this session and tool. */
  seenRecently(sessionId: string, kind: string, tool: string | undefined, nowMs: number): boolean;
  /** Records what the hook plane reported, so the tail can defer to it. */
  record(sessionId: string, kind: string, tool: string | undefined, nowMs: number): void;
}

interface LedgerEntry {
  readonly sessionId: string;
  readonly kind: string;
  readonly tool: string | undefined;
  readonly atMs: number;
}

/**
 * A bounded, time-windowed ledger.
 *
 * Bounded because a session that runs for hours would otherwise accumulate one
 * entry per tool call forever, in an adapter whose whole job is to be cheap to
 * leave running. Evicted in insertion order rather than by recency: the oldest
 * entry is also the one furthest past the window, so the two agree.
 */
export function createHookLedger(windowMs = HOOK_SUPPRESSION_MS): HookLedger {
  const entries: LedgerEntry[] = [];

  const matches = (entry: LedgerEntry, sessionId: string, kind: string, tool: string | undefined) =>
    entry.sessionId === sessionId && entry.kind === kind && entry.tool === tool;

  return {
    seenRecently(sessionId, kind, tool, nowMs) {
      return entries.some(
        (entry) => nowMs - entry.atMs < windowMs && matches(entry, sessionId, kind, tool),
      );
    },
    record(sessionId, kind, tool, nowMs) {
      entries.push({ sessionId, kind, tool, atMs: nowMs });
      while (entries.length > DEDUP_MEMORY) {
        entries.shift();
      }
    },
  };
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** The content blocks of an assistant turn, which is where tool calls live. */
function contentBlocksOf(message: unknown): readonly Record<string, unknown>[] {
  const content = recordOf(message).content;
  if (Array.isArray(content)) {
    return content.map(recordOf);
  }
  return [];
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * One transcript line into at most one tool call's worth of events.
 *
 * At most one CALL is deliberate. A single assistant turn can contain several
 * tool calls, and this returns the first one it recognises rather than an
 * array of calls, because the cursor loop below is what decides how much to
 * read — a parser that could return several calls would have to guess at the
 * caller's batching. One call may still produce several events, and they travel
 * together in one Observation precisely so the ledger can treat them as the one
 * fact they are. A line with nothing recognisable becomes null rather than a
 * guess.
 */
export function parseJsonlLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { observation: null, sourceUuid: undefined, skipped: 'blank-line' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // A line that is not JSON is not an event, and saying so beats guessing at
    // what the harness meant to write.
    return { observation: null, sourceUuid: undefined, skipped: 'unparseable' };
  }

  const record = recordOf(parsed);
  const sourceUuid = stringField(record, 'uuid');
  const sessionId = stringField(record, 'sessionId');
  if (sessionId === undefined) {
    return { observation: null, sourceUuid, skipped: 'no-session' };
  }
  const at = stringField(record, 'timestamp');
  if (at === undefined) {
    return { observation: null, sourceUuid, skipped: 'no-timestamp' };
  }
  const base = { sessionId, at };

  const blocks = contentBlocksOf(record.message);
  const toolUse = blocks.find((block) => block.type === 'tool_use');
  if (toolUse !== undefined) {
    const name = stringField(toolUse, 'name');
    if (name === undefined) {
      return { observation: null, sourceUuid, skipped: 'tool-without-name' };
    }
    const tool = normalizeToolName(name);
    const input = normalizeToolInput(toolUse.input);
    return {
      observation: {
        sessionId,
        tool,
        events: [
          { ...base, type: 'tool.started', tool, input },
          // The same file events the hook plane derives on PreToolUse, so the
          // two planes produce identical observations and the ledger can
          // compare them. What the tail cannot derive is any OUTCOME: the
          // tool_use line and the tool_result that follows it are separate
          // lines, and pairing them needs state held across both.
          ...deriveCallEvents(tool, input, base),
        ],
      },
      sourceUuid,
      skipped: undefined,
    };
  }

  if (record.type === 'user') {
    // A user turn that is not a tool result is a prompt. The hook plane reports
    // this too, and the ledger decides which of the two reaches the stream.
    const message = recordOf(record.message);
    if (Array.isArray(message.content)) {
      const isToolResult = contentBlocksOf(record.message).some(
        (block) => block.type === 'tool_result',
      );
      if (isToolResult) {
        return { observation: null, sourceUuid, skipped: 'tool-result-without-use' };
      }
    }
    const prompt = typeof message.content === 'string' ? message.content : undefined;
    return {
      observation: {
        sessionId,
        tool: undefined,
        events: [
          {
            ...base,
            type: 'prompt.submitted',
            ...(prompt === undefined || prompt === '' ? {} : { prompt }),
          },
        ],
      },
      sourceUuid,
      skipped: undefined,
    };
  }

  return {
    observation: null,
    sourceUuid,
    skipped: `unmapped-type:${String(record.type ?? '<none>')}`,
  };
}

/**
 * Reads a transcript from wherever the cursor left off.
 *
 * Returns nothing when the file has not grown, so the common polling case costs
 * one `stat` rather than a read.
 */
export async function readNewLines(
  path: string,
  offset: number,
): Promise<{ readonly lines: readonly string[]; readonly offset: number }> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { lines: [], offset };
  }
  if (size <= offset) {
    return { lines: [], offset: size };
  }

  // Read BYTES and slice BYTES, then decode. Decoding first and slicing the
  // resulting string by the same offset is equivalent only for ASCII: a
  // non-ASCII character is one UTF-16 code unit but two or more bytes, so the
  // two indices drift apart and every poll starts progressively further in,
  // destroying records silently. It always drops rather than duplicates, because
  // byte length is never less than the code-unit count, so nothing here ever
  // looked like the file growing. Codex already reads bytes for this reason;
  // this file was reading characters.
  const fresh = Buffer.allocUnsafe(size - offset);
  let filled = 0;
  const handle = await open(path, 'r');
  try {
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
  } finally {
    await handle.close();
  }

  // A short read is not fatal, but the cursor must advance over what was
  // actually read: a buffer claiming bytes it never received skips events.
  // A multi-byte character split across the tail is already excluded by the
  // newline search below, because 0x0A never appears inside a UTF-8 sequence.
  const text = fresh.toString('utf8', 0, filled);
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { lines: [], offset };
  }
  const complete = text.slice(0, lastNewline);
  const consumed = offset + Buffer.byteLength(complete, 'utf8') + 1;
  return { lines: complete.split('\n'), offset: consumed };
}

/** Where a machine keeps its Claude transcripts. Overridable so a test is not a real one. */
export function transcriptsDirectory(home = homedir()): string {
  return join(home, '.claude', PROJECTS_DIRECTORY);
}

/**
 * Whether the hook plane already reported this event, so the tail defers to it.
 *
 * Exported rather than applied inside `parseJsonlLine` because parsing is
 * translation and deduplication is policy: the same parsed line is the right
 * event in one deployment and a duplicate in another, depending entirely on
 * whether hooks are healthy. Collapsing the two would make the policy
 * unreachable and untestable.
 */
export function unreported(
  ledger: HookLedger,
  observation: Observation,
  nowMs: number,
): readonly AgentEvent[] {
  return observation.events.filter(
    (event) => !ledger.seenRecently(observation.sessionId, event.type, observation.tool, nowMs),
  );
}

/**
 * Records what the hook plane reported, so a later log line defers to it.
 *
 * One call to the ledger PER EVENT, keyed on the call's tool. A `file.write`
 * names a path and no tool at all, so keying it on the event's own fields would
 * record it under an empty tool and let the identical write through.
 */
export function recordObservation(
  ledger: HookLedger,
  observation: Observation,
  nowMs: number,
): void {
  for (const event of observation.events) {
    ledger.record(observation.sessionId, event.type, observation.tool, nowMs);
  }
}
