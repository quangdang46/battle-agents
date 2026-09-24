import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent } from '@battle-agents/core';
import { PROTOCOL_VERSION } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';
import { describe, expect, it } from 'vitest';

import { DEFAULT_BATCH_LIMITS, EventBuffer, readBatchLimits } from './event-batch.js';
import { createEventRoutes, type EventRouteDependencies } from './event-routes.js';
import { EventStreamHub, decodeStreamFrame, type GameSnapshot } from './event-stream.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The telemetry plane, without a server.
 *
 * Two things are being pinned here and they pull in opposite directions. The
 * success criteria are about what does NOT happen as much as what does: a batch
 * over the limit is refused before it is parsed, a transient event never reaches
 * the store but always reaches a subscriber, and a delta frame is structurally
 * incapable of carrying state. Each of those is a test that fails if the guard
 * is removed, and the ones that matter were deliberately broken to prove it
 * (see the report; the mutations are the reason to trust the green).
 */

const ORIGIN = 'https://agentbattle.test';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';
const AT = '2026-09-24T12:00:00.000Z';
const OTHER_INSTALLATION = '44444444-4444-4444-8444-444444444444';

function headers(entries: Record<string, string> = {}): HttpRequest['headers'] {
  return new Map(Object.entries(entries)) as unknown as HttpRequest['headers'];
}

/** A transient event: the kind a busy agent emits by the thousand. */
function transient(sessionId = SESSION_ID): AgentEvent {
  return { type: 'tool.started', sessionId, at: AT, tool: 'Read' };
}

/** A key event: one the persistence policy is willing to keep. */
function keyEvent(sessionId = SESSION_ID): AgentEvent {
  return {
    type: 'session.started',
    sessionId,
    at: AT,
    agentId: AGENT_ID,
    installationId: 'i',
    projectId: 'p',
    harness: 'claude',
  };
}

function batch(events: readonly AgentEvent[], protocolVersion = PROTOCOL_VERSION): unknown {
  return { protocolVersion, events };
}

interface Harness {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly store: InMemoryStateStore;
  readonly bus: ReturnType<typeof createInMemoryEventBus>;
  readonly hub: EventStreamHub;
  readonly emitted: GameEvent[];
  readonly published: GameEvent[];
}

/**
 * A gateway assembled from in-memory parts.
 *
 * The runtime here is the REAL one from core, not a stand-in, so the persistence
 * policy under test is the shipped policy and a change to `isPersistedEventType`
 * shows up in this file without a rebuild (the stages alias to source). Only the
 * database is faked, and it is faked with core's own `InMemoryStateStore` so the
 * "did this reach a row" question is asked of the same store the real one
 * implements.
 */
function harness(
  overrides: Partial<EventRouteDependencies> = {},
  maxSubscriberLag?: number,
): Harness {
  const bus = createInMemoryEventBus();
  const store = new InMemoryStateStore();
  const emitted: GameEvent[] = [];
  const published: GameEvent[] = [];
  bus.subscribe((event) => published.push(event));

  const runtime = createRuntime({ extensions: [], store, bus, now: () => AT });
  const hub = new EventStreamHub({
    bus,
    snapshot: (): GameSnapshot => ({ protocolVersion: PROTOCOL_VERSION, liveSessionIds: [] }),
    ...(maxSubscriberLag === undefined ? {} : { maxSubscriberLag }),
  });

  const handle = createEventRoutes({
    limits: DEFAULT_BATCH_LIMITS,
    authenticate: async () => ({ installationId: 'installation-1' }),
    resolveSession: async (sessionId, installationId) =>
      installationId === OTHER_INSTALLATION
        ? undefined
        : { id: sessionId, agentId: AGENT_ID, status: 'active' },
    emit: (event) => {
      emitted.push(event);
      return runtime.emit(event);
    },
    hub,
    ...overrides,
  });

  return { handle, store, bus, hub, emitted, published };
}

function post(
  h: Harness,
  body: unknown,
  request: Partial<HttpRequest> = {},
): Promise<HttpResponse> {
  return h.handle({
    method: 'POST',
    url: `${ORIGIN}/api/events`,
    headers: headers({ authorization: 'Bearer token' }),
    body,
    ...request,
  });
}

