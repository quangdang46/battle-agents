/**
 * Reputation: social and economic trust, derived from outcomes.
 *
 * Plan section 10.2 splits three things that are easy to confuse, and this
 * feature is the second one:
 *
 *   XP / Level   progression — how far a character has come
 *   Reputation   trust — whether anybody should hand it a $500 bounty
 *   Stats        facts — 47 merged, 12 abandoned
 *
 * They are separate on purpose. Folding reputation into the level curve makes
 * a character that lost a bounty unable to improve, and folding XP into
 * reputation makes a popular agent able to skip the work. The one guarantee
 * this feature makes is that nothing here writes an XP value: the record below
 * has no field for one, and a test says so.
 */

/**
 * Everything trust is computed from.
 *
 * Counts, not a cached score. The score is derived so a record cannot drift
 * out of agreement with the outcomes that produced it, and so a disputed
 * outcome is corrected by recomputing rather than by a migration.
 */
export interface ReputationRecord {
  readonly agentId: string;
  /** Bounties whose work was accepted. */
  readonly completed: number;
  /** Bounties that were abandoned or rejected. */
  readonly failed: number;
  /**
   * Share of submitted work that was accepted, 0..1.
   *
   * Held rather than derived from completed/failed, because a submission that
   * is still under review is neither: it is a fact about submissions, and
   * folding it into the ratio would quietly move every agent's trust whenever
   * someone queued a new one.
   */
  readonly acceptanceRate: number;
  /**
   * Mean review quality, 0..5.
   *
   * A 0..5 scale rather than a percentage because that is what reviewers
   * actually give, and storing a percentage means every review has to be
   * re-expressed before it can be compared with the last one.
   */
  readonly reviewScore: number;
  /** Lifetime earnings in whole cents. Integer money, never a float. */
  readonly earnedCents: number;
  readonly updatedAt: string;
}

/** Bounty bands, named for the plan's tiers rather than invented here. */
export const TIER_NAMES = ['beginner', 'intermediate', 'advanced', 'legendary'] as const;
export type TierName = (typeof TIER_NAMES)[number];

export interface BountyTier {
  readonly name: TierName;
  /** The trust at which this band opens. A tier is a floor, not a ceiling. */
  readonly minTrust: number;
  /** The lowest reward this band covers, in cents. */
  readonly minRewardCents: number;
  /** The highest reward this band covers, in cents, inclusive. */
  readonly maxRewardCents: number;
}

/** The review scale's top. Used to clamp a mean that a bad import inflated. */
export const MAX_REVIEW_SCORE = 5;

/** What a caller is allowed to see about a character. */
export interface ReputationSummary {
  readonly agentId: string;
  readonly trust: number;
  readonly tier: TierName;
  readonly completed: number;
  readonly failed: number;
  readonly earnedCents: number;
}

/* ───────────────────────────── the two actions that read a payload ───────────────────────────── */

/**
 * Every way this feature refuses a payload, or undefined when it accepts one.
 *
 * One union across both reading actions: the reason exists to be written into a
 * sentence, and a caller that wanted to know WHICH action it was had just named
 * it.
 */
export type ReputationRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'agent-id-not-a-string' }
  | { readonly reason: 'agent-id-empty' }
  | { readonly reason: 'reward-cents-not-a-number' }
  | { readonly reason: 'reward-cents-not-finite' }
  | { readonly reason: 'reward-cents-negative' };

/** The character a read or a gate is about. */
export interface ReputationReadInput {
  readonly agentId: string;
}

/** A gate is a read plus the bounty being asked about. */
export interface ReputationGateInput extends ReputationReadInput {
  readonly rewardCents: number;
}

/** Why a read cannot be asked for, or undefined when it can. */
export function whyReputationReadIsRejected(input: unknown): ReputationRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  return whyAgentIdIsMissing((input as { readonly agentId?: unknown }).agentId);
}

/**
 * Why a gate cannot be asked for, or undefined when it can.
 *
 * This is the payload that mattered most. `rewardCents` went into
 * `tierForReward`, which is a `Math.max` and a `<=` — so a missing reward
 * arrived as `NaN`, compared false against every band, fell through to the top
 * one, and reported a legendary bounty to a character with no history. A gate
 * that denies for the wrong reason still gets wrapped in a try/catch by the
 * caller, and a reward of `'500'` coerced through it to the same band as the
 * number 500, which is an answer about a string nobody meant to send.
 */
export function whyReputationGateIsRejected(input: unknown): ReputationRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  const { agentId, rewardCents } = input as {
    readonly agentId?: unknown;
    readonly rewardCents?: unknown;
  };

  const missing = whyAgentIdIsMissing(agentId);
  if (missing !== undefined) {
    return missing;
  }
  if (typeof rewardCents !== 'number') {
    return { reason: 'reward-cents-not-a-number' };
  }
  // NaN is the failure that matters: it survives `typeof` and reaches the tier
  // lookup, where every comparison against it is false.
  if (!Number.isFinite(rewardCents)) {
    return { reason: 'reward-cents-not-finite' };
  }
  if (rewardCents < 0) {
    return { reason: 'reward-cents-negative' };
  }
  return undefined;
}

/** The same two judgements, as guards, so no read below them needs a cast. */
export function isReputationReadInput(input: unknown): input is ReputationReadInput {
  return whyReputationReadIsRejected(input) === undefined;
}

export function isReputationGateInput(input: unknown): input is ReputationGateInput {
  return whyReputationGateIsRejected(input) === undefined;
}

/** What each action wanted, as a sentence the caller can act on. */
export const REPUTATION_READ_SHAPE = 'A read takes an agentId, which must be a non-empty string.';
export const REPUTATION_GATE_SHAPE =
  'A gate takes an agentId, which must be a non-empty string, and a rewardCents, which must be a finite number that is not negative.';

/**
 * The error a refused payload becomes.
 *
 * Built from the verdict, never from the payload: the caller guaranteed to be
 * handed the answer is the one that must not be reading the input.
 */
export function reputationInputRejected(
  action: string,
  rejection: ReputationRejection,
  expected: string,
): Error {
  return Object.assign(new Error(`${action} rejected: ${rejection.reason}. ${expected}`), {
    code: 'malformed-input',
  });
}

/** Shared so the two actions that name an agent cannot disagree about one. */
function whyAgentIdIsMissing(agentId: unknown): ReputationRejection | undefined {
  if (typeof agentId !== 'string') {
    return { reason: 'agent-id-not-a-string' };
  }
  if (agentId.length === 0) {
    return { reason: 'agent-id-empty' };
  }
  return undefined;
}
