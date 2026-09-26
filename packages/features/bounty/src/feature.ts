import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  describePayout,
  issueUrlFor,
  isTerminalBounty,
  nextBountyStatus,
  prUrlFor,
  toKnownStatus,
  type Bounty,
  type BountySummary,
} from './domain.js';
import {
  BOUNTY_CREATE_SHAPE,
  BOUNTY_EXPIRE_SHAPE,
  BOUNTY_FUND_SHAPE,
  BOUNTY_LIST_SHAPE,
  BOUNTY_TRANSITION_SHAPE,
  bountyInputRejected,
  coordinatesOf,
  isClaimBountyInput,
  isCreateBountyInput,
  isExpireBountyInput,
  isFundBountyInput,
  isListBountiesInput,
  isSubmitBountyInput,
  parsePullRequestUrl,
  whyClaimIsRejected,
  whyCreateIsRejected,
  whyExpireIsRejected,
  whyFundIsRejected,
  whyListIsRejected,
  whySubmitIsRejected,
  type FundBountyInput,
} from './input.js';
import {
  canHonourMode,
  DEFAULT_BOUNTY_MODE,
  describeBountyMode,
  toKnownBountyMode,
} from './modes.js';
import {
  BOUNTY_COMPLETED,
  GITHUB_PULL_REQUEST_MERGED,
  outcomeFor,
  outcomeForUnclaimed,
  prUrlForDelivery,
  PULL_REQUEST_MERGED_OUTCOME,
  readMergeDelivery,
  type MergeOutcomeEvent,
} from './merge.js';
import {
  checkIntent,
  declareFunding,
  markPending,
  type PayoutIntentStore,
  type PayoutState,
} from './payout.js';
import { fundingRefused, fundingRefusedError, FUNDING_REFUSALS } from './funding.js';
import { DISPUTE_WINDOWS, MIN_BOUNTY_CENTS, windowIsOpen } from './rules.js';
import type { BountyRepository, StoredBounty } from './repository.js';

/* ───────────────────────────── events ───────────────────────────── */

export const BOUNTY_CREATED = 'bounty.created';
export const BOUNTY_CLAIMED = 'bounty.claimed';
export const BOUNTY_SUBMITTED = 'bounty.submitted';
export const BOUNTY_EXPIRED = 'bounty.expired';
/** Recorded when a sponsor commits money. The spelling lives in payout.ts. */
export const BOUNTY_PAYOUT_FUNDED = 'bounty.payout_funded';
/**
 * Recorded when a sponsor was refused, so the refusal is not silent.
 *
 * Persisted, and that is the whole reason it exists. Payout-rail section 4.2
 * says the log is what settles a dispute, and a sponsor told "refused" whose
 * attempt left no trace has nothing to show the repository owner and nothing for
 * this platform to answer with. It is the third fact the rail writes that is not
 * a state — a bounty has no `refused` status, and adding one would be a claim
 * that the platform decided something about the money rather than declining to
 * accept it.
 *
 * The payload carries the amount ATTEMPTED and a `reason`, never a `funded` or a
 * `totalCents`, so nothing downstream can read this row as money that landed. No
 * funding row is written and no payout intent is touched: the sum of
 * `bounty_funds` is what the sponsors are owed, and a refused contribution is
 * not part of it.
 */
export const BOUNTY_FUNDING_REFUSED = 'bounty.funding_refused';

export { FUNDING_REFUSALS } from './funding.js';

/* ───────────────────────────── actions ───────────────────────────── */

export const BOUNTY_CREATE = 'bounty.create';
export const BOUNTY_LIST = 'bounty.list';
export const BOUNTY_CLAIM = 'bounty.claim';
export const BOUNTY_SUBMIT = 'bounty.submit';
export const BOUNTY_FUND = 'bounty.fund';
export const BOUNTY_EXPIRE = 'bounty.expire';

export interface BountyDependencies {
  readonly repository: BountyRepository;
  /**
   * Where payout intent is recorded.
   *
   * Required rather than optional for the reason the composition root gives for
   * every other store: a bounty whose funding is a claim nobody wrote down is a
   * bounty that says $500 and can prove nothing, and that is indistinguishable
   * from one that was never funded.
   */
  readonly payouts: PayoutIntentStore;
}

