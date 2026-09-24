import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import { AGENT_LEVEL_UP, type AgentProgress } from './domain.js';
import { isNoSuchProgress, type ProgressionRepository } from './repository.js';
import { apply, progressionFeature } from './feature.js';
import { DEFAULT_BUILD, OUTCOMES } from './rules.js';

const NOW = '2026-09-24T12:00:00.000Z';
const AGENT = 'agent-1';

/** A store held in memory, so the handler path is tested without a database. */
class InMemoryProgressionRepository implements ProgressionRepository {
  readonly rows = new Map<string, AgentProgress>();
  saves = 0;

  async find(agentId: string): Promise<AgentProgress | undefined> {
    return this.rows.get(agentId);
  }

  async ensure(progress: { agentId: string }, now: string): Promise<AgentProgress> {
    const existing = this.rows.get(progress.agentId);
    if (existing !== undefined) {
      return existing;
    }
    const created: AgentProgress = {
      agentId: progress.agentId,
      xp: 0,
      level: 1,
      build: DEFAULT_BUILD,
      history: [],
      updatedAt: now,
    };
    this.rows.set(progress.agentId, created);
    return created;
  }

  async save(progress: AgentProgress): Promise<void> {
    this.saves += 1;
    this.rows.set(progress.agentId, progress);
  }
}

function harness(): {
  runtime: Runtime;
  repository: InMemoryProgressionRepository;
  seen: GameEvent[];
} {
  const repository = new InMemoryProgressionRepository();
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((event) => seen.push(event));
  const runtime = createRuntime({
    extensions: [progressionFeature({ repository })],
    store: new InMemoryStateStore(),
    bus,
    now: () => NOW,
  });
  return { runtime, repository, seen };
}

function outcomeEvent(type: string, agentId: string | null = AGENT): GameEvent {
  return {
    type,
    occurredAt: NOW,
    actorId: 'system',
    payload: agentId === null ? {} : { agentId },
  };
}

describe('experience arrives because something happened', () => {
  it('awards for a bounty completion and records it', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(outcomeEvent('bounty.completed'));

    expect(repository.rows.get(AGENT)?.xp).toBe(OUTCOMES['bounty.completed'].xp);
  });

  it('ignores an event that is not an outcome', async () => {
    const { runtime, repository } = harness();

    for (const transient of ['file.write', 'thinking', 'session.heartbeat', 'tool.completed']) {
      await runtime.emit(outcomeEvent(transient));
    }

    // Nothing created either: an event with no agentId on it, or with one, is
    // not a reason to conjure a progress record.
    expect(repository.rows.size).toBe(0);
  });

  it('ignores an outcome that names no agent', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(outcomeEvent('bounty.completed', null));

    expect(repository.rows.size).toBe(0);
  });

  it('accumulates across many outcomes', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(outcomeEvent('test.passed'));
    await runtime.emit(outcomeEvent('test.passed'));
    await runtime.emit(outcomeEvent('pr.merged'));

    expect(repository.rows.get(AGENT)?.xp).toBe(100 + 100 + 500);
  });

  it('emits agent.level_up when a level is crossed, and not on every award', async () => {
    const { runtime, seen } = harness();

    await runtime.emit(outcomeEvent('bounty.completed'));
    await runtime.emit(outcomeEvent('test.passed'));

    const levelUps = seen.filter((event) => event.type === AGENT_LEVEL_UP);
    expect(levelUps).toHaveLength(1);
    // A bounty is worth a thousand, which carries a character from level 1 to 4
    // in one award. One event, saying where it ended up, rather than three
    // pretending it arrived one level at a time.
    expect(levelUps[0]?.payload).toMatchObject({ agentId: AGENT, level: 4, previousLevel: 1 });
  });
});

