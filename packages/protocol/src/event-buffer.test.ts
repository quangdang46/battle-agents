import { describe, expect, it } from 'vitest';

import { DEFAULT_BATCH_LIMITS, EventBuffer } from './event-buffer.js';
import type { AgentEvent } from './agent-event.js';

/**
 * A batch carries events for exactly ONE session, and the ingest route refuses
 * a mixed batch with a 400 naming the offending id (apps/web/src/event-routes.ts).
 *
 * The buffer had no notion of a session, so any adapter watching two harness
 * sessions produced a batch that was refused outright — losing up to
 * maxBatchEvents per occurrence, and looking like a flaky ingest path rather
 * than like a client bug. Codex was safe by accident: one rollout file is one
 * session. Four adapter beads found this independently and each proposed fixing
 * it in its own watcher, which is the two-copies-drift failure that moving this
 * buffer into protocol existed to prevent.
 */

function heartbeat(sessionId: string): AgentEvent {
  return { type: 'session.heartbeat', sessionId, at: '2026-01-01T00:00:00.000Z' };
}

/** Every event in a batch, which is the property the server actually checks. */
function sessionIdsIn(batch: readonly AgentEvent[]): readonly string[] {
  return batch.map((event) => event.sessionId);
}

describe('EventBuffer batches by session', () => {
  it('keeps a batch to a single session and closes the window on a change', () => {
    const buffer = new EventBuffer(DEFAULT_BATCH_LIMITS);

    expect(buffer.push(heartbeat('a'))).toBeUndefined();
    expect(buffer.push(heartbeat('a'))).toBeUndefined();

    // The first event of session b closes session a.
    const completed = buffer.push(heartbeat('b'));

    expect(completed).toBeDefined();
    expect(sessionIdsIn(completed as readonly AgentEvent[])).toEqual(['a', 'a']);
  });

  it('keeps the incoming event when it closes a window, rather than dropping it', () => {
    const buffer = new EventBuffer(DEFAULT_BATCH_LIMITS);

    buffer.push(heartbeat('a'));
    buffer.push(heartbeat('b'));

    // The whole point: the event that triggered the flush must survive it. An
    // implementation that returns early without buffering it loses every session
    // switch's first event, which is invisible until an agent goes quiet.
    expect(buffer.size).toBe(1);
    expect(buffer.sessionId).toBe('b');
    expect(sessionIdsIn(buffer.flush())).toEqual(['b']);
  });

  it('returns the completed window when that window held a single event', () => {
    // The one-event case is where an implementation that pops the incoming
    // event back out aliases the array it is about to return, and hands the
    // caller an empty batch for a session that clearly had one event in it.
    const buffer = new EventBuffer(DEFAULT_BATCH_LIMITS);

    buffer.push(heartbeat('a'));
    const completed = buffer.push(heartbeat('b'));

    expect(completed).toHaveLength(1);
    expect(sessionIdsIn(completed as readonly AgentEvent[])).toEqual(['a']);
    expect(sessionIdsIn(buffer.flush())).toEqual(['b']);
  });

  it('never mixes sessions across a full buffer either', () => {
    // The size limit and the session limit are independent, so a buffer that
    // only splits on one of them still emits a refused batch.
    const limits = { ...DEFAULT_BATCH_LIMITS, maxBatchEvents: 3 };
    const buffer = new EventBuffer(limits);

    const batches: (readonly AgentEvent[])[] = [];
    for (const sessionId of ['a', 'a', 'a', 'b', 'b', 'a', 'a']) {
      const batch = buffer.push(heartbeat(sessionId));
      if (batch !== undefined) batches.push(batch);
    }
    const due = buffer.flushIfDue();
    if (due !== undefined) batches.push(due);
    batches.push(buffer.flush());

    for (const batch of batches) {
      expect(new Set(sessionIdsIn(batch)).size).toBe(1);
    }
  });

  it('restarts the flush window when the session changes', () => {
    // Otherwise a session switch mid-interval immediately trips flushIfDue on
    // the elapsed-time test, and the batching policy silently becomes
    // one-event-per-batch for every active agent.
    let clock = 0;
    const buffer = new EventBuffer(DEFAULT_BATCH_LIMITS, { now: () => clock });

    buffer.push(heartbeat('a'));
    clock = 240;
    expect(buffer.flushIfDue()).toBeUndefined();

    buffer.push(heartbeat('b'));
    clock = 300; // 300ms after 'a' was buffered, 60ms after 'b'
    expect(buffer.flushIfDue()).toBeUndefined();
    expect(buffer.size).toBe(1);

    clock = 500;
    expect(sessionIdsIn(buffer.flushIfDue() as readonly AgentEvent[])).toEqual(['b']);
  });

  it('still batches hard when nothing changes session', () => {
    const buffer = new EventBuffer(DEFAULT_BATCH_LIMITS);

    let batch: readonly AgentEvent[] | undefined;
    for (let i = 0; i < DEFAULT_BATCH_LIMITS.maxBatchEvents; i += 1) {
      batch = buffer.push(heartbeat('a'));
    }

    expect(batch).toHaveLength(DEFAULT_BATCH_LIMITS.maxBatchEvents);
    expect(buffer.size).toBe(0);
  });
});
