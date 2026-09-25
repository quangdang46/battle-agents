import { AgentEventSchema } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assistantTurn,
  createOpenCodeFixture,
  FIXTURE_EPOCH_MS,
  removeOpenCodeFixture,
  type OpenCodeFixture,
} from './fixtures/database.js';
import { OpenCodeWatcher } from './watcher.js';

/**
 * The loop, the backoff, and what leaves it.
 *
 * The schedule is injected and never fired: a test calls `tick()` and reads the
 * delay the watcher asked for. That is the whole point of injecting it — the
 * backoff is only observable as a number the loop chose, and waiting through
 * real delays to watch it widen would be slow, flaky, and would prove less.
 */

const SESSION = 'ses_fixture';
const OTHER_SESSION = 'ses_other';
const MIN_MS = 500;
const MAX_MS = 5_000;

let fixture: OpenCodeFixture | undefined;
let watcher: OpenCodeWatcher | undefined;

afterEach(async () => {
  await watcher?.stop();
  watcher = undefined;
  if (fixture !== undefined) removeOpenCodeFixture(fixture);
  fixture = undefined;
});

interface Harness {
  readonly batches: readonly (readonly AgentEvent[])[];
  /** Every delay the loop asked for, in order. The backoff, read off. */
  readonly delays: readonly number[];
  readonly cancelled: () => number;
  readonly sent: () => readonly AgentEvent[];
  readonly advanceClock: (ms: number) => void;
}

function harness(
  options: {
    readonly minPollIntervalMs?: number;
    readonly maxPollIntervalMs?: number;
    readonly backoffFactor?: number;
    readonly sessionEndIdleMs?: number;
    readonly sendFails?: boolean;
  } = {},
): Harness {
  const batches: AgentEvent[][] = [];
  const delays: number[] = [];
  const all: AgentEvent[] = [];
  let cancelled = 0;
  let clock = 1_000_000;
  fixture = createOpenCodeFixture({
    generation: 'v2',
    sessions: [{ id: SESSION, createdAt: FIXTURE_EPOCH_MS }],
  });

  watcher = new OpenCodeWatcher({
    send: async (batch) => {
      if (options.sendFails === true) throw new Error('401 unauthorized');
      batches.push([...batch]);
      all.push(...batch);
    },
    databasePath: fixture.path,
    schedule: (_task, delayMs) => {
      delays.push(delayMs);
      return () => {
        cancelled += 1;
      };
    },
    // `cancel` is left at its default, which invokes the canceller the scheduler
    // returned — so the count below is the real one, not a test-side fiction.
    now: () => clock,
    ...(options.minPollIntervalMs === undefined ? {} : { minPollIntervalMs: options.minPollIntervalMs }),
    ...(options.maxPollIntervalMs === undefined ? {} : { maxPollIntervalMs: options.maxPollIntervalMs }),
    ...(options.backoffFactor === undefined ? {} : { backoffFactor: options.backoffFactor }),
    ...(options.sessionEndIdleMs === undefined ? {} : { sessionEndIdleMs: options.sessionEndIdleMs }),
  });

  return {
    batches,
    delays,
    cancelled: () => cancelled,
    sent: () => all,
    advanceClock: (ms) => {
      clock += ms;
    },
  };
}

function current(): OpenCodeWatcher {
  if (watcher === undefined) throw new Error('no watcher: call harness() first');
  return watcher;
}

function db(): OpenCodeFixture {
  if (fixture === undefined) throw new Error('no fixture: call harness() first');
  return fixture;
}

/** Writes an assistant turn carrying `count` distinct tool calls. */
function writeTools(count: number, offset: number, sessionId = SESSION): void {
  db().write('session_message', {
    id: `msg_${offset}`,
    session_id: sessionId,
    type: 'assistant',
    seq: offset,
    time_created: FIXTURE_EPOCH_MS + offset,
    time_updated: FIXTURE_EPOCH_MS + offset,
    data: JSON.stringify(
      assistantTurn({
        tools: Array.from({ length: count }, (_unused, index) => ({
          callId: `call_${offset}_${index}`,
          name: 'read',
          input: { path: `file-${index}.ts` },
        })),
      }),
    ),
  });
}

/** Writes an assistant turn that is only prose, so it yields a row and no event. */
function writeProse(offset: number, sessionId = SESSION): void {
  db().write('session_message', {
    id: `msg_prose_${offset}`,
    session_id: sessionId,
    type: 'assistant',
    seq: offset,
    time_created: FIXTURE_EPOCH_MS + offset,
    time_updated: FIXTURE_EPOCH_MS + offset,
    data: JSON.stringify(assistantTurn({ answer: `the answer to turn ${offset}` })),
  });
}

