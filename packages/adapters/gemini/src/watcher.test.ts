import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentEventSchema } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { afterEach, describe, expect, it } from 'vitest';

import { geminiInstallationId, listChatFiles } from './paths.js';
import {
  createChatState,
  parseChatLine,
  parseChatMessage,
  readChatDocument,
  readChatDocumentFile,
  readNewChatLines,
} from './parsers/chats.js';
import { GeminiWatcher } from './watcher.js';

/**
 * The Gemini adapter, tested against the two shapes its store is actually in.
 *
 * The store changed format between the 42 `.jsonl` files and the one `.json`
 * file on the machine this was written against, and both are on disk now, so
 * both are tested. Asserting only the newer one would leave the older one
 * unverified and the adapter quietly wrong for anyone whose sessions predate
 * the change.
 *
 * Every event is asserted against `AgentEventSchema` — the union the server
 * validates with — not against a local expectation.
 */

const SESSION = 'e44bdb3b-67c0-4fb9-8bb3-4c9f22a1f31e';
const OTHER_SESSION = '34697f65-d329-4c75-96d3-8c904b6e0d66';
const PROJECT_HASH = 'b4570edd91a5807a479f7a85087be57bf8733f2de793f38cdf66a73125040646';
const START = '2026-08-14T01:18:51.633Z';
const INSTALLATION = '37414a4e-2035-46ab-be50-0937e131f164';
const AT = '2026-08-14T01:18:52.070Z';
const FLUSH_INTERVAL_MS = 300;

const temporaries: string[] = [];

afterEach(() => {
  for (const path of temporaries.splice(0)) rmSync(path, { recursive: true, force: true });
});

function scratch(): string {
  const path = mkdtempSync(join(tmpdir(), 'gemini-chats-'));
  temporaries.push(path);
  return path;
}

/** A home with a real installation id, so session.started can name it. */
function home(): string {
  const path = scratch();
  mkdirSync(join(path, '.gemini'), { recursive: true });
  writeFileSync(join(path, '.gemini', 'installation_id'), INSTALLATION, 'utf8');
  return path;
}

/** A clock that advances past the flush interval on every reading. */
function advancing(): () => number {
  let current = 1_000_000;
  return () => {
    current += FLUSH_INTERVAL_MS;
    return current;
  };
}

function assertValid(events: readonly AgentEvent[]): void {
  for (const event of events) {
    const result = AgentEventSchema.safeParse(event);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  }
}

/** The `.jsonl` header, verbatim in shape. */
function headerLine(session = SESSION): string {
  return JSON.stringify({
    sessionId: session,
    projectHash: PROJECT_HASH,
    startTime: START,
    lastUpdated: START,
    kind: 'main',
  });
}

function userLine(text: string, at = AT): string {
  return JSON.stringify({
    id: 'b80e6537-e24d-4631-a4cc-f0fa99d457d4',
    timestamp: at,
    type: 'user',
    content: [{ text }],
  });
}

function geminiLine(thoughts: readonly string[]): string {
  return JSON.stringify({
    id: '7d04965a-073a-40df-a504-debc43b59ce8',
    timestamp: AT,
    type: 'gemini',
    content: 'okok',
    thoughts,
    tokens: null,
    model: 'gemini-3.1-pro-preview-customtools',
  });
}

const SET_PATCH = JSON.stringify({ $set: { lastUpdated: AT } });

function chatIn(root: string, name: string, contents = ''): string {
  const dir = join(root, 'repo-2', 'chats');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, contents, 'utf8');
  return path;
}

/** A watcher over a projects root, with a clock it controls. */
function watched(root: string, targetHome = home()) {
  const sent: AgentEvent[] = [];
  const batches: AgentEvent[][] = [];
  const watcher = new GeminiWatcher({
    send: async (batch) => {
      batches.push([...batch]);
      sent.push(...batch);
    },
    projectsRoot: root,
    home: targetHome,
    now: advancing(),
  });
  return { watcher, sent, batches };
}

