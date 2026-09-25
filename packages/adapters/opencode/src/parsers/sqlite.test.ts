import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { AgentEventSchema } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assistantTurn,
  createOpenCodeFixture,
  FIXTURE_EPOCH_MS,
  removeOpenCodeFixture,
  toolPart,
  type OpenCodeFixture,
} from '../fixtures/database.js';
import { OpenCodeStore, openCodeDatabasePath, readOnlyDatabaseUri } from './sqlite.js';

/**
 * The reader, against a real SQLite database.
 *
 * Every event is asserted against `AgentEventSchema` — the same union the server
 * validates with — rather than against a local expectation. A local expectation
 * would pass while the real endpoint 400s, which is the failure this stage exists
 * to make impossible.
 *
 * These tests use a database, and they live in the unit stage anyway. The stage
 * header says "pure, no network, no database", and it means the Postgres service
 * the integration stage needs: every handle here is a file under `mkdtemp` that
 * this test opens, writes to and removes, and nothing outside the process
 * touches it. Moving them to `tests/integration` would put a property this bead
 * cares most about behind a compose stack it does not need.
 *
 * ONE STORE PER TEST. `read()` opens the reader and takes the first poll;
 * `again()` polls the reader that is already open. A test that called `read()`
 * again would construct a SECOND store, which re-adopts the tail and therefore
 * reports nothing — so a cursor test written that way passes without the cursor
 * being wrong at all.
 */

const SESSION = 'ses_fixture';

let fixture: OpenCodeFixture | undefined;
let store: OpenCodeStore | undefined;

afterEach(() => {
  store?.close();
  store = undefined;
  if (fixture !== undefined) removeOpenCodeFixture(fixture);
  fixture = undefined;
});

/** Opens the reader and takes its first poll, asserting every event validates. */
function read(options: { readonly schema?: 'v1' | 'v2' } = {}) {
  if (fixture === undefined) throw new Error('no fixture: call make() first');
  store = new OpenCodeStore(
    fixture.path,
    options.schema === undefined ? {} : { schema: options.schema },
  );
  return poll();
}

/** Polls the reader that is already open. This is the second, third, nth poll. */
function poll() {
  if (store === undefined) throw new Error('no store: call read() first');
  const result = store.poll();
  for (const event of result.events) {
    const parsed = AgentEventSchema.safeParse(event);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  }
  return result;
}

function build(options: Parameters<typeof createOpenCodeFixture>[0]): OpenCodeFixture {
  fixture = createOpenCodeFixture(options);
  return fixture;
}

/**
 * The state a watcher actually finds: a database holding a session and nothing
 * else. The reader adopts the tail of the message and part tables, so a fixture
 * populated BEFORE the reader opens is history and correctly produces nothing —
 * which is why the tests below write their rows after `open()`.
 */
function openOn(sessionId = SESSION): OpenCodeFixture {
  const db = build({
    generation: 'v2',
    sessions: [{ id: sessionId, createdAt: FIXTURE_EPOCH_MS }],
  });
  const first = read();
  expect(typesOf(first.events), 'the first poll announces the session it can see').toEqual([
    'session.started',
  ]);
  return db;
}

function typesOf(events: readonly AgentEvent[]): readonly string[] {
  return events.map((event) => event.type);
}

function one<T extends AgentEvent['type']>(
  events: readonly AgentEvent[],
  type: T,
): Extract<AgentEvent, { type: T }> {
  const matches = events.filter((event) => event.type === type);
  expect(matches, `expected a ${type} in ${typesOf(events).join(', ')}`).toHaveLength(1);
  return matches[0] as Extract<AgentEvent, { type: T }>;
}

function countOf(events: readonly AgentEvent[], type: string): number {
  return events.filter((event) => event.type === type).length;
}

function userTurn(id: string, sessionId: string, at: number, text: string) {
  return {
    id,
    session_id: sessionId,
    type: 'user',
    seq: 1,
    time_created: FIXTURE_EPOCH_MS,
    time_updated: at,
    data: JSON.stringify({ type: 'user', text, time: { created: FIXTURE_EPOCH_MS } }),
  };
}

