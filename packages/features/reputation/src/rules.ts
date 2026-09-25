import {
  MAX_REVIEW_SCORE,
  type BountyTier,
  type ReputationRecord,
  type ReputationSummary,
  type TierName,
} from './domain.js';

/**
 * The trust formula and the tier gates, as pure functions.
 *
 * Everything here is a function of a record, with no clock, no storage and no
 * event bus. That is what makes the gates testable at their exact boundaries
 * and safe to reorder: a rule that can only be exercised by running a whole
 * bounty through a database is a rule nobody checks.
 */

const TRUST_PER_COMPLETED = 100;
const TRUST_PER_EARNED_DOLLAR = 0.5;
const TRUST_PER_ACCEPTANCE = 10;
const TRUST_PER_REVIEW_POINT = 2;
const TRUST_PENALTY_PER_FAILURE = 150;
const TRUST_FLOOR = 0;

/**
 * Trust, as a number other features can gate on.
 *
 * Each weight is a judgement about which outcome should matter more, written
 * down so a disagreement can be argued about rather than inferred from a
 * constant:
 *
 *   accepted work dominates, because it is the only signal here that anybody
 *     other than the solver is willing to vouch for;
 *   earnings come next, at half a point per dollar — enough that volume and
 *     value are not the same thing, not so much that one large bounty
 *     outranks a long record of small accepted ones;
 *   acceptance and review adjust that total rather than forming it, because
 *     they are rates: a 100% acceptance rate on two submissions is not
 *     evidence of anything;
 *   a failure subtracts more than an acceptance adds, because a rejected PR
 *     costs a maintainer their time as well as the solver theirs.
 *
 * The plan's worked example — 47 done, $8420 earned, 91% acceptance, 4.7 review
 * — lands at 8929 here, which is the shape of figure the plan was reaching for.
 * It is illustrative rather than a specification, so the numbers below are
 * chosen for a reason and written down, not reverse-engineered to reproduce the
 * plan's own 8,921. The one is not the other: they differ by eight points, and
 * rules.test.ts pins the total so a weight change fails a test rather than
 * leaving this line quietly wrong.
 */
export function trustScore(record: ReputationRecord): number {
  const earned = Math.max(0, record.earnedCents) / 100;
  const acceptance = clamp(record.acceptanceRate, 0, 1);
  const review = clamp(record.reviewScore, 0, MAX_REVIEW_SCORE);

  const total =
    Math.max(0, record.completed) * TRUST_PER_COMPLETED +
    earned * TRUST_PER_EARNED_DOLLAR +
    acceptance * TRUST_PER_ACCEPTANCE +
    review * TRUST_PER_REVIEW_POINT -
    Math.max(0, record.failed) * TRUST_PENALTY_PER_FAILURE;

  return Math.max(TRUST_FLOOR, Math.round(total));
}

/**
 * The bands, by reward size rather than by trust.
 *
 * The plan's tiers name a reward range each, so the band a bounty falls in is
 * a fact about the bounty, and the only question is whether the agent has
 * earned the right to take it. Gating on trust alone would let a legendary
 * agent take a $5 chore, which is not what the tiers mean: newcomers grind
 * easy bounties upward, which implies the value of the work tracks the trust.
 *
 * The amounts are this project's own bands, not market rates. The plan is
 * explicit that GitHub's security programme reward guidelines are specific to
 * that programme and do not generalise, so nothing here should be presented as
 * what open-source work is worth.
 */
export const BOUNTY_TIERS: readonly BountyTier[] = Object.freeze([
  { name: 'beginner', minTrust: 0, minRewardCents: 500, maxRewardCents: 2_500 },
  { name: 'intermediate', minTrust: 1_000, minRewardCents: 2_501, maxRewardCents: 20_000 },
  { name: 'advanced', minTrust: 5_000, minRewardCents: 20_001, maxRewardCents: 100_000 },
  {
    name: 'legendary',
    minTrust: 25_000,
    minRewardCents: 100_001,
    maxRewardCents: Number.MAX_SAFE_INTEGER,
  },
]);

/**
 * The band a reward falls in.
 *
 * A reward below the lowest band is still beginner work, because "too easy to
 * be worth gating" is not a reason to refuse somebody their first bounty — it
 * is the only kind most new agents can see.
 */
export function tierForReward(rewardCents: number): BountyTier {
  const reward = Math.max(0, rewardCents);
  return BOUNTY_TIERS.find((tier) => reward <= tier.maxRewardCents) ?? last(BOUNTY_TIERS);
}

/** The highest band this much trust has opened. */
export function tierForTrust(trust: number): BountyTier {
  return [...BOUNTY_TIERS].reverse().find((tier) => trust >= tier.minTrust) ?? first(BOUNTY_TIERS);
}

/**
 * Whether an agent with this trust may take a bounty worth this much.
 *
 * The one gate other features need, and the reason this feature is a capability
 * provider: a feature that wants to gate on trust declares
 * `requires: ['reputation.read']` and degrades to open when this one is gone,
 * rather than importing it and coupling the two for good.
 */
export function mayAcceptBounty(rewardCents: number, trust: number): boolean {
  return trust >= tierForReward(rewardCents).minTrust;
}

export function summarise(record: ReputationRecord): ReputationSummary {
  const trust = trustScore(record);
  return {
    agentId: record.agentId,
    trust,
    tier: tierForTrust(trust).name,
    completed: record.completed,
    failed: record.failed,
    earnedCents: record.earnedCents,
  };
}

/** True when a character is in this band. Not the gate — a question about identity. */
export function isInTier(record: ReputationRecord, tier: TierName): boolean {
  return tierForTrust(trustScore(record)).name === tier;
}

function clamp(value: number, low: number, high: number): number {
  if (Number.isNaN(value)) {
    return low;
  }
  return Math.min(high, Math.max(low, value));
}

function first<T>(items: readonly T[]): T {
  const [firstItem] = items;
  if (firstItem === undefined) {
    throw new Error('BOUNTY_TIERS is empty; a tier table with no bands gates nothing');
  }
  return firstItem;
}

function last<T>(items: readonly T[]): T {
  const lastItem = items[items.length - 1];
  if (lastItem === undefined) {
    throw new Error('BOUNTY_TIERS is empty; a tier table with no bands gates nothing');
  }
  return lastItem;
}
