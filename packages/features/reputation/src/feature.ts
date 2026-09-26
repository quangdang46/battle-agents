import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameFeature, RuntimeContext } from '@battle-agents/core';

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
import {
  freshRecord,
  type ReputationOutcome,
  type ReputationOutcomeKind,
  type ReputationRepository,
} from './repository.js';
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

export interface BountyCompletedPayload {
  /**
   * Which bounty was completed, and the only thing in this payload that makes a
   * second telling of the same outcome recognisable as the same one.
   *
   * Required rather than optional because GitHub delivers at least once, and
   * the event log this feature reads is replayable. Without it the second
   * delivery is a new fact: an agent whose reputation climbs because a webhook
   * arrived twice is a trust signal nobody can rely on, which is the whole
   * purpose of the number. The bounty feature already emits it
   * (features/bounty/src/merge.ts), so nothing has to be produced to satisfy
   * this — only honoured.
   */
  readonly bountyId: string;
  readonly agentId: string;
  readonly rewardCents: number;
  /** 0..5, when the maintainer gave one. Absent means "not reviewed". */
  readonly reviewScore?: number;
}

export interface BountyFailedPayload {
  /** As above, and for the same reason: a failure is counted too. */
  readonly bountyId: string;
  readonly agentId: string;
  /** True when the solver walked away rather than being rejected. */
  readonly abandoned?: boolean;
}

/** What a caller is told. No XP, no level, no skills: this is trust. */
export interface ReputationView {
  readonly agentId: string;
  readonly trust: number;
  readonly tier: string;
  readonly completed: number;
  readonly failed: number;
  readonly earnedCents: number;
  /** Outcomes refused because they could not be told from a repeat. */
  readonly refusedOutcomes: number;
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
    // `bounty.completed` is NOT declared here, and ba-feature-bounty-xhk is why.
    // The registry allows one owner per persisted event type, and the owner is
    // the feature that EMITS it: bounty emits a completion, this feature reacts
    // to one, and a declaration by the reactor is a claim about somebody else's
    // event. The event is still persisted — bounty declares it, and
    // `isPersistedEventType` asks the registry rather than the reactor. The
    // HANDLER above is unchanged, because reacting and owning are different
    // jobs and only one of them is this feature's.
    //
    // `battle.finished` was here and is not, for the same reason one step
    // further on. Nothing emits it, and a name nobody emits has no business
    // being owned here: FeatureRegistry.register throws on a duplicate, so
    // holding the name would make ba-feature-battle-fbt fail to install on the
    // day it declares the event it does emit.
    //
    // `bounty.failed` is the remaining exception and it is a real one: nothing
    // emits that either, and the same argument applies. It is left as it was
    // found rather than tidied, because changing what gets persisted for an
    // event another feature may be about to emit is not this bead's decision to
    // make. The tension is recorded rather than resolved.
    persistedEvents: [BOUNTY_FAILED],
    capabilities: [
      { name: REPUTATION_READ, description: "Read one character's trust and tier." },
      { name: REPUTATION_GATE, description: 'Ask whether a character may take a bounty.' },
    ],
    eventHandlers: [onBountyCompleted(repository), onBountyFailed(repository)],
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
            // Not part of the trust number and not filtered out of the view. A
            // caller asking how trusted somebody is has just been told a figure
            // this feature chose not to act on part of the evidence for, and
            // leaving that out of the view is how a reputation stops being
            // auditable.
            refusedOutcomes: record.refusedOutcomes,
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
      const admission = await admit(repository, BOUNTY_COMPLETED, payload, 'completed', context);
      if (!admission.admitted) {
        // `admit` has already recognised a repeat or counted a refusal. Nothing
        // more can be done about an outcome that cannot be identified, and the
        // one thing that must not happen is counting it.
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
      const admission = await admit(repository, BOUNTY_FAILED, payload, 'failed', context);
      if (!admission.admitted) {
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
 * The three answers to "may this event move a number", and the only place any
 * of them is decided.
 *
 * Both handlers go through here because the double-count this bead is about is
 * not a bug in either handler's arithmetic — it is both of them adding to a
 * record they cannot tell is already there. One gate, one rule.
 *
 *   no agent          nothing to attribute the event to, so there is no record
 *                     to write a refusal on. Logged, because an event nobody
 *                     can place is still an event somebody emitted.
 *   no bounty id      the event cannot be identified, and an event that cannot
 *                     be identified cannot be told from a second copy of an
 *                     outcome already counted. Not counted, and counted as
 *                     refused, because guessing is the failure mode.
 *   already claimed   the outcome is in the record. Silent: this is the
 *                     duplicate delivery the claim exists for, and a warning on
 *                     every one of them would train a reader to ignore the
 *                     warnings that matter.
 */
async function admit(
  repository: ReputationRepository,
  eventType: string,
  payload: { readonly agentId?: unknown; readonly bountyId?: unknown },
  kind: ReputationOutcomeKind,
  context: RuntimeContext,
): Promise<{ readonly admitted: true } | { readonly admitted: false }> {
  const agentId = payload.agentId;
  if (typeof agentId !== 'string' || agentId.length === 0) {
    context.log?.warn(
      `[reputation] ignored a ${eventType} naming no agent, so there is no record it could be counted against`,
    );
    return { admitted: false };
  }
  const bountyId = payload.bountyId;
  if (typeof bountyId !== 'string' || bountyId.trim().length === 0) {
    await recordRefusal(repository, agentId, eventType, context);
    return { admitted: false };
  }

  const outcome: ReputationOutcome = { agentId, bountyId, kind };
  if (await repository.claimOutcome(outcome, context.now())) {
    return { admitted: true };
  }
  return { admitted: false };
}

/**
 * The refusal, made visible in both the places a reader already looks.
 *
 * The log is for whoever is watching the delivery arrive; the counter is on the
 * record, so a caller reading an agent sees that part of the evidence was not
 * acted on. Either alone would be the weaker answer: a log line nobody reads is
 * not a record, and a count with no instant attached cannot be chased back to
 * the events that caused it.
 */
async function recordRefusal(
  repository: ReputationRepository,
  agentId: string,
  eventType: string,
  context: RuntimeContext,
): Promise<void> {
  const at = context.now();
  context.log?.warn(
    `[reputation] refused to count a ${eventType} for ${agentId}: the payload names no bounty, ` +
      'so it cannot be told apart from a repeat of an outcome already counted',
  );
  const record = await load(repository, agentId);
  await repository.save({
    ...record,
    refusedOutcomes: record.refusedOutcomes + 1,
    updatedAt: at,
  });
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
