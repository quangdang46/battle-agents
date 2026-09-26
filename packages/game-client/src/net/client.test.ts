import { describe, expect, it } from 'vitest';

import type { GameEvent } from '@battle-agents/core';

import { decodeFrame, StreamClient, type EventSourceLike, type StreamHandlers } from './client.js';
import { WorldStore } from '../state/store.js';
import { GameClient } from '../client.js';

/**
 * The SSE client: full_state hydrates, deltas patch, and a gap resyncs.
 *
 * The reconnect assertions matter more than they look. The hub CLOSES a
 * subscriber that falls behind rather than skipping frames, and the reason it
 * cannot skip is that a delta stream has no gap tolerance: a client that missed
 * one event and carried on would be permanently wrong with nothing to tell it.
 * So the client under test has to prove it stops patching when the stream ends
 * and waits for a fresh snapshot.
 */

/** A socket a test drives by hand. */
class FakeSource implements EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  close(): void {
    this.closed = true;
  }

  deliver(frame: unknown): void {
    this.onmessage?.({ data: `event: kind\ndata: ${JSON.stringify(frame)}\n\n` });
  }

  raw(message: string): void {
    this.onmessage?.({ data: message });
  }

  fail(): void {
    this.onerror?.(new Error('closed'));
  }
}

/** An SSE message, envelope and all — the decoder only reads the data line. */
function sse(frame: unknown): string {
  return `event: frame\ndata: ${JSON.stringify(frame)}\n\n`;
}

function fullStateFrame(sessionIds: string[] = ['s1']): string {
  return sse({ kind: 'full_state', state: { protocolVersion: 'test', liveSessionIds: sessionIds } });
}

function deltaFrame(event: GameEvent): string {
  return sse({ kind: 'delta', event });
}

function toolEvent(sessionId: string, tool: string): GameEvent {
  return {
    type: 'tool.started',
    occurredAt: '2026-09-26T00:00:00.000Z',
    actorId: sessionId,
    payload: { sessionId, tool },
  };
}

/** A client wired to a fake socket, recording what it was told. */
function harness(): {
  client: StreamClient;
  source: () => FakeSource;
  snapshots: WorldStore[];
  deltas: GameEvent[];
  disconnects: string[];
  runReconnect: () => void;
} {
  const created: FakeSource[] = [];
  const snapshots: WorldStore[] = [];
  const deltas: GameEvent[] = [];
  const disconnects: string[] = [];
  let store: WorldStore | undefined;

  const handlers: StreamHandlers = {
    onSnapshot: (snapshot) => {
      store = new WorldStore();
      store.hydrate(snapshot);
      snapshots.push(store);
    },
    onDelta: (event) => {
      deltas.push(event);
      store?.applyDelta(event);
    },
    onDisconnected: (reason) => {
      disconnects.push(reason);
    },
  };

  let reconnect: (() => void) | undefined;
  const client = new StreamClient({
    url: '/api/events/stream',
    createSource: (url) => {
      const source = new FakeSource(url);
      created.push(source);
      return source;
    },
    // Reconnect is captured rather than timed, so a test drives it explicitly
    // instead of waiting. A reconnect that only works on a real timer is a
    // reconnect nobody has executed.
    schedule: (callback) => {
      reconnect = callback;
    },
    handlers,
  });

  return {
    client,
    source: () => created[created.length - 1]!,
    /** Fires the pending reconnect, if the client scheduled one. */
    runReconnect: () => {
      const pending = reconnect;
      reconnect = undefined;
      pending?.();
    },
    snapshots,
    deltas,
    disconnects,
  };
}

describe('decodeFrame', () => {
  it('reads the data line out of an SSE message', () => {
    const frame = decodeFrame(
      `event: full_state\ndata: ${JSON.stringify({
        kind: 'full_state',
        state: { protocolVersion: '1', liveSessionIds: [] },
      })}\n\n`,
    );
    expect(frame?.kind).toBe('full_state');
  });

  it('returns undefined for a frame it cannot read, rather than throwing', () => {
    // A frame the client cannot parse is a GAP, and a gap is handled by
    // resyncing. Throwing would leave the socket open with no state change,
    // which is the silent corruption the hub's close rule exists to prevent.
    expect(decodeFrame('data: not json')).toBeUndefined();
    expect(decodeFrame('data: {"kind":"nonsense"}')).toBeUndefined();
    expect(decodeFrame('event: ping')).toBeUndefined();
    expect(decodeFrame('data: {"kind":"delta"}')).toBeUndefined();
    expect(decodeFrame('data: {"kind":"full_state"}')).toBeUndefined();
  });
});

