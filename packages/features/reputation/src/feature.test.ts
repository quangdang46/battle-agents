import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import type { ReputationRecord } from './domain.js';
import { BOUNTY_FAILED, BOUNTY_COMPLETED, reputationFeature } from './feature.js';
import { freshRecord, type ReputationRepository } from './repository.js';

const NOW = '2026-09-24T12:00:00.000Z';
const AGENT = 'agent-1';

class MapRepository implements ReputationRepository {
  readonly rows = new Map<string, ReputationRecord>();

  async find(agentId: string): Promise<ReputationRecord | undefined> {
    return this.rows.get(agentId);
  }

  async save(record: ReputationRecord): Promise<void> {
    this.rows.set(record.agentId, record);
  }
}

function harness(): { runtime: Runtime; repository: MapRepository } {
  const repository = new MapRepository();
  const runtime = createRuntime({
    extensions: [reputationFeature({ repository })],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => NOW,
  });
  return { runtime, repository };
}

function completed(agentId: string, rewardCents: number, reviewScore?: number): GameEvent {
  return {
    type: BOUNTY_COMPLETED,
    occurredAt: NOW,
    actorId: agentId,
    payload: { agentId, rewardCents, ...(reviewScore === undefined ? {} : { reviewScore }) },
  };
}

function failed(agentId: string): GameEvent {
  return { type: BOUNTY_FAILED, occurredAt: NOW, actorId: agentId, payload: { agentId } };
}

describe('reacting to outcomes', () => {
  it('starts from nothing rather than from a row that was never written', async () => {
    const { runtime } = harness();

    const view = await runtime.runAction<unknown, { trust: number; completed: number }>(
      'reputation.read',
      { agentId: AGENT },
    );

    expect(view).toMatchObject({ trust: 0, completed: 0 });
  });

  it('moves when a bounty is completed, without anyone telling it to', () => {
    const { runtime, repository } = harness();

    return runtime.emit(completed(AGENT, 10_000, 5)).then(() =>
      repository.find(AGENT).then((record) => {
        expect(record).toMatchObject({ completed: 1, earnedCents: 10_000, reviewScore: 5 });
      }),
    );
  });

  it('keeps the acceptance rate over submissions, not over accepted work', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(completed(AGENT, 1_000));
    await runtime.emit(failed(AGENT));

    // One of two. A rate over accepted work would still read 1.0 and would jump
    // on every failure, which measures nothing.
    expect(repository.rows.get(AGENT)?.acceptanceRate).toBe(0.5);
  });

  it('leaves the review mean alone when a submission was not reviewed', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(completed(AGENT, 1_000, 5));
    await runtime.emit(completed(AGENT, 1_000));

    // An unreviewed submission is missing information, not a score of zero.
    expect(repository.rows.get(AGENT)?.reviewScore).toBe(5);
  });

  it('ignores an event that names no agent rather than writing a blank record', async () => {
    const { runtime, repository } = harness();

    await runtime.emit({ type: BOUNTY_COMPLETED, occurredAt: NOW, actorId: 'x', payload: {} });

    expect(repository.rows.size).toBe(0);
  });

  it('treats a missing or malformed reward as zero', async () => {
    const { runtime, repository } = harness();

    await runtime.emit({ ...completed(AGENT, 1_000), payload: { agentId: AGENT } });
    await runtime.emit({
      ...completed(AGENT, 1_000),
      payload: { agentId: AGENT, rewardCents: -50 },
    });

    expect(repository.rows.get(AGENT)?.earnedCents).toBe(0);
  });
});

describe('what other features are given', () => {
  it('offers the capability another feature declares to gate on trust', () => {
    const { runtime } = harness();

    const detail = runtime.describeDomain('reputation');
    expect(detail.capabilities.map((each) => each.name)).toEqual([
      'reputation.read',
      'reputation.gate',
    ]);
  });

  it('answers the gate through the registry, not through an import', async () => {
    const { runtime, repository } = harness();
    await repository.save(freshRecord(AGENT, NOW));

    const answer = await runtime.runAction<unknown, { allowed: boolean; rewardCents: number }>(
      'reputation.gate',
      { agentId: AGENT, rewardCents: 50_000 },
    );

    expect(answer).toMatchObject({ allowed: false, rewardCents: 50_000 });
  });

  it('publishes the tier ladder so no client hardcodes it', async () => {
    const { runtime } = harness();

    const tiers = await runtime.runAction<unknown, readonly { name: string }[]>(
      'reputation.tiers',
      {},
    );

    expect(tiers.map((tier) => tier.name)).toEqual([
      'beginner',
      'intermediate',
      'advanced',
      'legendary',
    ]);
  });

  it('degrades a dependent feature instead of failing when uninstalled', () => {
    // The property the bead is really about: a feature that requires
    // reputation.read must still run, with a warning, when this one is gone.
    const { runtime } = harness();
    const dependent = {
      id: 'battle',
      requires: ['reputation.read'],
      capabilities: [{ name: 'battle.run', description: 'run a battle' }],
    };

    runtime.install(dependent);
    // Not degraded yet: reputation is installed and provides the capability.
    // A degradation here would mean the check reports a missing requirement for
    // something that is present, which is the false positive that teaches
    // readers to ignore the signal.
    expect(runtime.degraded().has('battle')).toBe(false);

    runtime.uninstall('reputation');

    expect(runtime.degraded().get('battle')).toEqual(['reputation.read']);
    // Still there. Degraded is reduced, not switched off.
    expect(runtime.capabilities()).toContain('battle.run');
  });
});
