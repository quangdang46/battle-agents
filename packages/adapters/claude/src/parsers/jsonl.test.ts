import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentEventSchema, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import {
  createHookLedger,
  isAlreadyReported,
  parseJsonlLine,
  readNewLines,
  recordReported,
} from './jsonl.js';

/**
 * The safety net, and the three things it has to get right.
 *
 * Translation: a transcript line is Claude's shape, not ours, and an event this
 * emits is validated at the door by AgentEventSchema. A local expectation would
 * pass while the real thing bounced with a 400.
 *
 * Incrementality: a transcript reaches tens of megabytes over a session, so
 * re-reading it per poll is quadratic in the cost of watching an agent. The
 * cursor advances and a half-written line is left alone.
 *
 * Deduplication: both planes see the same tool call, and reporting it twice is
 * worse than missing it — the game shows the work happening twice and every
 * count downstream is wrong.
 */

const SESSION = 'claude-session-abc';
const AT = '2026-09-25T09:00:00.000Z';

/** Asserts against the schema the server validates with, not a local copy. */
function parsed(line: string): AgentEvent | null {
  const { event, skipped } = parseJsonlLine(line);
  if (event === null) {
    expect(skipped, 'a dropped line should say why').toBeDefined();
    return null;
  }
  const result = AgentEventSchema.safeParse(event);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return event;
}

function line(fields: Record<string, unknown>): string {
  return JSON.stringify({ sessionId: SESSION, timestamp: AT, ...fields });
}

function transcript(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'claude-jsonl-')), 'session.jsonl');
  writeFileSync(path, '', 'utf8');
  return path;
}

describe('translating a transcript line', () => {
  it('reads a tool call out of an assistant turn', () => {
    const event = parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: {
          content: [
            { type: 'text', text: 'let me look' },
            { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: 'src/index.ts' } },
          ],
        },
      }),
    );

    expect(event).toMatchObject({
      type: 'tool.started',
      tool: normalizeToolName('Read'),
      input: { file_path: 'src/index.ts' },
    });
  });

  it('reads a prompt out of a user turn', () => {
    const event = parsed(
      line({ type: 'user', uuid: 'u-2', message: { content: 'fix the build' } }),
    );

    expect(event).toMatchObject({ type: 'prompt.submitted', prompt: 'fix the build' });
  });

  it('normalises the tool name, so the tail and the hooks agree on one activity', () => {
    const event = parsed(
      line({
        type: 'assistant',
        uuid: 'u-3',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
      }),
    );

    expect(event).toMatchObject({ tool: normalizeToolName('Bash') });
  });

  it('drops a line that is not JSON, rather than guessing at it', () => {
    expect(parsed('not json at all')).toBeNull();
    expect(parseJsonlLine('{ truncated').skipped).toBe('unparseable');
  });

  it('drops a line with no session id or no timestamp', () => {
    expect(parseJsonlLine(JSON.stringify({ timestamp: AT })).skipped).toBe('no-session');
    expect(parseJsonlLine(JSON.stringify({ sessionId: SESSION })).skipped).toBe('no-timestamp');
  });

  it('drops a tool call with no name, rather than emitting an empty one', () => {
    const outcome = parseJsonlLine(
      line({ type: 'assistant', uuid: 'u-4', message: { content: [{ type: 'tool_use' }] } }),
    );

    expect(outcome.event).toBeNull();
    expect(outcome.skipped).toBe('tool-without-name');
  });

  it('drops a tool result, because the tool_use line already reported the call', () => {
    const outcome = parseJsonlLine(
      line({
        type: 'user',
        uuid: 'u-5',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
      }),
    );

    expect(outcome.event).toBeNull();
    expect(outcome.skipped).toBe('tool-result-without-use');
  });

  it('carries the line uuid, which is the only id both planes could name', () => {
    expect(parseJsonlLine(line({ type: 'user', uuid: 'u-9', message: { content: 'hi' } })).sourceUuid).toBe('u-9');
  });
});