describe('the .jsonl store', () => {
  it('reads session.started out of the header, the only place the id exists', () => {
    const state = createChatState();
    const { events, skipped } = parseChatLine(headerLine(), state);

    assertValid(events);
    expect(skipped).toBeUndefined();
    expect(events[0]).toMatchObject({
      type: 'session.started',
      sessionId: SESSION,
      agentId: SESSION,
      projectId: PROJECT_HASH,
      harness: 'gemini',
      at: START,
    });
  });

  it('reads a user message as prompt.submitted, once the header has named the session', () => {
    const state = createChatState();
    parseChatLine(headerLine(), state);
    const { events } = parseChatLine(userLine('Reply with exactly: OK'), state);

    assertValid(events);
    expect(events[0]).toMatchObject({ type: 'prompt.submitted', prompt: 'Reply with exactly: OK' });
  });

  it('refuses a message with no session, because none can be built without one', () => {
    // The file name truncates the uuid to eight characters, so a watcher that
    // started past the header has nothing to fall back on. Better a counted
    // skip than an event attributed to the wrong session.
    const outcome = parseChatLine(userLine('hi'), createChatState());

    expect(outcome.events).toEqual([]);
    expect(outcome.skipped).toBe('no-session');
  });

  it('reads a gemini record with thoughts as thinking', () => {
    const state = createChatState();
    parseChatLine(headerLine(), state);
    const { events } = parseChatLine(geminiLine(['let me check the file']), state);

    assertValid(events);
    expect(events[0]).toMatchObject({ type: 'thinking' });
  });

  it('skips a gemini record with no thoughts, which is just an answer', () => {
    const state = createChatState();
    parseChatLine(headerLine(), state);
    const outcome = parseChatLine(geminiLine([]), state);

    expect(outcome.events).toEqual([]);
    expect(outcome.skipped).toBe('no-thoughts');
  });

  it('counts the interleaved $set patch rather than crashing on it', () => {
    const state = createChatState();
    parseChatLine(headerLine(), state);
    const outcome = parseChatLine(SET_PATCH, state);

    expect(outcome.events).toEqual([]);
    expect(outcome.skipped).toBe('set-patch');
  });

  it('emits session.started once even if the header is rewritten in place', () => {
    const state = createChatState();
    parseChatLine(headerLine(), state);
    const outcome = parseChatLine(headerLine(), state);

    expect(outcome.events).toEqual([]);
    expect(outcome.skipped).toBe('repeated-header');
    expect(state.started).toBe(true);
  });

  it('drops a record with no usable timestamp rather than inventing an instant', () => {
    const state = createChatState();
    parseChatLine(headerLine(), state);
    const outcome = parseChatLine(JSON.stringify({ type: 'user', content: 'hi' }), state);

    expect(outcome.skipped).toBe('no-timestamp');
  });

  it('reads new lines from a byte cursor, and holds a torn tail', async () => {
    const root = scratch();
    const path = chatIn(root, 'session-a.jsonl');
    const head = `${headerLine()}\n${userLine('first')}\n`;
    writeFileSync(path, head, 'utf8');

    const one = await readNewChatLines(path, 0);
    expect(one.lines).toEqual([headerLine(), userLine('first')]);

    // Half a record, then the rest of it.
    writeFileSync(path, head + userLine('seco').slice(0, 20), 'utf8');
    const two = await readNewChatLines(path, one.offset);
    expect(two.lines).toEqual([]);

    writeFileSync(path, head + `${userLine('second')}\n`, 'utf8');
    const three = await readNewChatLines(path, one.offset);
    expect(three.lines).toEqual([userLine('second')]);
  });

  it('advances by bytes over a non-ASCII line, and re-reads no fragment of it', async () => {
    // 87 bytes and 81 characters. A character cursor lands back inside the line
    // it just read, and the next poll gets its tail as a fragment — which still
    // splits on the newline and still yields the line after it, so counting
    // prompts is not enough. The offset is asserted directly.
    const root = scratch();
    const path = chatIn(root, 'session-a.jsonl');
    const first = `${userLine('sửa lỗi build 🚀')}\n`;
    const second = `${userLine('plain ascii after')}\n`;
    writeFileSync(path, first, 'utf8');

    const one = await readNewChatLines(path, 0);
    expect(one.offset).toBe(Buffer.byteLength(first, 'utf8'));

    writeFileSync(path, first + second, 'utf8');
    const two = await readNewChatLines(path, one.offset);
    expect(two.lines).toEqual([userLine('plain ascii after')]);
  });
});

