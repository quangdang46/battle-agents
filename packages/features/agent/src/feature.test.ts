import { createRuntime, InMemoryStateStore, createInMemoryEventBus } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  isDescribeAgentsInput,
  isEndSessionInput,
  isHeartbeatSessionInput,
  isReadAgentInput,
  whyDescribeAgentsIsRejected,
  whyEndSessionIsRejected,
  whyHeartbeatSessionIsRejected,
  whyReadAgentIsRejected,
  type AgentId,
  type AgentIdentity,
  type Installation,
  type NewAgent,
  type UserId,
} from './domain.js';
import {
  agentFeature,
  AGENT_REGISTERED,
  AGENT_REGISTRATION_REJECTED,
  type AgentSummary,
} from './feature.js';
import { AGENT_NAME_TAKEN, AGENT_NOT_OWNED, type AgentRepository } from './repository.js';
import type { SessionEndReason, SessionStatus } from './session.js';

const AT = '2026-09-24T00:00:00.000Z';

/** What a store raises, per the repository contract: an error carrying a code. */
function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const OWNER = 'user-1' as UserId;
const OTHER_OWNER = 'user-2' as UserId;

/**
 * A repository held entirely in memory, so the feature's rules can be tested
 * without a database. It lives in the test rather than beside the source on
 * purpose: a second implementation shipped in the package is one a caller can
 * reach for by mistake, and this one deliberately does not enforce anything the
 * Postgres implementation would not.
 */
class InMemoryAgentRepository implements AgentRepository {
  readonly records: AgentIdentity[] = [];
  #nextId = 1;
  /** Set to make `create` fail with something other than a name conflict. */
  failNextCreateWith: unknown = null;
  /**
   * Counts the reads, so a test can assert a malformed call was refused BEFORE
   * the store was asked. Nothing about an empty list would show that: a lookup
   * for `undefined` matches nothing and answers with nothing.
   */
  reads = 0;

  async findOwned(owner: UserId, agent: AgentId): Promise<AgentIdentity | undefined> {
    this.reads += 1;
    return this.records.find((row) => row.id === agent && row.ownerId === owner);
  }

  async requireOwned(owner: UserId, agent: AgentId): Promise<AgentIdentity> {
    const found = await this.findOwned(owner, agent);
    if (found === undefined) {
      // A record that exists under a different owner is reported the same way as
      // one that does not exist, so a caller cannot learn that an id is real.
      throw codedError(AGENT_NOT_OWNED, `agent ${agent} does not belong to user ${owner}`);
    }
    return found;
  }

  async listForOwner(owner: UserId): Promise<readonly AgentIdentity[]> {
    this.reads += 1;
    return this.records.filter((row) => row.ownerId === owner);
  }

  async create(agent: NewAgent, now: string): Promise<AgentIdentity> {
    if (this.failNextCreateWith !== null) {
      const failure = this.failNextCreateWith;
      this.failNextCreateWith = null;
      throw failure;
    }
    if (this.records.some((row) => row.ownerId === agent.ownerId && row.name === agent.name)) {
      throw codedError(AGENT_NAME_TAKEN, `user ${agent.ownerId} already has ${agent.name}`);
    }
    const created: AgentIdentity = {
      ...agent,
      id: `agent-${this.#nextId++}` as AgentId,
      level: 1,
      xp: 0,
      reputation: 0,
      presence: 'offline',
      lastSeenAt: null,
      createdAt: now,
    };
    this.records.push(created);
    return created;
  }

  async findInstallationForOwner(): Promise<Installation | undefined> {
    return undefined;
  }
}

/**
 * Session storage in memory.
 *
 * Status lives here rather than in a database because two of the rules are
 * about refusing: a heartbeat for a run that is not running must change
 * nothing, and neither must an end. A double that quietly allowed both would
 * make those tests pass for the wrong reason.
 */
class InMemorySessionRepository {
  readonly rows: { id: string; status: SessionStatus; reason: SessionEndReason | null }[] = [];
  #next = 1;
  /** Counts the reads, for the same reason as the agent repository's. */
  reads = 0;

