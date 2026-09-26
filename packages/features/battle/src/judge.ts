import { JUDGE_CRITERIA, type BattleWeights, type JudgeCriterion } from './domain.js';

/**
 * The scoring policy: per-criterion results in, one weighted total out.
 *
 * What this file is, and what it deliberately is not. ba-battle-workspace-judge-jc9
 * owns the judge RUN — provisioning the workspace, invoking the suite, timing a
 * participant out — and produces one 0..1 result per criterion. Its own brief
 * says the two beads "must not each define the score", and this is the half
 * nobody else can own: the weights, the combination, the tie rule, and the
 * refusal to score a half-judged battle. A judge that returned a single number
 * would put the rubric and the verdict in the same place, which is how a hidden
 * rubric comes back.
 *
 * The contributions are returned, not just the total. A total that cannot be
 * decomposed into its parts cannot be shown to the two agents who lost to it, and
 * a score nobody can explain is a score nobody can contest.
 */

/** One criterion's finding, 0..1. A criterion that ran and found nothing passing scores 0. */
export interface CriterionResult {
  readonly criterion: JudgeCriterion;
  readonly score: number;
}

export interface WeightedContribution {
  readonly criterion: JudgeCriterion;
  readonly weight: number;
  readonly score: number;
  readonly weighted: number;
}

export interface WeightedScore {
  readonly total: number;
  readonly contributions: readonly WeightedContribution[];
}

/** Why a score cannot be computed, or undefined when it can. */
export type ScoringRejection =
  | { readonly reason: 'criterion-not-a-known-criterion' }
  | { readonly reason: 'criterion-score-not-a-number' }
  | { readonly reason: 'criterion-score-not-finite' }
  | { readonly reason: 'criterion-score-out-of-range' }
  | { readonly reason: 'criterion-not-scored' }
  | { readonly reason: 'criterion-scored-twice' };

/** Thrown by `scoreAgainst`, which is the only place a score is produced. */
export class UnscorableBattle extends Error {
  readonly rejection: ScoringRejection;

  constructor(rejection: ScoringRejection) {
    super(`a battle cannot be scored: ${describeRejection(rejection)}`);
    this.name = 'UnscorableBattle';
    this.rejection = rejection;
  }
}

/**
 * Decimal places a weighted figure is reported to.
 *
 * Rounding is not cosmetic here: the total is compared for EQUALITY to decide
 * whether two participants tied, and 0.1 + 0.2 + 0.3 in binary floating point is
 * not the number anyone wrote down. Comparing unrounded totals would hand a
 * winner to whichever participant's arithmetic happened to land a bit higher,
 * which is a tiebreak by floating point — invisible, and indistinguishable from
 * rigging to anybody watching.
 */
export const SCORE_DECIMALS = 6;

function round(value: number): number {
  return Number(value.toFixed(SCORE_DECIMALS));
}

/**
 * The weighted total, with every part of it.
 *
 * The iteration is over `JUDGE_CRITERIA`, never over the results array, and that
 * is the determinism guarantee: the order the judge happens to report its checks
 * in cannot change the arithmetic, because the arithmetic never looks at that
 * order. A judge that summed whatever it was handed would return a different
 * last bit for two runs of the same battle that reported their checks in a
 * different order, and a battle decided on the last bit of a sum is a battle
 * decided by scheduling.
 *
 * A criterion the weights name but the judge did not score is a refusal, not a
 * zero. Zero means "this check ran and the work did not pass it", which is a
 * finding; a missing one means the check never ran, and scoring a battle on
 * checks that did not run is how a broken workspace produces a winner. Forfeit
 * and timeout rules belong to the judge bead, and this throws rather than
 * guessing which of them applies.
 */
export function scoreAgainst(
  results: readonly CriterionResult[],
  weights: BattleWeights,
): WeightedScore {
  const byCriterion = new Map<JudgeCriterion, CriterionResult>();
  for (const result of results) {
    if (!(JUDGE_CRITERIA as readonly string[]).includes(result.criterion)) {
      throw new UnscorableBattle({ reason: 'criterion-not-a-known-criterion' });
    }
    if (typeof result.score !== 'number') {
      throw new UnscorableBattle({ reason: 'criterion-score-not-a-number' });
    }
    if (!Number.isFinite(result.score)) {
      throw new UnscorableBattle({ reason: 'criterion-score-not-finite' });
    }
    if (result.score < 0 || result.score > 1) {
      throw new UnscorableBattle({ reason: 'criterion-score-out-of-range' });
    }
    if (byCriterion.has(result.criterion)) {
      throw new UnscorableBattle({ reason: 'criterion-scored-twice' });
    }
    byCriterion.set(result.criterion, result);
  }

  const contributions: WeightedContribution[] = [];
  let total = 0;
  for (const criterion of JUDGE_CRITERIA) {
    const result = byCriterion.get(criterion);
    if (result === undefined) {
      throw new UnscorableBattle({ reason: 'criterion-not-scored' });
    }
    const weight = weights[criterion];
    const weighted = round(weight * result.score);
    contributions.push({ criterion, weight, score: result.score, weighted });
    total += weighted;
  }
  return { total: round(total), contributions };
}

