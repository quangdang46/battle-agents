import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameFeature } from '@battle-agents/core';

import {
  isReputationGateInput,
  isReputationReadInput,
  REPUTATION_GATE_SHAPE,
  REPUTATION_READ_SHAPE,
  reputationInputRejected,
  whyReputationGateIsRejected,
  whyReputationReadIsRejected,
  type ReputationRecord,
} from './domain.js';
import { freshRecord, type ReputationRepository } from './repository.js';
import { BOUNTY_TIERS, mayAcceptBounty, summarise, trustScore } from './rules.js';

/**
 * Reputation, as a capability provider.
 *
 * Nothing here decides that a bounty was completed — the bounty feature does,
 * and announces it on the bus. This feature listens, updates a record, and makes
 * the result gateable. That is the whole reason features cannot import one
 * another: the reaction IS the contract, and a reputation that reached into the
 * bounty feature for its data would make the two impossible to remove
 * separately.
 */

/** The capability other features declare in `requires` to gate on trust. */
export const REPUTATION_READ = 'reputation.read';
export const REPUTATION_GATE = 'reputation.gate';

/** The outcomes this feature reacts to, named here so the two sides cannot drift. */
export const BOUNTY_COMPLETED = 'bounty.completed';
export const BOUNTY_FAILED = 'bounty.failed';
export const BATTLE_FINISHED = 'battle.finished';

export interface BountyCompletedPayload {
  readonly agentId: string;
  readonly rewardCents: number;
  /** 0..5, when the maintainer gave one. Absent means "not reviewed". */
  readonly reviewScore?: number;
}

export interface BountyFailedPayload {
  readonly agentId: string;
  /** True when the solver walked away rather than being rejected. */
  readonly abandoned?: boolean;
}

export interface BattleFinishedPayload {
  readonly agentId: string;
  readonly won: boolean;
}

/** What a caller is told. No XP, no level, no skills: this is trust. */
export interface ReputationView {
  readonly agentId: string;
  readonly trust: number;
  readonly tier: string;
  readonly completed: number;
  readonly failed: number;
  readonly earnedCents: number;
}

/** The bands, so a client can render the ladder without hardcoding it. */
export interface TierView {
  readonly name: string;
  readonly minTrust: number;
  readonly maxRewardCents: number;
}

export function reputationFeature(dependencies: {
  readonly repository: ReputationRepository;
}): GameFeature {
  const { repository } = dependencies;

  return {
    id: 'reputation',
    persistedEvents: [BOUNTY_COMPLETED, BOUNTY_FAILED, BATTLE_FINISHED],
    capabilities: [
      { name: REPUTATION_READ, description: "Read one character's trust and tier." },
      { name: REPUTATION_GATE, description: 'Ask whether a character may take a bounty.' },
    ],
    eventHandlers: [
      onBountyCompleted(repository),
      onBountyFailed(repository),
      onBattleFinished(repository),
    ],
    actionDefs: [
      // The two actions that read a payload take `unknown` and are guarded. The
      // annotation they used to carry was never checked: `act()` hands the
      // payload through as a generic, so `act('reputation.gate', { agentId })`
      // reached the tier lookup with `rewardCents` undefined. `reputation.tiers`
      // has no payload and so nothing to guard.
      defineAction({
        id: REPUTATION_READ,
        permissions: [REPUTATION_READ],
        run: async (input: unknown) => {
          if (!isReputationReadInput(input)) {
            throw reputationInputRejected(
              REPUTATION_READ,
              whyReputationReadIsRejected(input) ?? { reason: 'not-an-object' },
              REPUTATION_READ_SHAPE,
            );
          }
          const record = await load(repository, input.agentId);
          const view = summarise(record);
          return {
            agentId: view.agentId,
            trust: view.trust,
            tier: view.tier,
            completed: view.completed,
            failed: view.failed,
            earnedCents: view.earnedCents,
          } satisfies ReputationView;
        },
      }),
      defineAction({
        id: REPUTATION_GATE,
        permissions: [REPUTATION_GATE],
        run: async (input: unknown) => {
          if (!isReputationGateInput(input)) {
            throw reputationInputRejected(
              REPUTATION_GATE,
              whyReputationGateIsRejected(input) ?? { reason: 'not-an-object' },
              REPUTATION_GATE_SHAPE,
            );
          }
          const record = await load(repository, input.agentId);
          return {
            agentId: input.agentId,
            rewardCents: input.rewardCents,
            allowed: mayAcceptBounty(input.rewardCents, trustScore(record)),
            trust: trustScore(record),
          };
        },
      }),
      defineAction({
        id: 'reputation.tiers',
        permissions: [REPUTATION_READ],
        run: async () =>
          BOUNTY_TIERS.map<TierView>((tier) => ({
            name: tier.name,
            minTrust: tier.minTrust,
            maxRewardCents: tier.maxRewardCents,
          })),
      }),
    ],
  };
}