export function bountyFeature(dependencies: BountyDependencies): GameFeature {
  const { repository, payouts } = dependencies;

  return {
    id: 'bounty',
    persistedEvents: [
      BOUNTY_CREATED,
      BOUNTY_CLAIMED,
      BOUNTY_SUBMITTED,
      BOUNTY_EXPIRED,
      BOUNTY_COMPLETED,
      PULL_REQUEST_MERGED_OUTCOME,
      BOUNTY_FUNDING_REFUSED,
    ],
    capabilities: [
      { name: BOUNTY_CREATE, description: 'Put a reward on a real GitHub issue.' },
      { name: BOUNTY_LIST, description: 'Browse the bounties available to claim.' },
      { name: BOUNTY_CLAIM, description: 'Take a bounty, starting the work.' },
      { name: BOUNTY_SUBMIT, description: 'Hand in a pull request against a claimed bounty.' },
      { name: BOUNTY_FUND, description: "Record a sponsor's commitment to a bounty." },
      { name: BOUNTY_EXPIRE, description: 'End a bounty nobody finished.' },
    ],
    eventHandlers: [onPullRequestMerged(repository, payouts)],
    actionDefs: [
      // Every `run` takes `unknown` and is guarded. Not shorthand: `act()` hands
      // the payload through as a generic, so a narrower parameter here is an
      // annotation the registry never checks, which is the defect the quest and
      // progression features were each taught to refuse.
      defineAction({
        id: BOUNTY_CREATE,
        permissions: [BOUNTY_CREATE],
        run: (input: unknown, context) => create(repository, payouts, input, context),
      }),
      defineAction({
        id: BOUNTY_LIST,
        permissions: [BOUNTY_LIST],
        run: (input: unknown) => list(repository, payouts, input),
      }),
      defineAction({
        id: BOUNTY_CLAIM,
        permissions: [BOUNTY_CLAIM],
        run: (input: unknown, context) => claim(repository, payouts, input, context),
      }),
      defineAction({
        id: BOUNTY_SUBMIT,
        permissions: [BOUNTY_SUBMIT],
        run: (input: unknown, context) => submit(repository, payouts, input, context),
      }),
      defineAction({
        id: BOUNTY_FUND,
        permissions: [BOUNTY_FUND],
        run: (input: unknown, context) => fund(repository, payouts, input, context),
      }),
      defineAction({
        id: BOUNTY_EXPIRE,
        permissions: [BOUNTY_EXPIRE],
        run: (input: unknown, context) => expire(repository, payouts, input, context),
      }),
    ],
  };
}

/* ───────────────────────────── actions, implemented ───────────────────────────── */

async function create(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  input: unknown,
  context: RuntimeContext,
): Promise<BountySummary> {
  if (!isCreateBountyInput(input)) {
    throw bountyInputRejected(
      BOUNTY_CREATE,
      whyCreateIsRejected(input) ?? { reason: 'not-an-object' },
      BOUNTY_CREATE_SHAPE,
    );
  }
  const coordinates = coordinatesOf(input);
  const created = await repository.create({
    repoOwner: coordinates.repoOwner,
    repoName: coordinates.repoName,
    issueNumber: input.issueNumber,
    // Derived, never supplied. A bounty whose issue link is free text is a
    // bounty nobody can check, and this is one of only two places a GitHub link
    // is ever produced in this feature.
    issueUrl: issueUrlFor(coordinates, input.issueNumber),
    currency: input.currency?.trim() || DEFAULT_CURRENCY,
    requirements: (input.requirements ?? []).map((requirement) => requirement.trim()),
    // The default, not a guess. `first-valid` is the one mode the claim and
    // merge path can keep, so a bounty nobody labelled is one this build can
    // resolve — and a creator that DOES label it is held to the taxonomy, which
    // `whyCreateIsRejected` is what checks. The mode is stored from creation
    // rather than defaulted on first use, because a mode added later means every
    // live row needs a backfill and the backfill silently picks a claim policy
    // for bounties whose sponsor chose none.
    mode: input.mode?.trim() || DEFAULT_BOUNTY_MODE,
    // Null on purpose, and it is the only null-looking decision in this create.
    // A sponsor attaches through `bounty.fund`, which writes a funding row, and
    // the total and the refund arithmetic are per row. Putting a sponsor here
    // would make the second one invisible, which is the mistake the payout rail
    // calls a drifting scalar. A row created outside these actions (the seed)
    // may carry one, and the summary reports whatever is there.
    sponsorUserId: null,
    expiresAt: input.expiresAt ?? null,
    now: context.now(),
  });

  const summary = toBounty(created);
  await context.runtime.emit(
    event(context, BOUNTY_CREATED, {
      bountyId: summary.id,
      repository: `${summary.repository.repoOwner}/${summary.repository.repoName}`,
      issueNumber: summary.issueNumber,
      issueUrl: summary.issueUrl,
      mode: summary.mode,
    }),
  );
  return withPayout(repository, payouts, summary);
}

