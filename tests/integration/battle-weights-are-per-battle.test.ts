import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { DEFAULT_BATTLE_WEIGHTS, type BattleWeights } from '@battle-agents/battle';
import { agents, installations, sessions, users } from '@battle-agents/db';

import { sharedRuntime } from '../../apps/web/src/shared-runtime.js';

/**
 * Plan §17.4: the judge weights are published PER MATCH, and that is both a
 * fairness property and a trust property — a hidden rubric is indistinguishable
 * from a rigged one.
 *
 * Nothing checked it. Every judge test in the tree opened a battle with
 * DEFAULT_BATTLE_WEIGHTS, which is exactly the condition under which a judge
 * reading the plan defaults instead of the battle's own weights would pass every
 * test in the suite. The weights are stored per battle and the judge takes them
 * as an argument, so a judge that ignored both would look identical to a correct
 * one as long as no test ever opened two battles that disagreed.
 *
 * So the asymmetry IS the test: two battles, two different rubrics, each read
 * back as its own. A single-battle assertion is satisfied by a constant, and a
 * constant is the failure.
 *
 * Through the real composition root and the real Drizzle repository, not a
 * double. "The weights are stored per battle" is a claim about persistence, and
 * a stub that returns what it was handed proves nothing about storage.
 */

const SPEED: BattleWeights = Object.freeze({
  correctness: 0.5,
  tests: 0.2,
  regression: 0.1,
  quality: 0.05,
  efficiency: 0.15,
});

const QUALITY: BattleWeights = Object.freeze({
  correctness: 0.2,
  tests: 0.2,
  regression: 0.1,
  quality: 0.4,
  efficiency: 0.1,
});

async function aSession(): Promise<string> {
  const { database } = await sharedRuntime();
  const githubId = `${randomUUID()}-weights-owner`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  // A real installation, because sessions.installation_id is a foreign key and
  // a fixture that invents one fails on the constraint rather than on the thing
  // it is here to test.
  const [installation] = await database
    .insert(installations)
    .values({ userId: owner?.id ?? '', installationKey: `weights-${randomUUID()}` })
    .returning({ id: installations.id });
  const [agent] = await database
    .insert(agents)
    .values({ userId: owner?.id ?? '', name: `weights-${randomUUID()}`, harness: 'claude' })
    .returning({ id: agents.id });
  const [row] = await database
    .insert(sessions)
    .values({
      agentId: agent?.id ?? '',
      installationId: installation?.id ?? '',
      status: 'disconnected',
      // Satisfied rather than worked around: the schema carries a real CHECK
      // (sessions_disconnected_has_ended_at) saying a disconnected session has
      // ended, and a fixture that ignores it teaches the next reader that the
      // constraint is advisory.
      endedAt: new Date(),
    })
    .returning({ id: sessions.id });
  return row?.id ?? '';
}

/** What `battle.weights` answers with, read from the tree rather than assumed. */
interface WeightsReply {
  readonly battleId: string;
  readonly criteria: readonly string[];
  readonly published: boolean;
  readonly status: string;
  readonly weights: BattleWeights;
}

describe('the judge rubric is per match, not a plan default', () => {
  it('reads back each battle’s own weights when two battles disagree', async () => {
    const { createApplicationApi } = await import('@battle-agents/api');
    const { runtime } = await sharedRuntime();
    const api = createApplicationApi(runtime);

    const speedSession = await aSession();
    const qualitySession = await aSession();

    const speed = (await api.act('battle.create', {
      sessionId: speedSession,
      mode: 'speed',
      weights: SPEED,
    })) as { readonly id: string };
    const quality = (await api.act('battle.create', {
      sessionId: qualitySession,
      mode: 'quality',
      weights: QUALITY,
    })) as { readonly id: string };

    const speedReply = (await api.act('battle.weights', {
      battleId: speed.id,
    })) as WeightsReply;
    const qualityReply = (await api.act('battle.weights', {
      battleId: quality.id,
    })) as WeightsReply;

    // The whole set, not one convenient number: a judge that read
    // `correctness` correctly and everything else from a constant would pass a
    // field-by-field check on the wrong field.
    expect(speedReply.weights).toEqual(SPEED);
    expect(qualityReply.weights).toEqual(QUALITY);
    expect(speedReply.weights).not.toEqual(qualityReply.weights);

    // And neither is the plan default, which is the failure this exists for.
    expect(speedReply.weights).not.toEqual(DEFAULT_BATTLE_WEIGHTS);
    expect(qualityReply.weights).not.toEqual(DEFAULT_BATTLE_WEIGHTS);

    // §17.4 puts publication BEFORE the verdict, and the reply carries the
    // evidence rather than the claim: `published` and a `status` of `running` on
    // a match nobody has judged yet. A rubric readable only afterwards has not
    // been published to anyone who could object to it.
    expect(speedReply.published).toBe(true);
    expect(speedReply.status).toBe('running');
    expect(qualityReply.published).toBe(true);
    expect(qualityReply.status).toBe('running');
    // The criteria are named, so a viewer is told what it is being scored on
    // rather than handed five numbers and a guess.
    expect(speedReply.criteria).toEqual([
      'correctness',
      'tests',
      'regression',
      'quality',
      'efficiency',
    ]);
  });

  it('uses two rubrics that are neither the other nor the plan default', () => {
    // So the first test cannot pass by two battles happening to share a
    // constant, and cannot pass by a judge that ignored both arguments and
    // answered DEFAULT_BATTLE_WEIGHTS for each.
    expect(SPEED).not.toEqual(QUALITY);
    expect(SPEED).not.toEqual(DEFAULT_BATTLE_WEIGHTS);
    expect(QUALITY).not.toEqual(DEFAULT_BATTLE_WEIGHTS);
  });
});