describe('reading the batching limits', () => {
  it('uses the plan defaults when the environment says nothing', () => {
    expect(readBatchLimits({})).toEqual({
      flushIntervalMs: 250,
      maxBatchEvents: 50,
      maxRejectEvents: 100,
      retryAfterSeconds: 1,
    });
  });

  it('reads every limit from the environment rather than from a constant', () => {
    // If any one of these were hardcoded, tuning it from the load test would
    // need a code change, and the bead is explicit that the numbers are the
    // load test's to reveal.
    expect(
      readBatchLimits({
        EVENT_BATCH_FLUSH_MS: '40',
        EVENT_BATCH_MAX_EVENTS: '7',
        EVENT_BATCH_REJECT_EVENTS: '9',
        EVENT_BATCH_RETRY_AFTER_SECONDS: '3',
      }),
    ).toEqual({ flushIntervalMs: 40, maxBatchEvents: 7, maxRejectEvents: 9, retryAfterSeconds: 3 });
  });

  it('refuses a limit that is present but not a positive whole number', () => {
    // Falling back to the default on a typo is a limit that looks configured and
    // is not, and the mistake would only surface later under load.
    expect(() => readBatchLimits({ EVENT_BATCH_MAX_EVENTS: '0' })).toThrow(/positive whole number/);
    expect(() => readBatchLimits({ EVENT_BATCH_FLUSH_MS: 'soon' })).toThrow(
      /positive whole number/,
    );
    expect(() => readBatchLimits({ EVENT_BATCH_REJECT_EVENTS: '-5' })).toThrow(
      /positive whole number/,
    );
  });

  it('refuses a reject threshold below the client flush size', () => {
    // Otherwise a client that obeys its own limit builds a batch the server
    // refuses: obeying the rules would be punished.
    expect(() =>
      readBatchLimits({ EVENT_BATCH_MAX_EVENTS: '60', EVENT_BATCH_REJECT_EVENTS: '50' }),
    ).toThrow(/must be at least/);
  });
});

describe('POST /api/events — the 413 gate', () => {
  it('refuses a batch over the limit with 413 and a Retry-After', async () => {
    const h = harness();
    const response = await post(h, batch(Array.from({ length: 101 }, () => transient())));

    expect(response.status).toBe(413);
    expect(response.headers).toEqual({ 'Retry-After': '1' });
  });

  it('refuses the flood before it authenticates, and so before it parses', async () => {
    // The point of "size check before parsing": a flood is refused in constant
    // time. Two things are asserted — that auth is not consulted, and that the
    // per-event zod validation is not reached — because either one being done
    // first would mean the server did some of the flood's work.
    const authenticated: string[] = [];
    const h = harness({
      authenticate: async () => {
        authenticated.push('auth');
        return { installationId: 'installation-1' };
      },
    });

    const response = await post(h, batch(Array.from({ length: 5000 }, () => transient())));

    expect(response.status).toBe(413);
    expect(authenticated).toEqual([]);
    expect(h.emitted).toEqual([]);
    expect(h.store.recorded()).toEqual([]);
  });

  it('refuses on size even when the events are invalid, proving size precedes parse', async () => {
    // The sharpest form of the ordering claim. If parse ran first, the invalid
    // events would produce a 400; because size is checked first, the response is
    // 413 and the invalid events are never looked at.
    const h = harness();
    const events = Array.from(
      { length: 101 },
      () => ({ type: 'nonsense.event' }) as unknown as AgentEvent,
    );

    expect((await post(h, batch(events))).status).toBe(413);
  });

  it('accepts a batch exactly at the limit', async () => {
    // The other side of the boundary. A `>` where a `>=` was meant would refuse
    // the largest legal batch, and the test that only checks the refusal would
    // not notice.
    const h = harness();
    const response = await post(h, batch(Array.from({ length: 100 }, () => transient())));

    expect(response.status).toBe(200);
  });
});