  async findOrCreateInstallation(_input?: {
    ownerId: string;
    installationKey: string;
    now: string;
  }): Promise<{ id: string }> {
    return { id: 'i-1' };
  }
  async findAgentByName(_ownerId?: string, _name?: string): Promise<{ id: string } | undefined> {
    return { id: 'agent-1' };
  }
  async findOrCreateProject(_input?: {
    ownerId: string;
    name: string;
    now: string;
  }): Promise<{ id: string }> {
    return { id: 'project-1' };
  }
  async findResumableSessions(_input?: {
    agentId: string;
    installationId: string;
    projectId: string | null;
  }): Promise<readonly never[]> {
    return [];
  }
  /** The clock each row was stamped with, so a test can see whose clock won. */
  readonly stampedAt: string[] = [];
  async createSession(input: {
    agentId: string;
    installationId: string;
    projectId: string | null;
    now: string;
  }): Promise<{ id: string }> {
    const id = `session-${this.#next++}`;
    this.rows.push({ id, status: 'active', reason: null });
    this.stampedAt.push(input.now);
    return { id };
  }
  async markSessionActive(id: string, _now?: string): Promise<void> {
    this.set(id, (row) => ({ ...row, status: 'active' }));
  }
  async heartbeat(id: string, _now?: string): Promise<SessionStatus | undefined> {
    this.reads += 1;
    const row = this.rows.find((each) => each.id === id);
    return row?.status === 'active' ? row.status : undefined;
  }
  async end(
    id: string,
    reason: SessionEndReason,
    _now?: string,
  ): Promise<SessionStatus | undefined> {
    this.reads += 1;
    const row = this.rows.find((each) => each.id === id);
    if (row?.status !== 'active') {
      return undefined;
    }
    this.set(id, () => ({ ...row, status: 'ended', reason }));
    return 'ended';
  }
  private set(
    id: string,
    next: (row: { id: string; status: SessionStatus; reason: SessionEndReason | null }) => {
      id: string;
      status: SessionStatus;
      reason: SessionEndReason | null;
    },
  ): void {
    const at = this.rows.findIndex((each) => each.id === id);
    if (at !== -1) {
      this.rows[at] = next(this.rows[at]!);
    }
  }
}

function harnessWith(dependencies: Parameters<typeof agentFeature>[0]): { runtime: Runtime } {
  const bus = createInMemoryEventBus();
  return {
    runtime: createRuntime({
      extensions: [agentFeature(dependencies)],
      store: new InMemoryStateStore(),
      bus,
      now: () => AT,
    }),
  };
}

function harness(repository: AgentRepository): { runtime: Runtime; seen: GameEvent[] } {
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((each) => seen.push(each));
  const runtime = createRuntime({
    extensions: [agentFeature({ repository })],
    store: new InMemoryStateStore(),
    bus,
    now: () => AT,
  });
  return { runtime, seen };
}

function register(
  runtime: Runtime,
  payload: {
    ownerId: UserId;
    name: string;
    harness: 'claude' | 'codex';
  },
): Promise<GameEvent[]> {
  return runtime.dispatch({
    type: 'agent.register',
    issuedAt: AT,
    issuerId: payload.ownerId,
    payload,
  });
}

describe('registering a character', () => {
  it('emits agent.registered with the id the store assigned', async () => {
    const { runtime, seen } = harness(new InMemoryAgentRepository());

    const emitted = await register(runtime, {
      ownerId: OWNER,
      name: 'CodeKnight',
      harness: 'claude',
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.type).toBe(AGENT_REGISTERED);
    expect(emitted[0]?.payload).toMatchObject({ name: 'CodeKnight', harness: 'claude' });
    // The id comes from the store, not from the feature inventing one.
    expect((emitted[0]?.payload as { agentId: string }).agentId).toBe('agent-1');
    expect(seen.map((each) => each.type)).toEqual([AGENT_REGISTERED]);
  });

  it('trims the name it stores but remembers the one it was given', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);

    await register(runtime, { ownerId: OWNER, name: '  Padded  ', harness: 'codex' });

    expect(repository.records[0]?.name).toBe('Padded');
  });

  it('emits a rejection and stores nothing when the name is empty', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);

    const emitted = await register(runtime, { ownerId: OWNER, name: '   ', harness: 'codex' });

    expect(emitted[0]?.type).toBe(AGENT_REGISTRATION_REJECTED);
    expect(emitted[0]?.payload).toMatchObject({ reason: 'name-empty' });
    expect(repository.records).toEqual([]);
  });

  it('refuses a name the runtime would otherwise read as a system identity', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);

    const emitted = await register(runtime, { ownerId: OWNER, name: 'Root', harness: 'codex' });

    expect(emitted[0]?.payload).toMatchObject({ reason: 'name-reserved' });
    expect(repository.records).toEqual([]);
  });

  it('reports a duplicate as a conflict, not as a fault', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);
    await register(runtime, { ownerId: OWNER, name: 'Twin', harness: 'codex' });

    const emitted = await register(runtime, { ownerId: OWNER, name: 'Twin', harness: 'codex' });

    expect(emitted[0]?.type).toBe(AGENT_REGISTRATION_REJECTED);
    expect(emitted[0]?.payload).toMatchObject({ reason: 'name-taken' });
  });

  it('lets two different users each have the same name', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);

    await register(runtime, { ownerId: OWNER, name: 'Codex', harness: 'codex' });
    const second = await register(runtime, {
      ownerId: OTHER_OWNER,
      name: 'Codex',
      harness: 'codex',
    });

    expect(second[0]?.type).toBe(AGENT_REGISTERED);
  });

  it('lets a real fault escape instead of reporting it as a name conflict', async () => {
    // The failure this guards: catching everything around the store and calling
    // it "name taken" sends the caller off to rename a character that was never
    // the problem, while the actual fault — a dropped connection — disappears.
    const repository = new InMemoryAgentRepository();
    repository.failNextCreateWith = new Error('connection terminated unexpectedly');
    const { runtime } = harness(repository);

    await expect(
      register(runtime, { ownerId: OWNER, name: 'Unlucky', harness: 'codex' }),
    ).rejects.toThrow(/connection terminated/);
  });
});

