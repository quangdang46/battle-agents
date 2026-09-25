import { mkdtempSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentEventSchema, normalizeToolName } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import {
  createHookLedger,
  parseJsonlLine,
  readNewLines,
  recordObservation,
  unreported,
  type Observation,
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

/**
 * Asserts against the schema the server validates with, not a local copy.
 *
 * Returns the whole observation rather than one event, because a tool call
 * produces more than one and the ledger keys on the CALL. A helper that handed
 * back only the first event would let the derived file event go unvalidated.
 */
function parsed(text: string): Observation | null {
  const { observation, skipped } = parseJsonlLine(text);
  if (observation === null) {
    expect(skipped, 'a dropped line should say why').toBeDefined();
    return null;
  }
  for (const event of observation.events) {
    const result = AgentEventSchema.safeParse(event);
    expect(result.success, `${event.type}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
  }
  return observation;
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
  it('reads a tool call out of an assistant turn, and the file it names', () => {
    const observation = parsed(
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

    // The file event is derived here rather than left to the hook plane, because
    // a session whose hooks never installed has to still show which files it
    // touched — and because the two planes have to derive it identically or the
    // ledger compares a tool.started against a file.write and reports the same
    // edit twice.
    expect(observation?.events).toEqual([
      {
        type: 'tool.started',
        sessionId: SESSION,
        at: AT,
        tool: normalizeToolName('Read'),
        input: { file_path: 'src/index.ts' },
      },
      { type: 'file.read', sessionId: SESSION, at: AT, path: 'src/index.ts' },
    ]);
  });

  it('reads a prompt out of a user turn', () => {
    const observation = parsed(
      line({ type: 'user', uuid: 'u-2', message: { content: 'fix the build' } }),
    );

    expect(observation?.events).toEqual([
      { type: 'prompt.submitted', sessionId: SESSION, at: AT, prompt: 'fix the build' },
    ]);
    // A prompt is not a tool call, so it keys on nothing — which is what lets
    // the two planes agree about it.
    expect(observation?.tool).toBeUndefined();
  });

  it('normalises the tool name, so the tail and the hooks agree on one activity', () => {
    const observation = parsed(
      line({
        type: 'assistant',
        uuid: 'u-3',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
      }),
    );

    expect(observation?.tool).toBe(normalizeToolName('Bash'));
  });

  it('reports no outcome for a tool call, because the result is a different line', () => {
    // The tail sees the tool_use line and the tool_result as two entries, and
    // pairing them needs state held across both. Claiming a test passed here
    // would be a claim about a line that had not been written yet.
    const observation = parsed(
      line({
        type: 'assistant',
        uuid: 'u-6',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } }] },
      }),
    );

    expect(observation?.events.map((event) => event.type)).toEqual(['tool.started']);
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

    expect(outcome.observation).toBeNull();
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

    expect(outcome.observation).toBeNull();
    expect(outcome.skipped).toBe('tool-result-without-use');
  });

  it('carries the line uuid, which is the only id both planes could name', () => {
    expect(
      parseJsonlLine(line({ type: 'user', uuid: 'u-9', message: { content: 'hi' } })).sourceUuid,
    ).toBe('u-9');
  });
});

describe('reading incrementally', () => {
  it('keeps a multi-byte line from eating the lines after it', async () => {
    // The cursor is a BYTE offset but a decoded string is indexed in UTF-16 code
    // units, and the two only agree on ASCII. Every other fixture in this file
    // was pure ASCII, which is why a reader that sliced a string by a byte
    // offset passed all of them while destroying records on a real transcript.
    //
    // Verified failing: with the byte-slicing read restored, the second read
    // starts past the start of line two and returns a torn fragment that throws
    // `Unexpected non-whitespace character after JSON`.
    const path = transcript();
    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'a', message: { content: 'héllo — ünïcode ✅' } })}\n`,
      'utf8',
    );

    const first = await readNewLines(path, 0);
    expect(first.lines).toHaveLength(1);
    expect(JSON.parse(first.lines[0] as string).message.content).toBe('héllo — ünïcode ✅');

    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'b', message: { content: 'plain ascii' } })}\n`,
      'utf8',
    );

    const second = await readNewLines(path, first.offset);
    expect(second.lines).toHaveLength(1);
    expect(JSON.parse(second.lines[0] as string).uuid).toBe('b');
  });

  it('leaves the cursor on the byte the file actually ends at', async () => {
    // The two must agree exactly. A cursor short by one byte re-reads the tail
    // forever; a cursor long by one skips a character and produces invalid JSON
    // on every subsequent poll. Neither is visible without a non-ASCII fixture.
    const path = transcript();
    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'a', message: { content: '日本語のテキスト' } })}\n`,
      'utf8',
    );

    const read = await readNewLines(path, 0);
    expect(read.offset).toBe(statSync(path).size);
    expect(read.offset).not.toBe(read.lines.join('\n').length);
  });

  it('reads only what was appended since the cursor', async () => {
    const path = transcript();
    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'a', message: { content: 'one' } })}\n`,
      'utf8',
    );

    const first = await readNewLines(path, 0);
    expect(first.lines).toHaveLength(1);

    // The cursor is byte-based, so a second read continues rather than restarting.
    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'b', message: { content: 'two' } })}\n`,
      'utf8',
    );
    const second = await readNewLines(path, first.offset);
    expect(second.lines).toHaveLength(1);
    expect(JSON.parse(second.lines[0] as string).uuid).toBe('b');
  });

  it('leaves a half-written line for the next poll', async () => {
    // A JSON document cut in half is not a document. Parsing half of one is how
    // a tailer invents events, which is the failure this cursor exists to stop.
    const path = transcript();
    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'a', message: { content: 'on' } })}\n{"uuid":"b","ses`,
      'utf8',
    );

    const result = await readNewLines(path, 0);

    expect(result.lines).toHaveLength(1);
    expect(JSON.parse(result.lines[0] as string).uuid).toBe('a');
  });

  it('costs one stat, not a read, when nothing was appended', async () => {
    const path = transcript();
    appendFileSync(
      path,
      `${line({ type: 'user', uuid: 'a', message: { content: 'one' } })}\n`,
      'utf8',
    );
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
  const readCall = (): Observation =>
    parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] },
      }),
    ) as Observation;

  it('drops every log event the hooks already reported, not just the first', () => {
    // The half that is easy to get wrong: the hook plane reports an Edit as a
    // tool.started AND a file.write, and both are keyed on the CALL's tool. A
    // ledger that only matched the tool.started would leave every file write
    // reported twice, which is the exact failure the key's shape exists to
    // prevent — so the assertion is on the whole list being empty.
    const ledger = createHookLedger();
    recordObservation(
      ledger,
      {
        sessionId: SESSION,
        tool: normalizeToolName('Read'),
        events: [
          { type: 'tool.started', sessionId: SESSION, at: AT, tool: normalizeToolName('Read') },
          { type: 'file.read', sessionId: SESSION, at: AT, path: 'a.ts' },
        ],
      },
      1_000,
    );

    expect(unreported(ledger, readCall(), 1_100)).toEqual([]);
  });

  it('lets through a different tool, because the two planes agree per tool', () => {
    const ledger = createHookLedger();
    recordObservation(
      ledger,
      {
        sessionId: SESSION,
        tool: normalizeToolName('Read'),
        events: [
          { type: 'tool.started', sessionId: SESSION, at: AT, tool: normalizeToolName('Read') },
        ],
      },
      1_000,
    );

    const fromLog = parsed(
      line({
        type: 'assistant',
        uuid: 'u-1',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
      }),
    );

    expect(unreported(ledger, fromLog as Observation, 1_100)).toHaveLength(1);
  });

  it('stops suppressing once the window has passed, so a deliberate second use counts', () => {
    // Without this the adapter would report the first use of a tool in a
    // session and silently swallow every later one, which is the kind of bug
    // that looks like the agent simply being busy.
    const ledger = createHookLedger(1_000);
    recordObservation(ledger, readCall(), 1_000);

    expect(unreported(ledger, readCall(), 1_500)).toEqual([]);
    expect(unreported(ledger, readCall(), 5_000)).toHaveLength(2);
  });

  it('does not confuse one session for another', () => {
    const ledger = createHookLedger();
    recordObservation(
      ledger,
      {
        sessionId: 'session-one',
        tool: normalizeToolName('Read'),
        events: [
          {
            type: 'tool.started',
            sessionId: 'session-one',
            at: AT,
            tool: normalizeToolName('Read'),
          },
        ],
      },
      1_000,
    );

    const elsewhere: Observation = {
      ...readCall(),
      sessionId: 'session-two',
      events: readCall().events.map((event) => ({ ...event, sessionId: 'session-two' })),
    };
    expect(unreported(ledger, elsewhere, 1_100)).toHaveLength(2);
  });
});
