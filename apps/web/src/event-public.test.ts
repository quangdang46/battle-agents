import { describe, expect, it } from 'vitest';

import { createInMemoryEventBus } from '@battle-agents/core';

import { EventStreamHub, toPublicEvent } from './event-stream.js';
import type { GameEvent } from '@battle-agents/core';

/**
 * The public stream is the one surface an unauthenticated socket can reach, so
 * the classification is a security boundary rather than a formatting choice.
 *
 * The protocol makes this necessary rather than merely tidy: every payload
 * field is `z.string().min(...)`, an unbounded string, so a test that reads a
 * field and drops it proves nothing about what the field held. These assert
 * the shape that goes out, not the shape that went in.
 */

function event(type: string, payload: Record<string, unknown> = {}): GameEvent {
  return { type, occurredAt: '2026-09-25T00:00:00.000Z', actorId: 'agent-1', payload };
}

describe('the public event classification', () => {
  it('publishes the events that carry no free-form field', () => {
    for (const type of [
      'session.started',
      'session.ended',
      'session.resumed',
      'subagent.spawned',
      'subagent.completed',
    ]) {
      expect(toPublicEvent(event(type, { sessionId: 's1' }))).toBeDefined();
    }
  });

  it('publishes a reduced test event without the failure text', () => {
    // The case the whole classification exists for. `failure` is an unbounded
    // string, so publishing the event and deleting the key afterwards would be
    // the same as publishing the key.
    const published = toPublicEvent(
      event('test.failed', {
        suite: 'unit',
        failure: 'AssertionError at /Users/someone/secret-project/src/x.ts:42',
      }),
    );

    expect(published?.payload).toEqual({ suite: 'unit' });
    expect(JSON.stringify(published)).not.toMatch(/someone|secret-project|AssertionError/);
  });

  it('publishes a reduced waiting event with no reason at all', () => {
    const published = toPublicEvent(event('waiting', { reason: 'blocked on /private/path' }));

    expect(published).toBeDefined();
    expect(published?.payload).toEqual({});
    expect(JSON.stringify(published)).not.toMatch(/private/);
  });

  it.each([
    ['file.read', { path: '/Users/someone/project/src/secret.ts' }],
    ['file.write', { path: '/Users/someone/project/src/secret.ts' }],
    ['command.run', { argv0: 'deploy-production' }],
    ['tool.started', { input: { password: 'hunter2' } }],
    ['thinking', { text: 'the user asked me to bypass the check' }],
    ['message.sent', { body: 'private correspondence' }],
    ['prompt.submitted', { prompt: 'a confidential question' }],
    ['permission.requested', { tool: 'Bash' }],
  ])('never publishes %s', (type, payload) => {
    expect(toPublicEvent(event(type, payload))).toBeUndefined();
  });

  it('does not copy a key the feature never set', () => {
    // A reduced event that grew a key would look like the feature had said
    // something it did not.
    const published = toPublicEvent(event('test.failed', { suite: 'unit' }));

    expect(Object.keys(published?.payload ?? {})).toEqual(['suite']);
  });

  it('leaves the original event untouched', () => {
    const original = event('test.failed', { suite: 'unit', failure: 'boom' });
    toPublicEvent(original);

    expect(original.payload).toEqual({ suite: 'unit', failure: 'boom' });
  });
});

describe('a spectator socket', () => {
  it('receives the reduced event and never the transient one', async () => {
    // Through the hub rather than the classifier, because the classifier being
    // correct says nothing about whether the stream uses it. A guard that is
    // written and not called is the shape this repository has hit repeatedly.
    const bus = createInMemoryEventBus();
    const hub = new EventStreamHub({
      bus,
      snapshot: () => ({ protocolVersion: '0.1.0', liveSessionIds: [] }),
    });
    const spectator = hub.subscribe();
    const operator = hub.subscribe('operator');
    await spectator.pull();
    await operator.pull();

    bus.publish({
      type: 'file.write',
      occurredAt: '2026-09-25T00:00:00.000Z',
      actorId: 'a',
      payload: { path: '/home/someone/private.ts' },
    });
    bus.publish({
      type: 'session.started',
      occurredAt: '2026-09-25T00:00:00.000Z',
      actorId: 'a',
      payload: {},
    });

    const seenByOperator = await operator.pull();
    const seenBySpectator = await spectator.pull();

    // The operator view still sees the write, which is the whole reason the
    // filter moved off the bus: a busy agent is what that view exists to show.
    expect(seenByOperator).toMatchObject({ event: { type: 'file.write' } });
    expect(seenBySpectator).toMatchObject({ event: { type: 'session.started' } });
  });

  it('gives a new caller the strict view by default', async () => {
    // A forgotten argument must narrow what is shared, not widen it.
    const bus = createInMemoryEventBus();
    const hub = new EventStreamHub({
      bus,
      snapshot: () => ({ protocolVersion: '0.1.0', liveSessionIds: [] }),
    });
    const defaulted = hub.subscribe();
    await defaulted.pull();

    bus.publish({
      type: 'thinking',
      occurredAt: '2026-09-25T00:00:00.000Z',
      actorId: 'a',
      payload: { text: 'private reasoning' },
    });

    // Nothing is queued, so pull resolves to undefined rather than hanging.
    await expect(
      Promise.race([
        defaulted.pull().then((frame) => frame),
        new Promise((resolve) => setTimeout(() => resolve('nothing-queued'), 50)),
      ]),
    ).resolves.toBe('nothing-queued');
  });
});