describe('full_state then deltas', () => {
  it('hydrates from the opening frame and patches from deltas after it', () => {
    const h = harness();
    h.client.connect();
    h.source().raw(fullStateFrame(['s1']));
    h.source().raw(deltaFrame(toolEvent('s1', 'Bash')));

    expect(h.snapshots).toHaveLength(1);
    expect(h.deltas).toHaveLength(1);
    // The delta was applied to the hydrated store, not to an empty one.
    expect(h.snapshots[0]?.get('s1')?.zone).toBe('terminal');
  });

  it('drops a delta that arrives before any snapshot', () => {
    const h = harness();
    h.client.connect();
    h.source().raw(deltaFrame(toolEvent('s1', 'Bash')));

    expect(h.snapshots).toHaveLength(0);
    expect(h.deltas).toHaveLength(0);
    // And it says why, because silently ignoring a frame is how a client ends
    // up permanently wrong.
    expect(h.disconnects).toEqual(['delta before first full_state']);
  });
});

describe('a gap is a resync, never a resume', () => {
  it('stops patching when the server closes the stream', () => {
    const h = harness();
    h.client.connect();
    h.source().raw(fullStateFrame());
    h.source().fail();

    expect(h.disconnects).toEqual(['stream error']);
    expect(h.client.state).toBe('resyncing');
  });

  it('reconnects and takes the fresh snapshot as authoritative', () => {
    const h = harness();
    h.client.connect();
    const first = h.source();
    h.source().raw(fullStateFrame(['s1', 's2', 'gone-forever']));
    first.fail();

    h.runReconnect();
    // The reconnect opens a NEW socket rather than resuming the old one.
    const second = h.source();
    expect(second).not.toBe(first);
    expect(first.closed).toBe(true);

    // The new snapshot does not list s2, so s2 is genuinely gone and the old
    // one cannot be patched forward into agreement.
    second.raw(fullStateFrame(['s1']));
    expect(h.snapshots).toHaveLength(2);
    expect(h.snapshots[1]?.size).toBe(1);
    expect(h.snapshots[1]?.get('s2')).toBeUndefined();
  });

  it('resyncs on an unparseable frame rather than skipping it', () => {
    const h = harness();
    h.client.connect();
    h.source().raw(fullStateFrame());
    h.source().raw('data: {"kind":"delta","event":');
    expect(h.disconnects).toEqual(['unparseable frame']);
  });
});

describe('the wired client', () => {
  it('renders a streamed agent end to end', () => {
    // Store, stream and view through the composition root, so this is the path
    // a browser takes rather than a hand-assembled one.
    const sources: FakeSource[] = [];
    const client = new GameClient({
      createSource: (url) => {
        const source = new FakeSource(url);
        sources.push(source);
        return source;
      },
      schedule: () => {
        /* no auto-reconnect in this test */
      },
    });

    client.connect();
    const source = sources[0]!;
    source.deliver({ kind: 'full_state', state: { protocolVersion: '1', liveSessionIds: [] } });
    source.deliver({ kind: 'delta', event: toolEvent('live-session', 'Grep') });
    client.frame();

    expect(client.store.get('live-session')?.zone).toBe('search');
    expect(client.view.nodeCount).toBe(1);
  });

  it('rebuilds the view on a snapshot, because a snapshot is authoritative', () => {
    const sources: FakeSource[] = [];
    const client = new GameClient({
      createSource: (url) => {
        const source = new FakeSource(url);
        sources.push(source);
        return source;
      },
      schedule: () => {
        /* no auto-reconnect */
      },
    });
    client.connect();
    const source = sources[0]!;

    source.deliver({ kind: 'full_state', state: { protocolVersion: '1', liveSessionIds: ['a', 'b'] } });
    client.frame();
    expect(client.view.nodeCount).toBe(2);

    source.deliver({ kind: 'full_state', state: { protocolVersion: '1', liveSessionIds: ['a'] } });
    client.frame();
    // b is dropped, not merged. A merge would leave a ghost walking the city
    // with no event that could ever remove it.
    expect(client.view.nodeCount).toBe(1);
  });
});
