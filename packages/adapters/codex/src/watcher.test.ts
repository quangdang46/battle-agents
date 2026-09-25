import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentEventSchema, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import { parseRolloutLine, readNewRolloutLines } from './parsers/rollout.js';
import { CodexWatcher } from './watcher.js';

/**
 * The adapter with no hooks, which is the whole reason it exists.
 *
 * Every event is asserted against AgentEventSchema, the same union the Claude
 * adapter emits into and the server validates with. If both adapters produce
 * members of one union, the union is the contract rather than a wrapper around
 * one harness's extension points — which is the claim this bead exists to make
 * true, and a test against a local expectation would not make it true.
 */

const SESSION = 'codex-session-abc';
const AT_MS = Date.parse('2026-09-25T09:00:00.000Z');
const AT = '2026-09-25T09:00:00.000Z';
const FLUSH_INTERVAL_MS = 300;

/** Asserts against the schema the server validates with, not a local copy. */
function parsed(line: string): AgentEvent | null {
  const { event, skipped } = parseRolloutLine(line);
  if (event === null) {
    expect(skipped, 'a dropped line should say why').toBeDefined();
    return null;
  }
  const result = AgentEventSchema.safeParse(event);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  return event;
}

function rollout(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'codex-rollout-')), 'rollout-1.jsonl');
  writeFileSync(path, '', 'utf8');
  return path;
}

function metaLine(): string {
  return JSON.stringify({
    type: 'session_meta',
    timestamp: AT,
    payload: { id: SESSION, cwd: '/repo', agent_id: 'agent-1' },
  });
}

function userLine(prompt: string): string {
  return JSON.stringify({
    type: 'response_item',
    session_id: SESSION,
    timestamp: AT,
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] },
  });
}

function callLine(name: string, args: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'response_item',
    session_id: SESSION,
    timestamp: AT,
    payload: { type: 'function_call', name, arguments: JSON.stringify(args), call_id: 'c-1' },
  });
}

describe('the session envelope', () => {
  it('reads session.started out of the meta record', () => {
    const event = parsed(metaLine());

    expect(event).toMatchObject({
      type: 'session.started',
      sessionId: SESSION,
      agentId: 'agent-1',
      projectId: '/repo',
      harness: 'codex',
    });
  });

  it('accepts an epoch millisecond timestamp, which is what Codex writes', () => {
    // The protocol rejects a local timestamp and requires an explicit offset.
    // Epoch numbers are unambiguous, so they are the better input; the string
    // form is a convenience, not the source of truth.
    const event = parsed(
      JSON.stringify({ type: 'session_meta', timestamp: AT_MS, payload: { id: SESSION } }),
    );

    expect(event).toMatchObject({ at: AT });
  });

  it('drops a line with no timestamp, rather than inventing an instant', () => {
    // An event with a fabricated time is worse than a missing one, because a
    // client cannot tell the difference.
    expect(parseRolloutLine(JSON.stringify({ type: 'session_meta', payload: { id: SESSION } })).skipped).toBe(
      'no-timestamp',
    );
  });

  it('drops a line with no session id, which no event can be built without', () => {
    expect(
      parseRolloutLine(JSON.stringify({ type: 'session_meta', timestamp: AT, payload: {} })).skipped,
    ).toBe('no-session');
  });
});

