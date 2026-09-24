import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_RESUME_GRACE_MS,
  isHeartbeatStale,
  isResumable,
  isTerminal,
  isWithinResumeGrace,
  nextSessionStatus,
  SESSION_STATUSES,
  type SessionEvent,
  type SessionStatus,
} from './session.js';

const NOW = '2026-09-24T12:00:00.000Z';
const MINUTE_MS = 60_000;

function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * MINUTE_MS).toISOString();
}

describe('the session state machine', () => {
  it('keeps a live session live on a heartbeat', () => {
    expect(nextSessionStatus('active', { kind: 'heartbeat' })).toBe('active');
  });

  it('ends an active session, recording why in the payload rather than the status', () => {
    expect(nextSessionStatus('active', { kind: 'ended', reason: 'completed' })).toBe('ended');
    expect(nextSessionStatus('active', { kind: 'ended', reason: 'crashed' })).toBe('ended');
  });

  it('disconnects rather than ends when the terminal goes away', () => {
    // The distinction the whole model rests on: a closed terminal is not proof
    // the run is over, so the character stays reachable and resumable.
    expect(nextSessionStatus('active', { kind: 'disconnected' })).toBe('disconnected');
  });

  it('resumes only a disconnected session', () => {
    expect(nextSessionStatus('disconnected', { kind: 'resumed' })).toBe('active');
  });

  it('never lets a handshake hijack a live session', () => {
    expect(nextSessionStatus('active', { kind: 'resumed' })).toBeUndefined();
  });

  it('abandons a disconnected session once the grace window passes', () => {
    expect(nextSessionStatus('disconnected', { kind: 'grace-expired' })).toBe('abandoned');
  });

  it('treats ended and abandoned as terminal', () => {
    for (const status of ['ended', 'abandoned'] as const) {
      for (const event of everyEvent()) {
        expect(nextSessionStatus(status, event), `${status} + ${event.kind}`).toBeUndefined();
      }
    }
  });

  it('accepts exactly the events each status allows', () => {
    // The full matrix. A new status cannot be added without someone deciding
    // here what it may become, and the refused pairs are the interesting half:
    // they are what stops a late heartbeat resurrecting a finished run.
    const allowed: Record<SessionStatus, readonly SessionEvent[]> = {
      active: [
        { kind: 'heartbeat' },
        { kind: 'ended', reason: 'completed' },
        { kind: 'disconnected' },
      ],
      disconnected: [{ kind: 'resumed' }, { kind: 'grace-expired' }],
      ended: [],
      abandoned: [],
    };

    for (const status of SESSION_STATUSES) {
      for (const event of everyEvent()) {
        const permitted = allowed[status].some((allowed) => allowed.kind === event.kind);
        const moved = nextSessionStatus(status, event);
        expect(moved !== undefined, `${status} + ${event.kind}`).toBe(permitted);
      }
    }
  });

  it('resumes nothing that is not disconnected, and terminates only what is over', () => {
    expect(isResumable('disconnected')).toBe(true);
    expect(isResumable('active')).toBe(false);
    expect(isResumable('ended')).toBe(false);

    expect(isTerminal('ended')).toBe(true);
    expect(isTerminal('abandoned')).toBe(true);
    expect(isTerminal('active')).toBe(false);
    expect(isTerminal('disconnected')).toBe(false);
  });
});

describe('time-based rules', () => {
  it('calls a session stale once it misses the heartbeat window', () => {
    const timeoutMinutes = DEFAULT_HEARTBEAT_TIMEOUT_MS / MINUTE_MS;
    expect(isHeartbeatStale(minutesAgo(timeoutMinutes - 1), NOW)).toBe(false);
    expect(isHeartbeatStale(minutesAgo(timeoutMinutes), NOW)).toBe(false);
    expect(isHeartbeatStale(minutesAgo(timeoutMinutes + 1), NOW)).toBe(true);
  });

  it('measures staleness from the last heartbeat, not from the start', () => {
    // A session that has been running for an hour and heartbept a second ago is
    // alive. Measuring from the start would sweep up every long session.
    expect(isHeartbeatStale(new Date(Date.parse(NOW) - 1).toISOString(), NOW)).toBe(false);
  });

  it('keeps a disconnected session resumable right up to the grace window', () => {
    const graceMinutes = DEFAULT_RESUME_GRACE_MS / MINUTE_MS;
    expect(isWithinResumeGrace(minutesAgo(graceMinutes - 1), NOW)).toBe(true);
    expect(isWithinResumeGrace(minutesAgo(graceMinutes), NOW)).toBe(true);
    expect(isWithinResumeGrace(minutesAgo(graceMinutes + 1), NOW)).toBe(false);
  });
});

function everyEvent(): readonly SessionEvent[] {
  return [
    { kind: 'heartbeat' },
    { kind: 'ended', reason: 'completed' },
    { kind: 'ended', reason: 'crashed' },
    { kind: 'ended', reason: 'abandoned' },
    { kind: 'disconnected' },
    { kind: 'resumed' },
    { kind: 'grace-expired' },
  ];
}