function sessionRow(id: string, at: number, parentId?: string) {
  return {
    id,
    project_id: 'project-1',
    parent_id: parentId ?? null,
    slug: id,
    directory: '/repo',
    title: 'a session',
    version: '1.18.21',
    time_created: at,
    time_updated: at,
    time_archived: null,
  };
}

function turnColumns(sessionId: string, at: number, data: unknown) {
  return {
    id: 'msg_assistant',
    session_id: sessionId,
    type: 'assistant',
    seq: 1,
    time_created: FIXTURE_EPOCH_MS,
    time_updated: at,
    data: JSON.stringify(data),
  };
}

describe('a v2 database, which is the generation the installed OpenCode writes', () => {
  it('detects the live generation rather than the tables that happen to remain', () => {
    // A migrated database still carries v1's tables and they are still readable,
    // so a reader that only knew about them would succeed and return nothing at
    // all. The probe is the only thing between that and a watcher that looks like
    // an idle agent for the rest of its life.
    build({ generation: 'v2' });
    read();
    expect(store?.schema).toBe('v2');
  });

  it('submits a prompt and reports a tool call once, on the rows written after it opened', () => {
    const db = openOn();
    db.write(
      'session_message',
      userTurn('msg_user', SESSION, FIXTURE_EPOCH_MS + 1, 'fix the build'),
    );
    expect(typesOf(poll().events)).toEqual(['prompt.submitted']);

    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 2,
        assistantTurn({
          reasoning: true,
          answer: 'done',
          tools: [{ callId: 'call_1', name: 'read', input: { path: 'a.ts' } }],
        }),
      ),
    );
    expect(typesOf(poll().events)).toEqual(['thinking', 'tool.started', 'tool.completed']);
  });

  it('stamps session.started from the row rather than from the wall clock', () => {
    const db = build({
      generation: 'v2',
      sessions: [{ id: SESSION, createdAt: FIXTURE_EPOCH_MS }],
    });
    const first = read();
    expect(one(first.events, 'session.started')).toMatchObject({
      sessionId: SESSION,
      harness: 'opencode',
      installationId: 'opencode',
      projectId: 'project-1',
      at: new Date(FIXTURE_EPOCH_MS).toISOString(),
    });
    expect(db.path).toContain('opencode.db');
  });

  it('normalises tool names through the shared map, and normalises the input keys', () => {
    // Both calls. Omitting normalizeToolInput leaves every consumer reading
    // camelCase keys no other adapter produces, and it is invisible without a
    // test because the event still validates.
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [
            { callId: 'c1', name: 'read', input: { filePath: 'src/a.ts' } },
            { callId: 'c2', name: 'edit', input: { path: 'b.ts', oldString: 'x', newString: 'y' } },
            { callId: 'c3', name: 'shell', input: { command: 'ls' } },
          ],
        }),
      ),
    );

    const started = poll().events.filter((event) => event.type === 'tool.started');
    expect(started.map((event) => event.tool)).toEqual(['Read', 'Edit', 'Bash']);
    expect(started[0]?.input).toEqual({ file_path: 'src/a.ts' });
    expect(started[1]?.input).toEqual({ path: 'b.ts', old_string: 'x', new_string: 'y' });
  });

  it('passes an unmapped tool through rather than dropping it', () => {
    // Three of the 1153 calls in the database on this machine are
    // `tools.hashline_read`, a plugin tool. A placeholder name would make it
    // indistinguishable from a mapped one; the documented behaviour is that it
    // keeps its own name and lands in a zone.
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [{ callId: 'c1', name: 'tools.hashline_read', input: {} }],
        }),
      ),
    );

    expect(one(poll().events, 'tool.started').tool).toBe('tools.hashline_read');
  });

  it('reports an errored call as tool.failed, not as a successful completion', () => {
    // The union has both, and says a failure is a different event because the
    // game reads it differently. One exit path that cannot tell them apart is
    // exactly where that distinction gets lost.
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [{ callId: 'c1', name: 'shell', status: 'error', error: 'command not found' }],
        }),
      ),
    );

    const events = poll().events;
    expect(countOf(events, 'tool.failed')).toBe(1);
    expect(countOf(events, 'tool.completed')).toBe(0);
    expect(one(events, 'tool.failed')).toMatchObject({ reason: 'command not found' });
  });

  it('measures the duration from the two stamps the row carries', () => {
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [
            {
              callId: 'c1',
              name: 'shell',
              createdAt: FIXTURE_EPOCH_MS,
              completedAt: FIXTURE_EPOCH_MS + 1_500,
            },
          ],
        }),
      ),
    );

    expect(one(poll().events, 'tool.completed').durationMs).toBe(1_500);
  });

  it('emits one start and one end however many polls the call spans', () => {
    // The defect this pins. A row is re-read on every poll its time_updated
    // moves, so a call that takes three writes is three sightings. Deduplicating
    // on the ROW rather than the CALL would put a duplicate in the stream for
    // each one — and every duplicate validates, so nothing downstream complains.
    const db = openOn();
    for (const offset of [1, 2, 3]) {
      db.write(
        'session_message',
        turnColumns(SESSION, FIXTURE_EPOCH_MS + offset, {
          type: 'assistant',
          content: [],
          time: { created: FIXTURE_EPOCH_MS },
        }),
      );
      expect(poll().events, `poll at +${offset}`).toEqual([]);
    }

    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 4,
        assistantTurn({
          tools: [
            {
              callId: 'call_slow',
              name: 'shell',
              createdAt: FIXTURE_EPOCH_MS,
              completedAt: FIXTURE_EPOCH_MS + 40,
            },
          ],
        }),
      ),
    );
    expect(typesOf(poll().events)).toEqual(['tool.started', 'tool.completed']);

    // A fifth re-write of the same row, still carrying the same call, adds nothing.
    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 5,
        assistantTurn({
          tools: [{ callId: 'call_slow', name: 'shell' }],
        }),
      ),
    );
    expect(poll().events).toEqual([]);
  });

  it('emits only the new call when a turn gains a block ahead of an existing tool', () => {
    // A v2 turn is rewritten whole, so its `content` array is a list rather than
    // a set and a tool's INDEX is not its identity — a turn that gains a block
    // ahead of one shifts every later element. Deduplicating on the element's own
    // id is what survives that; deduplicating on the position puts a second start
    // and a second completion for `call_a` in the log, and both validate.
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [{ callId: 'call_a', name: 'read', input: { path: 'a.ts' } }],
        }),
      ),
    );
    expect(countOf(poll().events, 'tool.started')).toBe(1);

    db.write(
      'session_message',
      turnColumns(
        SESSION,
        FIXTURE_EPOCH_MS + 2,
        assistantTurn({
          reasoning: true,
          tools: [
            { callId: 'call_a', name: 'read', input: { path: 'a.ts' } },
            { callId: 'call_b', name: 'read', input: { path: 'b.ts' } },
          ],
        }),
      ),
    );
    const after = poll().events;
    // One start, and it is the call that is genuinely new. The shifted `call_a`
    // is not re-announced.
    expect(countOf(after, 'tool.started')).toBe(1);
    expect(one(after, 'tool.started').input).toEqual({ path: 'b.ts' });
  });

  it('counts a turn it does not understand rather than dropping it silently', () => {
    const db = openOn();
    db.write('session_message', {
      id: 'msg_bookkeeping',
      session_id: SESSION,
      type: 'model-switched',
      seq: 1,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS + 1,
      data: JSON.stringify({ type: 'model-switched', time: { created: FIXTURE_EPOCH_MS } }),
    });

    expect(poll().skips).toEqual({ 'turn:model-switched': 1 });
    expect(store?.skipReasons['turn:model-switched']).toBe(1);
  });

  it('counts the assistant prose it drops, so the loss is a number', () => {
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(SESSION, FIXTURE_EPOCH_MS + 1, assistantTurn({ answer: 'here is what I found' })),
    );

    const result = poll();
    expect(result.skips).toEqual({ 'assistant-text': 1 });
    expect(result.events).toEqual([]);
  });

  it('emits one thinking per model step, not one per reasoning block', () => {
    // 5569 reasoning elements across 1283 turns on this machine is four per turn.
    // The union's `thinking` carries no payload, so it is a zone transition; one
    // per block is a stream no client can render.
    const turn = assistantTurn({ reasoning: true });
    const blocks = (turn.content as Record<string, unknown>[]).filter(
      (element) => element.type === 'reasoning',
    );
    const db = openOn();
    db.write(
      'session_message',
      turnColumns(SESSION, FIXTURE_EPOCH_MS + 1, {
        ...turn,
        content: [...blocks, ...blocks, ...blocks, ...blocks],
      }),
    );

    expect(countOf(poll().events, 'thinking')).toBe(1);
  });

  it('announces a session it has to invent, rather than dropping the events on it', () => {
    // A part can belong to a session whose own row predates the session cursor,
    // or to one the harness has not written yet. The stream still has to be
    // well formed: a session.started with a synthetic project id, then the tool
    // call, and a skip saying the identity was made up. A session with a hole in
    // it is recoverable; a tool call with nowhere to attach is not.
    const db = build({ generation: 'v2' });
    read();
    db.write(
      'session_message',
      turnColumns(
        'ses_ghost',
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [{ callId: 'c1', name: 'read', input: { path: 'a.ts' } }],
        }),
      ),
    );

    const events = poll().events;
    expect(typesOf(events)).toEqual(['session.started', 'tool.started', 'tool.completed']);
    expect(one(events, 'session.started')).toMatchObject({
      sessionId: 'ses_ghost',
      // With no row to read, the session is its own project.
      projectId: 'ses_ghost',
    });
    expect(poll().skips).toEqual({});
  });

  it('counts a session it had to invent, so the hole is visible', () => {
    const db = build({ generation: 'v2' });
    read();
    db.write(
      'session_message',
      turnColumns(
        'ses_ghost',
        FIXTURE_EPOCH_MS + 1,
        assistantTurn({
          tools: [{ callId: 'c1', name: 'read' }],
        }),
      ),
    );
    poll();

    expect(store?.skipReasons).toEqual({ 'unknown-session': 1 });
  });

  it('reports a subagent on the parent stream, and starts the child on its own', () => {
    build({ generation: 'v2', sessions: [{ id: SESSION, createdAt: FIXTURE_EPOCH_MS }] });
    read();
    fixture?.write('session_v2', sessionRow('ses_child', FIXTURE_EPOCH_MS + 1, SESSION));

    const events = poll().events;
    expect(one(events, 'subagent.spawned')).toMatchObject({
      sessionId: SESSION,
      childSessionId: 'ses_child',
    });
    expect(countOf(events, 'session.started')).toBe(1);
  });

  it('ends a session the harness archived, with the reason the column supports', () => {
    // time_archived is a real column and the only real end signal in the
    // database, so the common end is observed rather than guessed.
    const db = openOn();
    db.write('session_v2', {
      ...sessionRow(SESSION, FIXTURE_EPOCH_MS),
      time_updated: FIXTURE_EPOCH_MS + 5,
      time_archived: FIXTURE_EPOCH_MS + 5,
    });

    expect(one(poll().events, 'session.ended')).toMatchObject({ reason: 'completed' });
  });

  it('adopts the tail rather than replaying a session that was already over', () => {
    // A database with a finished session in it would otherwise open by reporting
    // that history as live activity, and every assertion here would still pass.
    build({
      generation: 'v2',
      sessions: [{ id: SESSION }],
      messages: [
        {
          id: 'msg_old',
          sessionId: SESSION,
          data: { type: 'user', text: 'from last week', time: { created: FIXTURE_EPOCH_MS } },
        },
      ],
    });

    expect(read().events).toHaveLength(1); // the session, and nothing that was already there
  });
});