describe('POST /api/events — authentication and validation', () => {
  it('reports a refused credential as 401 with the reason', async () => {
    const h = harness({
      authenticate: async () => {
        const failure = new Error('credential refused') as Error & { reason: string };
        failure.reason = 'revoked';
        throw failure;
      },
    });

    const response = await post(h, batch([transient()]));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ reason: 'revoked' });
    expect(h.emitted).toEqual([]);
  });

  it('rejects a batch whose protocol version is not the one this server speaks', async () => {
    const h = harness();
    const response = await post(h, batch([transient()], '9.9.9'));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      expectedProtocol: PROTOCOL_VERSION,
      receivedProtocol: '9.9.9',
    });
  });

  it('rejects an event the protocol schema does not describe', async () => {
    const h = harness();
    const response = await post(
      h,
      batch([{ type: 'tool.started', sessionId: SESSION_ID, at: AT } as unknown as AgentEvent]),
    );

    expect(response.status).toBe(400);
  });

  it('resolves the session against the caller installation, and refuses one it does not own', async () => {
    // Ownership is a property of the QUERY, so the route cannot be used to probe
    // which session ids exist: a session belonging to somebody else is
    // `undefined`, exactly like one that does not exist.
    const h = harness({ authenticate: async () => ({ installationId: OTHER_INSTALLATION }) });

    const response = await post(h, batch([transient()]));

    expect(response.status).toBe(404);
    expect(h.emitted).toEqual([]);
  });

  it('refuses a batch spanning two sessions', async () => {
    // The response names one session and ownership is resolved for one, so a
    // two-session batch is either a client bug or an attempt to write one
    // session's events into another's log. Refused, not guessed at.
    const h = harness();
    const response = await post(h, batch([transient(), transient(OTHER_SESSION_ID)]));

    expect(response.status).toBe(400);
    expect(h.emitted).toEqual([]);
  });

  it('answers what was accepted, for which session, and whether it had disconnected', async () => {
    const h = harness({
      resolveSession: async (sessionId) => ({
        id: sessionId,
        agentId: AGENT_ID,
        status: 'disconnected',
      }),
    });

    const response = await post(h, batch([transient(), transient(), keyEvent()]));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: 3, sessionId: SESSION_ID, resumed: true });
  });
});

describe('not persisting is not dropping', () => {
  // The requirement the whole split exists for. Two independent questions, and
  // the answer has to be yes to BOTH: did the event avoid a row, and did a live
  // subscriber still see it. An implementation that got the first right by
  // filtering on the way to the bus would pass a persistence-only test and fail
  // a spectator, which is the failure this file exists to catch.
  it('persists a key event and shows it to a subscriber', async () => {
    const h = harness();
    const subscriber = h.hub.subscribe();
    await subscriber.pull(); // the full_state opening frame

    await post(h, batch([keyEvent()]));

    expect(h.store.recorded().map((event) => event.type)).toEqual(['session.started']);
    const delta = await subscriber.pull();
    expect(delta).toMatchObject({ kind: 'delta' });
  });

  it('keeps a transient event off the store and still delivers it to a subscriber', async () => {
    const h = harness();
    const subscriber = h.hub.subscribe();
    await subscriber.pull();

    await post(h, batch([transient()]));

    expect(h.store.recorded()).toEqual([]);
    expect(await subscriber.pull()).toMatchObject({
      kind: 'delta',
      event: { type: 'tool.started' },
    });
  });

  it('delivers 150 transient events across 3 batches while writing 0 rows', async () => {
    // The exact scenario the bead names, with both halves asserted in one place
    // so neither can be satisfied by accident. 3 x 50 is deliberately a legal
    // batch every time, so this is about the fan-out and the filter, not the
    // 413 gate (which has its own tests above).
    const h = harness();
    const subscriber = h.hub.subscribe();
    await subscriber.pull(); // full_state

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const response = await post(h, batch(Array.from({ length: 50 }, () => transient())));
      expect(response.status).toBe(200);
    }

    // Every transient event reached the bus, and the hub turned each into a
    // delta, without a single row reaching the store.
    expect(h.store.recorded()).toEqual([]);
    expect(h.published).toHaveLength(150);
    expect(h.hub.subscriberCount).toBe(1);

    const deltas = [];
    for (let i = 0; i < 150; i += 1) {
      deltas.push(await subscriber.pull());
    }
    expect(deltas).toHaveLength(150);
    expect(deltas.every((frame) => frame?.kind === 'delta')).toBe(true);
  });

  it('publishes to the bus even for an event no handler claims', async () => {
    // The bus publish is the LAST thing runtime.emit does and it is
    // unconditional, so the realtime path does not depend on the store having
    // been called. If someone moved the publish behind the persistence branch,
    // this is the test that notices.
    const h = harness();
    await post(h, batch([transient()]));
    expect(h.published.map((event) => event.type)).toEqual(['tool.started']);
  });
});