describe('reading incrementally', () => {
  it('reads only what was appended since the cursor', async () => {
    const path = transcript();
    appendFileSync(path, `${line({ type: 'user', uuid: 'a', message: { content: 'one' } })}\n`, 'utf8');

    const first = await readNewLines(path, 0);
    expect(first.lines).toHaveLength(1);

    // The cursor is byte-based, so a second read continues rather than restarting.
    appendFileSync(path, `${line({ type: 'user', uuid: 'b', message: { content: 'two' } })}\n`, 'utf8');
    const second = await readNewLines(path, first.offset);
    expect(second.lines).toHaveLength(1);
    expect(JSON.parse(second.lines[0] as string).uuid).toBe('b');
  });

  it('leaves a half-written line for the next poll', async () => {
    // A JSON document cut in half is not a document. Parsing half of one is how
    // a tailer invents events, which is the failure this cursor exists to stop.
    const path = transcript();
    appendFileSync(path, `${line({ type: 'user', uuid: 'a', message: { content: 'on' } })}\n{"uuid":"b","ses`, 'utf8');

    const result = await readNewLines(path, 0);

    expect(result.lines).toHaveLength(1);
    expect(JSON.parse(result.lines[0] as string).uuid).toBe('a');
  });

  it('costs one stat, not a read, when nothing was appended', async () => {
    const path = transcript();
    appendFileSync(path, `${line({ type: 'user', uuid: 'a', message: { content: 'one' } })}\n`, 'utf8');
    const first = await readNewLines(path, 0);

    const second = await readNewLines(path, first.offset);

    expect(second.lines).toEqual([]);
  });

  it('survives a file that is not there', async () => {
    const result = await readNewLines(join(tmpdir(), 'definitely-not-a-transcript.jsonl'), 0);

    expect(result).toEqual({ lines: [], offset: 0 });
  });
});

describe('deferring to the hook plane', () => {
  it('drops a log event the hooks already reported', () => {
    const ledger = createHookLedger();
    const fromHook: AgentEvent = {
      type: 'tool.started',
      sessionId: SESSION,
      at: AT,
      tool: normalizeToolName('Read'),
    };
    recordReported(ledger, fromHook, 1_000);

    const fromLog = parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] },
      }),
    );

    expect(fromLog).not.toBeNull();
    expect(isAlreadyReported(ledger, fromLog as AgentEvent, 1_100)).toBe(true);
  });

  it('lets through a different tool, because the two planes agree per tool', () => {
    const ledger = createHookLedger();
    recordReported(
      ledger,
      { type: 'tool.started', sessionId: SESSION, at: AT, tool: normalizeToolName('Read') },
      1_000,
    );

    const fromLog = parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
      }),
    );

    expect(isAlreadyReported(ledger, fromLog as AgentEvent, 1_100)).toBe(false);
  });

  it('stops suppressing once the window has passed, so a deliberate second use counts', () => {
    // Without this the adapter would report the first use of a tool in a
    // session and silently swallow every later one, which is the kind of bug
    // that looks like the agent simply being busy.
    const ledger = createHookLedger(1_000);
    recordReported(
      ledger,
      { type: 'tool.started', sessionId: SESSION, at: AT, tool: normalizeToolName('Read') },
      1_000,
    );

    const fromLog = parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }),
    );

    expect(isAlreadyReported(ledger, fromLog as AgentEvent, 1_500)).toBe(true);
    expect(isAlreadyReported(ledger, fromLog as AgentEvent, 5_000)).toBe(false);
  });

  it('does not confuse one session for another', () => {
    const ledger = createHookLedger();
    recordReported(
      ledger,
      { type: 'tool.started', sessionId: 'session-one', at: AT, tool: normalizeToolName('Read') },
      1_000,
    );

    const fromLog = parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] },
      }),
    );

    expect(isAlreadyReported(ledger, { ...(fromLog as AgentEvent), sessionId: 'session-two' }, 1_100)).toBe(false);
  });
});