describe('a v1 database, which is the generation the port reads', () => {
  /** The same shape as openOn: a session and nothing else, on the v1 tables. */
  function openOnV1(): OpenCodeFixture {
    const db = build({
      generation: 'v1',
      sessions: [{ id: SESSION, createdAt: FIXTURE_EPOCH_MS }],
    });
    expect(typesOf(read().events)).toEqual(['session.started']);
    return db;
  }

  function partRow(id: string, at: number, data: unknown, messageId = 'msg_1') {
    return {
      id,
      message_id: messageId,
      session_id: SESSION,
      time_created: at,
      time_updated: at,
      data: JSON.stringify(data),
    };
  }

  it('reads the v1 part table, and reports which generation it read', () => {
    const db = openOnV1();
    db.write('message', {
      id: 'msg_1',
      session_id: SESSION,
      time_created: FIXTURE_EPOCH_MS + 1,
      time_updated: FIXTURE_EPOCH_MS + 1,
      data: JSON.stringify({ role: 'assistant', modelID: 'm' }),
    });
    for (const [index, part] of [
      { type: 'step-start' },
      { type: 'step-finish' },
      toolPart({ callId: 'c1', name: 'grep', input: { pattern: 'x' } }),
    ].entries()) {
      db.write('part', partRow(`pr_${index}`, FIXTURE_EPOCH_MS + 2 + index, part));
    }

    const result = poll();
    expect(store?.schema).toBe('v1');
    expect(typesOf(result.events)).toEqual([
      'session.heartbeat',
      'session.heartbeat',
      'tool.started',
      'tool.completed',
    ]);
    expect(one(result.events, 'tool.started')).toMatchObject({
      tool: 'Grep',
      input: { pattern: 'x' },
    });
  });

  it('reads a user turn as a prompt by asking which message the text hangs off', () => {
    // The lookup matters: a part can belong to a message written before this
    // watcher opened, in which case the message cursor never moves over it and
    // the role was never remembered. Without the lookup, every part of a session
    // already in progress reads as context instead of as a prompt.
    const db = openOnV1();
    db.write('message', {
      id: 'msg_user',
      session_id: SESSION,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS,
      data: JSON.stringify({ role: 'user' }),
    });
    db.write(
      'part',
      partRow('pr_1', FIXTURE_EPOCH_MS + 1, { type: 'text', text: 'go' }, 'msg_user'),
    );

    expect(one(poll().events, 'prompt.submitted')).toMatchObject({ prompt: 'go' });
  });

  it('counts a patch part it cannot turn into a file write', () => {
    const db = openOnV1();
    db.write('message', {
      id: 'msg_1',
      session_id: SESSION,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS,
      data: JSON.stringify({ role: 'assistant' }),
    });
    db.write(
      'part',
      partRow('pr_1', FIXTURE_EPOCH_MS + 1, { type: 'patch', files: [], hash: 'h' }),
    );

    expect(poll().skips).toEqual({ 'unmapped-part': 1 });
  });
});