describe('reading characters', () => {
  it('lists only the characters the caller owns', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);
    await register(runtime, { ownerId: OWNER, name: 'Mine', harness: 'claude' });
    await register(runtime, { ownerId: OTHER_OWNER, name: 'Theirs', harness: 'codex' });

    const summaries = await runtime.runAction<unknown, readonly AgentSummary[]>('agent.describe', {
      ownerId: OWNER,
    });

    expect(summaries.map((each) => each.name)).toEqual(['Mine']);
  });

  it('refuses to read another user’s character', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);
    const [created] = await register(runtime, {
      ownerId: OTHER_OWNER,
      name: 'Theirs',
      harness: 'codex',
    });
    const agentId = (created?.payload as { agentId: AgentId }).agentId;

    await expect(
      runtime.runAction('agent.read', { ownerId: OWNER, agentId }),
    ).rejects.toMatchObject({ code: AGENT_NOT_OWNED });
  });

  it('reports an unknown id the same way as somebody else’s', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);
    await register(runtime, { ownerId: OTHER_OWNER, name: 'Theirs', harness: 'codex' });

    const readOther = runtime.runAction('agent.read', {
      ownerId: OWNER,
      agentId: 'agent-1' as AgentId,
    });
    const readNothing = runtime.runAction('agent.read', {
      ownerId: OWNER,
      agentId: 'agent-999' as AgentId,
    });

    await expect(readOther).rejects.toMatchObject({ code: AGENT_NOT_OWNED });
    await expect(readNothing).rejects.toMatchObject({ code: AGENT_NOT_OWNED });
  });
});

describe('what the feature offers', () => {
  it('declares only capabilities that cannot be used without an owner', () => {
    const { runtime } = harness(new InMemoryAgentRepository());
    const described = runtime.describeDomain('agent');

    expect(described.capabilities.map((each) => each.name)).toEqual([
      'agent.read',
      'agent.describe',
    ]);
    expect(described.actions.map((each) => each.id)).toEqual(['agent.describe', 'agent.read']);
  });

  it('keeps its key events, because a character outlives the run that made it', () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);

    return register(runtime, { ownerId: OWNER, name: 'Keeper', harness: 'claude' }).then(() => {
      expect(runtime.degraded().size).toBe(0);
      expect(repository.records).toHaveLength(1);
    });
  });
});

