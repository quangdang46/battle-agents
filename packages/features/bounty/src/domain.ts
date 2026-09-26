/**
 * The bounty: a funded quest on a real GitHub issue.
 *
 * A bounty is a thin layer over a GitHub issue, not a replacement for one. Every
 * bounty names a repository, an issue number and a pull request URL that exist
 * on github.com, and the three of them are DERIVED from the coordinates rather
 * than accepted as text — see `issueUrlFor` and `prUrlFor`, which are the only
 * two ways this file produces a URL. A bounty whose links point somewhere else
 * is not a bounty with a bad link, it is a bounty whose work nobody can check,
 * and the cheapest place to refuse that is the only place a link is written.
 *
 * The lifecycle is a pure function for the reason the session and quest
 * lifecycles are: every "may this go from A to B" question is answered in one
 * place, and a command handler that decided for itself would eventually
 * disagree with a command handler that did not.
 */

import { needsSandboxBanner, type PayoutState } from './payout.js';
import {
  allocateProRata,
  REFUND_DISPOSITIONS,
  REFUND_NOTICES,
  type RefundFund,
  type RefundNotice,
} from './refund.js';
import { windowClosesAt, type DisputeWindow } from './rules.js';

/* ───────────────────────────── statuses ───────────────────────────── */

export const BOUNTY_STATUSES = [
  'open',
  'claimed',
  'submitted',
  'completed',
  'expired',
  'disputed',
] as const;
export type BountyStatus = (typeof BOUNTY_STATUSES)[number];

/**
 * What someone did to a bounty, as opposed to a status it now has.
 *
 * `merge` is here even though no command accepts it, because it is a move like
 * any other and putting it in the table rather than in the webhook handler is
 * what stops the handler from growing its own idea of what a merge may follow.
 */
export const BOUNTY_TRANSITIONS = ['claim', 'submit', 'merge', 'expire'] as const;
export type BountyTransition = (typeof BOUNTY_TRANSITIONS)[number];

/**
 * The statuses a bounty can move to, and the ones that are terminal.
 *
 * `disputed` is terminal HERE and that is a statement, not an omission. The
 * column exists because the payout rail reserves it, and the moves out of it
 * belong to the dispute path this bead does not build. Treating it as terminal
 * is the fail-closed half: a disputed bounty cannot be claimed, submitted or
 * merged by this feature, so a row somebody else is arguing about does not get
 * completed underneath them.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<BountyStatus, Readonly<Record<BountyTransition, BountyStatus>>>
> = {
  open: { claim: 'claimed', submit: 'open', merge: 'open', expire: 'expired' },
  claimed: { claim: 'claimed', submit: 'submitted', merge: 'claimed', expire: 'expired' },
  submitted: { claim: 'submitted', submit: 'submitted', merge: 'completed', expire: 'submitted' },
  completed: { claim: 'completed', submit: 'completed', merge: 'completed', expire: 'completed' },
  expired: { claim: 'expired', submit: 'expired', merge: 'expired', expire: 'expired' },
  disputed: { claim: 'disputed', submit: 'disputed', merge: 'disputed', expire: 'disputed' },
};

/**
 * The status a bounty moves to, or undefined when the move is not allowed.
 *
 * Undefined rather than a status, so a caller cannot mistake a refused
 * transition for one that happened. The table's self-loops return `current`,
 * and `next === current` is the refusal — the same shape the quest machine
 * uses, so a reader who knows one knows the other.
 */
export function nextBountyStatus(
  current: BountyStatus,
  transition: BountyTransition,
): BountyStatus | undefined {
  const next = ALLOWED_TRANSITIONS[current][transition];
  return next === current ? undefined : next;
}

export function isTerminalBounty(status: BountyStatus): boolean {
  return status === 'completed' || status === 'expired' || status === 'disputed';
}

/**
 * A status this build knows, or `disputed` when it does not.
 *
 * A column is text, so a row written by a future build — or by hand — can carry
 * a status this one has never heard of. It maps to `disputed`, which is the only
 * terminal-and-do-nothing status in the table: an unknown status must not
 * become `open` (that would make a bounty nobody understands claimable) and must
 * not become `completed` (that would pay a bounty twice). Refusing to move it is
 * the only answer that cannot transfer money by accident.
 */
export function toKnownStatus(stored: string): BountyStatus {
  return (BOUNTY_STATUSES as readonly string[]).includes(stored)
    ? (stored as BountyStatus)
    : 'disputed';
}