describe('the .json store', () => {
  const ctx = { sessionId: OTHER_SESSION, installationId: INSTALLATION, toolNames: new Map() };

  it('names the session from the document rather than the file', () => {
    const document = readChatDocument({
      sessionId: OTHER_SESSION,
      projectHash: '1bb9886be2232a8b35e405b1bf77b39e3805f1edcf5fa8d46043c0360afba309',
      startTime: '2026-09-04T15:33:24.788Z',
      messages: [],
    });

    expect(document).toMatchObject({
      sessionId: OTHER_SESSION,
      at: '2026-09-04T15:33:24.788Z',
    });
  });

  it('refuses a document with no session id, which no event can be built from', () => {
    expect(readChatDocument({ messages: [] })).toBeUndefined();
    expect(readChatDocument({ sessionId: OTHER_SESSION })).toBeUndefined();
  });

  it('reads a user message whose content is a bare string, not an array', () => {
    // Half the messages in the one real document have string content and half
    // have arrays, in the same file and the same version. A parser that assumed
    // either reads zero events from the other half.
    const { events } = parseChatMessage(
      { type: 'user', timestamp: AT, content: 'research fix all issues' },
      ctx,
    );

    assertValid(events);
    expect(events[0]).toMatchObject({
      type: 'prompt.submitted',
      prompt: 'research fix all issues',
    });
  });

  it('reads a model turn as thinking plus one tool.started per call', () => {
    const { events } = parseChatMessage(
      {
        type: 'model',
        timestamp: AT,
        message: { content: [{ type: 'thinking', thinking: 'the file is too large' }] },
        content: [
          { type: 'text', text: '[Thinking] …' },
          {
            type: 'tool_use',
            id: 'call_fdd61b53',
            name: 'bash',
            input: { command: 'grep -n byte_to_line' },
          },
        ],
      },
      ctx,
    );

    assertValid(events);
    expect(events.map((event) => event.type)).toEqual(['thinking', 'tool.started']);
    // `bash` is in the shared map, so the name that reaches the bus is `Bash`.
    expect(events[1]).toMatchObject({ tool: 'Bash', input: { command: 'grep -n byte_to_line' } });
  });

  it('names a tool.completed after the call that opened it, not after its id', () => {
    const toolNames = new Map<string, string>();
    const shared = { ...ctx, toolNames };
    parseChatMessage(
      {
        type: 'model',
        timestamp: AT,
        content: [{ type: 'tool_use', id: 'call_fdd61b53', name: 'bash', input: {} }],
      },
      shared,
    );
    const { events } = parseChatMessage(
      {
        type: 'tool',
        timestamp: AT,
        content: [{ type: 'tool_result', tool_use_id: 'call_fdd61b53', is_error: false }],
      },
      shared,
    );

    assertValid(events);
    expect(events[0]).toMatchObject({ type: 'tool.completed', tool: 'Bash', ok: true });
  });

  it('reports an errored result as not ok', () => {
    const { events } = parseChatMessage(
      {
        type: 'tool',
        timestamp: AT,
        content: [{ type: 'tool_result', tool_use_id: 'call_x', is_error: true }],
      },
      ctx,
    );

    expect(events[0]).toMatchObject({ ok: false });
  });

  it('completes a call it never saw started, under its id, because it happened', () => {
    // A watcher that adopts a document mid-session has no memory of the call
    // that opened this. Dropping the completion would leave a tool.started with
    // no ending, and an id in the tool field is visibly an id.
    const { events } = parseChatMessage(
      {
        type: 'tool',
        timestamp: AT,
        content: [{ type: 'tool_result', tool_use_id: 'call_unseen', is_error: false }],
      },
      ctx,
    );

    assertValid(events);
    expect(events[0]).toMatchObject({ tool: 'call_unseen' });
  });

  it('skips a system reminder, which is the harness talking to itself', () => {
    const outcome = parseChatMessage(
      { type: 'system', timestamp: AT, content: '<system-reminder>…</system-reminder>' },
      ctx,
    );

    expect(outcome.events).toEqual([]);
    expect(outcome.skipped).toBe('system-reminder');
  });

  it('returns nothing for a half-written document rather than throwing', async () => {
    const root = scratch();
    const path = chatIn(root, 'session-b.json', '{"sessionId":"x","messages":[{"type":"user"');

    expect(await readChatDocumentFile(path)).toBeUndefined();
  });
});

