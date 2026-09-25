import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

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
 * in both — so the key here is the pair (event kind, tool) within a short
 * window. That is a heuristic and it is named as one: a session that runs the
 * same tool twice inside the window loses the second, and a session that runs
 * two different tools is never affected. The alternative, dropping the tail
 * whenever hooks are healthy, loses a crash's entire record to avoid the
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

export interface ParsedLine {
  readonly event: AgentEvent | null;
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

  const matches = (
    entry: LedgerEntry,
    sessionId: string,
    kind: string,
    tool: string | undefined,
  ) => entry.sessionId === sessionId && entry.kind === kind && entry.tool === tool;

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
 * One transcript line into at most one event.
 *
 * At most one is deliberate. A single assistant turn can contain several tool
 * calls, and this returns the first tool call it recognises rather than an
 * array, because the cursor loop below is what decides how much to read — a
 * parser that could return several events would have to guess at the caller's
 * batching. One line, one event, and a line with nothing recognisable becomes
 * null rather than a guess.
 */
export function parseJsonlLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { event: null, sourceUuid: undefined, skipped: 'blank-line' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // A line that is not JSON is not an event, and saying so beats guessing at
    // what the harness meant to write.
    return { event: null, sourceUuid: undefined, skipped: 'unparseable' };
  }

  const record = recordOf(parsed);
  const sourceUuid = stringField(record, 'uuid');
  const sessionId = stringField(record, 'sessionId');
  if (sessionId === undefined) {
    return { event: null, sourceUuid, skipped: 'no-session' };
  }
  const at = stringField(record, 'timestamp');
  if (at === undefined) {
    return { event: null, sourceUuid, skipped: 'no-timestamp' };
  }
  const base = { sessionId, at };

  const blocks = contentBlocksOf(record.message);
  const toolUse = blocks.find((block) => block.type === 'tool_use');
  if (toolUse !== undefined) {
    const name = stringField(toolUse, 'name');
    if (name === undefined) {
      return { event: null, sourceUuid, skipped: 'tool-without-name' };
    }
    return {
      event: {
        ...base,
        type: 'tool.started',
        tool: normalizeToolName(name),
        input: normalizeToolInput(toolUse.input),
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
        return { event: null, sourceUuid, skipped: 'tool-result-without-use' };
      }
    }
    const prompt = typeof message.content === 'string' ? message.content : undefined;
    return {
      event: {
        ...base,
        type: 'prompt.submitted',
        ...(prompt === undefined || prompt === '' ? {} : { prompt }),
      },
      sourceUuid,
      skipped: undefined,
    };
  }

  return { event: null, sourceUuid, skipped: `unmapped-type:${String(record.type ?? '<none>')}` };
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

  const whole = await readFile(path, 'utf8');
  const fresh = whole.slice(offset);
  // A trailing newline is what makes the last line complete. Without one the
  // file is mid-write and the partial line belongs to the next poll.
  const lastNewline = fresh.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { lines: [], offset };
  }
  const complete = fresh.slice(0, lastNewline);
  const consumed = offset + Buffer.byteLength(complete, 'utf8') + 1;
  return { lines: complete.split('\n'), offset: consumed };
}

/** Where a machine keeps its Claude transcripts. Overridable so a test is not a real one. */
export function transcriptsDirectory(home = homedir()): string {
  return join(home, '.claude', PROJECTS_DIRECTORY);
}

/** The tool an event is about, or undefined for an event that names none. */
function toolOf(event: AgentEvent): string | undefined {
  return 'tool' in event && typeof event.tool === 'string' ? event.tool : undefined;
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
export function isAlreadyReported(ledger: HookLedger, event: AgentEvent, nowMs: number): boolean {
  return ledger.seenRecently(event.sessionId, event.type, toolOf(event), nowMs);
}

/** Records what the hook plane reported, so a later log line defers to it. */
export function recordReported(ledger: HookLedger, event: AgentEvent, nowMs: number): void {
  ledger.record(event.sessionId, event.type, toolOf(event), nowMs);
}
