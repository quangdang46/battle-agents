import { appendFileSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
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

/** A prompt line, with a settable timestamp so a malformed one can be written. */
function promptLine(prompt: string, at = AT): string {
  return `${JSON.stringify({
    sessionId: SESSION,
    timestamp: at,
    type: 'user',
    uuid: `u-${prompt}`,
    message: { content: prompt },
  })}\n`;
}

/**
 * A tool call as the hook plane reports it.
 *
 * An observation rather than a bare event, because that is the shape the ledger
 * keys on: the tool is a property of the CALL, and an Edit's `file.write` names
 * a path and no tool at all. Building it wrong here would test a key that does
 * not exist in production.
 */
function hookReported(tool: string): {
  readonly sessionId: string;
  readonly tool: string;
  readonly events: readonly AgentEvent[];
} {
  return {
    sessionId: SESSION,
    tool: normalizeToolName(tool),
    events: [{ type: 'tool.started', sessionId: SESSION, at: AT, tool: normalizeToolName(tool) }],
  };
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
    await h.watcher.recordHookEvent(hookReported('Read'));
    h.append(toolLine('Read'));

    const delivered = await h.settle();

    // Only the hook plane's own event crossed the wire.
    expect(delivered.filter((event) => event.type === 'tool.started')).toHaveLength(1);
  });

  it('still delivers a DIFFERENT tool the hooks never saw', async () => {
    // The key is (kind, tool), so suppressing one tool must not silence
    // another — otherwise a session that ran Read then Bash would lose the Bash.
    const h = harness();
    await h.watcher.recordHookEvent(hookReported('Read'));
    h.append(toolLine('Bash'));

    const delivered = await h.settle();

    expect(delivered).toContainEqual(expect.objectContaining({ tool: normalizeToolName('Bash') }));
  });

  it('delivers it again once the window has passed, so a deliberate reuse counts', async () => {
    // The failure this guards is an adapter that reports a tool's first use in
    // a session and silently swallows every later one — which looks exactly
    // like an agent that is merely busy.
    const h = harness();
    await h.watcher.recordHookEvent(hookReported('Read'));
    h.advance(5_000);
    h.append(toolLine('Read'));

    const delivered = await h.settle();

    // The hook event, then the log event the window no longer suppresses.
    expect(delivered.filter((event) => event.type === 'tool.started')).toHaveLength(2);
  });
});