describe('discovery', () => {
  it('finds both store shapes under a project directory', async () => {
    const root = scratch();
    chatIn(root, 'session-2026-08-14T01-18-e44bdb3b.jsonl');
    chatIn(root, 'session-2026-09-05T18-26-34697f65.json');

    const found = await listChatFiles(root);

    expect(found.map((file) => file.shape).sort()).toEqual(['json', 'jsonl']);
  });

  it('reads the installation id, and falls back when the file is absent', async () => {
    expect(await geminiInstallationId(home())).toBe(INSTALLATION);
    expect(await geminiInstallationId(scratch())).toBe('gemini');
  });
});

describe('the watcher over a whole store', () => {
  it('names the installation from ~/.gemini rather than inventing one', async () => {
    const root = scratch();
    chatIn(root, 'session-a.jsonl', `${headerLine()}\n${userLine('hi')}\n`);
    const { watcher, sent } = watched(root);

    await watcher.tick();

    const started = sent.find((event) => event.type === 'session.started');
    expect(started).toMatchObject({ installationId: INSTALLATION, harness: 'gemini' });
  });

  it('never puts two sessions in one batch, across two chat files', async () => {
    // The endpoint refuses a mixed batch with a 400, so one buffer per file is
    // the arrangement where that rule has nothing left to catch.
    const root = scratch();
    chatIn(root, 'session-a.jsonl', `${headerLine()}\n${userLine('a')}\n`);
    chatIn(root, 'session-b.jsonl', `${headerLine(OTHER_SESSION)}\n${userLine('b')}\n`);
    const { watcher, sent, batches } = watched(root);

    await watcher.tick();

    expect(sent.filter((event) => event.type === 'prompt.submitted')).toHaveLength(2);
    for (const batch of batches) {
      expect(new Set(batch.map((event) => event.sessionId)).size).toBe(1);
    }
  });

  it('emits a new .jsonl session from its header even when it already existed', async () => {
    // The header is the only place the session id is, so this file is read from
    // zero even though the first listing found it finished.
    const root = scratch();
    chatIn(root, 'session-a.jsonl', `${headerLine()}\n${userLine('hi')}\n`);
    const { watcher, sent } = watched(root);

    await watcher.tick();

    expect(sent.filter((event) => event.type === 'prompt.submitted')).toHaveLength(1);
  });

  it('adopts a .json store that already existed at its end', async () => {
    const root = scratch();
    chatIn(root, 'session-b.json', JSON.stringify({ sessionId: OTHER_SESSION, messages: [{}] }));
    const { watcher, sent } = watched(root);

    await watcher.tick();

    expect(sent.filter((event) => event.type === 'prompt.submitted')).toEqual([]);
  });

  it('emits only the messages a rewrite added, and none of them twice', async () => {
    // This store is REWRITTEN in full every turn, so a byte cursor is not a
    // cursor: the bytes before the offset have been replaced rather than
    // appended to. The cursor is the message count, and a document that grew by
    // one message produces exactly one new event.
    const root = scratch();
    const path = chatIn(
      root,
      'session-b.json',
      JSON.stringify({ sessionId: OTHER_SESSION, messages: [] }),
    );
    const { watcher, sent } = watched(root);

    await watcher.tick();
    writeFileSync(
      path,
      JSON.stringify({
        sessionId: OTHER_SESSION,
        messages: [{ type: 'user', timestamp: AT, content: 'first' }],
      }),
      'utf8',
    );
    await watcher.tick();
    writeFileSync(
      path,
      JSON.stringify({
        sessionId: OTHER_SESSION,
        messages: [
          { type: 'user', timestamp: AT, content: 'first' },
          { type: 'user', timestamp: AT, content: 'second' },
        ],
      }),
      'utf8',
    );
    await watcher.tick();

    const prompts = sent
      .filter((event) => event.type === 'prompt.submitted')
      .map((event) => (event as { prompt?: string }).prompt);
    expect(prompts).toEqual(['first', 'second']);
  });

  it('reads a grown .jsonl file incrementally rather than re-reading it whole', async () => {
    const root = scratch();
    const path = chatIn(root, 'session-a.jsonl', `${headerLine()}\n`);
    const { watcher, sent, batches } = watched(root);

    await watcher.tick();
    appendFileSync(path, `${userLine('one')}\n`, 'utf8');
    await watcher.tick();
    appendFileSync(path, `${userLine('two')}\n`, 'utf8');
    await watcher.tick();

    const prompts = sent.filter((event) => event.type === 'prompt.submitted');
    expect(prompts).toHaveLength(2);
    // One session.started and two prompts, not three sessions' worth of restarts.
    expect(sent.filter((event) => event.type === 'session.started')).toHaveLength(1);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(50);
    }
  });

  it('holds a poll back until the flush interval', async () => {
    const root = scratch();
    const path = chatIn(root, 'session-a.jsonl', `${headerLine()}\n${userLine('hi')}\n`);
    const sent: AgentEvent[] = [];
    let current = 1_000_000;
    const watcher = new GeminiWatcher({
      send: async (batch) => {
        sent.push(...batch);
      },
      projectsRoot: root,
      home: home(),
      now: () => current,
    });

    await watcher.tick();
    expect(sent).toEqual([]);

    current += 250;
    await watcher.tick();
    expect(sent.map((event) => event.type)).toEqual(['session.started', 'prompt.submitted']);
    void path;
  });

  it('flushes every buffer separately on stop', async () => {
    const root = scratch();
    chatIn(root, 'session-a.jsonl', `${headerLine()}\n${userLine('a')}\n`);
    chatIn(root, 'session-b.jsonl', `${headerLine(OTHER_SESSION)}\n${userLine('b')}\n`);
    const sent: AgentEvent[] = [];
    const batches: AgentEvent[][] = [];
    let current = 1_000_000;
    const watcher = new GeminiWatcher({
      send: async (batch) => {
        batches.push([...batch]);
        sent.push(...batch);
      },
      projectsRoot: root,
      home: home(),
      now: () => current,
    });

    await watcher.tick();
    expect(sent).toEqual([]);
    current += 250;
    await watcher.tick();

    const beforeStop = batches.length;
    await watcher.stop();

    // Nothing is left, and nothing new is invented: the flush is idempotent
    // because both buffers were already closed by the elapsed interval.
    expect(batches.length).toBe(beforeStop);
    expect(sent.length).toBeGreaterThan(0);
  });
});
