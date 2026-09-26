import type { AchievementCode, RecordedRow } from './rules.js';
import { describeCode, IN_FLIGHT_SEQUENCE } from './rules.js';

/**
 * Achievements: badges derived from what an agent actually did.
 *
 * Plan section 30 puts this feature in the same sentence as replay and audit —
 * all three read the one ordered activity log rather than from scattered
 * feature tables — and this is the third of them. A badge is a PROJECTION over
 * that log, which is the whole reason it cannot disagree with the history it
 * claims to summarise. There is no counter here to drift, no scheduled job
 * rescanning the bounties table, and no second source of truth to reconcile
 * with anything.
 *
 * Which means an award is also retroactively derivable: a rule added tomorrow
 * can be run over today's rows and reach an answer about an agent established
 * last month. That is the correct answer, not a bug — a veteran who completed
 * four bounties before the badge existed has earned it, and withholding it
 * because the rule is newer than the work is the plan's own mistake being
 * repeated. `achievements.project` is that re-derivation, and it is the same
 * function the live handler runs.
 */

/** The event this feature emits, and the only one it owns. */
export const ACHIEVEMENT_AWARDED = 'achievement.awarded';

export interface AchievementAwardedPayload {
  readonly agentId: string;
  readonly code: AchievementCode;
  /** When the badge was granted. */
  readonly awardedAt: string;
  /**
   * When the recorded outcome that completed the rule happened, which is not
   * the same instant: a backfill run today grants a badge for work from months
   * ago, and an event that reported only `awardedAt` would put the award in a
   * session's trail at a moment the agent was doing something else entirely.
   */
  readonly evidenceAt: string;
  /**
   * The recorded row that satisfied the rule, as a fact rather than a
   * reference. A log sequence is meaningless to anyone but this database, so
   * the type and the instant travel and the sequence does not.
   */
  readonly evidenceType: string;
}

/** One badge as a character sheet renders it. */
export interface AchievementBadgeView {
  /**
   * The stored code, verbatim. Not AchievementCode, and not re-derived from the
   * slug: a badge this build does not recognise must come back as it was awarded,
   * and every other field on this view is already nullable for exactly that
   * case. Typing this one narrowly made "unknown code" unrepresentable while the
   * rest of the row said it was expected.
   */
  readonly code: string;
  /** The unversioned name, stable across rewording. */
  readonly slug: string | null;
  /** The major version the code claims. */
  readonly version: number | null;
  /** Null when this build has never heard of the code. See describeCode. */
  readonly title: string | null;
  readonly detail: string | null;
  readonly awardedAt: string;
}

/** What a caller asking about a character's badges is told. */
export interface AchievementsView {
  readonly agentId: string;
  readonly badges: readonly AchievementBadgeView[];
  readonly count: number;
  /**
   * False when the character holds nothing at all.
   *
   * The read answers rather than throwing, for the reason progression's does: a
   * caller asking about a brand-new agent needs an answer, and an exception is
   * not one. This flag is what keeps "has earned nothing" and "nobody has heard
   * of" apart, because an empty list is otherwise both.
   */
  readonly exists: boolean;
}

/** A badge rendered off a row, with its meaning looked up rather than stored. */
export function viewBadge(awarded: {
  readonly code: string;
  readonly awardedAt: string;
}): AchievementBadgeView {
  const described = describeCode(awarded.code);
  return {
    // The stored code, not a canonicalised one. A code this build does not know
    // still comes back exactly as awarded: re-deriving it from the slug would
    // silently rewrite a v1 badge as whatever v2 happens to mean.
    code: awarded.code,
    slug: described.slug,
    version: described.version,
    title: described.title,
    detail: described.detail,
    awardedAt: awarded.awardedAt,
  };
}

/**
 * A recorded row built from an in-flight event.
 *
 * The store has already taken this event — the runtime persists before it
 * dispatches, and that ordering is the whole reason a handler can count against
 * the log — but this feature has not read the row back, so it is assembled from
 * the event's own fields.
 *
 * `sessionId` is read out of the payload because that is where it lives at this
 * point: the store lifts it into its own column on the way in and takes it out
 * of the payload, so this is the same value the log will group on.
 */
export function recordedRowOf(event: {
  readonly type: string;
  readonly occurredAt: string;
  readonly actorId?: string | null;
  readonly payload: unknown;
}): RecordedRow {
  const payload =
    typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {};
  const inPayload = payload['sessionId'];
  return {
    sequence: IN_FLIGHT_SEQUENCE,
    type: event.type,
    sessionId: typeof inPayload === 'string' && inPayload.length > 0 ? inPayload : null,
    actorId: typeof event.actorId === 'string' && event.actorId.length > 0 ? event.actorId : null,
    occurredAt: event.occurredAt,
    payload,
  };
}

/* ───────────────────────── the actions that read a payload ───────────────────────── */

/**
 * Every way this feature refuses a payload, or undefined when it accepts one.
 *
 * One union across the two reading actions, for the reason progression and
 * reputation each keep one: the reason exists to be written into a sentence,
 * and a caller that wanted to know WHICH action it was had just named it.
 */
export type AchievementsRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'agent-id-not-a-string' }
  | { readonly reason: 'agent-id-empty' };

/** The character a read or a projection is about. */
export interface AchievementsAgentInput {
  readonly agentId: string;
}

/**
 * Why a read cannot be asked for, or undefined when it can.
 *
 * `unknown`, like every validator here: the payload arrived from `act()` as an
 * unconstrained generic, so `act('achievements.list', {})` compiled clean and
 * queried `agentId = undefined` — which is not a question anybody asked.
 */
export function whyAchievementsListIsRejected(input: unknown): AchievementsRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  return whyAgentIdIsMissing((input as { readonly agentId?: unknown }).agentId);
}

/** As above, for the projection. The two take the same shape, on purpose. */
export function whyAchievementsProjectIsRejected(
  input: unknown,
): AchievementsRejection | undefined {
  return whyAchievementsListIsRejected(input);
}

export function isAchievementsListInput(input: unknown): input is AchievementsAgentInput {
  return whyAchievementsListIsRejected(input) === undefined;
}

export function isAchievementsProjectInput(input: unknown): input is AchievementsAgentInput {
  return whyAchievementsProjectIsRejected(input) === undefined;
}

/** What each action wanted, as a sentence the caller can act on. */
export const ACHIEVEMENTS_LIST_SHAPE = 'A list takes an agentId, which must be a non-empty string.';
export const ACHIEVEMENTS_PROJECT_SHAPE =
  'A projection takes an agentId, which must be a non-empty string. It awards whatever the recorded ' +
  'log already justifies and nothing else, so running it twice changes nothing the second time.';

/**
 * The error a refused payload becomes.
 *
 * Built from the verdict, never from the payload: the caller guaranteed to be
 * handed the answer is the one that must not be reading the input back.
 */
export function achievementsInputRejected(
  action: string,
  rejection: AchievementsRejection,
  expected: string,
): Error {
  return Object.assign(new Error(`${action} rejected: ${rejection.reason}. ${expected}`), {
    code: 'malformed-input',
  });
}

function whyAgentIdIsMissing(agentId: unknown): AchievementsRejection | undefined {
  if (typeof agentId !== 'string') {
    return { reason: 'agent-id-not-a-string' };
  }
  if (agentId.length === 0) {
    return { reason: 'agent-id-empty' };
  }
  return undefined;
}
