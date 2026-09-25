import { createApplicationApi } from '@battle-agents/api';
import type { ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { createMcpServer } from '@battle-agents/mcp-server';

import { describe, expect, it } from 'vitest';

import { EventStreamHub, type GameSnapshot } from './event-stream.js';

/**
 * What MCP shares with the other two surfaces, and what it must not add.
 *
 * Two properties, and the second is easy to get wrong by reading it as "push
 * MCP's events into the hub". The hub subscribes to the bus itself, so anything
 * that also pushes an event INTO the hub delivers it twice. The correct shape
 * is one bus with two independent consumers: the hub for the public stream, and
 * each MCP observer for its own scoped subscription. Neither feeds the other.
 *
 * The delivery assertions count frames rather than checking that "something
 * arrived", because double delivery is invisible to any test that stops at the
 * first event.
 */

const NOW = '2026-09-25T12:00:00.000Z';

const FIXTURE = {
  id: 'quest',
  capabilities: [{ name: 'quest.read', description: 'reads quests' }],
  actionDefs: [
    defineAction({
      id: 'quest.claim',
      permissions: ['quest.claim'],
      run: async () => ({ claimed: 'an-issue' }),
    }),
  ],
};

const TEST_PASSED = {
  type: 'test.passed',
  occurredAt: NOW,
  actorId: 'agent-1',
  payload: { suite: 'unit', count: 1 },
} satisfies GameEvent;

const QUEST_CLAIMED = {
  type: 'quest.claimed',
  occurredAt: NOW,
  actorId: 'agent-1',
  payload: { questId: 'q-1' },
} satisfies GameEvent;

function emptySnapshot(): GameSnapshot {
  return { protocolVersion: 'test', liveSessionIds: [] };
}

function fixture() {
  const bus = createInMemoryEventBus();
  const runtime: Runtime = createRuntime({
    extensions: [FIXTURE],
    store: new InMemoryStateStore(),
    bus,
    now: () => NOW,
  });
  // The bus goes IN, or observe is a no-op and the delivery assertions below
  // would be measuring an absence.
  const api: ApplicationApi = createApplicationApi(runtime, bus);
  const hub = new EventStreamHub({ bus, snapshot: emptySnapshot });
  return { api, bus, runtime, hub };
}

/** Discards the opening full_state so what is left is deltas. */
async function openStream(hub: EventStreamHub, view: 'public' | 'operator' = 'public') {
  const subscriber = hub.subscribe(view);
  await subscriber.pull();
  return subscriber;
}

describe('MCP and the other surfaces share one application API', () => {
  it('produces the same result through MCP as through the API the CLI and HTTP use', async () => {
    // The CLI and HTTP surfaces call the api directly; MCP goes through the
    // five primitives. Same input, same answer is the parity claim, and it is
    // only a claim because both paths hold the SAME api object.
    const { api } = fixture();
    const server = createMcpServer({ api });

    const direct = await api.act('quest.claim', {});
    const overMcp = await server.callTool('act', { action: 'quest.claim', input: {} });

    expect(overMcp.ok).toBe(true);
    expect(overMcp.value).toEqual(direct);
  });

  it('describes the same catalog through discover as the API does', async () => {
    const { api } = fixture();
    const server = createMcpServer({ api });

    const direct = await api.discover();
    const overMcp = await server.callTool('discover', {});

    expect(overMcp.ok).toBe(true);
    expect(overMcp.value).toEqual(direct);
  });
});

describe('observe actually delivers', () => {
  it('hands an event to the listener, which it did not before a bus was passed in', async () => {
    // This is the assertion the existing suite was missing. It only ever
    // checked that a subscription opens and closes, so `observe` could ignore
    // both its arguments and stay green while one of the five frozen
    // primitives delivered nothing to anybody.
    const { api, bus } = fixture();
    const seen: unknown[] = [];

    const observer = api.observe({}, (event) => seen.push(event));
    bus.publish(TEST_PASSED);
    observer.close();

    expect(seen).toEqual([TEST_PASSED]);
  });

  it('scopes a domain subscription to that domain', async () => {
    const { api, bus } = fixture();
    const seen: unknown[] = [];

    const observer = api.observe({ domain: 'quest' }, (event) => seen.push(event));
    bus.publish(TEST_PASSED);
    bus.publish(QUEST_CLAIMED);
    observer.close();

    expect(seen).toEqual([QUEST_CLAIMED]);
  });

  it('stops delivering after close, rather than leaking into a later subscriber', async () => {
    const { api, bus } = fixture();
    const seen: unknown[] = [];

    const observer = api.observe({}, (event) => seen.push(event));
    observer.close();
    bus.publish(TEST_PASSED);

    expect(seen).toEqual([]);
  });
});

describe('MCP does not open a second realtime plane', () => {
  it('delivers each event to a public SSE subscriber exactly once', async () => {
    const { bus, hub } = fixture();
    const subscriber = await openStream(hub);

    bus.publish(TEST_PASSED);

    expect(subscriber.pending).toBe(1);
  });

  it('still delivers once, and once only, while an MCP observer is also subscribed', async () => {
    // The case that matters. One bus, two consumers: the MCP observer gets one
    // copy through its own subscription and the stream gets one through the
    // hub's. Feeding the MCP notification back into the hub would make the
    // stream's count two, and the only assertion that catches it is a count.
    //
    // The operator view, not the public one: `quest.claimed` is not on the
    // spectator allowlist, and asserting delivery to a public subscriber would
    // be asserting that the filter is broken.
    const { api, bus, hub } = fixture();
    const server = createMcpServer({ api });
    const subscriber = await openStream(hub, 'operator');

    const observed = await server.callTool('observe', {});
    expect(observed.ok).toBe(true);

    bus.publish(QUEST_CLAIMED);

    expect(subscriber.pending).toBe(1);
  });
});
