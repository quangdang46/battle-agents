/**
 * A funding attempt that did not become a funding row, and what it means for the
 * money that was behind it.
 *
 * `refund.ts` answers "where does the money go when a bounty ends". This file
 * answers the other question open funding creates, which the refund vocabulary
 * has no word for: **the attempt never joined the ledger, so is there anything
 * to give back?**
 *
 * ## Why the answer cannot be "the sponsor was refunded"
 *
 * `docs/design/payout-rail.md` section 1 is the reason, and it is a hosting
 * constraint rather than a phase: the platform does not hold, route or process
 * money. A refused contribution is therefore not a failed payment and not a
 * cancelled one — there was never a payment. Saying "refunded" would describe a
 * transfer that did not happen, and the sentence a sponsor reads after being
 * turned away has to survive being read by somebody who is worried about their
 * bank account.
 *
 * So the honest disposition is stated on every refusal, in the same words, and
 * it is the one thing true of every reason: nothing was taken, and there is
 * nothing to return.
 *
 * ## Why the reason still chooses the disposition
 *
 * Two refusals share that sentence and not much else, and a caller that is only
 * told "nothing was taken" still cannot answer the question they actually have,
 * which is whether the bounty they wanted to back is worth backing some other
 * time. A finished bounty and a payable one are different answers to that, so
 * the disposition is a function of the reason rather than a constant, and the
 * notice says which.
 *
 * No imports. The reasons and the dispositions are vocabulary about money, and
 * this file holds the same kind as `refund.ts` and `payout.ts` — none of which
 * needs a `BountyStatus` to be a member, only the caller that has one.
 */

/* ───────────────────────────── the reasons ───────────────────────────── */

/**
 * Why a top-up was turned away.
 *
 * Both are refusals rather than failures to record one: a malformed payload is
 * refused by `input.ts` before this file is reached, and never becomes an
 * attempt worth a row.
 *
 * These are the `code` values on the thrown error, so they are part of the wire:
 * a caller branches on them. The spelling is the one `payout.ts` uses for the
 * same condition, because it is the same condition — a value arriving for a
 * payout intent that is no longer `funded`.
 */
export const FUNDING_REFUSALS = {
  /** `completed`, `expired` or `disputed`: the lifecycle itself is finished. */
  terminal: 'bounty-not-fundable',
  /** The payout intent is `pending` or `recorded`: the bounty is already payable. */
  payable: 'payout-illegal-transition',
} as const;

export type FundingRefusalReason = (typeof FUNDING_REFUSALS)[keyof typeof FUNDING_REFUSALS];

/* ────────────────────────── the money, stated once ────────────────────────── */

/**
 * True of every refusal, and on every one of them deliberately.
 *
 * The platform has no state in which it holds money, so the contribution behind
 * a refused attempt is still sitting in the account of the person who has not
 * sent it. That is a stronger and stranger claim than "we refunded you", and it
 * is the one a sponsor needs: the failure they are being told about is a
 * bookkeeping refusal on this side of the wire, not a charge that went
 * somewhere.
 *
 * It is exported so a test can assert the refusal carries it, which is the only
 * way the sentence is known to have survived an edit to the message above it.
 */
export const NO_MONEY_WAS_TAKEN =
  'No money moved and none is held here. This platform never takes a payment — sponsors pay ' +
  'solvers directly, off-platform — so nothing was charged and there is nothing to refund. The ' +
  'contribution you were making never left you.';

/* ───────────────────────────── the dispositions ───────────────────────────── */

/**
 * What became of a refused contribution, beyond the fact that nothing moved.
 *
 * Two members and not a boolean, for the reason `REFUND_DISPOSITIONS` is not
 * one: whether money is owed back and whether anybody has decided it is are
 * different questions, and the same collapse is available here. A caller that
 * gets `bounty-finished` learns the bounty is over; a caller that gets
 * `already-payable` learns the work is done and the money is the solver's. Both
 * then read the same sentence about their own bank account, which is what makes
 * the pair worth having rather than one value.
 */
export const FUNDING_REFUSAL_DISPOSITIONS = {
  /**
   * The lifecycle is finished — `completed`, `expired` or `disputed` — so the
   * bounty will never be payable again and this contribution has no future
   * here. Where a sponsor on the ledger stands is a different question with a
   * different answer, and `describeRefund` on the bounty's summary is what
   * answers it; this disposition is about the attempt, not about them.
   */
  bountyFinished: 'bounty-finished',
  /**
   * The intent is `pending` or `recorded`: a pull request has been merged and a
   * solver is owed the total. Money cannot be added to an amount already owed,
   * so the sum would be a number the solver is not being paid and the sponsors
   * are not refunded from.
   */
  alreadyPayable: 'already-payable',
} as const;

