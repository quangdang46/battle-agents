import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import { createHookLedger } from './parsers/jsonl.js';
import { ClaudeWatcher } from './watcher.js';

/**
 * Both planes, and the one thing that has to be true when they meet.
 *
 * A stream that reports a tool call twice is worse than one that misses it: the
 * game shows the agent doing the work twice and every count downstream is
 * wrong. So the test below is not "the tail works" — the parser suite already
 * proves that — it is "the tail defers to the hooks, and stands in when they
 * did not run".
 *
 * The clock is driven by hand throughout. The buffer flushes at 250ms and the
 * dedup window is 1000ms, so a test that used real time would be either slow
 * or flaky, and the two would fail for reasons that have nothing to do with
 * what they are checking.
 */

const SESSION = 'claude-session-abc';
const AT = '2026-09-25T09:00:00.000Z';
const FLUSH_INTERVAL_MS = 300;

function transcriptPath(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'claude-watcher-')), 'session.jsonl');
  writeFileSync(path, '', 'utf8');
  return path;
}

function toolLine(name: string): string {
  return `${JSON.stringify({
    sessionId: SESSION,
    timestamp: AT,
    type: 'assistant',
    uuid: `u-${name}`,
    message: { content: [{ type: 'tool_use', name, input: {} }] },
  })}\n`;
}

function promptLine(prompt: string): string {
  return `${JSON.stringify({
    sessionId: SESSION,
    timestamp: AT,
    type: 'user',
    uuid: `u-${prompt}`,
    message: { content: prompt },
  })}\n`;
}

function toolEvent(tool: string): AgentEvent {
  return { type: 'tool.started', sessionId: SESSION, at: AT, tool: normalizeToolName(tool) };
}

/**
 * A watcher over a real transcript, with a clock the test moves and a sink it
 * reads. `settle` advances past the flush interval and polls again, which is
 * what makes a buffered event actually arrive — one `tick` only buffers.
 */
function harness() {
  const path = transcriptPath();
  const sent: AgentEvent[] = [];
  let current = 1_000_000;
  const now = (): number => current;
  const advance = (ms: number): void => {
    current += ms;
  };

  const watcher = new ClaudeWatcher({
    send: async (batch) => {
      sent.push(...batch);
    },
    transcriptPath: path,
    ledger: createHookLedger(1_000),
    now,
    pollIntervalMs: 10,
  });

  return {
    path,
    sent,
    watcher,
    advance,
    append: (line: string) => appendFileSync(path, line, 'utf8'),
    /** Polls, waits out the flush interval, polls again, returns what arrived. */
    async settle(): Promise<AgentEvent[]> {
      const before = sent.length;
      await watcher.tick();
      advance(FLUSH_INTERVAL_MS);
      await watcher.tick();
      return sent.slice(before);
    },
  };
}

describe('the tail standing in for hooks that did not run', () => {
  it('delivers a tool call the log recorded and no hook saw', async () => {
    const h = harness();
    h.append(toolLine('Read'));

    const delivered = await h.settle();

    expect(delivered).toEqual([expect.objectContaining({ tool: normalizeToolName('Read') })]);
  });

  it('delivers a prompt as well, so a session is not tools-only', async () => {
    const h = harness();
    h.append(promptLine('fix the build'));

    const delivered = await h.settle();

    expect(delivered).toEqual([expect.objectContaining({ type: 'prompt.submitted' })]);
  });
});

describe('the tail deferring to the hooks', () => {
  it('does not deliver a tool call the hook plane already reported', async () => {
    // Zero, not one. Reporting it twice is the failure this whole ledger
    // exists to prevent: the game shows the work happening twice and every
    // count downstream is wrong.
    const h = harness();
    await h.watcher.recordHookEvent(toolEvent('Read'));
    h.append(toolLine('Read'));

    const delivered = await h.settle();

    // Only the hook plane's own event crossed the wire.
    expect(delivered.filter((event) => event.type === 'tool.started')).toHaveLength(1);
  });

  it('still delivers a DIFFERENT tool the hooks never saw', async () => {
    // The key is (kind, tool), so suppressing one tool must not silence
    // another — otherwise a session that ran Read then Bash would lose the Bash.
    const h = harness();
    await h.watcher.recordHookEvent(toolEvent('Read'));
    h.append(toolLine('Bash'));

    const delivered = await h.settle();

    expect(delivered).toContainEqual(expect.objectContaining({ tool: normalizeToolName('Bash') }));
  });

  it('delivers it again once the window has passed, so a deliberate reuse counts', async () => {
    // The failure this guards is an adapter that reports a tool's first use in
    // a session and silently swallows every later one — which looks exactly
    // like an agent that is merely busy.
    const h = harness();
    await h.watcher.recordHookEvent(toolEvent('Read'));
    h.advance(5_000);
    h.append(toolLine('Read'));

    const delivered = await h.settle();

    // The hook event, then the log event the window no longer suppresses.
    expect(delivered.filter((event) => event.type === 'tool.started')).toHaveLength(2);
  });
});

describe('batching', () => {
  it('flushes what is buffered when the watcher stops, rather than dropping it', async () => {
    // A void stop makes the final flush fire-and-forget, and the session then
    // ends with events delivered after the runtime has torn down — the same
    // class of loss the tail exists to catch.
    const h = harness();
    h.append(promptLine('one'));
    await h.watcher.tick();
    const before = h.sent.length;

    await h.watcher.stop();

    expect(h.sent.slice(before)).toEqual([expect.objectContaining({ type: 'prompt.submitted' })]);
  });
});