const DEFAULT_CURRENCY = 'USD';

async function list(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  input: unknown,
): Promise<readonly BountySummary[]> {
  if (!isListBountiesInput(input)) {
    throw bountyInputRejected(
      BOUNTY_LIST,
      whyListIsRejected(input) ?? { reason: 'not-an-object' },
      BOUNTY_LIST_SHAPE,
    );
  }
  const stored = await repository.list({
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.repoOwner === undefined ? {} : { repoOwner: input.repoOwner }),
    ...(input.repoName === undefined ? {} : { repoName: input.repoName }),
  });
  return Promise.all(stored.map((row) => withPayout(repository, payouts, toBounty(row))));
}

async function claim(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  input: unknown,
  context: RuntimeContext,
): Promise<BountySummary> {
  if (!isClaimBountyInput(input)) {
    throw bountyInputRejected(
      BOUNTY_CLAIM,
      whyClaimIsRejected(input) ?? { reason: 'not-an-object' },
      BOUNTY_TRANSITION_SHAPE,
    );
  }
  const current = await require(repository, input.bountyId);

  // The claim window is checked before the funding floor, because an unfunded
  // bounty has no window at all, and reporting "your window closed" for one would
  // be a reason that is not the real one.
  if (
    current.fundedAt !== null &&
    !windowIsOpen('claimAfterFundingDays', current.fundedAt, context.now())
  ) {
    throw Object.assign(
      new Error(
        `bounty ${current.id} has been funded for longer than the ` +
          `${DISPUTE_WINDOWS.claimAfterFundingDays}-day claim window and is no longer available`,
      ),
      { code: 'bounty-claim-window-closed' },
    );
  }
  if (current.rewardCents < MIN_BOUNTY_CENTS) {
    // Below the floor it is a support ticket rather than a reward: the design
    // notes that a solved $2 bounty weighs exactly as much in the aggregate
    // trust score as a solved $2000 one, which makes the score noise.
    throw Object.assign(
      new Error(
        `bounty ${current.id} is funded to ${current.rewardCents} cents, below the ` +
          `${MIN_BOUNTY_CENTS}-cent minimum, so it is not claimable until it is funded`,
      ),
      { code: 'bounty-under-minimum' },
    );
  }

  // A mode this build knows and cannot keep is refused HERE, and not resolved as
  // if it were `first-valid`. Those are the two answers that look alike to the
  // caller and are not alike at all: under `maintainer-picks` the sponsor
  // promised to choose among several, so a first-come-first-served claim does
  // not merely disappoint, it sends an agent to do work another agent's pull
  // request is about to beat. An unrecognised mode is deliberately NOT this
  // branch and keeps the older exclusive reading, because a value nobody can
  // name has no promise attached to it to keep.
  const storedMode = toKnownBountyMode(current.mode);
  if (storedMode !== undefined && !canHonourMode(storedMode)) {
    throw Object.assign(
      new Error(
        `bounty ${current.id} resolves under ${describeBountyMode(storedMode)}, and this build ` +
          'cannot keep that claim: it holds one claimant per bounty, so a mode decided by ' +
          'comparing several is refused rather than quietly resolved as a race. No other mode ' +
          'can be taken until the store can hold more than one holder.',
      ),
      { code: 'bounty-mode-not-playable' },
    );
  }

  const claimed = await repository.claim(input.bountyId, input.agentId, context.now());
  if (claimed === undefined) {
    // A lost race, not a missing row. The two answers stay distinct because they
    // ask the caller for different things: one to pick a different bounty, the
    // other to back off.
    await require(repository, input.bountyId);
    throw Object.assign(
      new Error(
        `bounty ${input.bountyId} was claimed by somebody else first. A claim is exclusive ` +
          'whatever mode the bounty carries, because two solvers on one bounty is the same ' +
          'work paid twice.',
      ),
      { code: 'bounty-already-claimed' },
    );
  }

  const summary = toBounty(claimed);
  await context.runtime.emit(
    event(context, BOUNTY_CLAIMED, {
      bountyId: summary.id,
      agentId: input.agentId,
      issueUrl: summary.issueUrl,
      mode: summary.mode,
    }),
  );
  return withPayout(repository, payouts, summary);
}

