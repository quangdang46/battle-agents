import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { AgentEventSchema, PROTOCOL_VERSION, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import { createIngestSender, IngestRefusedError } from './ingest.js';
import type { FetchLike, HttpRequestInit, HttpResponseLike } from './ingest.js';
import { listRolloutFiles, parseRolloutLine, readNewRolloutLines } from './parsers/rollout.js';
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

function metaLine(session = SESSION): string {
  return JSON.stringify({
    type: 'session_meta',
    timestamp: AT,
    payload: { id: session, cwd: '/repo', agent_id: 'agent-1' },
  });
}

function userLine(prompt: string, session = SESSION): string {
  return JSON.stringify({
    type: 'response_item',
    session_id: session,
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

/** The prompt text of a user-turn line, which is what a multi-byte fixture varies. */
function promptOf(line: string): string {
  return JSON.parse(line).payload.content[0].text as string;
}

/** The layout Codex writes: sessions/YYYY/MM/DD, a new directory per date. */
function sessionsTree(): string {
  return mkdtempSync(join(tmpdir(), 'codex-sessions-'));
}

function rolloutIn(root: string, day: string, name: string, contents = ''): string {
  const path = join(root, ...day.split('.'), name);
  mkdirSync(join(root, ...day.split('.')), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  return path;
}

/**
 * A watcher over a pinned file, or over a tree it discovers for itself, with a
 * clock it controls so the 250ms flush is proven by moving time rather than by
 * sleeping through it.
 */
function harness(target?: { readonly sessionsRoot: string }) {
  const sent: AgentEvent[] = [];
  const batches: AgentEvent[][] = [];
  let current = 1_000_000;
  const send = async (batch: readonly AgentEvent[]): Promise<void> => {
    batches.push([...batch]);
    sent.push(...batch);
  };
  const common = { send, pollIntervalMs: 10, now: () => current };
  // Branching on `target` rather than on the path derived from it, because
  // narrowing a value says nothing about where it came from: the old spread
  // tested `path` and read `target?.sessionsRoot`, so the two cases stayed
  // indistinguishable to tsc and `exactOptionalPropertyTypes` rejected the
  // `undefined` the optional chain could produce — and in that branch it
  // could not, since `path` is undefined only when `target` is not.
  let pinnedPath: string | undefined;
  let watcher: CodexWatcher;
  if (target === undefined) {
    pinnedPath = rollout();
    watcher = new CodexWatcher({ ...common, rolloutPath: pinnedPath });
  } else {
    watcher = new CodexWatcher({ ...common, sessionsRoot: target.sessionsRoot });
  }
  return {
    watcher,
    sent,
    batches,
    append: (line: string) => appendFileSync(pinnedPath as string, line, 'utf8'),
    /** Two polls: one to read, one to reach the flush the read started. */
    async settle(): Promise<AgentEvent[]> {
      const before = sent.length;
      await watcher.tick();
      current += FLUSH_INTERVAL_MS;
      await watcher.tick();
      return sent.slice(before);
    },
  };
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
    expect(
      parseRolloutLine(JSON.stringify({ type: 'session_meta', payload: { id: SESSION } })).skipped,
    ).toBe('no-timestamp');
  });

  it('drops a line with no session id, which no event can be built without', () => {
    expect(
      parseRolloutLine(JSON.stringify({ type: 'session_meta', timestamp: AT, payload: {} }))
        .skipped,
    ).toBe('no-session');
  });
});

describe('what the agent did', () => {
  it('reads a user turn as prompt.submitted', () => {
    const event = parsed(userLine('fix the build'));

    expect(event).toMatchObject({ type: 'prompt.submitted', prompt: 'fix the build' });
  });

  it("ignores the assistant's own messages, which are not prompts", () => {
    // Otherwise every answer the agent gave would arrive as a prompt, and the
    // activity log would read as a conversation the agent was having with itself.
    const outcome = parseRolloutLine(
      JSON.stringify({
        type: 'response_item',
        session_id: SESSION,
        timestamp: AT,
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'done' }],
        },
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
      parseRolloutLine(JSON.stringify({ type: 'event_msg', session_id: SESSION, timestamp: AT }))
        .skipped,
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

  it('keeps a multi-byte line from eating the lines after it', async () => {
    // The defect this pins. A rollout line is UTF-8 bytes on disk and the cursor
    // is a byte count, so a line holding one accented character or one emoji is
    // longer in bytes than in characters. Read the cursor as a character index
    // and the second poll starts past the end of the line before it: the events
    // in between fail to parse and are counted as skips, which is how a session
    // in any language other than English loses history with a green test suite.
    const path = rollout();
    appendFileSync(path, `${userLine('sửa lỗi build 🚀')}\n`, 'utf8');
    const first = await readNewRolloutLines(path, 0);
    appendFileSync(path, `${userLine('tiếp theo')}\n${userLine('xong rồi')}\n`, 'utf8');

    const second = await readNewRolloutLines(path, first.offset);

    expect([...first.lines, ...second.lines].map(promptOf)).toEqual([
      'sửa lỗi build 🚀',
      'tiếp theo',
      'xong rồi',
    ]);
  });

  it('leaves the cursor on the byte the file actually ends at', async () => {
    // The line count above only proves the lines came back; this proves the
    // cursor did not drift while they did, and the first assertion is what keeps
    // the fixture honest — without a character that is more than one byte, a
    // byte cursor and a character cursor are the same number and the test would
    // pass against the bug it exists to catch.
    const path = rollout();
    appendFileSync(path, `${userLine('héllo 🚀')}\n`, 'utf8');
    const first = await readNewRolloutLines(path, 0);
    appendFileSync(path, `${userLine('tiếp')}\n`, 'utf8');
    const second = await readNewRolloutLines(path, first.offset);

    const text = readFileSync(path, 'utf8');
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(text.length);
    expect(second.offset).toBe(Buffer.byteLength(text, 'utf8'));
  });
});

describe('finding the session', () => {
  it('finds every rollout in the tree, including one that started on a later day', async () => {
    const root = sessionsTree();
    rolloutIn(root, '2026.09.24', 'rollout-old.jsonl', `${userLine('yesterday')}\n`);
    rolloutIn(root, '2026.09.25', 'rollout-new.jsonl', `${userLine('today')}\n`);
    rolloutIn(root, '2026.09.25', 'notes.jsonl', 'not a rollout');
    rolloutIn(root, '2026.09.25', 'rollout-partial.jsonl', '{"type":"response_');

    const found = await listRolloutFiles(root);

    expect(found.map((file) => basename(file.path))).toEqual([
      'rollout-old.jsonl',
      'rollout-new.jsonl',
      'rollout-partial.jsonl',
    ]);
    expect(found.map((file) => file.size)).toEqual([
      Buffer.byteLength(`${userLine('yesterday')}\n`, 'utf8'),
      Buffer.byteLength(`${userLine('today')}\n`, 'utf8'),
      Buffer.byteLength('{"type":"response_', 'utf8'),
    ]);
  });

  it('finds nothing where there is no session yet, rather than failing', async () => {
    const root = sessionsTree();
    mkdirSync(join(root, '2026', '09', '25'), { recursive: true });

    expect(await listRolloutFiles(root)).toEqual([]);
    expect(await listRolloutFiles(join(root, 'nowhere'))).toEqual([]);
  });
});

describe('the watcher', () => {
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

  it('never sends a batch the ingest endpoint would refuse', async () => {
    // 413 above 100 events, and a batch that is only held together by the
    // interval is exactly how a burst of tool calls turns into a refused POST.
    const h = harness();
    h.append(`${Array.from({ length: 60 }, (_, turn) => userLine(`turn ${turn}`)).join('\n')}\n`);

    const delivered = await h.settle();

    expect(delivered).toHaveLength(60);
    expect(h.batches.every((batch) => batch.length > 0 && batch.length <= 50)).toBe(true);
    expect(Math.max(...h.batches.map((batch) => batch.length))).toBe(50);
  });
});

describe('a watcher that finds its own sessions', () => {
  it('does not replay the sessions it found already over', async () => {
    const root = sessionsTree();
    rolloutIn(root, '2026.09.24', 'rollout-old.jsonl', `${metaLine()}\n${userLine('yesterday')}\n`);
    const h = harness({ sessionsRoot: root });

    // Settled, not a single tick: a poll that only reads leaves events in the
    // buffer, and "nothing was sent" would then be true of a watcher that had
    // replayed the whole history and was about to send it.
    await h.settle();

    // Everything already in the tree happened before this watcher existed.
    // Emitting it would put a year of finished sessions on the live stream.
    expect(h.sent).toEqual([]);
  });

  it('streams a session that starts after it, from its first line', async () => {
    const root = sessionsTree();
    const h = harness({ sessionsRoot: root });
    await h.watcher.tick();
    const path = rolloutIn(root, '2026.09.25', 'rollout-new.jsonl', `${metaLine()}\n`);
    appendFileSync(path, `${userLine('first turn')}\n`, 'utf8');

    const delivered = await h.settle();

    expect(delivered.map((event) => event.type)).toEqual(['session.started', 'prompt.submitted']);
  });

  it('keeps a cursor per rollout, so a second session does not restart the first', async () => {
    // A cursor for the watcher rather than for the file would reset when the
    // second session appeared, and the first one's turns would be delivered a
    // second time. That is the duplicate the brief calls out.
    const root = sessionsTree();
    const first = rolloutIn(root, '2026.09.24', 'rollout-a.jsonl', `${metaLine('sess-a')}\n`);
    const h = harness({ sessionsRoot: root });
    await h.watcher.tick();
    appendFileSync(first, `${userLine('one', 'sess-a')}\n`, 'utf8');
    rolloutIn(root, '2026.09.25', 'rollout-b.jsonl', `${metaLine('sess-b')}\n`);
    appendFileSync(first, `${userLine('two', 'sess-a')}\n`, 'utf8');

    const delivered = await h.settle();

    expect(delivered.map((event) => `${event.sessionId}:${event.type}`)).toEqual([
      'sess-a:prompt.submitted',
      'sess-a:prompt.submitted',
      'sess-b:session.started',
    ]);
  });

  it('forgets a rollout that is gone, rather than resuming the next one mid-file', async () => {
    const root = sessionsTree();
    const path = rolloutIn(root, '2026.09.24', 'rollout-a.jsonl', `${userLine('one', 'sess-a')}\n`);
    const h = harness({ sessionsRoot: root });
    await h.watcher.tick();
    appendFileSync(path, `${userLine('two', 'sess-a')}\n`, 'utf8');
    await h.settle();

    rmSync(path);
    // The poll that sees the file is gone. A cursor kept across this point would
    // be pointing at bytes that are not coming back.
    await h.watcher.tick();
    // Longer than the cursor the old rollout left, so a surviving cursor would
    // start this read in the middle of the replacement's first line and deliver
    // nothing at all.
    writeFileSync(path, `${userLine('x'.repeat(300), 'sess-a')}\n`, 'utf8');
    const delivered = await h.settle();

    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.type).toBe('prompt.submitted');
  });
});

/**
 * The way out.
 *
 * The fake below re-implements the ingest endpoint's three refusals from
 * apps/web/src/event-routes.ts rather than importing them, because an adapter
 * may not import apps/web and importing the real route would need a server. The
 * assertions are about what the CLIENT does with those answers — whether it
 * halves a batch, waits, or gives up — so a fake that agreed with the client
 * about everything else could not make these pass.
 */
function reply(
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): HttpResponseLike {
  return {
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  };
}

function fakeIngest(maxEvents = 100) {
  const requests: { readonly url: string; readonly init: HttpRequestInit }[] = [];
  const accepted: AgentEvent[][] = [];
  const slept: number[] = [];
  let refused = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    const body = JSON.parse(init.body) as {
      protocolVersion: string;
      events: AgentEvent[];
    };
    if (body.protocolVersion !== PROTOCOL_VERSION) {
      return reply(400, 'protocol version mismatch');
    }
    if (body.events.length > maxEvents) {
      refused += 1;
      return reply(413, 'batch too large', { 'Retry-After': '1' });
    }
    if (new Set(body.events.map((event) => event.sessionId)).size > 1) {
      return reply(400, 'a batch must carry events for exactly one session');
    }
    accepted.push(body.events);
    return reply(200, JSON.stringify({ accepted: body.events.length }));
  };

  const send = createIngestSender({
    baseUrl: 'https://agentbattle.test',
    token: 'agent_battle_test',
    fetch: fetchImpl,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  return {
    send,
    requests,
    accepted,
    slept,
    get refused(): number {
      return refused;
    },
  };
}

function eventFor(index: number, session = SESSION): AgentEvent {
  const { event } = parseRolloutLine(userLine(`turn ${index}`, session));
  if (event === null) throw new Error('the fixture line did not parse');
  return event;
}

describe('posting a batch', () => {
  it('sends the shape the server parses, not a bare array', async () => {
    // parseEventBatch reads body.protocolVersion and body.events; an array is
    // refused with a 400 naming a body that must be an object, and a client
    // that only learns the shape from that 400 has never worked.
    const { send, requests } = fakeIngest();

    await send([eventFor(0)]);

    expect(requests).toHaveLength(1);
    const { url, init } = requests[0] as { url: string; init: HttpRequestInit };
    expect(url).toBe('https://agentbattle.test/api/events');
    expect(init.method).toBe('POST');
    expect(init.headers['authorization']).toBe('Bearer agent_battle_test');
    expect(JSON.parse(init.body)).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      events: [eventFor(0)],
    });
  });

  it('tolerates a base URL that ends in a slash', async () => {
    // A configuration mistake that would otherwise produce a double slash, which
    // some proxies answer with a redirect this client does not follow.
    const requests: string[] = [];
    const send = createIngestSender({
      baseUrl: 'https://agentbattle.test/',
      token: 't',
      fetch: async (url) => {
        requests.push(url);
        return reply(200, '{}');
      },
    });

    await send([eventFor(0)]);

    expect(requests).toEqual(['https://agentbattle.test/api/events']);
  });

  it('sends nothing at all for an empty batch', async () => {
    // The endpoint answers a body with no events with a 400, and a caller whose
    // buffer emptied between the check and the post would learn nothing from it.
    const { send, requests } = fakeIngest();

    await send([]);

    expect(requests).toEqual([]);
  });
});

describe('a batch the server calls too large', () => {
  it('halves it until the server accepts, delivering every event once', async () => {
    // Waiting alone cannot fix this: the batch is still too big a second later,
    // so a client that only honours Retry-After retries the identical refusal
    // forever. The refusal is about SIZE, so the answer is a smaller batch.
    const { send, accepted } = fakeIngest(3);
    const batch = Array.from({ length: 10 }, (_, i) => eventFor(i));

    await send(batch);

    const delivered = accepted.flat();
    expect(delivered).toHaveLength(10);
    // Exactly once, not merely at least once: a split that re-sent a half would
    // pass a length check and duplicate a session's history.
    expect(new Set(delivered.map((event) => (event as { prompt?: string }).prompt)).size).toBe(10);
    expect(Math.max(...accepted.map((each) => each.length))).toBeLessThanOrEqual(3);
  });

  it('waits the Retry-After the refusal advertised, once per refusal', async () => {
    // The header is the instruction. Ignoring it because the client has decided
    // the split is the real fix is how a refusal becomes a stampede. One wait
    // per refusal, because halving a batch of ten under a limit of three is
    // three refusals and a single wait would cover only the first.
    const ingest = fakeIngest(3);

    await ingest.send(Array.from({ length: 10 }, (_, i) => eventFor(i)));

    // Read after the send: the refusal count is a getter, and destructuring it
    // would have sampled it once up front and read zero.
    expect(ingest.refused).toBeGreaterThan(0);
    expect(ingest.slept).toEqual(Array.from({ length: ingest.refused }, () => 1_000));
  });

  it('does not sleep at all for a batch the server accepted', async () => {
    const { send, slept } = fakeIngest();

    await send([eventFor(0)]);

    expect(slept).toEqual([]);
  });
});

describe('a batch the server refuses for a reason waiting cannot fix', () => {
  it('throws with the status, and does not resend the same bytes', async () => {
    // A 400 is a client bug. The identical bytes are the identical bug next
    // time, so a retry here is a loop that never ends and never succeeds.
    const { send, requests } = fakeIngest();
    const mixed = [eventFor(0, SESSION), eventFor(1, 'a-different-session')];

    await expect(send(mixed)).rejects.toBeInstanceOf(IngestRefusedError);
    expect(requests).toHaveLength(1);
  });

  it("names the status and the server's own words, because the fix differs per status", async () => {
    // A 401 and a 404 are a credential problem and a registration problem. An
    // error that said only "request failed" would send somebody to the wrong one.
    const send = createIngestSender({
      baseUrl: 'https://agentbattle.test',
      token: 't',
      fetch: async () => reply(404, 'no such session'),
    });

    const thrown = await send([eventFor(0)]).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(IngestRefusedError);
    expect((thrown as IngestRefusedError).status).toBe(404);
    expect((thrown as IngestRefusedError).message).toContain('no such session');
  });
});

describe('a watcher posting into a server that refuses it', () => {
  it('counts the refused batch and keeps reading, rather than dying on it', async () => {
    // The interval awaits nothing, so a rejected poll is an unhandled rejection
    // and in Node that ends the process. One bad credential would take the
    // adapter down and look identical to an agent that simply went idle.
    const path = rollout();
    appendFileSync(path, `${metaLine()}\n`, 'utf8');
    let refuse = true;
    const delivered: AgentEvent[] = [];
    // The buffer only flushes on its own clock, so the test moves it rather
    // than sleeping. Without that, a tick that merely reads would send nothing
    // and a count of zero would be the truth, not evidence of a swallowed error.
    let clock = 1_000_000;
    const watcher = new CodexWatcher({
      rolloutPath: path,
      send: async (batch) => {
        if (refuse) throw new Error('401 unauthorized');
        delivered.push(...batch);
      },
      pollIntervalMs: 10,
      now: () => clock,
    });

    const pollUntilFlush = async () => {
      await watcher.tick();
      clock += FLUSH_INTERVAL_MS;
      await watcher.tick();
    };
    await pollUntilFlush();
    await pollUntilFlush();

    expect(watcher.failedBatchCount).toBe(1);
    expect(watcher.lastFailure).toContain('401 unauthorized');

    // Still reading afterwards: the second line arrives on the next poll, which
    // is the part that distinguishes "kept running" from "did not crash yet".
    refuse = false;
    appendFileSync(path, `${userLine('after the refusal')}\n`, 'utf8');
    await pollUntilFlush();

    expect(delivered.map((event) => event.type)).toEqual(['prompt.submitted']);
    expect(watcher.failedBatchCount).toBe(1);
  });

  it('reports a failure from the shutdown flush, which is otherwise the last chance to notice', async () => {
    const path = rollout();
    appendFileSync(path, `${userLine('one')}\n`, 'utf8');
    const watcher = new CodexWatcher({
      rolloutPath: path,
      send: async () => {
        throw new Error('no such session');
      },
      pollIntervalMs: 10,
    });
    await watcher.tick();

    await watcher.stop();

    expect(watcher.failedBatchCount).toBe(1);
    expect(watcher.lastFailure).toContain('no such session');
  });
});