/**
 * A record for an agent who has none yet.
 *
 * Zero, not undefined: the gates have to answer for everybody, including the
 * agent who is about to try their first bounty, and an absent record would make
 * the simplest question the platform asks unanswerable.
 */
async function load(repository: ReputationRepository, agentId: string): Promise<ReputationRecord> {
  return (await repository.find(agentId)) ?? freshRecord(agentId, new Date(0).toISOString());
}

function onBountyCompleted(repository: ReputationRepository): EventHandler {
  return {
    on: BOUNTY_COMPLETED,
    async handle(event, context) {
      const payload = event.payload as BountyCompletedPayload;
      if (typeof payload.agentId !== 'string') {
        return;
      }
      const record = await load(repository, payload.agentId);
      const submitted = record.completed + record.failed;
      const accepted = record.completed + 1;
      await repository.save({
        ...record,
        completed: accepted,
        earnedCents: record.earnedCents + rewardOf(payload),
        // A running mean over SUBMISSIONS, not over accepted work: mixing the
        // two makes the rate jump whenever a failure is recorded and fall back
        // whenever one is cleared, which is a history of sawtooth rather than a
        // measure of anything.
        acceptanceRate: accepted / (submitted + 1),
        reviewScore: blendReview(record.reviewScore, accepted, payload.reviewScore),
        updatedAt: context.now(),
      });
    },
  };
}

function onBountyFailed(repository: ReputationRepository): EventHandler {
  return {
    on: BOUNTY_FAILED,
    async handle(event, context) {
      const payload = event.payload as BountyFailedPayload;
      if (typeof payload.agentId !== 'string') {
        return;
      }
      const record = await load(repository, payload.agentId);
      const submitted = record.completed + record.failed;
      await repository.save({
        ...record,
        failed: record.failed + 1,
        acceptanceRate: record.completed / (submitted + 1),
        updatedAt: context.now(),
      });
    },
  };
}

/**
 * A battle is evidence about the agent, but a weak one.
 *
 * It moves nothing: the count, the acceptance rate and the earnings are all
 * about bounties, and letting a win nudge trust would let somebody grind
 * reputation by fighting rather than by shipping. A loss is likewise free,
 * because the plan is explicit that a character must be able to fail.
 */
function onBattleFinished(_repository: ReputationRepository): EventHandler {
  return { on: BATTLE_FINISHED, async handle() {} };
}

/** An absent or non-numeric reward is zero, not NaN. */
function rewardOf(payload: BountyCompletedPayload): number {
  return typeof payload.rewardCents === 'number' && Number.isFinite(payload.rewardCents)
    ? Math.max(0, Math.round(payload.rewardCents))
    : 0;
}

/**
 * A running mean of the review scores that actually exist.
 *
 * A submission with no review leaves the mean alone rather than counting as a
 * zero, because an unreviewed PR is missing information and a score of zero is
 * a judgement that the work was the worst thing submitted.
 */
function blendReview(current: number, count: number, incoming: number | undefined): number {
  if (incoming === undefined || !Number.isFinite(incoming)) {
    return current;
  }
  const score = Math.min(5, Math.max(0, incoming));
  return (current * Math.max(0, count - 1) + score) / count;
}
