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
