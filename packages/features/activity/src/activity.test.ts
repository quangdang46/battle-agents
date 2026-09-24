import { isPersistedEventType, PERSISTED_EVENT_TYPES } from '@battle-agents/core';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RETENTION_DAYS,
  hasExpired,
  retentionCutoff,
  summarise,
  type ActivityEntry,
} from './activity.js';

const NOW = '2026-09-24T12:00:00.000Z';

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    sequence: 1,
    type: 'demo.happened',
    actorId: 'agent-1',
    sessionId: 'session-1',
    causationId: null,
    payload: {},
    occurredAt: NOW,
    ...overrides,
  };
}

describe('the persistence policy', () => {
  it('admits exactly the key events the platform records', () => {
    // Pinned deliberately. The list is the difference between a database that
    // holds a session's story and one holding every cursor move, and it is
    // edited far more easily than it is reviewed.
    expect([...PERSISTED_EVENT_TYPES].sort()).toEqual([
      'session.ended',
      'session.resumed',
      'session.started',
      'test.failed',
      'test.passed',
    ]);
  });

  it('keeps out the events a busy agent emits by the thousand', () => {
    // Coding agents emit tool and file events continuously. 100 agents at 20
    // events a second is 2000 writes a second, which is the number the storage
    // budget was chosen against.
    for (const transientType of [
      'thinking',
      'waiting',
      'session.heartbeat',
      'tool.started',
      'tool.completed',
      'file.read',
      'file.write',
      'command.run',
      'permission.requested',
    ]) {
      expect(isPersistedEventType(transientType), transientType).toBe(false);
    }
  });

  it('lets a feature add its own key events without editing core', () => {
    // The reason the list is not the plan's full list in core: a feature that
    // has to modify core to record its own key events cannot be added at all.
    expect(isPersistedEventType('bounty.completed')).toBe(false);
    expect(isPersistedEventType('bounty.completed', new Set(['bounty.completed']))).toBe(true);
  });
});

describe('retention', () => {
  it('keeps a year by default, because a shared replay is a link', () => {
    expect(retentionCutoff(NOW)).toBe('2025-09-24T12:00:00.000Z');
    expect(retentionCutoff(NOW)).toBe(
      new Date(Date.parse(NOW) - DEFAULT_RETENTION_DAYS * 86_400_000).toISOString(),
    );
  });

  it('expires an entry only once it is past the cutoff', () => {
    const cutoff = retentionCutoff(NOW);
    expect(hasExpired(cutoff, NOW)).toBe(false);
    expect(hasExpired('2025-09-24T11:59:59.999Z', NOW)).toBe(true);
    expect(hasExpired('2026-09-24T00:00:00.000Z', NOW)).toBe(false);
  });

  it('honours a window the host chose', () => {
    const yesterday = '2026-09-23T12:00:00.000Z';
    expect(hasExpired(yesterday, NOW, 1)).toBe(false); // exactly at the cutoff
    expect(hasExpired('2026-09-23T11:59:59.000Z', NOW, 1)).toBe(true);
    expect(hasExpired(yesterday, NOW, 7)).toBe(false);
  });
});

describe('summarising a trail', () => {
  it('renders one line per entry, in order, with its details sorted by key', () => {
    // Sorted rather than in payload order: the payload comes back from jsonb,
    // which does not preserve key order, so a summary that followed it would
    // render the same event differently on different reads.
    const lines = summarise([
      entry({ sequence: 1, type: 'bounty.claimed', payload: { bountyId: 'b-1' } }),
      entry({ sequence: 2, type: 'file.write', payload: { path: 'src/index.ts', linesAdded: 4 } }),
      entry({ sequence: 3, type: 'test.passed', payload: { suite: 'unit', count: 12 } }),
    ]);

    expect(lines.map((line) => line.description)).toEqual([
      'bounty.claimed (bountyId=b-1)',
      'file.write (linesAdded=4 path=src/index.ts)',
      'test.passed (count=12 suite=unit)',
    ]);
    expect(lines.map((line) => line.at)).toEqual([NOW, NOW, NOW]);
  });

  it('shows an event it does not recognise rather than dropping it', () => {
    // A trail that omits an event a future version added is a trail that lies
    // about what happened, which is the one thing an audit trail must not do.
    const lines = summarise([entry({ type: 'some.future.event', payload: { why: 'testing' } })]);

    expect(lines[0]?.description).toBe('some.future.event (why=testing)');
  });

  it('renders an event with no details as just its type', () => {
    expect(summarise([entry()])[0]?.description).toBe('demo.happened');
  });

  it('renders a structured detail rather than [object Object]', () => {
    const lines = summarise([entry({ payload: { input: { command: 'ls' } } })]);

    expect(lines[0]?.description).toBe('demo.happened (input={"command":"ls"})');
  });
});
