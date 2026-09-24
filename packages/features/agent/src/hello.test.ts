import { describe, expect, it } from 'vitest';

import { hello, sweepStaleSessions, UnknownAgentError } from './hello.js';
import type {
  HelloRequest,
  ResumableSession,
  SessionRepository,
  SweepRepository,
} from './hello.js';
import type { SessionStatus } from './session.js';

const NOW = '2026-09-24T12:00:00.000Z';
const MINUTE_MS = 60_000;

function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * MINUTE_MS).toISOString();
}

function request(overrides: Partial<HelloRequest> = {}): HelloRequest {
  return {
    installationKey: 'install-1',
    ownerId: 'user-1',
    agentName: 'CodeKnight',
    harness: 'claude',
    projectKey: 'battle-agents',
    now: NOW,
    ...overrides,
  };
}

/**
 * A store in memory, recording what the handshake asked it to do. The
 * resumable list is the interesting part: it is what the handshake chooses
 * from, and every resume-vs-new decision is a question about it.
 */
class FakeSessionRepository implements SessionRepository {
  installations = 0;
  projects = 0;
  createdSessions = 0;
  resumed: string[] = [];
  agentExists = true;
  resumable: ResumableSession[] = [];

  async findOrCreateInstallation(): Promise<{ id: string }> {
    this.installations += 1;
    return { id: 'installation-1' };
  }

  async findAgentByName(): Promise<{ id: string } | undefined> {
    return this.agentExists ? { id: 'agent-1' } : undefined;
  }

  async findOrCreateProject(): Promise<{ id: string }> {
    this.projects += 1;
    return { id: 'project-1' };
  }

  async findResumableSessions(): Promise<readonly ResumableSession[]> {
    return this.resumable;
  }

  async createSession(): Promise<{ id: string }> {
    this.createdSessions += 1;
    return { id: `session-${this.createdSessions}` };
  }

  async markSessionActive(sessionId: string): Promise<void> {
    this.resumed.push(sessionId);
  }
}

describe('the HELLO handshake', () => {
  it('creates a session the first time an agent connects', async () => {
    const repository = new FakeSessionRepository();

    const result = await hello(repository, request());

    expect(result).toMatchObject({ sessionId: 'session-1', resumed: false, agentId: 'agent-1' });
  });

  it('resumes the same session when the terminal comes back inside the window', async () => {
    // The whole point of the identity model. A reopened terminal is the same
    // character on a new run, not a second character.
    const repository = new FakeSessionRepository();
    repository.resumable = [{ id: 'session-7', statusChangedAt: minutesAgo(3) }];

    const result = await hello(repository, request());

    expect(result).toMatchObject({ sessionId: 'session-7', resumed: true });
    expect(repository.createdSessions).toBe(0);
  });

  it('starts a new session once the window has passed', async () => {
    const repository = new FakeSessionRepository();
    repository.resumable = [{ id: 'session-7', statusChangedAt: minutesAgo(16) }];

    const result = await hello(repository, request());

    expect(result).toMatchObject({ sessionId: 'session-1', resumed: false });
  });

  it('resumes right up to the boundary and starts fresh past it', async () => {
    const inside = new FakeSessionRepository();
    inside.resumable = [{ id: 'session-7', statusChangedAt: minutesAgo(14.9) }];
    await expect(hello(inside, request())).resolves.toMatchObject({ resumed: true });

    const outside = new FakeSessionRepository();
    outside.resumable = [{ id: 'session-7', statusChangedAt: minutesAgo(15.1) }];
    await expect(hello(outside, request())).resolves.toMatchObject({ resumed: false });
  });

  it('takes the most recent session when several are resumable', async () => {
    const repository = new FakeSessionRepository();
    repository.resumable = [
      { id: 'session-9', statusChangedAt: minutesAgo(1) },
      { id: 'session-3', statusChangedAt: minutesAgo(5) },
    ];

    const result = await hello(repository, request());

    expect(result.sessionId).toBe('session-9');
  });

  it('skips a session outside the window and resumes one inside it', async () => {
    const repository = new FakeSessionRepository();
    repository.resumable = [
      { id: 'session-1', statusChangedAt: minutesAgo(40) },
      { id: 'session-2', statusChangedAt: minutesAgo(2) },
    ];

    const result = await hello(repository, request());

    expect(result.sessionId).toBe('session-2');
  });

  it('never creates a character to connect to', async () => {
    // If the handshake could register the agent, every reopened terminal would
    // add one, and the registry would fill with duplicates of the same person.
    const repository = new FakeSessionRepository();
    repository.agentExists = false;

    await expect(hello(repository, request())).rejects.toBeInstanceOf(UnknownAgentError);
    expect(repository.createdSessions).toBe(0);
  });

  it('reuses the installation rather than minting one per process', async () => {
    const repository = new FakeSessionRepository();
    await hello(repository, request());
    await hello(repository, request({ agentName: 'CodeKnight' }));

    // findOrCreate is idempotent by contract; what matters is that the
    // handshake asks, so the store can recognise a machine it has seen before.
    expect(repository.installations).toBe(2);
  });

  it('connects without a project when none was named', async () => {
    const repository = new FakeSessionRepository();

    const result = await hello(repository, request({ projectKey: undefined }));

    expect(result.projectId).toBeNull();
    expect(repository.projects).toBe(0);
  });

  it('honours a grace window the host configured', async () => {
    const repository = new FakeSessionRepository();
    repository.resumable = [{ id: 'session-7', statusChangedAt: minutesAgo(10) }];

    await expect(
      hello(repository, request(), { resumeGraceMs: 5 * MINUTE_MS }),
    ).resolves.toMatchObject({ resumed: false });
    await expect(
      hello(repository, request(), { resumeGraceMs: 20 * MINUTE_MS }),
    ).resolves.toMatchObject({ resumed: true });
  });
});

