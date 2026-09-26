import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  isReputationGateInput,
  isReputationReadInput,
  whyReputationGateIsRejected,
  whyReputationReadIsRejected,
  type ReputationRecord,
} from './domain.js';
import { BOUNTY_FAILED, BOUNTY_COMPLETED, reputationFeature } from './feature.js';
import {
  freshRecord,
  type ReputationOutcome,
  type ReputationRepository,
} from './repository.js';

const NOW = '2026-09-24T12:00:00.000Z';
const AGENT = 'agent-1';

/**
 * A store that models the claim as the claim really behaves.
 *
 * The key is (bountyId, kind) and NOT the agent, which is the part worth
 * reproducing exactly: a second event naming a different agent for the same
 * bounty has to lose, and a fake keyed on all three fields would let it win and
 * pass a test the real database fails.
 */
class MapRepository implements ReputationRepository {
  readonly rows = new Map<string, ReputationRecord>();
  readonly claims = new Set<string>();
  /**
   * Counts the reads, so a test can assert a malformed call was refused BEFORE
   * the store was asked. Nothing about the map would show that: a lookup for
   * `undefined` misses, and the action then answers from a fresh zero record.
   */
  reads = 0;

  async find(agentId: string): Promise<ReputationRecord | undefined> {
    this.reads += 1;
    return this.rows.get(agentId);
  }

  async save(record: ReputationRecord): Promise<void> {
    this.rows.set(record.agentId, record);
  }

  async claimOutcome(outcome: ReputationOutcome): Promise<boolean> {
    const key = `${outcome.bountyId}:${outcome.kind}`;
    if (this.claims.has(key)) {
      return false;
    }
    this.claims.add(key);
    return true;
  }
}

function harness(): {
  runtime: Runtime;
  repository: MapRepository;
  warnings: readonly string[];
} {
  const repository = new MapRepository();
  const warnings: string[] = [];
  const runtime = createRuntime({
    extensions: [reputationFeature({ repository })],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => NOW,
    // Captured rather than discarded. A refusal that only says so in a log
    // nobody keeps is not visible, and the test that says so has to read the
    // same place a reader would.
    log: { warn: (message: string) => warnings.push(message) },
  });
  return { runtime, repository, warnings };
}

function completed(
  agentId: string,
  rewardCents: number,
  reviewScore?: number,
  bountyId = 'bounty-1',
): GameEvent {
  return {
    type: BOUNTY_COMPLETED,
    occurredAt: NOW,
    actorId: agentId,
    payload: { bountyId, agentId, rewardCents, ...(reviewScore === undefined ? {} : { reviewScore }) },
  };
}

function failed(agentId: string, bountyId = 'bounty-1'): GameEvent {
  return { type: BOUNTY_FAILED, occurredAt: NOW, actorId: agentId, payload: { bountyId, agentId } };
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

    await runtime.emit(completed(AGENT, 1_000, undefined, 'bounty-1'));
    await runtime.emit(failed(AGENT, 'bounty-2'));

    // One of two. A rate over accepted work would still read 1.0 and would jump
    // on every failure, which measures nothing.
    expect(repository.rows.get(AGENT)?.acceptanceRate).toBe(0.5);
  });

  it('leaves the review mean alone when a submission was not reviewed', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(completed(AGENT, 1_000, 5, 'bounty-1'));
    await runtime.emit(completed(AGENT, 1_000, undefined, 'bounty-2'));

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

    await runtime.emit({
      ...completed(AGENT, 1_000),
      payload: { bountyId: 'bounty-1', agentId: AGENT },
    });
    await runtime.emit({
      ...completed(AGENT, 1_000),
      payload: { bountyId: 'bounty-2', agentId: AGENT, rewardCents: -50 },
    });

    expect(repository.rows.get(AGENT)?.earnedCents).toBe(0);
  });
});