/* ───────────────────────────── the result ───────────────────────────── */

/** Why nobody won, for a battle where nobody did. */
export const NO_WINNER_NO_VALID_SUBMISSION = 'no-valid-submission';
export const NO_WINNER_NO_PARTICIPANTS = 'no-participants';

/** Why a winner won, so a replay and a dispute can both name it. */
export type WinReason = 'outscored' | 'fastest-valid' | 'shared';

export type BattleOutcome =
  | {
      readonly kind: 'won';
      readonly winnerSessionIds: readonly string[];
      readonly reason: WinReason;
    }
  | { readonly kind: 'no-winner'; readonly reason: string };

/** One scored participant, as the outcome rule sees them. */
export interface ScoredParticipant {
  readonly sessionId: string;
  readonly score: number;
  /** When a VALID submission was made. Null when the participant submitted nothing. */
  readonly submittedAt: string | null;
}

/**
 * Who won, from the scores and the mode.
 *
 * Three cases, and the order they are decided in matters:
 *
 *   no valid submission   Nobody entered the arena, so there is nothing to
 *                         compare. Naming a winner here would award a match
 *                         neither participant played.
 *   a unique top score    The ordinary case.
 *   a tie                  The mode's rule, resolved by the caller from the mode
 *                         and passed in here, so this function never has to know
 *                         what a mode is. `fastest-valid` gives the tie to the
 *                         earliest valid submission; `shared` splits it, and a
 *                         tie `fastest-valid` cannot break because the
 *                         submissions carry the same instant is shared too
 *                         rather than resolved by the order the rows came back
 *                         in.
 *
 * A tie at zero is a shared win rather than a no-winner, which is the
 * deliberate choice. Two agents who both submitted and both failed everything
 * have still produced a result, and the difference between "nobody won" and
 * "everybody tied" is the difference between an empty match and a draw. Calling
 * it a draw credits nobody with beating anybody, which is the only defensible
 * reading of a rubric they both failed.
 */
export function decideOutcome(
  participants: readonly ScoredParticipant[],
  tiePolicy: 'fastest-valid' | 'shared',
): BattleOutcome {
  const entered = participants.filter((participant) => participant.submittedAt !== null);
  if (participants.length === 0) {
    return { kind: 'no-winner', reason: NO_WINNER_NO_PARTICIPANTS };
  }
  if (entered.length === 0) {
    return { kind: 'no-winner', reason: NO_WINNER_NO_VALID_SUBMISSION };
  }

  const ranked = [...entered].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (best === undefined) {
    // The filter above leaves at least one entry, so this is unreachable; the
    // branch exists because `ranked[0]` is `ScoredParticipant | undefined` under
    // noUncheckedIndexedAccess and an `as` here would be a lie about the length.
    return { kind: 'no-winner', reason: NO_WINNER_NO_PARTICIPANTS };
  }
  const tied = ranked.filter((participant) => participant.score === best.score);

  if (tied.length === 1) {
    return { kind: 'won', winnerSessionIds: [best.sessionId], reason: 'outscored' };
  }
  if (tiePolicy === 'fastest-valid') {
    const earliest = tied.reduce((left, right) =>
      (left.submittedAt ?? '') <= (right.submittedAt ?? '') ? left : right,
    );
    const alsoEarliest = tied.filter(
      (participant) => participant.submittedAt === earliest.submittedAt,
    );
    if (alsoEarliest.length === 1) {
      return { kind: 'won', winnerSessionIds: [earliest.sessionId], reason: 'fastest-valid' };
    }
  }
  return {
    kind: 'won',
    winnerSessionIds: tied.map((participant) => participant.sessionId).sort(),
    reason: 'shared',
  };
}

function describeRejection(rejection: ScoringRejection): string {
  switch (rejection.reason) {
    case 'criterion-not-a-known-criterion':
      return 'a result named a criterion this build does not judge';
    case 'criterion-score-not-a-number':
      return 'a criterion score was not a number';
    case 'criterion-score-not-finite':
      return 'a criterion score was not finite';
    case 'criterion-score-out-of-range':
      return 'a criterion score was outside 0..1';
    case 'criterion-not-scored':
      return 'a criterion the rubric names produced no result, so the battle was only half judged';
    case 'criterion-scored-twice':
      return 'a criterion was scored twice, so the weights were applied to it twice';
  }
}
