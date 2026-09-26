/**
 * Coding behaviour, mapped to stats. Plan sections 2.2 and 10.3.
 *
 * The rule this file exists to enforce is a prohibition. Section 2.2 bans
 * "token-count-as-damage" by name, and it bans it because a token economy pays
 * an agent for spending tokens to earn reward for spending tokens — the one
 * design in the plan that makes the product worse the more people use it. So
 * there is no counter in `CodingBehaviour` that counts tokens, tool bytes, or
 * anything else proportional to how much an agent was willing to spend, and no
 * line below reads one. The mapping is from what the agent DID.
 *
 * The four the plan names explicitly:
 *   Edit + tests pass      -> charge, and STR
 *   Edit + fail            -> a much smaller charge, and it feeds the streak
 *   five consecutive fails -> damage
 *   fixing your own bug    -> a critical hit, and LUK
 *
 * And the six stats, with the discipline each is counting:
 *   STR successful changes    INT reasoning steps
 *   WIS tool choices          LUK own-bug fixes
 *   DEF tests passed          DEX edit attempts
 *
 * These are BATTLE-LOCAL. progression owns the eight RuneScape skills and pays
 * for outcomes; it deliberately names no skill for a won battle, because a win is
 * the reward for a match rather than evidence about any discipline. So nothing
 * here is a skill, nothing here is written to a character sheet, and the
 * `charge` below is not experience: it is a number that lives and dies with the
 * battle and is reported to the arena. Progression's award for finishing a battle
 * is the existing one, and this feature emits the event that triggers it.
 */

/** Six disciplines, as the arena shows them. Not the eight skills progression owns. */
export const BATTLE_STAT_NAMES = ['str', 'int', 'wis', 'luk', 'def', 'dex'] as const;
export type BattleStatName = (typeof BATTLE_STAT_NAMES)[number];

export interface BattleStats {
  readonly str: number;
  readonly int: number;
  readonly wis: number;
  readonly luk: number;
  readonly def: number;
  readonly dex: number;
}

/**
 * What a participant has actually done, counted.
 *
 * Every field is a count of an OBSERVABLE act. None of them is a cost, a
 * duration, or a size, and that is the point: the struct is the only input the
 * stat functions take, so there is no field a token-derived term could be added
 * from without a type error.
 *
 * `longestFailureStreak` is held rather than derived because a streak is
 * sequential and the struct is not — a reducer that reset it on every pass
 * would have to be replayed in order, and the arena reads it after the battle
 * rather than during it.
 */
export interface CodingBehaviour {
  /** An edit whose verification passed. */
  readonly successfulChanges: number;
  /** Every edit attempted, green or not. This is what "fast iterations" counts. */
  readonly editAttempts: number;
  readonly reasoningSteps: number;
  /** A deliberate choice of one tool over another, not a call. */
  readonly toolChoices: number;
  readonly testsPassed: number;
  readonly testsFailed: number;
  readonly longestFailureStreak: number;
  /** A failure this participant's own edit caused, which they then fixed. */
  readonly ownBugFixes: number;
}

export function emptyCodingBehaviour(): CodingBehaviour {
  return {
    successfulChanges: 0,
    editAttempts: 0,
    reasoningSteps: 0,
    toolChoices: 0,
    testsPassed: 0,
    testsFailed: 0,
    longestFailureStreak: 0,
    ownBugFixes: 0,
  };
}

/* ───────────────────────────── the numbers ───────────────────────────── */

/**
 * What a change that works is worth here, against one that does not.
 *
 * Ten to one, and the ratio is the design rather than a tuning choice: the arena
 * reads as "do the work" and not as "try things until something sticks". A ratio
 * near one would make a long streak of failures and a short burst of successes
 * the same battle, and the stat line would stop carrying information.
 */
export const CHARGE_PER_SUCCESSFUL_CHANGE = 10;
export const CHARGE_PER_FAILED_RUN = 1;

/** What fixing your own bug is worth, which is the critical hit of section 10.3. */
export const CHARGE_PER_OWN_BUG_FIX = 25;

/**
 * Consecutive failures before the arena starts taking health off.
 *
 * Five, because five is the plan's number and because a smaller number punishes
 * the ordinary first attempt at a hard problem, while a larger one lets a
 * participant burn through a whole subsystem before anything is charged.
 */
export const FAILURE_STREAK_FOR_DAMAGE = 5;
export const DAMAGE_PER_FAILURE_PAST_THE_THRESHOLD = 1;