async function submit(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  input: unknown,
  context: RuntimeContext,
): Promise<BountySummary> {
  if (!isSubmitBountyInput(input)) {
    throw bountyInputRejected(
      BOUNTY_SUBMIT,
      whySubmitIsRejected(input) ?? { reason: 'not-an-object' },
      BOUNTY_TRANSITION_SHAPE,
    );
  }
  const current = await require(repository, input.bountyId);
  const parsed = parsePullRequestUrl(input.prUrl);

  // The pull request has to be in the SAME repository as the issue, and this is
  // the only place that can be refused. A submit pointing at another repository
  // would let a merge there complete a bounty here, which is somebody else's
  // pull request paying for somebody else's work.
  if (
    parsed === undefined ||
    parsed.repository.repoOwner !== current.repoOwner ||
    parsed.repository.repoName !== current.repoName
  ) {
    throw Object.assign(
      new Error(
        `bounty ${input.bountyId} is on ${current.repoOwner}/${current.repoName} and ` +
          `${input.prUrl} is not a pull request in that repository`,
      ),
      { code: 'bounty-pr-repository-mismatch' },
    );
  }
  if (nextBountyStatus(toKnownStatus(current.status), 'submit') === undefined) {
    throw new Error(
      `bounty ${current.id} is ${current.status} and cannot have a pull request submitted against it`,
    );
  }

  // Canonicalised before it is stored, so the merge correlation later is a
  // string comparison against a string this module also builds.
  const canonical = prUrlFor(
    { repoOwner: current.repoOwner, repoName: current.repoName },
    parsed.pullRequest,
  );
  const moved = await repository.submit(input.bountyId, input.agentId, canonical, context.now());
  if (moved === undefined) {
    const held = await require(repository, input.bountyId);
    if (held.claimedAgentId !== input.agentId) {
      // Not a complaint about the pull request. The agent that did the work is
      // not the one holding the claim, and the claim is the only record of who
      // did what: a GitHub pull request author is a person, not an agent.
      throw Object.assign(
        new Error(
          `bounty ${input.bountyId} is claimed by ${held.claimedAgentId ?? 'nobody'} so ` +
            `${input.agentId} cannot submit against it. The claim is the identity record.`,
        ),
        { code: 'bounty-not-the-claimant' },
      );
    }
    throw Object.assign(
      new Error(
        `bounty ${input.bountyId} changed while ${input.agentId} was submitting it; read it ` +
          'again and retry',
      ),
      { code: 'bounty-submit-conflict' },
    );
  }

  const summary = toBounty(moved);
  await context.runtime.emit(
    event(context, BOUNTY_SUBMITTED, {
      bountyId: summary.id,
      agentId: input.agentId,
      prUrl: summary.prUrl,
      issueUrl: summary.issueUrl,
    }),
  );
  return withPayout(repository, payouts, summary);
}