describe('GET /api/events/stream — full_state first, deltas after', () => {
  async function openStream(h: Harness): Promise<ReadableStream<Uint8Array>> {
    const response = await h.handle({
      method: 'GET',
      url: `${ORIGIN}/api/events/stream`,
      headers: headers(),
    });
    expect(response.status).toBe(200);
    return response.body as ReadableStream<Uint8Array>;
  }

  it('opens with full_state and every later frame is a delta', async () => {
    const h = harness();
    const stream = await openStream(h);
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    const first = decodeStreamFrame(decoder.decode((await reader.read()).value));
    expect(first).toMatchObject({ kind: 'full_state' });
    expect(first).toMatchObject({ state: { protocolVersion: PROTOCOL_VERSION } });

    // Two deltas, one event each — broadcast as diffs, never as whole state.
    await post(h, batch([transient()]));
    await post(h, batch([keyEvent()]));

    const second = decodeStreamFrame(decoder.decode((await reader.read()).value));
    const third = decodeStreamFrame(decoder.decode((await reader.read()).value));
    expect(second).toMatchObject({ kind: 'delta', event: { type: 'tool.started' } });
    expect(third).toMatchObject({ kind: 'delta', event: { type: 'session.started' } });
  });

  it('never puts a state field on a delta', async () => {
    // The compile-time half of the union is real, but the guarantee that matters
    // is at runtime: a client that switches on `'state' in frame` must see state
    // on the snapshot and on NOTHING else, or "hydrate or patch" becomes a guess.
    const h = harness();
    const subscriber = h.hub.subscribe();

    const full = await subscriber.pull();
    expect(full).toHaveProperty('state');
    expect(Object.prototype.hasOwnProperty.call(full, 'state')).toBe(true);

    await post(h, batch([transient()]));
    const delta = await subscriber.pull();
    expect(delta).toMatchObject({ kind: 'delta' });
    expect(Object.prototype.hasOwnProperty.call(delta, 'state')).toBe(false);
  });

  it('closes a subscriber that falls behind, so the reconnect gets a fresh snapshot', async () => {
    // Skipping frames would leave the client permanently wrong with nothing to
    // tell it. Closing is the only safe response, and the reconnect is what
    // repairs the state.
    const h = harness({}, 2);
    const subscriber = h.hub.subscribe();
    await subscriber.pull(); // full_state

    // Two queued deltas reach the lag limit; the third cannot be accepted.
    await post(h, batch([transient(), transient()]));
    await post(h, batch([transient()]));

    expect(subscriber.closed).toBe(true);
    expect(await subscriber.pull()).toBeUndefined();

    // And the hub has let go of it, so a reconnect starts clean.
    expect(h.hub.subscriberCount).toBe(0);
    const reconnected = h.hub.subscribe();
    expect(await reconnected.pull()).toMatchObject({ kind: 'full_state' });
  });
});

describe('the client-side buffer', () => {
  it('flushes when it reaches its configured size, not the default 50', async () => {
    // Proves the buffer reads its limit rather than a baked-in constant.
    let now = 0;
    const buffer = new EventBuffer(
      { ...DEFAULT_BATCH_LIMITS, maxBatchEvents: 3 },
      { now: () => now },
    );

    expect(buffer.push(transient())).toBeUndefined();
    expect(buffer.push(transient())).toBeUndefined();
    expect(buffer.push(transient())).toHaveLength(3);
    expect(buffer.size).toBe(0);
  });

  it('flushes on the configured interval, measured from the first buffered event', async () => {
    let now = 0;
    const buffer = new EventBuffer(
      { ...DEFAULT_BATCH_LIMITS, flushIntervalMs: 250 },
      { now: () => now },
    );

    buffer.push(transient());
    now = 249;
    expect(buffer.flushIfDue()).toBeUndefined();
    now = 250;
    expect(buffer.flushIfDue()).toHaveLength(1);
    // The window restarts on the next event, not on the old one.
    expect(buffer.flushIfDue()).toBeUndefined();
  });

  it('produces a batch the server accepts, and stops short of the reject limit', async () => {
    // The client flushes at 50 and the server refuses above 100, so a buffer
    // obeying its own limit can never build a batch the server turns away. The
    // batch is what `push` HANDS BACK when the buffer fills — collecting it by
    // calling flush() afterwards would read the empty buffer the flush already
    // emptied.
    const h = harness();
    const buffer = new EventBuffer(DEFAULT_BATCH_LIMITS);
    const flushed: AgentEvent[] = [];
    for (let i = 0; i < 50; i += 1) {
      const ready = buffer.push(transient());
      if (ready !== undefined) {
        flushed.push(...ready);
      }
    }

    expect(flushed).toHaveLength(50);
    const response = await post(h, batch(flushed));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 50 });
  });
});

describe('what a client that is not watching still gets', () => {
  it('accepts and persists a batch with no subscriber attached', async () => {
    // The ingest path must not depend on somebody being connected. A gateway
    // that only emitted to a live SSE subscriber would accept nothing whenever
    // the game was closed, and the log would have a hole exactly when nobody was
    // looking — which is most of the time.
    const h = harness();
    const response = await post(h, batch([keyEvent()]));

    expect(response.status).toBe(200);
    expect(h.store.recorded()).toHaveLength(1);
  });
});