describe('one outcome, counted once', () => {
  it('does not count a second delivery of the same bounty', async () => {
    // The bug this bead exists for. GitHub delivers a merge at least once, and
    // the event log this feature reads is replayable, so the same completion
    // arrives twice and used to arrive as two completions: twice the count and
    // twice the money, for one pull request.
    const { runtime, repository } = harness();
    const delivery = completed(AGENT, 10_000, 4, 'bounty-7');

    await runtime.emit(delivery);
    await runtime.emit(delivery);

    expect(repository.rows.get(AGENT)).toMatchObject({ completed: 1, earnedCents: 10_000 });
  });

  it('counts two different bounties, which are two outcomes', async () => {
    const { runtime, repository } = harness();

    await runtime.emit(completed(AGENT, 10_000, undefined, 'bounty-7'));
    await runtime.emit(completed(AGENT, 2_000, undefined, 'bounty-8'));

    expect(repository.rows.get(AGENT)).toMatchObject({ completed: 2, earnedCents: 12_000 });
  });

  it('reproduces the same record when the log is replayed end to end', async () => {
    // The property a replayable event log is supposed to have, and the reason
    // the claim is in the store rather than in a check of an event id: replaying
    // the sequence has to be a no-op, not a second history.
    const { runtime, repository } = harness();
    const log = [
      completed(AGENT, 10_000, 4, 'bounty-7'),
      failed(AGENT, 'bounty-8'),
      completed(AGENT, 2_000, undefined, 'bounty-9'),
    ];

    for (const event of log) {
      await runtime.emit(event);
    }
    const afterFirstPass = repository.rows.get(AGENT);
    for (const event of log) {
      await runtime.emit(event);
    }

    expect(repository.rows.get(AGENT)).toEqual(afterFirstPass);
  });

  it('counts a completion and a later retraction of one bounty as two outcomes', async () => {
    // `kind` is part of the key on purpose. A bounty that is resolved and then
    // retracted is two things that happened, and a key of the bounty alone would
    // call the second one a duplicate and freeze the record at the first telling
    // — a dedup key that is worse than none.
    const { runtime, repository } = harness();

    await runtime.emit(completed(AGENT, 10_000, undefined, 'bounty-7'));
    await runtime.emit(failed(AGENT, 'bounty-7'));

    expect(repository.rows.get(AGENT)).toMatchObject({ completed: 1, failed: 1 });
  });

  it('refuses a second claim on one bounty that names a different agent', async () => {
    // The agent is not part of the key, so two events disagreeing about who did
    // the work cannot both be credited. Crediting the second is a guess about
    // which of the two claims is true, and the first one already holds the key.
    const { runtime, repository } = harness();

    await runtime.emit(completed('agent-a', 10_000, undefined, 'bounty-7'));
    await runtime.emit(completed('agent-b', 10_000, undefined, 'bounty-7'));

    expect(repository.rows.get('agent-a')).toMatchObject({ completed: 1, earnedCents: 10_000 });
    // No row at all for the second: a lost claim is a duplicate, and duplicates
    // are the routine case this key exists for, so they are silent. Stated here
    // because it is a real limit rather than an accident — a bounty whose two
    // deliveries disagree about the agent is indistinguishable from a repeat at
    // this seam, and nothing downstream is told which of the two it saw.
    expect(repository.rows.has('agent-b')).toBe(false);
    // One claim, not two. The key names the bounty and the kind and says
    // nothing about the agent, so the second agent's event could not take it.
    expect(repository.claims.size).toBe(1);
  });
});