describe('the watermarks', () => {
  it('advances a message on time_updated, so a message updated in place is re-read', () => {
    const db = build({ generation: 'v2', sessions: [{ id: SESSION }] });
    read();

    db.write('session_message', {
      id: 'msg_1',
      session_id: SESSION,
      type: 'user',
      seq: 1,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS + 10,
      data: JSON.stringify({ type: 'user', text: 'first', time: { created: FIXTURE_EPOCH_MS } }),
    });
    expect(one(poll().events, 'prompt.submitted').prompt).toBe('first');

    // Same row, later stamp, different text. Keyed on time_created this would
    // never be read again and the turn would be lost. It is re-read here, and
    // emitted-once is keyed on the message id, so the prompt is not doubled.
    db.write('session_message', {
      id: 'msg_1',
      session_id: SESSION,
      type: 'user',
      seq: 1,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS + 20,
      data: JSON.stringify({ type: 'user', text: 'second', time: { created: FIXTURE_EPOCH_MS } }),
    });
    expect(poll().rowsRead).toBe(1);
    expect(poll().events).toEqual([]);
  });

  it('does not re-emit a part that arrives late carrying an old time_created', () => {
    // The other half of the same rule. A row written after the cursor moved but
    // stamped before it is history by the column the part cursor rides, and
    // re-emitting it would put a tool call in the log twice.
    // A baseline part below the one under test, so the tail this reader adopts is
    // not the row it is supposed to read.
    const db = build({
      generation: 'v1',
      sessions: [{ id: SESSION }],
      messages: [{ id: 'msg_1', sessionId: SESSION, data: { role: 'assistant' } }],
      parts: [
        {
          id: 'pr_baseline',
          messageId: 'msg_1',
          sessionId: SESSION,
          createdAt: FIXTURE_EPOCH_MS,
          data: toolPart({ callId: 'c_baseline', name: 'read' }),
        },
      ],
    });
    read();
    db.write('part', {
      id: 'pr_1',
      message_id: 'msg_1',
      session_id: SESSION,
      time_created: FIXTURE_EPOCH_MS + 10,
      time_updated: FIXTURE_EPOCH_MS + 10,
      data: JSON.stringify(toolPart({ callId: 'c1', name: 'read' })),
    });
    expect(countOf(poll().events, 'tool.started')).toBe(1);

    db.write('part', {
      id: 'pr_late',
      message_id: 'msg_1',
      session_id: SESSION,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS,
      data: JSON.stringify(toolPart({ callId: 'c_late', name: 'read' })),
    });

    expect(poll().events).toEqual([]);
  });

  it('reads two rows stamped in the same millisecond, one poll apart', () => {
    // OpenCode stamps in milliseconds, so two parts in the same millisecond
    // share a time_created, and a `>` cursor steps over the second the instant it
    // sees the first. The skipped tool call validates perfectly and nothing
    // downstream complains.
    //
    // The two rows have to arrive in SEPARATE polls. Written together before the
    // first poll, a bare timestamp and a `(time, id)` pair return the same two
    // rows, and the test passes while the cursor is wrong — which is how this
    // first version of the test was written, and it passed against a bare
    // timestamp for exactly that reason.
    const db = build({
      generation: 'v1',
      sessions: [{ id: SESSION }],
      messages: [{ id: 'msg_1', sessionId: SESSION, data: { role: 'assistant' } }],
    });
    read();

    for (const id of ['pr_a', 'pr_b']) {
      db.write('part', {
        id,
        message_id: 'msg_1',
        session_id: SESSION,
        time_created: FIXTURE_EPOCH_MS + 7,
        time_updated: FIXTURE_EPOCH_MS + 7,
        data: JSON.stringify(toolPart({ callId: `call_${id}`, name: 'read' })),
      });
      expect(countOf(poll().events, 'tool.started'), `${id} must be read on its own poll`).toBe(1);
    }
  });

  it('reads a v1 part once for discovery and once per change, not twice per change', () => {
    // The reason the two v1 cursors ride different columns. A part row is
    // rewritten in place as its tool progresses, so keying discovery on
    // `time_updated` as well would return every update from BOTH statements and
    // double the rows the backoff is reading. `rowsRead` is the backoff's input,
    // so doubling it is a doubling of the polling cost, and it is observable.
    const db = build({
      generation: 'v1',
      sessions: [{ id: SESSION }],
      messages: [{ id: 'msg_1', sessionId: SESSION, data: { role: 'assistant' } }],
    });
    read();

    const write = (at: number) => {
      db.write('part', {
        id: 'pr_1',
        message_id: 'msg_1',
        session_id: SESSION,
        time_created: FIXTURE_EPOCH_MS + 1,
        time_updated: at,
        data: JSON.stringify(toolPart({ callId: 'call_pr_1', name: 'read' })),
      });
    };

    // Discovered once and seen once: both passes return a brand new part, which is
    // the overlap the two cursors are designed around.
    write(FIXTURE_EPOCH_MS + 1);
    expect(poll().rowsRead).toBe(2);

    // Updated in place: the discovery cursor has passed this row and does not
    // move, so only the update pass returns it. Keying discovery on
    // `time_updated` as well would return it twice, doubling what the backoff
    // counts as busy.
    write(FIXTURE_EPOCH_MS + 2);
    expect(poll().rowsRead).toBe(1);
  });
});