async function fund(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  input: unknown,
  context: RuntimeContext,
): Promise<BountySummary> {
  if (!isFundBountyInput(input)) {
    throw bountyInputRejected(
      BOUNTY_FUND,
      whyFundIsRejected(input) ?? { reason: 'not-an-object' },
      BOUNTY_FUND_SHAPE,
    );
  }
  const current = await require(repository, input.bountyId);
  if (isTerminalBounty(toKnownStatus(current.status))) {
    throw await refuseFunding(context, input, current, FUNDING_REFUSALS.terminal);
  }

  const previous = await payouts.currentFor(input.bountyId);
  // A top-up is NOT a state move, so the transition table is the wrong gate here.
  // Applying it refused the second sponsor's money while still writing their
  // funding row, leaving the intent saying the first total — which is the
  // drifting scalar docs/design/payout-rail.md section 3.1 warns about, moved
  // from the column to the row. A second sponsor tops the same state up; the
  // state that cannot be topped up is a payable one, because money cannot be
  // added to something a solver is already owed.
  //
  // Which is `pending`, and `pending` is set by the MERGE. So the answer to
  // payout-rail section 7's open question — may a sponsor stack on a bounty a
  // solver has already claimed? — is yes, and the boundary is the merge rather
  // than the claim or the submit. `claimedAgentId` and `prUrl` being set is no
  // evidence either way: a solver's work is not a reason to refuse a stranger
  // money, and the refund arithmetic is the same whether the funds arrive before
  // or after it.
  if (previous !== undefined && previous.state !== 'funded') {
    throw await refuseFunding(context, input, current, FUNDING_REFUSALS.payable, previous.state);
  }
  const intent = declareFunding({
    bountyId: input.bountyId,
    // The TOTAL, not this contribution. A refund is arithmetic on the funding
    // rows (payout-rail.md section 3.1), so the number the intent carries has to
    // be the sum and not a value the caller computed.
    amountCents: current.rewardCents + input.amountCents,
    reportedBy: input.reportedBy,
    now: context.now(),
  });
  // The payout package's own gate, applied to the VALUE rather than to the
  // transition: whole cents, a named reporter, and the single mode that exists.
  // Passing no previous intent is what makes this a value check — the value is
  // the same whether it is the first write of a bounty's funding or the tenth.
  const accepted = checkIntent(intent, undefined);
  if (!accepted.accepted) {
    throw Object.assign(new Error(`bounty ${input.bountyId} cannot be funded: ${accepted.code}`), {
      code: accepted.code,
    });
  }

  const funded = await repository.fund(
    input.bountyId,
    input.sponsorUserId,
    input.amountCents,
    context.now(),
  );
  // The intent is written AFTER the funding row, not before: a recorded intent
  // with no row behind it is a claim about money the platform cannot point at,
  // which is the one state the audit trail cannot use. A crash between the two
  // leaves a funding row with no intent, and `describePayout` reads that as
  // `funded` — the same word, reached from the row instead.
  await payouts.record({ ...intent, amountCents: funded.totalCents });

  const summary = toBounty({
    ...current,
    rewardCents: funded.totalCents,
    fundedAt: funded.fundedAt,
  });
  await context.runtime.emit(
    event(context, BOUNTY_PAYOUT_FUNDED, {
      bountyId: summary.id,
      totalCents: funded.totalCents,
      reportedBy: input.reportedBy,
    }),
  );
  return withPayout(repository, payouts, summary);
}

async function expire(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  input: unknown,
  context: RuntimeContext,
): Promise<BountySummary> {
  if (!isExpireBountyInput(input)) {
    throw bountyInputRejected(
      BOUNTY_EXPIRE,
      whyExpireIsRejected(input) ?? { reason: 'not-an-object' },
      BOUNTY_EXPIRE_SHAPE,
    );
  }
  await require(repository, input.bountyId);
  const moved = await repository.expire(input.bountyId, context.now());
  if (moved === undefined) {
    const held = await require(repository, input.bountyId);
    throw new Error(`bounty ${input.bountyId} is ${held.status} and cannot be expired`);
  }
  const summary = toBounty(moved);
  await context.runtime.emit(
    event(context, BOUNTY_EXPIRED, { bountyId: summary.id, status: summary.status }),
  );
  return withPayout(repository, payouts, summary);
}

/* ───────────────────────────── the merge handler ───────────────────────────── */

/**
 * Completes the bounty a merged pull request belongs to.
 *
 * Registered on the integration edge's event name rather than on a game name,
 * because the integration is what observes a merge and this feature is what
 * decides what it means. Everything the decision needs — which agent, how much,
 * which bounty — is read from the claim record; nothing is read from the
 * delivery's `githubLogin`, which is a person's GitHub account.
 *
 * The idempotence lives in the store, not in a check of the delivery id:
 * `complete` moves `submitted` and only `submitted`. GitHub delivers at least
 * once and reorders, so a second delivery of the same merge finds nothing to
 * move and produces no event. Keying on the delivery id instead would have paid
 * twice the first time GitHub reissued one.
 */
