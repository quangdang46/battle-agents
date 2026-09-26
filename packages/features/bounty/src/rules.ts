/**
 * Payout and dispute constants, as data.
 *
 * Every number in this file is one docs/design/payout-rail.md section 4.3
 * decided. They were prose there, which is a perfectly good place for a rule
 * nobody has to obey yet and a terrible place for one a feature has to enforce
 * — so they live here, where changing one is a visible edit to a line whose
 * reason is two lines above it, rather than a hunt through a design doc.
 *
 * The name collides with features/progression/src/rules.ts and
 * features/reputation/src/rules.ts, and that is deliberate on both sides: a
 * file called rules.ts in a feature is that feature's tuning table, and the
 * header is what tells a reader which table they opened. This one is the payout
 * and dispute windows and nothing else. A reader who greps rules.ts and finds
 * two unrelated tables is looking at two files that happen to share a name; the
 * headers are the disambiguation.
 */

/**
 * How long each of the four windows in section 4.3 stays open, in days.
 *
 * Named for what CLOSES rather than for what happens during them, because the
 * four things that happen are not symmetric: claiming, reporting, disputing and
 * refunding are different verbs with different failure modes, and a key called
 * `disputeDays` would have to be read next to the doc to know which side of the
 * window it measures.
 */
export const DISPUTE_WINDOWS = {
  /** A solver may claim this long after funding; after that the bounty expires. */
  claimAfterFundingDays: 7,
  /** A sponsor may report a transfer this long after it became payable. */
  reportTransferDays: 30,
  /** A dispute may be opened this long after a transfer was reported. */
  openDisputeDays: 30,
  /** An unclaimed refund is returned this long after the bounty was cancelled. */
  refundUnclaimedDays: 90,
} as const;

export type DisputeWindow = keyof typeof DISPUTE_WINDOWS;

const MS_PER_DAY = 86_400_000;

/**
 * The smallest bounty worth having.
 *
 * Section 5.2 of the design: below this, the support cost of a disputed reward
 * exceeds the reward, and a solved $2 bounty counts exactly as much in the
 * aggregate trust score as a solved $2000 one, which makes the score noise.
 *
 * Integer cents, like every other money value in this feature. A float here
 * would be a rounding rule nobody wrote down.
 */
export const MIN_BOUNTY_CENTS = 500;

const MS_PER_WINDOW: Readonly<Record<DisputeWindow, number>> = {
  claimAfterFundingDays: DISPUTE_WINDOWS.claimAfterFundingDays * MS_PER_DAY,
  reportTransferDays: DISPUTE_WINDOWS.reportTransferDays * MS_PER_DAY,
  openDisputeDays: DISPUTE_WINDOWS.openDisputeDays * MS_PER_DAY,
  refundUnclaimedDays: DISPUTE_WINDOWS.refundUnclaimedDays * MS_PER_DAY,
};

/**
 * The instant a window shuts.
 *
 * Returns null rather than throwing when there is no start instant, because
 * "the deadline is unknown because the thing has not happened" is a real state
 * for all four windows — a bounty nobody funded has no claim deadline — and
 * inventing a date for it would put an expiry on a bounty that never had one.
 */
export function windowClosesAt(
  window: DisputeWindow,
  from: string | null | undefined,
): string | null {
  if (from === null || from === undefined || from === '') {
    return null;
  }
  const start = Date.parse(from);
  if (Number.isNaN(start)) {
    // A timestamp the platform cannot read is not a timestamp it may do
    // arithmetic on. Refusing is the honest answer; substituting the epoch
    // would expire every window in the product at once.
    return null;
  }
  return new Date(start + MS_PER_WINDOW[window]).toISOString();
}

/**
 * Whether a window is still open.
 *
 * `>=` rather than `>`: a window that shuts at an exact instant is shut, and
 * the boundary is where a bug would live, so the rule is written down rather
 * than left to whichever comparison someone typed.
 *
 * Fail-closed on an unreadable timestamp. A window this code cannot date is a
 * window it must not report as open — the whole point of the 7-day claim rule
 * is that a listing nobody can start must stop looking available, and a
 * `NaN <= NaN` comparison is false by accident rather than by decision.
 */
export function windowIsOpen(
  window: DisputeWindow,
  from: string | null | undefined,
  now: string,
): boolean {
  const closesAt = windowClosesAt(window, from);
  if (closesAt === null) {
    return false;
  }
  return Date.parse(now) < Date.parse(closesAt);
}