describe('the send path refuses nothing silently', () => {
  it('drops one event the protocol schema rejects, and still delivers the rest', async () => {
    // The failure this guards is a whole batch lost to one line. The endpoint
    // validates a BATCH, so a single schema-invalid event takes up to 49 good
    // ones with it and the 400 emits nothing — the session simply goes dark,
    // and a dark session is indistinguishable from an agent doing no work.
    const h = harness();
    // A local timestamp with no offset. Every timestamp in the transcripts this
    // was written against carries a Z, which is why nothing upstream has caught
    // this: the shape has to be constructed, because the harness does not
    // produce it.
    h.append(promptLine('before', '2026-09-25T09:00:00.000'));
    h.append(promptLine('after', AT));

    const delivered = await h.settle();

    expect(delivered).toEqual([expect.objectContaining({ prompt: 'after' })]);
    expect(h.watcher.rejectedCount).toBe(1);
  });

  it("says what the last refusal was, in the schema's own words", async () => {
    // A count says how often; this says what changed, which is the half that
    // names a Claude format change instead of leaving somebody guessing.
    const h = harness();
    h.append(promptLine('bad', 'not-a-timestamp-at-all'));

    await h.settle();

    expect(h.watcher.lastRejection).toContain('prompt.submitted');
    expect(h.watcher.lastRejection).toContain(SESSION);
  });

  it('refuses a hook event the schema rejects, before it can be buffered', async () => {
    // The same rule on the other plane: an identity the protocol does not
    // describe must not reach a buffer that would post it.
    const h = harness();
    await h.watcher.recordHookEvent({
      sessionId: SESSION,
      tool: 'Read',
      events: [
        // A session.started with no agentId, which the schema requires.
        { type: 'session.started', sessionId: SESSION, at: AT } as unknown as AgentEvent,
      ],
    });

    const delivered = await h.settle();

    expect(delivered).toEqual([]);
    expect(h.watcher.rejectedCount).toBe(1);
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

/**
 * Following the session that is live, rather than one file somebody named.
 *
 * The rule every assertion below exists to protect: `POST /api/events` refuses a
 * batch carrying two sessionIds, and the 400 emits nothing. A tail that read
 * every transcript under the projects directory as one stream would produce such
 * a batch the first time two sessions overlapped — which is the normal case on a
 * machine with a project open in one window and a second in another.
 *
 * Batches are captured whole, not flattened, because flattening destroys the only
 * thing under test: a single sessionId belongs to a BATCH, not to a stream.
 */
function discoveryHarness() {
  const root = mkdtempSync(join(tmpdir(), 'claude-projects-'));
  const batches: AgentEvent[][] = [];
  let current = 1_000_000;
  const now = (): number => current;
  const advance = (ms: number): void => {
    current += ms;
  };

  const watcher = new ClaudeWatcher({
    send: async (batch) => {
      batches.push([...batch]);
    },
    transcriptsRoot: root,
    ledger: createHookLedger(1_000),
    now,
    pollIntervalMs: 10,
  });

  /** Writes a session's transcript and marks it as the most recent on disk. */
  let recency = 1_000;
  const startSession = (sessionId: string, ...lines: string[]): void => {
    const directory = join(root, 'project');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `${sessionId}.jsonl`);
    writeFileSync(path, lines.join(''), 'utf8');
    // The watcher follows the newest file, so "a new session started" is
    // expressed as a newer mtime rather than as a call the watcher was told
    // about. A counter rather than the fake clock, which does not move between
    // two `startSession` calls in the same test and would leave the first
    // session looking current.
    recency += 1;
    utimesSync(path, recency, recency);
  };

  return {
    root,
    watcher,
    batches,
    advance,
    now,
    startSession,
    /** Every sessionId seen, one entry per batch. */
    sessionsPerBatch: () => batches.map((batch) => [...new Set(batch.map((e) => e.sessionId))]),
  };
}

/** A prompt line belonging to a named session, so two transcripts can differ. */
function promptFor(sessionId: string, prompt: string): string {
  return `${JSON.stringify({
    sessionId,
    timestamp: AT,
    type: 'user',
    uuid: `u-${sessionId}-${prompt}`,
    message: { content: prompt },
  })}\n`;
}

describe('following the live session', () => {
  it('delivers every batch under exactly one sessionId', async () => {
    // The assertion the whole discovery mode exists for. Two sessions in two
    // project directories, read as one stream, produce a batch the endpoint
    // refuses outright.
    const h = discoveryHarness();
    h.startSession('session-one', promptFor('session-one', 'first'));
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    h.startSession('session-two', promptFor('session-two', 'second'));
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    await h.watcher.tick();

    expect(h.batches.length).toBeGreaterThan(0);
    for (const sessions of h.sessionsPerBatch()) {
      expect(sessions).toHaveLength(1);
    }
  });

  it('flushes the outgoing session BEFORE the incoming one is buffered', async () => {
    // The order is the fix, not a detail. Flushing after reading would let the
    // two sessions share one buffer and produce exactly the refused batch above.
    const h = discoveryHarness();
    h.startSession('session-one', promptFor('session-one', 'first'));
    await h.watcher.tick();
    expect(h.batches).toEqual([]);

    h.startSession('session-two', promptFor('session-two', 'second'));
    await h.watcher.tick();

    expect(h.batches).toEqual([
      [expect.objectContaining({ sessionId: 'session-one', prompt: 'first' })],
    ]);
  });

  it('moves on when a newer session appears, and leaves the old one behind', async () => {
    const h = discoveryHarness();
    h.startSession('session-one', promptFor('session-one', 'first'));
    await h.watcher.tick();

    h.startSession('session-two', promptFor('session-two', 'second'));
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    await h.watcher.tick();

    expect(h.watcher.currentSessionId).toBe('session-two');
    const delivered = h.batches.flat();
    expect(delivered).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: 'session-two', prompt: 'second' }),
      ]),
    );
  });

  it('drops a line naming a DIFFERENT session than the file it was found in', async () => {
    // The filename is the partition in discovery mode. A line disagreeing with
    // it belongs to a transcript this adapter does not understand, and following
    // it would put another session's events into this session's batch.
    const h = discoveryHarness();
    h.startSession(
      'session-one',
      promptFor('someone-else', 'not mine'),
      promptFor('session-one', 'mine'),
    );
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    await h.watcher.tick();

    const delivered = h.batches.flat();
    expect(delivered).toEqual([expect.objectContaining({ prompt: 'mine' })]);
    expect(delivered.map((event) => event.sessionId)).not.toContain('someone-else');
  });

  it('does not re-report a session that becomes current a second time', async () => {
    // A per-session cursor, not one shared offset. Re-reading from zero would
    // re-report a transcript that can reach tens of megabytes.
    const h = discoveryHarness();
    h.startSession('session-one', promptFor('session-one', 'first'));
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    await h.watcher.tick();

    h.startSession('session-two', promptFor('session-two', 'second'));
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    await h.watcher.tick();
    const seenBefore = h.batches.flat().length;

    // session-one is written again, and is now the newest file again.
    const back = Math.floor(h.now() / 1_000) + 99;
    utimesSync(join(h.root, 'project', 'session-one.jsonl'), back, back);
    await h.watcher.tick();
    h.advance(FLUSH_INTERVAL_MS);
    await h.watcher.tick();

    expect(h.batches.flat().length).toBe(seenBefore);
  });
});