describe('read-only', () => {
  it('refuses a write through the handle the reader actually opened', () => {
    // The bead's stated correctness rule, asserted on the reader's OWN handle and
    // not on the arguments it was constructed with.
    //
    // The first version of this test built a handle from `readOnlyDatabaseUri`
    // and proved the URI was read-only — which proved the helper, not the store.
    // Substituting a read-write open into the store left all 45 tests green: a
    // read-write connection that only SELECTs holds no write lock and changes no
    // bytes, so nothing else in the suite could see the difference. Going
    // through `store.handle` is what makes this a gate.
    const db = build({ generation: 'v2', sessions: [{ id: SESSION }] });
    read();

    const insert =
      "INSERT INTO session_v2 (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES ('x','p','s','d','t','1',1,1)";
    expect(() => store?.handle.exec(insert), 'the reader must not be able to write').toThrow();
    expect(() => db.exec(insert), 'the writer beside it must still be able to').not.toThrow();
  });

  it('builds the URI with mode=ro, and says so', () => {
    // The helper is the single source of that URI, so its own shape is worth one
    // assertion: `mode=ro` is what SQLite itself refuses a write through, and the
    // `readOnly` option is the second lock on the same door.
    expect(readOnlyDatabaseUri('/tmp/opencode.db').searchParams.get('mode')).toBe('ro');
  });

  it('leaves the database byte-identical and writes no rollback journal', () => {
    // Not "the constructor was passed readOnly: true" — the file. A `-wal`
    // sidecar may appear when a read-only connection attaches to a WAL database,
    // because SQLite needs a shared-memory index to read one; that is
    // coordination, not data. The assertion is on the bytes the user would lose.
    const db = build({
      generation: 'v2',
      sessions: [{ id: SESSION }],
      messages: [
        {
          id: 'msg_1',
          sessionId: SESSION,
          data: assistantTurn({ tools: [{ callId: 'c1', name: 'read' }] }),
        },
      ],
    });
    const before = readFileSync(db.path);

    for (let index = 0; index < 5; index += 1) pollAfterOpening(db);

    expect(readFileSync(db.path).equals(before)).toBe(true);
    expect(() => statSync(`${db.path}-journal`)).toThrow();
  });

  it('holds no write lock: a writer can still take the reserved lock underneath it', () => {
    // The strongest statement about "we do not contend on the user's database",
    // and the one that would fail if this were a read-write handle: BEGIN
    // IMMEDIATE takes the write lock, so a reader holding one would make this
    // throw SQLITE_BUSY.
    const db = build({ generation: 'v2', sessions: [{ id: SESSION }] });
    read();
    expect(() => {
      db.beginUncommittedWrite();
    }).not.toThrow();
    db.endUncommittedWrite(false);
  });

  it('keeps reading while a writer holds the database open mid-transaction', () => {
    // SQLite's write lock is held by the CONNECTION, not the process, so a second
    // write connection is the same contention a second OpenCode process
    // produces. Spawning a child process would cost a Node start-up on every unit
    // run to exercise the same code path.
    openOn();
    const db = fixture as OpenCodeFixture;

    db.beginUncommittedWrite();
    db.write('session_message', {
      id: 'msg_1',
      session_id: SESSION,
      type: 'user',
      seq: 1,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS,
      data: JSON.stringify({
        type: 'user',
        text: 'uncommitted',
        time: { created: FIXTURE_EPOCH_MS },
      }),
    });

    // Not blocked: a read-write handle here would throw SQLITE_BUSY on the first
    // poll, because a writer mid-transaction holds the reserved lock. And the
    // row the writer has not committed is correctly invisible either way.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => poll(), `poll ${attempt} while a writer held the database`).not.toThrow();
    }
    expect(countOf(poll().events, 'prompt.submitted')).toBe(0);

    db.endUncommittedWrite(true);
    expect(countOf(poll().events, 'prompt.submitted')).toBe(1);
  });
});

/** Opens a reader on a fixture, polls it, and closes it. For a loop, not a cursor. */
function pollAfterOpening(db: OpenCodeFixture): void {
  const handle = new OpenCodeStore(db.path);
  handle.poll();
  handle.close();
}

describe('finding the database', () => {
  it('returns undefined rather than a path that is not there', () => {
    // A watcher that opened a database OpenCode has not created yet would create
    // one, and a reader with the wrong schema on an empty file is a far worse
    // error than a path that does not exist.
    expect(openCodeDatabasePath('/nonexistent-home-for-tests')).toBeUndefined();
  });

  it('finds the XDG layout OpenCode uses', () => {
    const home = build({ generation: 'v2' }).directory;
    const xdg = join(home, '.local', 'share', 'opencode');
    mkdirSync(xdg, { recursive: true });
    const moved = join(xdg, 'opencode.db');
    require('node:fs').renameSync(fixture?.path as string, moved);

    expect(openCodeDatabasePath(home)).toBe(moved);
  });
});