describe('an outcome it cannot identify', () => {
  it('refuses an event naming no bounty, and says so on the record', async () => {
    // Fail-closed: an event that cannot be identified cannot be told from a
    // second copy of one already counted, so counting it is a coin toss that
    // lands on somebody's trust score. Not counted, and not silent either.
    const { runtime, repository, warnings } = harness();

    await runtime.emit({
      type: BOUNTY_COMPLETED,
      occurredAt: NOW,
      actorId: AGENT,
      payload: { agentId: AGENT, rewardCents: 10_000 },
    });

    expect(repository.rows.get(AGENT)).toMatchObject({ completed: 0, earnedCents: 0 });
    expect(repository.rows.get(AGENT)?.refusedOutcomes).toBe(1);
    expect(warnings).toEqual([expect.stringContaining('refused to count a bounty.completed')]);
  });

  it('refuses a blank bounty id, which is the same failure in another spelling', async () => {
    const { runtime, repository } = harness();

    for (const bountyId of ['', '   ', 7, null, undefined]) {
      await runtime.emit({
        type: BOUNTY_COMPLETED,
        occurredAt: NOW,
        actorId: AGENT,
        payload: { bountyId, agentId: AGENT, rewardCents: 10_000 },
      });
    }

    expect(repository.rows.get(AGENT)?.completed).toBe(0);
    // One each, so the count is a count of events refused rather than one
    // refusal that swallowed the rest.
    expect(repository.rows.get(AGENT)?.refusedOutcomes).toBe(5);
  });

  it('refuses a failure it cannot identify too, rather than charging it', async () => {
    // The same rule on the other handler. A refusal here is a penalty not
    // applied, which is the direction that a producer omitting an id could
    // exploit — so it is also the one that has to be visible, and it is why the
    // payload's bountyId is required rather than optional.
    const { runtime, repository } = harness();

    await runtime.emit({ type: BOUNTY_FAILED, occurredAt: NOW, actorId: AGENT, payload: { agentId: AGENT } });

    expect(repository.rows.get(AGENT)).toMatchObject({ failed: 0, refusedOutcomes: 1 });
  });

  it('still counts the same bounty once a real id is on the event', async () => {
    // Refusing is not a taint on the agent: a producer that starts naming the
    // bounty has fixed the problem, and the next delivery is a normal outcome.
    const { runtime, repository } = harness();

    await runtime.emit({
      type: BOUNTY_COMPLETED,
      occurredAt: NOW,
      actorId: AGENT,
      payload: { agentId: AGENT, rewardCents: 10_000 },
    });
    await runtime.emit(completed(AGENT, 10_000, undefined, 'bounty-7'));

    expect(repository.rows.get(AGENT)).toMatchObject({ completed: 1, earnedCents: 10_000 });
  });

  it('tells the caller, through the read they already make', async () => {
    const { runtime, repository } = harness();
    await runtime.emit({
      type: BOUNTY_COMPLETED,
      occurredAt: NOW,
      actorId: AGENT,
      payload: { agentId: AGENT, rewardCents: 10_000 },
    });

    const view = await runtime.runAction<unknown, { refusedOutcomes: number }>('reputation.read', {
      agentId: AGENT,
    });

    expect(view.refusedOutcomes).toBe(repository.rows.get(AGENT)?.refusedOutcomes);
    expect(view.refusedOutcomes).toBe(1);
  });

  it('reports an event it cannot even attribute, without a record to write on', async () => {
    // No agent means no row to hold a count, so the log is the only place this
    // can be seen. Said here because the two refusals are not the same event:
    // this one never had a record to belong to.
    const { runtime, repository, warnings } = harness();

    await runtime.emit({
      type: BOUNTY_COMPLETED,
      occurredAt: NOW,
      actorId: 'x',
      payload: { bountyId: 'bounty-7', rewardCents: 10_000 },
    });

    expect(repository.rows.size).toBe(0);
    expect(warnings).toEqual([expect.stringContaining('naming no agent')]);
  });
});