describe('the backoff', () => {
  it('starts at the floor and widens on every poll that finds nothing', async () => {
    // The requirement the plan states twice and nothing in the tree implemented:
    // a fixed interval is wrong in both directions, because an idle OpenCode
    // writes no rows at all and there is nothing to gain by reading its database
    // twice a second for ten minutes.
    const loop = harness();
    await current().start();
    expect(loop.delays).toEqual([MIN_MS]);

    await current().tick();
    expect(loop.delays.at(-1)).toBe(MIN_MS * 2);
    await current().tick();
    expect(loop.delays.at(-1)).toBe(MIN_MS * 4);
    await current().tick();
    expect(loop.delays.at(-1)).toBe(MIN_MS * 8);
  });

  it('tightens back to the floor the moment a poll reads a row', async () => {
    harness();
    await current().start();
    await current().tick();
    await current().tick();
    expect(current().pollIntervalMs).toBeGreaterThan(MIN_MS);

    writeTools(1, 1);
    await current().tick();
    expect(current().pollIntervalMs).toBe(MIN_MS);
  });

  it('treats a poll that read rows but emitted nothing as busy, not as idle', async () => {
    // The distinction this pins, and the reason the backoff takes rowsRead rather
    // than events.length. A turn that is nothing but the assistant's answer is a
    // row the reader consumed, a skip it counted, and ZERO events — the database
    // is plainly busy. Backing off on the event count would widen to the ceiling
    // in the middle of a step, which is the opposite of what the delay is for.
    harness();
    await current().start();
    await current().tick();
    await current().tick();
    expect(current().pollIntervalMs).toBeGreaterThan(MIN_MS);

    writeProse(1);
    await current().tick();
    expect(current().skippedCount).toBeGreaterThan(0);
    expect(current().pollIntervalMs).toBe(MIN_MS);

    // And a genuinely idle poll still widens, so the previous line is not just
    // "the interval never changes".
    await current().tick();
    expect(current().pollIntervalMs).toBe(MIN_MS * 2);
  });

  it('never widens past the ceiling, however long the silence runs', async () => {
    const loop = harness();
    await current().start();
    for (let poll = 0; poll < 20; poll += 1) await current().tick();
    expect(loop.delays.every((delay) => delay <= MAX_MS)).toBe(true);
    expect(current().pollIntervalMs).toBe(MAX_MS);
  });

  it('honours bounds it is given rather than the defaults', async () => {
    const loop = harness({ minPollIntervalMs: 10, maxPollIntervalMs: 40 });
    await current().start();
    await current().tick();
    await current().tick();
    expect(loop.delays).toEqual([10, 20, 40]);
    await current().tick();
    expect(current().pollIntervalMs).toBe(40);
  });

  it('re-arms exactly one poll per tick, and cancels the one it replaces', async () => {
    const loop = harness();
    await current().start();
    await current().tick();
    await current().tick();
    expect(loop.delays).toHaveLength(3);
    await current().stop();
    expect(loop.cancelled()).toBeGreaterThan(0);
    expect(current().status).toBe('stopped');
  });

  it('backs off on a poll that throws, so a broken reader is not retried hot', async () => {
    // A poll that throws counts as silence — which is what a locked database is,
    // from the loop's point of view — and the widening is what stops a
    // permanently broken database from being retried twice a second forever. The
    // scenario is an OpenCode upgrade that drops a table the reader prepared a
    // statement against at start-up, which is a real failure and not a mock.
    const loop = harness();
    await current().start();
    db().exec('DROP TABLE session_message');

    await current().tick();

    expect(current().failedPollCount).toBe(1);
    expect(current().lastFailure).toContain('session_message');
    expect(current().pollIntervalMs).toBe(MIN_MS * 2);
    expect(loop.delays.at(-1)).toBe(MIN_MS * 2);
  });
});