/* ─────────────────────── GitHub coordinates ─────────────────────── */

export const GITHUB_WEB_ORIGIN = 'https://github.com';

/**
 * The canonical issue URL for a set of coordinates.
 *
 * The single source of every issue link this feature stores or shows. A caller
 * may not supply an issue URL, and that is the point: the plan's core insight
 * is that a bounty is a real GitHub issue, so a link that did not come from
 * these three values would be a claim the platform cannot check.
 */
export function issueUrlFor(repository: RepositoryCoordinates, issueNumber: number): string {
  return `${GITHUB_WEB_ORIGIN}/${repository.repoOwner}/${repository.repoName}/issues/${issueNumber}`;
}

/**
 * The canonical pull request URL for a set of coordinates.
 *
 * Asymmetric with `issueUrlFor` in one way that matters: the number here is the
 * PULL REQUEST's number, which is not the issue's. A bounty hangs off issue 42
 * and is completed by a merge of pull request 43, and conflating them is a
 * correlation bug that would complete a bounty from an unrelated merge.
 */
export function prUrlFor(repository: RepositoryCoordinates, pullRequest: number): string {
  return `${GITHUB_WEB_ORIGIN}/${repository.repoOwner}/${repository.repoName}/pull/${pullRequest}`;
}

/**
 * `owner/name`, the only spelling GitHub guarantees for a repository.
 *
 * The nested `repository.owner.login` is not used, and `full_name` is what
 * follows a repository through a transfer. The integration edge already reads
 * it; this is the same string in the form the store keeps, so the two can be
 * compared as text.
 */
export function forRepository(fullName: string): RepositoryCoordinates | undefined {
  const parts = fullName.split('/');
  if (parts.length !== 2) {
    return undefined;
  }
  const [repoOwner, repoName] = parts;
  if (repoOwner === undefined || repoName === undefined) return undefined;
  if (!isSlug(repoOwner) || !isSlug(repoName)) {
    return undefined;
  }
  return { repoOwner, repoName };
}

export interface RepositoryCoordinates {
  readonly repoOwner: string;
  readonly repoName: string;
}

/**
 * What GitHub allows in an owner or a repository name.
 *
 * The rule rather than a list of the names that exist today, because the list
 * would need updating and a rule would not. It is also the shortest thing that
 * rejects `..`, a slash and a space — the three that would let a caller build a
 * `github.com/owner/name/../../elsewhere` link out of coordinates that passed
 * every other check.
 */
const SLUG = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

function isSlug(value: string): boolean {
  return value.length > 0 && value.length <= 100 && SLUG.test(value);
}

export function isRepositoryCoordinates(value: unknown): value is RepositoryCoordinates {
  if (typeof value !== 'object' || value === null) return false;
  const { repoOwner, repoName } = value as {
    readonly repoOwner?: unknown;
    readonly repoName?: unknown;
  };
  return (
    typeof repoOwner === 'string' &&
    isSlug(repoOwner) &&
    typeof repoName === 'string' &&
    isSlug(repoName)
  );
}

/* ───────────────────────────── the object ───────────────────────────── */

/**
 * A bounty as the feature holds it.
 *
 * `rewardCents` is the SUM of the funding rows, never a scalar on the row. The
 * payout rail's section 3.1 is explicit that a denormalised total is how a
 * second sponsor's money disappears, and the schema verifier fails the build
 * if `bounties.amount_cents` is ever added.
 */
