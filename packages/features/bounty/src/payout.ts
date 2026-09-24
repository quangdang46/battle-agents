/**
 * Payout intent: the three facts the platform writes about money, and nothing
 * else it may ever write.
 *
 * The design that decides this is docs/design/payout-rail.md. The short version:
 * Vercel Hobby is non-commercial only, and Vercel counts "any method of
 * requesting or processing payment" as commercial. So the platform does not hold,
 * route or process money — sponsors pay solvers directly and the platform
 * observes. That is an architectural constraint, not a phase, and this file is
 * where it stops being a note in a design doc and becomes a type.
 *
 * ## Why the guarantee is structural
 *
 * It would be easy to record intent here and let a later contributor add an
 * optional `destinationAccount` or a `transferId`. Nothing would stop them. So
 * the shape is arranged so that adding one is not a small edit:
 *
 *   - `PayoutMode` is a single-member union, so `mode` can only ever hold one
 *     value and a second mode cannot be added without changing this type.
 *   - The intent carries no field that could hold a credential, an account, a
 *     card token, or a handle that resolves to one. There is nowhere to put a
 *     transfer even if someone wanted to.
 *   - The rail is reached through a function that has no parameter capable of
 *     naming one, so the call site cannot pass one either.
 *
 * A guarantee that depends on nobody adding a field is not a guarantee. This
 * one is.
 */

/**
 * The only mode that exists.
 *
 * A single-member union rather than a boolean. `real: true` is a value some
 * future change could set; a union with one member means adding a second mode is
 * a visible edit to this declaration, in this file, where the reason lives.
 */
export const INTENT_ONLY = 'intent-only' as const;
export type PayoutMode = typeof INTENT_ONLY;

/** The states a payout passes through, in the order they occur. */
export const PAYOUT_STATES = ['funded', 'pending', 'recorded'] as const;
export type PayoutState = (typeof PAYOUT_STATES)[number];

export const PAYOUT_EVENTS = {
  funded: 'bounty.payout_funded',
  pending: 'bounty.payout_pending',
  recorded: 'bounty.payout_recorded',
} as const;

/** What the platform is willing to say about a payment. */
export interface PayoutIntent {
  readonly bountyId: string;
  /** A stated target in integer cents. Never a transferred amount. */
  readonly amountCents: number;
  readonly state: PayoutState;
  readonly mode: PayoutMode;
  /** ISO instant. */
  readonly recordedAt: string;
  /**
   * Who reported it. Always a person: the platform cannot observe a transfer
   * between two humans, so every `recorded` is an attributed claim, never an
   * inference. Present on every state because a funded bounty is a claim too.
   */
  readonly reportedBy: string;
}

/**
 * Where intents are stored.
 *
 * A port like every other feature's storage, so the bounty feature does not
 * import the database. Its implementation in packages/db matches this shape
 * structurally, because infrastructure may not import the layer that consumes
 * it.
 */
export interface PayoutIntentStore {
  record(intent: PayoutIntent): Promise<void>;
  /** The current intent for a bounty, or undefined if it has none yet. */
  currentFor(bountyId: string): Promise<PayoutIntent | undefined>;
}

/**
 * Declares a funding target.
 *
 * No money has moved and none can be said to have. The function is named
 * `declare` rather than `pay` or `transfer` for the same reason the type has no
 * `real` flag: the name is the first thing a reader sees, and it should not
 * have to be cross-referenced to find out.
 */
export function declareFunding(input: {
  readonly bountyId: string;
  readonly amountCents: number;
  readonly reportedBy: string;
  readonly now: string;
}): PayoutIntent {
  return {
    bountyId: input.bountyId,
    amountCents: requireNonNegative(input.amountCents, 'amountCents'),
    state: 'funded',
    mode: INTENT_ONLY,
    recordedAt: input.now,
    reportedBy: input.reportedBy,
  };
}

/**
 * Moves a funded bounty to pending: the conditions for paying are met.
 *
 * Still not a payment. A merge is a reason to pay, not a payment.
 */