/**
 * A sweeper store that reflects its own writes.
 *
 * It has to, or the test below proves nothing: the ordering claim is that a
 * session the sweep disconnects is visible to the abandonment pass with a
 * status change of "now", and a store that only returns the rows it was handed
 * would never show it, so the test would pass whether or not the order was
 * right.
 */
class FakeSweepRepository implements SweepRepository {
  readonly written: { id: string; status: SessionStatus }[] = [];
  active: { id: string; lastHeartbeatAt: string }[] = [];
  disconnected: { id: string; statusChangedAt: string }[] = [];

  async findActiveSessions(): Promise<readonly { id: string; lastHeartbeatAt: string }[]> {
    return this.active;
  }

  async findDisconnectedSessions(): Promise<readonly { id: string; statusChangedAt: string }[]> {
    return this.disconnected;
  }

  async markSessionStatus(sessionId: string, status: SessionStatus, now: string): Promise<void> {
    this.written.push({ id: sessionId, status });
    this.active = this.active.filter((session) => session.id !== sessionId);
    this.disconnected = this.disconnected.filter((session) => session.id !== sessionId);
    if (status === 'disconnected') {
      this.disconnected.push({ id: sessionId, statusChangedAt: now });
    }
  }
}

describe('the stale-session sweep', () => {
  const options = { now: NOW, heartbeatTimeoutMs: 5 * MINUTE_MS, resumeGraceMs: 15 * MINUTE_MS };

  it('disconnects a session that stopped heartbeating', async () => {
    const repository = new FakeSweepRepository();
    repository.active = [
      { id: 'quiet', lastHeartbeatAt: minutesAgo(6) },
      { id: 'talking', lastHeartbeatAt: minutesAgo(1) },
    ];

    const result = await sweepStaleSessions(repository, options);

    expect(result.disconnected).toEqual(['quiet']);
    expect(result.abandoned).toEqual([]);
  });

  it('abandons a disconnected session once its window passes', async () => {
    const repository = new FakeSweepRepository();
    repository.disconnected = [
      { id: 'gone', statusChangedAt: minutesAgo(20) },
      { id: 'recent', statusChangedAt: minutesAgo(2) },
    ];

    const result = await sweepStaleSessions(repository, options);

    expect(result.abandoned).toEqual(['gone']);
  });

  it('does not abandon what the same sweep just disconnected', async () => {
    // The order is the point: a session idle as active for an hour is
    // disconnected now, and must still be resumable for the next fifteen
    // minutes. Abandoning it in the same pass would mean the grace window never
    // applied to anything the sweeper touched.
    const repository = new FakeSweepRepository();
    repository.active = [{ id: 'long-idle', lastHeartbeatAt: minutesAgo(120) }];

    const result = await sweepStaleSessions(repository, options);

    expect(result).toEqual({ disconnected: ['long-idle'], abandoned: [] });
    expect(repository.written).toEqual([{ id: 'long-idle', status: 'disconnected' }]);
  });

  it('agrees with the handshake about what is still resumable', async () => {
    // The two functions answer the same question from opposite ends. If the
    // sweep abandoned a session the handshake would still resume, a character
    // would be "abandoned" and running at the same time.
    const repository = new FakeSweepRepository();
    repository.disconnected = [{ id: 'boundary', statusChangedAt: minutesAgo(14) }];
    await sweepStaleSessions(repository, options);

    const store = new FakeSessionRepository();
    store.resumable = [{ id: 'boundary', statusChangedAt: minutesAgo(14) }];
    await expect(hello(store, request())).resolves.toMatchObject({ resumed: true });
  });
});