describe('driving a running session', () => {
  it('creates a session the ingest route can then resolve', async () => {
    // This is the action that makes POST /api/events reachable at all. Every
    // other action in this describe reads a row this one creates, and the ingest
    // route answers 404 for a session that does not exist — so before
    // `session.create` existed there was no path from a network client to an
    // accepted batch, on any harness.
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });

    const created = await runtime.runAction('session.create', {
      installationKey: 'laptop-1',
      ownerId: 'user-1',
      agentName: 'the-debugger',
      harness: 'claude',
    });

    expect(created).toMatchObject({
      sessionId: expect.any(String),
      agentId: expect.any(String),
      installationId: expect.any(String),
    });
    // The cast is what ba-vsd is about: runAction returns unknown, so a caller
    // asserting anything about the reply must narrow it by hand. That is the gap
    // the typing half of that bead exists to close, and it is still open.
    const sessionId = (created as { readonly sessionId: string }).sessionId;
    // The session the runtime reports must be one the repository can find, or
    // the row and the answer disagree and the first batch 404s anyway.
    expect(await store.heartbeat(sessionId, AT)).toBe('active');
  });

  it('refuses a handshake that cannot name a machine, a character, or a harness', async () => {
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });
    const valid = {
      installationKey: 'laptop-1',
      ownerId: 'user-1',
      agentName: 'the-debugger',
      harness: 'claude',
    };

    for (const input of [
      {},
      null,
      { ...valid, installationKey: 7 },
      { ...valid, installationKey: '' },
      { ...valid, ownerId: '' },
      { ...valid, agentName: '' },
      { ...valid, harness: '' },
      { ...valid, harness: 3 },
      // Absent is allowed — "no project context" is a real state. Present and
      // the wrong type is not, because it reaches a lookup expecting a key.
      { ...valid, projectKey: 9 },
    ]) {
      await expect(runtime.runAction('session.create', input)).rejects.toThrow(
        /session\.create rejected/,
      );
    }
  });

  it('accepts a harness this build has never heard of', async () => {
    // Refusing an unknown harness would mean the newest adapters — the ones this
    // repository exists to add — could not start a session at all. The domain
    // already decided this in toHarness: 'other' is the escape hatch so a
    // character is never dropped because its harness is newer than the code
    // reading it.
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });

    const created = await runtime.runAction('session.create', {
      installationKey: 'laptop-1',
      ownerId: 'user-1',
      agentName: 'the-newcomer',
      harness: 'a-coding-agent-shipped-last-week',
    });

    expect(created).toMatchObject({ sessionId: expect.any(String) });
  });

  it('stamps the row with the runtime clock rather than the one supplied', async () => {
    // The row decides whether a LATER session is inside its resume grace
    // window, so a caller-supplied clock would let a client decide its own
    // continuity. `now` in the payload is not a field — it is something the
    // action overwrites, and this is the assertion that it does.
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });

    await runtime.runAction('session.create', {
      installationKey: 'laptop-1',
      ownerId: 'user-1',
      agentName: 'the-debugger',
      harness: 'claude',
      now: '1999-01-01T00:00:00.000Z',
    });

    expect(store.stampedAt).toEqual([AT]);
    expect(store.stampedAt).not.toContain('1999-01-01T00:00:00.000Z');
  });

  // Resume-versus-new is NOT asserted here. The double in this file returns []
  // from findResumableSessions unconditionally, so the branch is structurally
  // undemonstrable, and an assertion that passes because the double cannot
  // reach it is the failure this repository keeps meeting. hello() owns the
  // decision and hello.test.ts covers it three times, grace boundary included.

  it('heartbeats a live session and refuses one that is not running', async () => {
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });
    const created = await store.createSession({
      agentId: 'agent-1',
      installationId: 'i-1',
      projectId: null,
      now: AT,
    });

    const beat = await runtime.runAction('session.heartbeat', { sessionId: created.id });
    expect(beat).toEqual({ sessionId: created.id, status: 'active' });

    await expect(
      runtime.runAction('session.heartbeat', { sessionId: 'no-such-session' }),
    ).rejects.toThrow(/is not running/);
  });

  it('ends a session and records why', async () => {
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });
    const created = await store.createSession({
      agentId: 'agent-1',
      installationId: 'i-1',
      projectId: null,
      now: AT,
    });

    const ended = await runtime.runAction('session.end', {
      sessionId: created.id,
      reason: 'completed',
    });
    expect(ended).toEqual({ sessionId: created.id, status: 'ended', reason: 'completed' });
  });

  it('does not accept an ending the table cannot hold', async () => {
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });
    const created = await store.createSession({
      agentId: 'agent-1',
      installationId: 'i-1',
      projectId: null,
      now: AT,
    });

    const ended = await runtime.runAction('session.end', {
      sessionId: created.id,
      reason: 'gave-up',
    });
    // A caller inventing a reason would otherwise write a value no reader knows
    // how to interpret, and the column is an enum precisely so it cannot.
    expect(ended).toMatchObject({ status: 'ended', reason: 'crashed' });
  });

  it('offers no session actions at all when no session storage is wired', async () => {
    const { runtime } = harnessWith({ repository: new InMemoryAgentRepository() });

    // Absent rather than registered-and-throwing: `discover` is how a caller
    // finds out, and a host with no session store genuinely has no sessions.
    expect(runtime.actions()).not.toContain('session.create');
    expect(runtime.actions()).not.toContain('session.heartbeat');
    expect(runtime.actions()).not.toContain('session.end');
    expect(runtime.actions()).toContain('agent.describe');
  });
});