describe('a failed run still teaches', () => {
  it('grants experience for a recovery and keeps the character', async () => {
    // Section 10.2's death rule: HP 0 never kills the character. A run that
    // failed and was recovered is experience, and the character is untouched.
    const { runtime, repository } = harness();

    await runtime.emit(outcomeEvent('session.recovered'));

    const progress = repository.rows.get(AGENT);
    expect(progress?.xp).toBe(150);
    expect(progress?.build).toBe('debugger');
  });

  it('never deletes or zeroes a record, whatever arrives', async () => {
    const { runtime, repository } = harness();
    await runtime.emit(outcomeEvent('bounty.completed'));
    const before = repository.rows.get(AGENT);

    for (const type of ['session.recovered', 'battle.won', 'test.passed']) {
      await runtime.emit(outcomeEvent(type));
    }

    const after = repository.rows.get(AGENT);
    expect(repository.rows.size).toBe(1);
    expect(after?.xp).toBeGreaterThan(before?.xp ?? 0);
    expect(after?.agentId).toBe(AGENT);
  });
});

describe('the same model, two histories', () => {
  it('specialises two characters differently from behaviour alone', async () => {
    const { runtime, repository } = harness();

    for (let index = 0; index < 4; index += 1) {
      await runtime.emit(outcomeEvent('session.recovered', 'the-debugger'));
      await runtime.emit(outcomeEvent('bounty.completed', 'the-builder'));
    }

    // Nothing above names a model, and nothing above could: the feature is
    // never told one. The two characters are the same model by construction,
    // because the only thing that differs is what they did.
    expect(repository.rows.get('the-debugger')?.build).toBe('debugger');
    expect(repository.rows.get('the-builder')?.build).toBe('builder');
  });
});

describe('reading progress', () => {
  it('reports experience, level and build', async () => {
    const { runtime } = harness();
    await runtime.emit(outcomeEvent('bounty.completed'));

    const summary = await runtime.runAction<
      { agentId: string },
      { xp: number; level: number; build: string }
    >('progression.read', { agentId: AGENT });

    expect(summary).toMatchObject({ xp: 1000, level: 4, build: 'builder' });
  });

  it('says an unknown character is unknown, not new', async () => {
    const { runtime } = harness();

    const failure = await runtime
      .runAction('progression.read', { agentId: 'never-seen' })
      .catch((cause: unknown) => cause);

    // A character that has done nothing and a character nobody has heard of are
    // different answers. Reporting "level 1, zero xp" for both would make a
    // missing record look like a new player.
    expect(isNoSuchProgress(failure)).toBe(true);
  });

  it('answers what an outcome is worth before it happens', async () => {
    const { runtime } = harness();

    await expect(
      runtime.runAction<{ eventType: string }, { xp: number; recognised: boolean }>(
        'progression.awards',
        { eventType: 'bounty.completed' },
      ),
    ).resolves.toMatchObject({ xp: 1000, recognised: true });

    await expect(
      runtime.runAction<{ eventType: string }, { xp: number; recognised: boolean }>(
        'progression.awards',
        { eventType: 'tokens.spent' },
      ),
    ).resolves.toMatchObject({ xp: 0, recognised: false });
  });
});

describe('applying an outcome', () => {
  it('is pure, so a mis-awarded outcome self-corrects on the next one', () => {
    const start: AgentProgress = {
      agentId: AGENT,
      xp: 0,
      level: 1,
      build: DEFAULT_BUILD,
      history: [],
      updatedAt: NOW,
    };

    const after = apply(start, OUTCOMES['bounty.completed'], NOW);

    // The input is untouched, which is what makes a re-award safe to replay.
    expect(start.xp).toBe(0);
    expect(start.history).toEqual([]);
    expect(after.xp).toBe(1000);
    expect(after.build).toBe('builder');
  });

  it('recomputes the build from the whole history rather than adjusting it', () => {
    const asBuilder: AgentProgress = {
      agentId: AGENT,
      xp: 1000,
      level: 2,
      build: 'builder',
      history: [{ build: 'builder', weight: 1, at: NOW }],
      updatedAt: NOW,
    };

    // Six more builder outcomes on top of one: still a builder, and the
    // history says why rather than the build having been incremented.
    let progress = asBuilder;
    for (let index = 0; index < 6; index += 1) {
      progress = apply(progress, OUTCOMES['bounty.completed'], NOW);
    }
    expect(progress.build).toBe('builder');
    expect(progress.history).toHaveLength(7);
  });
});
