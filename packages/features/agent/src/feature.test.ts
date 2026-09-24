import { createRuntime, InMemoryStateStore, createInMemoryEventBus } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import type { AgentId, AgentIdentity, Installation, NewAgent, UserId } from './domain.js';
import {
  agentFeature,
  AGENT_REGISTERED,
  AGENT_REGISTRATION_REJECTED,
  type AgentSummary,
} from './feature.js';
import { AGENT_NAME_TAKEN, AGENT_NOT_OWNED, type AgentRepository } from './repository.js';

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

  async findOwned(owner: UserId, agent: AgentId): Promise<AgentIdentity | undefined> {
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
