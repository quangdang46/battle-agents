import { describe, expect, it } from 'vitest';

import type { ReputationRecord } from './domain.js';
import { freshRecord } from './repository.js';
import {
  BOUNTY_TIERS,
  isInTier,
  mayAcceptBounty,
  summarise,
  tierForReward,
  tierForTrust,
  trustScore,
} from './rules.js';

const NOW = '2026-09-24T12:00:00.000Z';

function record(overrides: Partial<ReputationRecord> = {}): ReputationRecord {
  return {
    agentId: 'agent-1',
    completed: 0,
    failed: 0,
    acceptanceRate: 0,
    reviewScore: 0,
    earnedCents: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

/** The plan's worked example, used here to show the formula's shape. */
const THE_PLANS_AGENT = record({
  completed: 47,
  failed: 0,
  acceptanceRate: 0.91,
  reviewScore: 4.7,
  earnedCents: 842_000,
});

describe('the trust formula', () => {
  it('scores a new agent at zero rather than at a negative number', () => {
    // A first agent who fails must still be able to take beginner work. A
    // negative score would put them below the floor of every tier.
    expect(trustScore(record({ failed: 3 }))).toBe(0);
  });

  it('rewards accepted work above all else', () => {
    const tenAccepted = record({ completed: 10 });
    const tenWorthALot = record({ earnedCents: 100_000 });

    expect(trustScore(tenAccepted)).toBeGreaterThan(trustScore(tenWorthALot));
  });

  it('does not let earnings alone outrank a record of small accepted work', () => {
    // Otherwise one lucky large bounty would make a character more trusted than
    // someone who has shipped fifty PRs, which is not what trust means.
    // Fifty accepted PRs is 5000 points; the plan example of $8,420 earned is
    // 4210. Fifty of the former beats the whole of the latter, which is the
    // property worth stating — a tie at $10,000 would prove nothing.
    const fiftyShipped = record({ completed: 50 });
    const eightThousand = record({ earnedCents: 842_000 });

    expect(trustScore(fiftyShipped)).toBeGreaterThan(trustScore(eightThousand));
  });

  it('penalises a failure more than an acceptance rewards', () => {
    const lostOne = trustScore(record({ failed: 1 }));
    const wonOne = trustScore(record({ completed: 1 }));

    expect(lostOne).toBeLessThan(wonOne);
  });

  it('lands on the exact total the comment above it names', () => {
    // The plan's 47 done / $8420 / 91% / 4.7 is illustrative, not a spec, but
    // the rules.ts comment states the figure this input produces, and a band of
    // 5,000..25,000 lets that figure drift by a factor of five without failing
    // anything. Asserting the exact total is what makes the comment a claim
    // somebody checked.
    expect(trustScore(THE_PLANS_AGENT)).toBe(8_929);
  });

  it('clamps a rate or a review score that arrived out of range', () => {
    const inflated = record({ acceptanceRate: 4.2, reviewScore: 99 });

    expect(trustScore(inflated)).toBe(trustScore(record({ acceptanceRate: 1, reviewScore: 5 })));
  });

  it('treats a NaN rate as zero rather than poisoning the total', () => {
    expect(trustScore(record({ acceptanceRate: Number.NaN }))).toBe(0);
  });
});

describe('tier boundaries', () => {
  it('places a reward in the band its size names', () => {
    expect(tierForReward(500).name).toBe('beginner');
    expect(tierForReward(2_500).name).toBe('beginner');
    expect(tierForReward(2_501).name).toBe('intermediate');
    expect(tierForReward(20_000).name).toBe('intermediate');
    expect(tierForReward(20_001).name).toBe('advanced');
    expect(tierForReward(100_000).name).toBe('advanced');
    expect(tierForReward(100_001).name).toBe('legendary');
  });

  it('calls a reward below the first band beginner work rather than refusing it', () => {
    // "Too easy to be worth gating" is not a reason to lock somebody out of
    // their first bounty, which is the only kind most of them can see.
    expect(tierForReward(1).name).toBe('beginner');
  });

  it('opens the next band exactly at its threshold', () => {
    for (const tier of BOUNTY_TIERS) {
      expect(tierForTrust(tier.minTrust).name).toBe(tier.name);
      if (tier.minTrust > 0) {
        expect(tierForTrust(tier.minTrust - 1).name).not.toBe(tier.name);
      }
    }
  });

  it('answers who is in a band', () => {
    // Exactly on the legendary threshold: 250 accepted at 100 each is 25000.
    const trusted = record({
      completed: 250,
      earnedCents: 1_000_000,
      acceptanceRate: 1,
      reviewScore: 5,
    });

    expect(isInTier(trusted, 'legendary')).toBe(true);
    expect(isInTier(record(), 'beginner')).toBe(true);
    expect(isInTier(record(), 'legendary')).toBe(false);
  });
});

describe('the gate', () => {
  it('lets a new agent take beginner work and nothing above it', () => {
    expect(mayAcceptBounty(1_000, 0)).toBe(true);
    expect(mayAcceptBounty(10_000, 0)).toBe(false);
  });

  it('opens intermediate at exactly its threshold, not a point before', () => {
    const band = tierForReward(10_000);

    expect(mayAcceptBounty(10_000, band.minTrust - 1)).toBe(false);
    expect(mayAcceptBounty(10_000, band.minTrust)).toBe(true);
  });

  it('does not stop a trusted agent taking easy work', () => {
    // Gating on tier membership rather than on the band the bounty falls in
    // would make a legendary agent unable to pick up a $5 chore, which is not
    // what the plan's tiers mean.
    expect(mayAcceptBounty(500, 40_000)).toBe(true);
  });
});

describe('reputation is not progression', () => {
  it('builds a record with no XP or level field in it', () => {
    // The one conflation plan section 10.2 warns about, checked on the record the
    // feature actually builds rather than on one a test assembled by hand —
    // asserting against a record the test itself gave an 'xp' field to
    // proves nothing except that the spread worked.
    const keys = Object.keys(freshRecord('agent-1', NOW)).sort();

    expect(keys).toEqual([
      'acceptanceRate',
      'agentId',
      'completed',
      'earnedCents',
      'failed',
      'reviewScore',
      'updatedAt',
    ]);
  });

  it('reports trust and tier, never a level', () => {
    const view = summarise(THE_PLANS_AGENT);

    expect(Object.keys(view).sort()).toEqual([
      'agentId',
      'completed',
      'earnedCents',
      'failed',
      'tier',
      'trust',
    ]);
  });
});