export interface Bounty {
  readonly id: string;
  readonly repository: RepositoryCoordinates;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly prUrl: string | null;
  readonly currency: string;
  readonly requirements: readonly string[];
  readonly status: BountyStatus;
  /**
   * The mode taxonomy belongs to ba-bounty-modes-tiers-seasons-62l and is
   * deliberately not an enum here: two features defining the same list is the
   * duplication bug the bead warns about, and a union here would be one. What
   * this bead needs from it is a single yes/no question — is claiming exclusive
   * — so it stores a string and answers that, fail-closed, for any value it
   * does not recognise.
   */
  readonly mode: string;
  readonly claimedAgentId: string | null;
  /** The GitHub ACCOUNT that merged the pull request. A person, never an agent. */
  readonly mergedBy: string | null;
  /** When the merge completed it. The anchor for the transfer-report window. */
  readonly mergedAt: string | null;
  /** When an expiry ended it. The anchor for the refund window. */
  readonly expiredAt: string | null;
  readonly sponsorUserId: string | null;
  readonly rewardCents: number;
  readonly fundedAt: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

/** The one way a caller names the agent a command is about. */
export interface AgentRef {
  readonly agentId: string;
}

/* ───────────────────────── payout, as seen from outside ───────────────────────── */

/**
 * What a surface is told about the money behind a bounty.
 *
 * Present on every summary, unconditionally, because the failure this whole
 * package exists to make impossible is a solver reading a status that says
 * `paid` and closing the tab believing money arrived. A caller cannot render
 * this bounty without encountering the question, and `notice` is a non-empty
 * string in every state where the answer is "this is a target, not a payment".
 *
 * `needsSandboxBanner` decides, and it is the rule rather than a component so
 * that the web page, the CLI and the MCP tool cannot each answer the question
 * differently. The string is a property of the value, not of the surface
 * rendering it, so there is no path where a surface forgets to ask.
 */
export interface PayoutNotice {
  /** Always the single payout mode that exists. Never a boolean. */
  readonly mode: 'intent-only';
  readonly state: PayoutState | 'none';
  /** True whenever `rewardCents` is money the platform has NOT moved. */
  readonly sandbox: boolean;
  /** Non-empty exactly when `sandbox` is true. */
  readonly notice: string;
  /** The four payout-rail windows, as deadlines from the instants this bounty has. */
  readonly windows: Readonly<Record<DisputeWindow, string | null>>;
  /**
   * What a sponsor is owed back, which is never nothing to say.
   *
   * A fourth question alongside the other three, and the reason it is here rather
   * than behind a call is that `refundUnclaimedDays` was already being computed
   * with no reader: a deadline nobody is shown is a promise the product appears to
   * make and does not keep. A surface that has the notice cannot forget the
   * disposition of a co-funded bounty that expired.
   */
  readonly refund: RefundNotice;
}

export const SANDBOX_NOTICE =
  'SANDBOX: this reward is a target, not a payment. The platform does not hold, route or ' +
  'process money — sponsors pay solvers directly, off-platform. Nothing has been transferred.';

/**
 * The payout notice for a bounty, with the windows resolved against it.
 *
 * Every window is derived from an instant the bounty actually has, and is null
 * where the instant has not happened. A deadline computed from a guess would be
 * a date the platform invented, and this is a package whose whole argument is
 * that it does not invent facts.
 */
export function describePayout(
  rewardCents: number,
  state: PayoutState | 'none',
  instants: {
    readonly fundedAt: string | null;
    readonly completedAt: string | null;
    readonly reportedAt: string | null;
    readonly cancelledAt: string | null;
  },
  /**
   * Required rather than optional, and the requirement is the point.
   *
   * An optional argument here would let a caller build a `PayoutNotice` for a
   * co-funded bounty that had expired and report no refund at all, which is the
   * exact shape of the defect `needsSandboxBanner` was written against: a rule
   * that is only correct on the paths somebody remembered to call it. Every
   * caller has to hand over the status, the claimant and the funding rows, and
   * therefore has to think about where the money went.
   */
  funding: {
    readonly status: BountyStatus;
    readonly claimedAgentId: string | null;
    readonly funds: readonly RefundFund[];
  },
): PayoutNotice {
  // `funded` rather than `none` whenever money is attached, because a bounty
  // with a reward and no recorded intent is a funded bounty whose funding was
  // never written down — and the honest reading of that is `funded`, which is
  // the state that says "a person said they committed this".
  const effective: PayoutState | 'none' = state === 'none' && rewardCents > 0 ? 'funded' : state;
  return {
    mode: 'intent-only',
    state: effective,
    sandbox: needsSandboxBanner(effective),
    notice: needsSandboxBanner(effective) ? SANDBOX_NOTICE : '',
    windows: {
      claimAfterFundingDays: windowClosesAt('claimAfterFundingDays', instants.fundedAt),
      reportTransferDays: windowClosesAt('reportTransferDays', instants.completedAt),
      openDisputeDays: windowClosesAt('openDisputeDays', instants.reportedAt),
      refundUnclaimedDays: windowClosesAt('refundUnclaimedDays', instants.cancelledAt),
    },
    refund: describeRefund({
      status: funding.status,
      funds: funding.funds,
      cancelledAt: instants.cancelledAt,
      claimedAgentId: funding.claimedAgentId,
    }),
  };
}

/**
 * The disposition of the money on a bounty that ended without paying it.
 *
 * A function rather than a lookup because the answer depends on three facts that
 * vary independently, and a table keyed on one of them would have to encode the
 * others as hidden assumptions. What it decides is only ever the platform's own
 * business: the contested case is referred to the repository owner and comes back
 * with no allocation, because payout-rail section 4.1 settles that question and
 * this function's job is to obey the settlement rather than to have an opinion.
 *
 * The payout STATE is deliberately not an input. A `completed` bounty is not
 * refundable whether the transfer was reported or not — the money is owed to the
 * solver, and a sponsor is not out of pocket in either case — so accepting the
 * state here would have suggested it could change the answer.
 *
 * `claimedAgentId` is the input that is not obviously about money. It is what
 * separates "cancelled before anybody worked on it", which the platform can
 * settle, from "cancelled after a solver started", which it cannot — and the
 * status alone cannot tell those apart, because a claim is never released in this
 * lifecycle.
 */
export function describeRefund(input: {
  readonly status: BountyStatus;
  readonly funds: readonly RefundFund[];
  readonly cancelledAt: string | null;
  readonly claimedAgentId: string | null;
}): RefundNotice {
  const totalCents = input.funds.reduce((total, fund) => total + fund.amountCents, 0);
  const deadline = windowClosesAt('refundUnclaimedDays', input.cancelledAt);
  const nothing: RefundNotice = {
    disposition: REFUND_DISPOSITIONS.notApplicable,
    totalCents: 0,
    shares: [],
    deadline: null,
    notice: REFUND_NOTICES.nothingOutstanding,
  };

  if (totalCents === 0 || !isTerminalBounty(input.status)) {
    return nothing;
  }
  if (input.status === 'completed') {
    // Paid, or payable and unreported. Either way the money is owed to the solver
    // rather than returned to a sponsor, and payout-rail section 1.1 makes
    // staying at `pending` the correct outcome when nobody reports — so treating
    // it as not-yet-refundable is the honest reading rather than a pessimistic one.
    return nothing;
  }
  if (input.status !== 'expired' || input.cancelledAt === null) {
    // Disputed, or a terminal status this build cannot date. The owner decides.
    // `totalCents` is reported even though `shares` is empty: how much is unspent
    // is not in dispute, only its disposition is.
    return {
      disposition: REFUND_DISPOSITIONS.ownerDecides,
      totalCents,
      shares: [],
      deadline,
      notice: REFUND_NOTICES.ownerDecides,
    };
  }
  if (input.claimedAgentId !== null) {
    // Cancelled after a solver started: payout-rail section 3.2, the contested
    // case. Referred rather than answered.
    return {
      disposition: REFUND_DISPOSITIONS.ownerDecides,
      totalCents,
      shares: [],
      deadline,
      notice: REFUND_NOTICES.ownerDecides,
    };
  }
  // Cancelled before any solver started. Every sponsor is owed exactly what they
  // put in, so the allocation is the identity — but it goes through the same
  // arithmetic a partial refund uses, because a full refund and a partial one
  // must not be two code paths that can disagree about the sum.
  return {
    disposition: REFUND_DISPOSITIONS.owedInFull,
    totalCents,
    shares: allocateProRata(input.funds, totalCents),
    deadline,
    notice: REFUND_NOTICES.owedInFull,
  };
}

/**
 * What a caller gets back from every bounty action.
 *
 * The full Bounty, not a summary. There is no second, smaller shape to keep in
 * step: a summary is a thing that drifts from the thing it summarises, and the
 * drift in this feature would be a reward amount or a link that stopped being
 * the real one.
 *
 * `funds` lives here rather than on `Bounty` because it is not part of the stored
 * record — it is a read, assembled by the summary builder alongside the payout
 * notice. Putting it on `Bounty` would have made the row mapper invent an empty
 * list, and an empty list on a co-funded bounty is a lie that typechecks.
 */
export type BountySummary = Bounty & {
  /**
   * Every sponsor's contribution, in funding order.
   *
   * Present on the value rather than behind a call, because a refund is
   * arithmetic on rows (payout-rail.md section 3.1) and a caller that had to ask
   * for the rows separately could render the total and omit the attribution. A
   * co-funded bounty whose second sponsor is invisible is the drift the design
   * warns about, one layer up: correct arithmetic nobody can see.
   *
   * `rewardCents` is the sum of these, and a value that disagrees with them is
   * the bug rather than the truth.
   */
  readonly funds: readonly RefundFund[];
  readonly payout: PayoutNotice;
};