describe('a payload nobody checked', () => {
  // These four read their payload off an annotation. `act()` takes its input as
  // a generic, so every one of these compiled clean. `agent.read` is the one
  // that mattered: it exists so a character is only ever read by its owner, and
  // `act('agent.read', { agentId })` asked for a character with no owner at all.
  //
  // The inputs are branded ids, and a brand is a phantom symbol, so what these
  // refuse is the STRING check underneath. The assertion that matters is the
  // counter: an unbranded string satisfies the declared type today, and only a
  // runtime check can refuse one.
  it('refuses a read that names no owner, before the store is asked', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);
    await register(runtime, { ownerId: OTHER_OWNER, name: 'Theirs', harness: 'codex' });

    for (const input of [{}, null, { ownerId: 7 }, { ownerId: '' }]) {
      await expect(runtime.runAction('agent.describe', input)).rejects.toThrow(
        /agent\.describe rejected/,
      );
    }
    expect(repository.reads).toBe(0);
  });

  it('refuses a read with no owner even when it names a character', async () => {
    const repository = new InMemoryAgentRepository();
    const { runtime } = harness(repository);
    await register(runtime, { ownerId: OTHER_OWNER, name: 'Theirs', harness: 'codex' });

    // The shape that turns "look up one of the caller's own characters" into
    // "look up this character". A store that keyed on agent id alone would
    // answer it.
    for (const input of [
      { agentId: 'agent-1' },
      { ownerId: OWNER },
      { ownerId: OWNER, agentId: 1 },
    ]) {
      await expect(runtime.runAction('agent.read', input)).rejects.toThrow(/agent\.read rejected/);
    }
    expect(repository.reads).toBe(0);

    // The well-formed call still reads, and only for its owner.
    await expect(
      runtime.runAction<unknown, readonly AgentSummary[]>('agent.read', {
        ownerId: OWNER,
        agentId: 'agent-1' as AgentId,
      }),
    ).rejects.toMatchObject({ code: AGENT_NOT_OWNED });
    expect(repository.reads).toBe(1);
  });

  it('refuses a session action that names no session', async () => {
    const store = new InMemorySessionRepository();
    const { runtime } = harnessWith({
      repository: new InMemoryAgentRepository(),
      sessionRepository: store,
    });

    for (const input of [{}, null, { sessionId: 7 }, { sessionId: '' }]) {
      await expect(runtime.runAction('session.heartbeat', input)).rejects.toThrow(
        /session\.heartbeat rejected/,
      );
    }
    // A reason that is not a string is a different mistake from a reason this
    // feature has never heard of: the second is absorbed as 'crashed' on
    // purpose, and refusing it here would move that choice onto every caller.
    await expect(
      runtime.runAction('session.end', { sessionId: 'session-1', reason: 42 }),
    ).rejects.toThrow(/session\.end rejected: reason-not-a-string/);
    await expect(runtime.runAction('session.end', { reason: 'completed' })).rejects.toThrow(
      /session\.end rejected: session-id-not-a-string/,
    );

    expect(store.reads).toBe(0);
  });

  it('agrees with the guard it is built from, on every verdict', () => {
    for (const [validator, guard] of [
      [whyDescribeAgentsIsRejected, isDescribeAgentsInput],
      [whyReadAgentIsRejected, isReadAgentInput],
      [whyHeartbeatSessionIsRejected, isHeartbeatSessionInput],
      [whyEndSessionIsRejected, isEndSessionInput],
    ] as const) {
      for (const input of [
        null,
        'a string',
        {},
        { ownerId: 1 },
        { ownerId: '' },
        { agentId: 1 },
        { sessionId: 1 },
        { reason: 1 },
      ]) {
        expect(guard(input), String(input)).toBe(validator(input) === undefined);
      }
    }
  });

  it('narrows to the branded ids, so the action below reads the type it declares', () => {
    // Not a cast: the guard is what produces the branded shape, and a payload
    // it rejects is one where the declared type would have been a lie.
    const input: unknown = { ownerId: OWNER, agentId: 'agent-1' as AgentId };
    if (!isReadAgentInput(input)) {
      throw new Error('expected the read to be well-formed');
    }
    const owner: UserId = input.ownerId;
    const agent: AgentId = input.agentId;
    expect(owner).toBe(OWNER);
    expect(agent).toBe('agent-1');
    expect(isReadAgentInput({ ownerId: OWNER })).toBe(false);
  });
});