/**
 * The six stats, as pure functions of what was done.
 *
 * There is no token in this signature and no token in the body, and that is the
 * mechanism rather than a promise: a weight on tokens could not be added here
 * without adding a field to `CodingBehaviour` to carry it, which is a visible
 * change to a type six features and a replay read.
 */
export function deriveStats(behaviour: CodingBehaviour): BattleStats {
  return {
    str: behaviour.successfulChanges,
    int: behaviour.reasoningSteps,
    wis: behaviour.toolChoices,
    luk: behaviour.ownBugFixes,
    def: behaviour.testsPassed,
    dex: behaviour.editAttempts,
  };
}

export interface BattleCharge {
  /** Battle-local reward. Reported to the arena; never a character-sheet award. */
  readonly charge: number;
  readonly damage: number;
  readonly criticalHits: number;
}

/**
 * Charge and damage for one participant's behaviour.
 *
 * Damage is counted from the streak PAST the threshold, so the fifth consecutive
 * failure is the first one that costs anything and a seventh costs two. Counting
 * from one would make a participant start a battle already bleeding for a
 * single red test run, which is the opposite of what a streak is for.
 *
 * No cap on the failed-run charge, deliberately. Capping it would make
 * `testsFailed` a free variable past the cap, and an agent that can add failures
 * at no cost past a threshold has found the cheapest way to farm whatever the
 * failed-run charge feeds.
 */
export function chargeFor(behaviour: CodingBehaviour): BattleCharge {
  const damage =
    (behaviour.longestFailureStreak - (FAILURE_STREAK_FOR_DAMAGE - 1)) *
    DAMAGE_PER_FAILURE_PAST_THE_THRESHOLD;

  return {
    charge:
      behaviour.successfulChanges * CHARGE_PER_SUCCESSFUL_CHANGE +
      behaviour.testsFailed * CHARGE_PER_FAILED_RUN +
      behaviour.ownBugFixes * CHARGE_PER_OWN_BUG_FIX,
    damage: Math.max(0, damage),
    criticalHits: behaviour.ownBugFixes,
  };
}

/* ───────────────────────────── accumulation ───────────────────────────── */

/**
 * The counters a live battle is folding events into.
 *
 * Separate from `CodingBehaviour` because the two answer different questions.
 * The struct above is a finished record; this one carries the running failure
 * streak, which only exists between a red run and the next test and would be a
 * second, disagreeing copy of `longestFailureStreak` if it lived in the record.
 */
export interface BehaviourAccumulator extends CodingBehaviour {
  readonly currentFailureStreak: number;
}

export function emptyAccumulator(): BehaviourAccumulator {
  return { ...emptyCodingBehaviour(), currentFailureStreak: 0 };
}

/** An edit was made. Whether it worked is decided by the next test run, not here. */
export function observeEdit(accumulator: BehaviourAccumulator): BehaviourAccumulator {
  return { ...accumulator, editAttempts: accumulator.editAttempts + 1 };
}

/** The suite went green. The edit that led here counts as a successful change. */
export function observeTestPassed(accumulator: BehaviourAccumulator): BehaviourAccumulator {
  return {
    ...accumulator,
    successfulChanges: accumulator.successfulChanges + 1,
    testsPassed: accumulator.testsPassed + 1,
    currentFailureStreak: 0,
  };
}

export function observeTestFailed(accumulator: BehaviourAccumulator): BehaviourAccumulator {
  const streak = accumulator.currentFailureStreak + 1;
  return {
    ...accumulator,
    testsFailed: accumulator.testsFailed + 1,
    currentFailureStreak: streak,
    longestFailureStreak: Math.max(accumulator.longestFailureStreak, streak),
  };
}

export function observeReasoning(accumulator: BehaviourAccumulator): BehaviourAccumulator {
  return { ...accumulator, reasoningSteps: accumulator.reasoningSteps + 1 };
}

export function observeToolChoice(accumulator: BehaviourAccumulator): BehaviourAccumulator {
  return { ...accumulator, toolChoices: accumulator.toolChoices + 1 };
}

/** A red run this participant's own edit caused, which they have now fixed. */
export function observeOwnBugFix(accumulator: BehaviourAccumulator): BehaviourAccumulator {
  return { ...accumulator, ownBugFixes: accumulator.ownBugFixes + 1 };
}

/** The finished record, with the live streak dropped. */
export function settle(accumulator: BehaviourAccumulator): CodingBehaviour {
  const { currentFailureStreak: _live, ...settled } = accumulator;
  return settled;
}