function onPullRequestMerged(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
): EventHandler {
  return {
    on: GITHUB_PULL_REQUEST_MERGED,
    async handle(event: GameEvent, context: RuntimeContext): Promise<void> {
      const delivery = readMergeDelivery(event.payload);
      if (delivery === undefined) {
        return;
      }
      const prUrl = prUrlForDelivery(delivery);
      if (prUrl === undefined) {
        // Coordinates this feature cannot place. Doing nothing is the only
        // honest response: there is no bounty to complete, and raising would put
        // an integration's odd delivery into the game's error path.
        return;
      }

      const submitted = await repository.findByPrUrl(prUrl);
      if (submitted === undefined) {
        // A merge that completed no bounty. Recorded as a fact and priced at
        // nothing, because there is no claim and so no agent — see merge.ts.
        await emitAll(context, [
          outcomeForUnclaimed({
            repository: delivery.repository,
            pullRequest: delivery.pullRequest,
            prUrl,
            mergedBy: delivery.githubLogin,
          }),
        ]);
        return;
      }
      if (submitted.claimedAgentId === null) {
        // `submitted` means `claimed`, so this is unreachable through the
        // commands. Reaching it means a row was written by something other than
        // this feature, and completing it would attribute the award to nobody.
        return;
      }

      const completed = await repository.complete(
        submitted.id,
        prUrl,
        delivery.githubLogin,
        context.now(),
      );
      if (completed === undefined) {
        // Already completed by an earlier delivery of this same merge. Silence
        // is the whole answer: the bounty is credited and the work is paid, and
        // re-announcing either is the double-pay this feature exists to avoid.
        return;
      }
      if (completed.claimedAgentId === null) {
        // Re-read, so the narrowing has to be re-earned. Unreachable: the row we
        // just moved was `submitted`, which means claimed, and nothing in this
        // feature can clear the claimant. A row somebody else wrote is the only
        // way here, and paying it would attribute the award to nobody.
        return;
      }
      const { claimedAgentId } = completed;

      // The payout moves to `pending` before the award is emitted, so a consumer
      // reacting to `bounty.completed` and reading the intent sees the state the
      // merge put it in. A merge is a reason to pay, not a payment.
      const previous = await payouts.currentFor(completed.id);
      if (previous === undefined) {
        await payouts.record(
          declareFunding({
            bountyId: completed.id,
            amountCents: completed.rewardCents,
            reportedBy: delivery.githubLogin ?? 'github',
            now: context.now(),
          }),
        );
      }
      await payouts.record(
        markPending({
          bountyId: completed.id,
          amountCents: completed.rewardCents,
          reportedBy: delivery.githubLogin ?? 'github',
          now: context.now(),
        }),
      );

      await emitAll(
        context,
        outcomeFor({
          bountyId: completed.id,
          rewardCents: completed.rewardCents,
          prUrl,
          repository: delivery.repository,
          pullRequest: delivery.pullRequest,
          agentId: claimedAgentId,
          mergedBy: delivery.githubLogin,
        }).events,
      );
    },
  };
}

async function emitAll(
  context: RuntimeContext,
  events: readonly MergeOutcomeEvent[],
): Promise<void> {
  for (const entry of events) {
    await context.runtime.emit(event(context, entry.type, entry.payload));
  }
}

/* ───────────────────────────── shaping ───────────────────────────── */

async function require(repository: BountyRepository, bountyId: string): Promise<StoredBounty> {
  const stored = await repository.findById(bountyId);
  if (stored === undefined) {
    throw new Error(`no bounty ${bountyId}`);
  }
  return stored;
}