export function markPending(input: {
  readonly bountyId: string;
  readonly amountCents: number;
  readonly reportedBy: string;
  readonly now: string;
}): PayoutIntent {
  return {
    bountyId: input.bountyId,
    amountCents: requireNonNegative(input.amountCents, 'amountCents'),
    state: 'pending',
    mode: INTENT_ONLY,
    recordedAt: input.now,
    reportedBy: input.reportedBy,
  };
}

/**
 * Records that a transfer was reported to have happened.
 *
 * A claim by a person, not an observation. The platform cannot see money move
 * between two humans, and an inference here would be the one place in the
 * product where it quietly invents a fact.
 */
export function markRecorded(input: {
  readonly bountyId: string;
  readonly amountCents: number;
  readonly reportedBy: string;
  readonly now: string;
}): PayoutIntent {
  return {
    bountyId: input.bountyId,
    amountCents: requireNonNegative(input.amountCents, 'amountCents'),
    state: 'recorded',
    mode: INTENT_ONLY,
    recordedAt: input.now,
    reportedBy: input.reportedBy,
  };
}

const LEGAL_MOVES: Readonly<Record<PayoutState, readonly PayoutState[]>> = {
  funded: ['pending'],
  pending: ['recorded'],
  recorded: [],
};

export function canTransition(from: PayoutState, to: PayoutState): boolean {
  return LEGAL_MOVES[from].includes(to);
}

/**
 * Whether a UI must say the reward is a target and not a payment.
 *
 * A rule rather than a component, so the decision is testable without a
 * renderer, and so every surface that shows a bounty asks the same question. A
 * banner on the web page and none in the API response is how a user ends up
 * believing they were paid.
 *
 * True for every state that has money attached and has not been reported
 * transferred. `recorded` is excluded here because the caller has to say how to
 * read it — it is a human's claim, not something the platform observed — and
 * this rule does not get to decide that for them.
 */
export function needsSandboxBanner(state: PayoutState | 'none'): boolean {
  return state !== 'none' && state !== 'recorded';
}

/**
 * Why an intent was refused.
 *
 * A discriminant, not a class, for the reason the other cross-layer contracts
 * use one: the store that receives this lives in another layer and cannot
 * import the class.
 */
export const PAYOUT_REJECTIONS = {
  invalidAmount: 'payout-invalid-amount',
  illegalTransition: 'payout-illegal-transition',
  /** A caller trying to use this to move money, which this package cannot do. */
  transferAttempted: 'payout-transfer-attempted',
  missingReporter: 'payout-missing-reporter',
} as const;

export type PayoutRejection = (typeof PAYOUT_REJECTIONS)[keyof typeof PAYOUT_REJECTIONS];

export type PayoutRejectionCheck =
  { readonly accepted: true } | { readonly accepted: false; readonly code: PayoutRejection };

/**
 * Whether an intent may be recorded.
 *
 * The gate every write goes through, and the single place a refusal can be
 * explained. It is a function rather than a type because a value can arrive from
 * outside the type system — a JSON body, a row written by an older build — and
 * the types do not see those.
 */
export function checkIntent(
  intent: PayoutIntent,
  previous: PayoutIntent | undefined,
): PayoutRejectionCheck {
  if (!Number.isInteger(intent.amountCents) || intent.amountCents < 0) {
    return { accepted: false, code: PAYOUT_REJECTIONS.invalidAmount };
  }
  if (intent.reportedBy.trim() === '') {
    // Every state is somebody's claim, including "funded". An unattributed
    // intent is the one thing the audit trail cannot use.
    return { accepted: false, code: PAYOUT_REJECTIONS.missingReporter };
  }
  if (intent.mode !== INTENT_ONLY) {
    // Unreachable through the typed constructors, which is the point — and
    // reachable from a parsed body, which is why it is still checked.
    return { accepted: false, code: PAYOUT_REJECTIONS.transferAttempted };
  }
  if (previous !== undefined && !canTransition(previous.state, intent.state)) {
    return { accepted: false, code: PAYOUT_REJECTIONS.illegalTransition };
  }
  return { accepted: true };
}

function requireNonNegative(amountCents: number, field: string): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(
      `${field} must be a whole number of cents, got ${String(amountCents)}. A float ` +
        'loses a cent somewhere, and once the sum of refunds stops equalling the sum of ' +
        'funds, every refund path is wrong.',
    );
  }
  return amountCents;
}