describe('what the agent did', () => {
  it('reads a user turn as prompt.submitted', () => {
    const event = parsed(userLine('fix the build'));

    expect(event).toMatchObject({ type: 'prompt.submitted', prompt: 'fix the build' });
  });

  it('ignores the assistant\'s own messages, which are not prompts', () => {
    // Otherwise every answer the agent gave would arrive as a prompt, and the
    // activity log would read as a conversation the agent was having with itself.
    const outcome = parseRolloutLine(
      JSON.stringify({
        type: 'response_item',
        session_id: SESSION,
        timestamp: AT,
        payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
      }),
    );

    expect(outcome.event).toBeNull();
    expect(outcome.skipped).toBe('not-a-user-message');
  });

  it('reads a function call as tool.started, parsing the arguments string', () => {
    // Codex ships arguments as a JSON STRING, so a consumer that reads an
    // object would get nothing. Parsing here is what makes one input shape.
    const event = parsed(callLine('shell', { command: 'ls -la' }));

    expect(event).toMatchObject({
      type: 'tool.started',
      tool: normalizeToolName('shell'),
      input: { command: 'ls -la' },
    });
  });

  it('passes unparseable arguments through as raw text, because the tool still ran', () => {
    const event = parsed(
      JSON.stringify({
        type: 'response_item',
        session_id: SESSION,
        timestamp: AT,
        payload: { type: 'function_call', name: 'shell', arguments: 'not json' },
      }),
    );

    // Wrapped, not dropped and not bare: normalizeToolInput reduces a
    // non-object to {}, so a bare string would arrive as an empty input and the
    // command the agent ran would be gone while the tool.started reporting it
    // stayed. That is the worst combination of the three.
    expect(event).toMatchObject({ type: 'tool.started', input: { raw: 'not json' } });
  });

  it('reads a call output as tool.completed, and an errored one as not ok', () => {
    const ok = parsed(
      JSON.stringify({
        type: 'response_item',
        session_id: SESSION,
        timestamp: AT,
        payload: { type: 'function_call_output', name: 'shell', output: 'file list' },
      }),
    );
    const failed = parsed(
      JSON.stringify({
        type: 'response_item',
        session_id: SESSION,
        timestamp: AT,
        payload: { type: 'function_call_output', name: 'shell', output: { ok: false } },
      }),
    );

    expect(ok).toMatchObject({ type: 'tool.completed', ok: true });
    expect(failed).toMatchObject({ type: 'tool.completed', ok: false });
  });
});

describe('lines this adapter does not understand', () => {
  it('counts them rather than failing, so a Codex upgrade is a number that changed', () => {
    expect(parseRolloutLine('not json').skipped).toBe('unparseable');
    expect(
      parseRolloutLine(
        JSON.stringify({ type: 'event_msg', session_id: SESSION, timestamp: AT }),
      ).skipped,
    ).toMatch(/^unmapped-type/);
  });
});

describe('reading incrementally', () => {
  it('reads only what was appended, and leaves a torn line for the next poll', async () => {
    // A JSON document cut in half is not a document; parsing half of one is how
    // a tailer invents events.
    const path = rollout();
    appendFileSync(path, `${metaLine()}\n{"type":"response_`, 'utf8');

    const first = await readNewRolloutLines(path, 0);
    expect(first.lines).toHaveLength(1);

    const second = await readNewRolloutLines(path, first.offset);
    expect(second.lines).toEqual([]);
  });

  it('resets the cursor when the file shrank, rather than reading from mid-file', async () => {
    // Codex rotates rollout files. A stale offset into a replaced file reads
    // from wherever it happened to land, which is a different session entirely.
    const path = rollout();
    appendFileSync(path, `${metaLine()}\n${userLine('one')}\n`, 'utf8');
    const first = await readNewRolloutLines(path, 0);
    writeFileSync(path, `${userLine('fresh')}\n`, 'utf8');

    const afterRotation = await readNewRolloutLines(path, first.offset);

    expect(JSON.parse(afterRotation.lines[0] as string).payload.content[0].text).toBe('fresh');
  });
});

describe('the watcher', () => {
  function harness() {
    const path = rollout();
    const sent: AgentEvent[] = [];
    let current = 1_000_000;
    const watcher = new CodexWatcher({
      send: async (batch) => {
        sent.push(...batch);
      },
      rolloutPath: path,
      pollIntervalMs: 10,
      now: () => current,
    });
    return {
      watcher,
      sent,
      append: (line: string) => appendFileSync(path, line, 'utf8'),
      advance: (ms: number) => (current += ms),
      async settle(): Promise<AgentEvent[]> {
        const before = sent.length;
        await watcher.tick();
        current += FLUSH_INTERVAL_MS;
        await watcher.tick();
        return sent.slice(before);
      },
    };
  }

  it('delivers a session from start to prompt, with no hooks involved', async () => {
    const h = harness();
    h.append(`${metaLine()}\n${userLine('fix the build')}\n`);

    const delivered = await h.settle();

    expect(delivered.map((event) => event.type)).toEqual(['session.started', 'prompt.submitted']);
  });

  it('flushes what is buffered on stop, rather than dropping it', async () => {
    const h = harness();
    h.append(`${userLine('one')}\n`);
    await h.watcher.tick();
    const before = h.sent.length;

    await h.watcher.stop();

    expect(h.sent.slice(before)).toHaveLength(1);
  });

  it('counts the lines it could not read', async () => {
    const h = harness();
    h.append('not json\n');

    await h.settle();

    expect(h.watcher.skippedCount).toBe(1);
  });
});
