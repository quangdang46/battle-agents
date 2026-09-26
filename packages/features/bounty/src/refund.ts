/**
 * The vocabulary and the arithmetic of giving a sponsor their money back.
 *
 * `docs/design/payout-rail.md` section 3 lists three endings that owe money back
 * and section 4.1 answers the only question the arithmetic is allowed to answer:
 * who adjudicates. For the contested case the answer is the repository owner, in
 * the repository, and "the platform executes the refund arithmetic it is given".
 * That sentence is the whole reason this file computes a number and never picks
 * one.
 *
 * ## What this does not do
 *
 * It moves nothing, holds nothing and schedules nothing. The money is the
 * sponsor's and the solver's, out of band, exactly as `payout.ts` says, and the
 * deadline reported alongside a refund is the platform stating when its own record
 * stops being evidence — not a promise that anything will be transferred by then.
 *
 * ## Why the shares sum exactly
 *
 * `bounty_funds` is a ledger. Once a refund exists, the only property that keeps
 * it trustworthy is that the shares add up to the amount being returned, to the
 * cent, every time. Integer cents and largest-remainder are what make that true;
 * a float, or a floor-and-hand-the-leftover-to-anyone rule, loses a cent
 * somewhere, and the residue has to go somewhere decided rather than arbitrary.
 *
 * No imports. The disposition needs `BountyStatus` and the terminal rule, and
 * those live in `domain.ts` — which is where `describeRefund` therefore is, next
 * to `describePayout` and the other two shape builders. A cycle between a
 * vocabulary file and the domain it describes is one more edge for a reader to
 * resolve, and there was no need for it.
 */

/* ───────────────────────────── the vocabulary ───────────────────────────── */

/**
 * What is owed back, and who says so.
 *
 * Three values because there are three answers, and a boolean would have to
 * answer two different questions with one bit: whether money is owed, and whether
 * anybody has actually decided that it is.
 */
export const REFUND_DISPOSITIONS = {
  /** No sponsor is out of pocket: the bounty was never funded, or it paid. */
  notApplicable: 'not-applicable',
  /**
   * Cancelled before any solver worked, so every sponsor is owed back exactly
   * what they put in. The one case the platform can settle on its own, because
   * nobody's judgement of the work is involved.
   */
  owedInFull: 'owed-in-full',
  /**
   * A solver had started, or the bounty is disputed. The repository owner
   * decides who was owed (payout-rail sections 3.2 and 4.1); the platform holds
   * the funding rows as the evidence and computes nothing on their behalf.
   */
  ownerDecides: 'owner-decides',
} as const;

export type RefundDisposition = (typeof REFUND_DISPOSITIONS)[keyof typeof REFUND_DISPOSITIONS];

/** One sponsor's contribution, as the funding rows hold it. */
export interface RefundFund {
  readonly sponsorUserId: string;
  readonly amountCents: number;
}

/** What one sponsor is owed back. */
export interface RefundShare {
  readonly sponsorUserId: string;
  readonly amountCents: number;
}

/**
 * What a surface is told about the money a cancelled bounty is sitting on.
 *
 * Unconditionally on the notice, and for the same reason `PayoutNotice` is
 * unconditional on a funded bounty: the failure this exists to prevent is a
 * sponsor whose bounty expired, closing the tab believing either that the money
 * is escrowed or that it evaporated. It did neither.
 */
export interface RefundNotice {
  readonly disposition: RefundDisposition;
  /**
   * Everything the sponsors put in, which is what is at stake.
   *
   * Zero when `disposition` is `not-applicable`, and NOT zero for
   * `owner-decides` — the money is genuinely unspent there; the platform simply
   * does not get to say how much of it comes back.
   */
  readonly totalCents: number;
  /**
   * The allocation, when the platform may state one. Empty for `owner-decides`,
   * which is the honest answer rather than a guess dressed as arithmetic.
   */
  readonly shares: readonly RefundShare[];
  /** When the platform's own record stops being evidence, or null if it has not begun. */
  readonly deadline: string | null;
  /** Never empty. A caller that renders `disposition` alone has to interpret it. */
  readonly notice: string;
}

/* ───────────────────────────── the arithmetic ───────────────────────────── */

/**
 * Splits `refundableCents` across the funding rows, and gives back exactly that.
 *
 * Pro rata on each row's own amount, largest-remainder for the rounding, and the
 * residue to the earliest contributor. Largest-remainder rather than
 * floor-then-distribute-the-leftover-arbitrarily, because the alternative is a
 * rule decided by iteration order, and a sponsor short by one cent is a support
 * ticket whose answer is "which of your funds did you think was last?".
 *
 * `refundableCents` may be less than the total — that is the owner's decision
 * arriving from section 4.1 — but it may not be negative or non-integer, and it
 * may not exceed the total, because a refund larger than the money in would be
 * arithmetic inventing a debt nobody owes.
 *
 * Rows that contributed nothing keep a share of zero rather than disappearing. A
 * sponsor who funded 0 cents is still a sponsor, and dropping them is how "who was
 * refunded" stops matching "who funded".
 *
 * The rows are expected in funding order, and the residue rule depends on it: the
 * first `residue` rows take the extra cent. `fundsFor` sorts by `created_at` then
 * `id` so that "earliest contributor" is a property of the store rather than of
 * whatever order a reader happened to use.
 */
export function allocateProRata(
  funds: readonly RefundFund[],
  refundableCents: number,
): readonly RefundShare[] {
  if (!Number.isInteger(refundableCents) || refundableCents < 0) {
    throw new Error(
      `refundableCents must be a whole number of cents, got ${String(refundableCents)}`,
    );
  }
  const totalCents = sumOf(funds);
  if (refundableCents > totalCents) {
    throw new Error(
      `refundableCents ${refundableCents} exceeds the ${totalCents} cents funded; a refund ` +
        'larger than the money in is a debt nobody owes',
    );
  }
  if (funds.length === 0) {
    return [];
  }

  const floors = funds.map((fund) => Math.floor((fund.amountCents * refundableCents) / totalCents));
  let residue = refundableCents - sumOfAmounts(floors);

  return funds.map((fund, index) => {
    const share = (floors[index] ?? 0) + (residue > 0 ? 1 : 0);
    if (share > 0) {
      residue -= 1;
    }
    return { sponsorUserId: fund.sponsorUserId, amountCents: share };
  });
}

function sumOf(funds: readonly RefundFund[]): number {
  return funds.reduce((total, fund) => total + fund.amountCents, 0);
}

function sumOfAmounts(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/* ───────────────────────────── the notice text ───────────────────────────── */

/**
 * Exported because the three sentences are claims about what the platform did and
 * did not do, and a test that asserts the disposition without asserting these is
 * asserting half of it.
 */
export const REFUND_NOTICES = {
  nothingOutstanding: 'No sponsor is out of pocket: this bounty has no unspent funding.',
  ownerDecides:
    'This bounty was cancelled or is disputed after a solver started, so the repository owner ' +
    'decides who was owed — the platform does not adjudicate it. The funding rows are the ' +
    'evidence, and the platform executes refund arithmetic it is given rather than inventing an ' +
    'allocation. No money has moved and none is held here.',
  owedInFull:
    'This bounty was cancelled before any solver started, so every sponsor is owed back exactly ' +
    'what they put in, and the shares add up to the total. The refund happens off-platform ' +
    'between the sponsors: this is a record of what is owed, not a transfer, and nothing here is ' +
    'escrowed.',
} as const;