describe('batching', () => {
  it('flushes at 50 events and never puts more than 100 in a batch', async () => {
    // The three server-enforced rules: 250ms or 50 events, never more than 100
    // (a 413 with a Retry-After), and never two sessionIds (a 400). An adapter
    // that invented its own policy would be refused by the endpoint it posts to.
    // 60 tool calls is 120 events, because a call is a start AND a completion,
    // plus the `session.started` still sitting in the window from the opening
    // poll. Batching does not care what the events are, and 121 is the honest
    // total — a test that forced the count to 120 by flushing first would be
    // asserting an arithmetic accident.
    const loop = harness();
    await current().start();
    writeTools(60, 1);

    await current().tick();
    expect(loop.batches.map((batch) => batch.length)).toEqual([50, 50]);

    loop.advanceClock(250);
    await current().tick();
    expect(loop.batches.map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(loop.batches.every((batch) => batch.length <= 100)).toBe(true);
  });

  it('holds a partial batch until the 250ms window closes', async () => {
    const loop = harness();
    await current().start();
    writeTools(3, 1);

    await current().tick();
    expect(loop.batches).toHaveLength(0);

    loop.advanceClock(250);
    await current().tick();
    expect(loop.batches).toHaveLength(1);
    // Three calls is six events, a start and a completion each, plus the
    // `session.started` the opening poll left in the window.
    expect(loop.batches[0]).toHaveLength(7);
  });

  it('never mixes two sessionIds in one batch', async () => {
    const loop = harness();
    await current().start();
    writeTools(3, 1);
    writeTools(3, 2, OTHER_SESSION);
    loop.advanceClock(250);

    await current().tick();
    const delivered = loop.batches.flat();
    expect(delivered.length).toBeGreaterThan(1);
    for (const batch of loop.batches) {
      expect(new Set(batch.map((event) => event.sessionId)).size).toBe(1);
    }
  });

  it('validates everything it sends against the union the server validates with', async () => {
    const loop = harness();
    await current().start();
    writeTools(4, 1);
    loop.advanceClock(250);
    await current().tick();

    expect(loop.sent().length).toBeGreaterThan(0);
    for (const event of loop.sent()) {
      const result = AgentEventSchema.safeParse(event);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it('counts a refused batch instead of dying on it', async () => {
    // An interval whose rejected promise nobody awaits takes the process down in
    // Node, and a telemetry adapter that dies because one POST was refused costs
    // more than the batch it lost. A 401 and a 404 are different problems, so
    // the reason is kept.
    const loop = harness({ sendFails: true });
    await current().start();
    writeTools(2, 1);
    loop.advanceClock(250);
    await current().tick();
    expect(current().failedBatchCount).toBeGreaterThan(0);
    expect(current().lastFailure).toContain('401');
    expect(current().status).toBe('watching');
  });
});

describe('the lifecycle', () => {
  it('flushes what is buffered on stop rather than dropping it', async () => {
    // The assertion that fails if someone copies the reference implementation's
    // `void` stop(): with a void stop this flush is fire-and-forget, and the
    // session ends with events delivered after the runtime has torn down.
    const loop = harness();
    await current().start();
    writeTools(3, 1);
    await current().tick();
    expect(loop.batches).toHaveLength(0);

    await current().stop();
    expect(loop.batches).toHaveLength(1);
    expect(loop.batches[0]).toHaveLength(7);
    expect(current().status).toBe('stopped');
  });

  it('reports a state, because a silent watcher is indistinguishable from an idle agent', async () => {
    harness();
    expect(current().status).toBe('idle');
    await current().start();
    expect(current().status).toBe('watching');
  });

  it('says where it is reading and which generation it read', () => {
    harness();
    expect(current().databasePath).toBe(db().path);
    expect(current().schema).toBe('v2');
  });

  it('ends a session that goes quiet, with the reason the heuristic supports', async () => {
    // The one mapping in this adapter with no data behind it: the database has
    // no "the user quit" field, so silence is all there is. `abandoned` and not
    // `completed` because nothing here knows why it stopped.
    const loop = harness({ sessionEndIdleMs: 1 });
    await current().start();
    writeTools(1, 1);
    await current().tick();
    expect(loop.sent().some((event) => event.type === 'session.ended')).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    loop.advanceClock(250);
    await current().tick();

    const ended = loop.sent().find((event) => event.type === 'session.ended');
    expect(ended).toMatchObject({ type: 'session.ended', reason: 'abandoned' });
  });

  it('never arms the end timer when the idle window is turned off', async () => {
    const loop = harness({ sessionEndIdleMs: -1 });
    await current().start();
    writeTools(1, 1);
    await current().tick();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loop.sent().some((event) => event.type === 'session.ended')).toBe(false);
  });

  it('skips are reported per reason, so a schema change is a number that moved', async () => {
    harness();
    await current().start();
    db().write('session_message', {
      id: 'msg_bookkeeping',
      session_id: SESSION,
      type: 'model-switched',
      seq: 9,
      time_created: FIXTURE_EPOCH_MS,
      time_updated: FIXTURE_EPOCH_MS + 1,
      data: JSON.stringify({ type: 'model-switched' }),
    });
    await current().tick();

    expect(current().skippedCount).toBe(1);
    expect(current().skipReasons).toEqual({ 'turn:model-switched': 1 });
  });
});

describe('a database that is not there', () => {
  it('fails at construction with a message naming where it looked', () => {
    // Loud rather than silent. A watcher that quietly watched nothing is the
    // failure the research doc records four times over in the port it came from.
    expect(() => new OpenCodeWatcher({ send: async () => {}, databasePath: '/nonexistent/db.sqlite' })).toThrow(
      /unable to open database file|no such file/i,
    );
  });
});