function toBounty(row: StoredBounty): Bounty {
  return {
    id: row.id,
    repository: { repoOwner: row.repoOwner, repoName: row.repoName },
    issueNumber: row.issueNumber,
    issueUrl: row.issueUrl,
    prUrl: row.prUrl,
    currency: row.currency,
    requirements: row.requirements,
    status: toKnownStatus(row.status),
    mode: row.mode,
    claimedAgentId: row.claimedAgentId,
    mergedBy: row.mergedBy,
    mergedAt: row.mergedAt,
    expiredAt: row.expiredAt,
    sponsorUserId: row.sponsorUserId,
    rewardCents: row.rewardCents,
    fundedAt: row.fundedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/**
 * Attaches the payout notice and the funding rows.
 *
 * Every action that returns a bounty goes through here, which is what makes
 * `needsSandboxBanner` and `describeRefund` production callers rather than tested
 * functions with no caller. There is no path out of this feature that hands a
 * caller a bounty without the question of whether the money moved attached to it,
 * and without who put it there — and a surface cannot render the reward or the
 * refund without rendering the notices, because they are part of the value it was
 * given.
 *
 * The funds are read HERE and not by the callers, for the reason the reads above
 * are here: one place decides what a summary costs, and no action can forget. The
 * alternative — each action reading its own rows — is six chances to attach a
 * total to no attribution, which is the defect this whole file exists to prevent.
 */
async function withPayout(
  repository: BountyRepository,
  payouts: PayoutIntentStore,
  bounty: Bounty,
): Promise<BountySummary> {
  const [intent, funds] = await Promise.all([
    payouts.currentFor(bounty.id),
    repository.fundsFor(bounty.id),
  ]);
  const state: PayoutState | 'none' = intent?.state ?? 'none';
  return {
    ...bounty,
    funds,
    payout: describePayout(
      bounty.rewardCents,
      state,
      {
        fundedAt: bounty.fundedAt,
        completedAt: bounty.mergedAt,
        // The intent's own instant, and only once it is actually reported: before
        // `recorded` nobody has claimed a transfer happened, so there is no dispute
        // deadline to compute from one.
        reportedAt: intent !== undefined && intent.state === 'recorded' ? intent.recordedAt : null,
        cancelledAt: bounty.expiredAt,
      },
      {
        status: bounty.status,
        claimedAgentId: bounty.claimedAgentId,
        funds,
      },
    ),
  };
}

/**
 * Records a top-up that was turned away, and returns the error that says so.
 *
 * Returning the error rather than throwing it is what lets the caller `throw
 * await refuseFunding(...)`: the event is emitted and AWAITED before the caller
 * is told, so the row exists by the time anyone hears about the refusal. A
 * refusal that is announced first and recorded later is a refusal a crash can
 * lose, and this is the one event in the feature whose absence is invisible to
 * everyone who was not looking.
 *
 * The one value built here is written to BOTH places a sponsor can meet it: the
 * thrown error and the log row. Two hand-written copies of that sentence would
 * be how somebody is told their money is safe at the moment of the refusal and
 * something vaguer when they read the log a week later, which is the failure
 * payout-rail section 4.2's "if the log cannot settle a dispute, the design is
 * incomplete" is about.
 */
async function refuseFunding(
  context: RuntimeContext,
  input: FundBountyInput,
  current: StoredBounty,
  reason: (typeof FUNDING_REFUSALS)[keyof typeof FUNDING_REFUSALS],
  /** The payout state, when the reason is about the payout rather than the status. */
  payoutState?: PayoutState,
): Promise<Error> {
  const refusal = fundingRefused(reason);
  await context.runtime.emit(
    event(context, BOUNTY_FUNDING_REFUSED, {
      bountyId: input.bountyId,
      sponsorUserId: input.sponsorUserId,
      amountCents: input.amountCents,
      reason: refusal.reason,
      disposition: refusal.disposition,
      notice: refusal.notice,
      bountyStatus: current.status,
      // The state the intent was actually in, rather than the status. On a
      // `submitted` bounty the two disagree, and a reader deciding whether the
      // work is done needs the payout's word for it, not the lifecycle's.
      ...(payoutState === undefined ? {} : { payoutState }),
    }),
  );
  return fundingRefusedError(
    refusal,
    `bounty ${current.id} is ${current.status} and cannot be funded` +
      (payoutState === undefined ? '' : `; its payout is already ${payoutState}`) +
      '.',
  );
}

function event(context: RuntimeContext, type: string, payload: Record<string, unknown>): GameEvent {
  return { type, occurredAt: context.now(), actorId: 'bounty', payload };
}

/**
 * The two award names and the event the integration emits, re-exported from
 * here because `feature.ts` is where a feature's whole vocabulary is declared.
 * The definitions live in `merge.ts`; a second copy of either string is what
 * would drift, and a drifted award name is a mispriced merge.
 */
export { BOUNTY_COMPLETED, GITHUB_PULL_REQUEST_MERGED, PULL_REQUEST_MERGED_OUTCOME };
export type { BountySummary, PayoutState };