describe('battle.finished', () => {
  it('is neither handled nor claimed by this feature', async () => {
    // The no-op handler this bead removed stood in for behaviour nobody wrote:
    // it moved nothing, so it read as an implementation and was one. Its removal
    // is not only a deletion. `battle.finished` was in persistedEvents, and the
    // registry throws on a duplicate — so the day ba-feature-battle-fbt declares
    // the event it emits, this feature holding the name would make it fail to
    // install at all. That is the cost of leaving a no-op standing.
    const repository = new MapRepository();
    const store = new InMemoryStateStore();
    const runtime = createRuntime({
      extensions: [reputationFeature({ repository })],
      store,
      bus: createInMemoryEventBus(),
      now: () => NOW,
    });

    await runtime.emit({
      type: 'battle.finished',
      occurredAt: NOW,
      actorId: AGENT,
      payload: { agentId: AGENT, won: true },
    });

    // Nothing claimed it, so the event is nobody's to persist. With the name
    // back in persistedEvents this row appears, which is how the assertion is
    // known to be able to go red.
    expect(store.recorded()).toEqual([]);
    expect(repository.rows.size).toBe(0);
    // And the feature that will actually emit it can install.
    expect(() =>
      runtime.install({
        id: 'battle',
        persistedEvents: ['battle.finished'],
        capabilities: [{ name: 'battle.run', description: 'run a battle' }],
      }),
    ).not.toThrow();
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
    // What this proves is core's recomputation, NOT the integration the bead
    // asks for. `dependent` below is a literal written here: packages/features/
    // battle/src/index.ts is still `export {};` and ba-feature-battle-fbt is
    // blocked on this bead, so no feature in this tree declares
    // `requires: ['reputation.read']` and this test would stay green if battle
    // were never written. The literal is honest about being a stand-in, and the
    // day the real feature exists this assertion is replaced by installing it.
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

describe('a payload nobody checked', () => {
  // `reputation.gate` is the one place an unchecked payload reached a DECISION.
  // The tier lookup is a `Math.max` and a `<=`, so a missing reward arrived as
  // NaN, compared false against every band, fell through to the top one, and
  // told a character with no history that it could not take a legendary bounty.
  it('refuses a gate with no reward in it, rather than answering about NaN', async () => {
    const { runtime, repository } = harness();
    await repository.save(freshRecord(AGENT, NOW));

    for (const input of [
      { agentId: AGENT },
      { agentId: AGENT, rewardCents: '500' },
      { agentId: AGENT, rewardCents: null },
      { agentId: AGENT, rewardCents: NaN },
      { agentId: AGENT, rewardCents: Number.POSITIVE_INFINITY },
      { agentId: AGENT, rewardCents: -1 },
    ]) {
      await expect(runtime.runAction('reputation.gate', input)).rejects.toThrow(
        /reputation\.gate rejected/,
      );
    }

    expect(repository.reads).toBe(0);
  });

  it('names which half of a gate was refused', async () => {
    const { runtime } = harness();

    await expect(runtime.runAction('reputation.gate', {})).rejects.toThrow(
      /reputation\.gate rejected: agent-id-not-a-string/,
    );
    await expect(
      runtime.runAction('reputation.gate', { agentId: AGENT, rewardCents: {} }),
    ).rejects.toThrow(/reputation\.gate rejected: reward-cents-not-a-number/);
    await expect(
      runtime.runAction('reputation.gate', { agentId: AGENT, rewardCents: NaN }),
    ).rejects.toThrow(/reputation\.gate rejected: reward-cents-not-finite/);
    await expect(
      runtime.runAction('reputation.gate', { agentId: AGENT, rewardCents: -1 }),
    ).rejects.toThrow(/reputation\.gate rejected: reward-cents-negative/);
  });

  it('refuses a read that names no character, and still answers a real one', async () => {
    const { runtime, repository } = harness();

    for (const input of [{}, null, { agentId: 7 }, { agentId: '' }]) {
      await expect(runtime.runAction('reputation.read', input)).rejects.toThrow(
        /reputation\.read rejected/,
      );
    }
    expect(repository.reads).toBe(0);

    // A zero record is a real answer for an agent nobody has heard of, so the
    // guard has to leave that path alone: `find` is reached exactly once.
    await expect(
      runtime.runAction<{ agentId: string }, { trust: number }>('reputation.read', {
        agentId: AGENT,
      }),
    ).resolves.toMatchObject({ trust: 0 });
    expect(repository.reads).toBe(1);
  });

  it('agrees with the guard it is built from, on every verdict', () => {
    for (const [validator, guard] of [
      [whyReputationReadIsRejected, isReputationReadInput],
      [whyReputationGateIsRejected, isReputationGateInput],
    ] as const) {
      for (const input of [
        null,
        {},
        'agent-1',
        { agentId: 1 },
        { agentId: '' },
        { rewardCents: NaN },
      ]) {
        expect(guard(input), String(input)).toBe(validator(input) === undefined);
      }
    }
  });
});