export type FundingRefusalDisposition =
  (typeof FUNDING_REFUSAL_DISPOSITIONS)[keyof typeof FUNDING_REFUSAL_DISPOSITIONS];

/* ───────────────────────────── the value ───────────────────────────── */

/**
 * A refused attempt, as the sponsor is told about it.
 *
 * The thrown error carries it and the `bounty.funding_refused` payload repeats
 * it, and both readings are asserted against this one value rather than against
 * two independently written strings — a sponsor told one thing at the moment of
 * the refusal and a different thing when they read the log afterwards is the
 * failure this shape is for.
 *
 * `reason` stays the wire `code` so a caller that already branches on it keeps
 * working; `disposition` is the new, finer answer.
 */
export interface FundingRefusal {
  readonly reason: FundingRefusalReason;
  readonly disposition: FundingRefusalDisposition;
  /** Never empty, and never only the disposition — a caller has to be able to render it. */
  readonly notice: string;
}

/**
 * The disposition a reason implies, and the words that go with it.
 *
 * A lookup rather than a branch at each call site so the two cannot disagree:
 * `feature.ts` has two refusal points today, and the failure of a `switch` here
 * would be a reason that reported a disposition its sibling never uses.
 */
const BY_REASON: Readonly<Record<FundingRefusalReason, Omit<FundingRefusal, 'reason'>>> = {
  [FUNDING_REFUSALS.terminal]: {
    disposition: FUNDING_REFUSAL_DISPOSITIONS.bountyFinished,
    notice:
      'This bounty is over — it was completed, expired or disputed — so it will never be paid ' +
      'out and it cannot take new funding. If the work is still worth paying for, a sponsor can ' +
      'open a bounty on the same issue and everyone who wanted to back it can fund that one. ' +
      NO_MONEY_WAS_TAKEN,
  },
  [FUNDING_REFUSALS.payable]: {
    disposition: FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable,
    notice:
      'This bounty is already payable: a pull request has been merged against it, so the reward ' +
      'is owed to the solver and the amount is settled. Money cannot be added to a total that ' +
      'has already been promised to somebody. ' +
      NO_MONEY_WAS_TAKEN,
  },
};

/**
 * A refusal, for a reason the caller has already decided.
 *
 * `bountyStatus` is not an input, and the omission is the same one
 * `describeRefund` makes deliberately: the status is the reason's own evidence
 * and the caller has it, so a second copy of it here could only disagree. What
 * this function owns is the mapping from a reason to what a sponsor is told,
 * because that sentence is a claim about the money and belongs in one place.
 */
export function fundingRefused(reason: FundingRefusalReason): FundingRefusal {
  const entry = BY_REASON[reason];
  if (entry === undefined) {
    // Unreachable through the typed reasons, and reachable from a parsed body or
    // a row written by a build that knew more reasons than this one. Refusing to
    // answer is the fail-closed half: a reason this build cannot explain has no
    // sentence, and inventing one is how a caller is told their money is safe on
    // the strength of a rule nobody wrote.
    throw new Error(
      `no funding-refusal disposition for ${String(reason)}; a refusal this build cannot ` +
        'explain would leave a sponsor with a reason and no answer about their money',
    );
  }
  return { reason, ...entry };
}

/**
 * The error every refused top-up throws.
 *
 * A discriminant-carrying `Error` rather than a class, for the reason
 * `BountyInputRejected` gives: the error crosses a process boundary to a
 * transport that cannot import this package, and what the two sides can agree on
 * is a stable `code` plus a body. The refusal rides along as a property so a
 * transport can render the disposition without re-deriving it from the reason.
 */
export interface FundingRefusedError extends Error {
  readonly code: FundingRefusalReason;
  readonly refusal: FundingRefusal;
  /**
   * 409 rather than 500, and declared here so the transport reads it from the
   * value rather than from a table it has to keep in step with this package. A
   * client that retries a 500 retries a top-up that can never succeed, and the
   * two are the same request.
   */
  readonly status: 409;
}

export function fundingRefusedError(refusal: FundingRefusal, context: string): FundingRefusedError {
  return Object.assign(new Error(`${context} ${refusal.notice}`), {
    code: refusal.reason,
    refusal,
    status: 409 as const,
  });
}
