import { describe, expect, it } from 'vitest';

import {
  BATTLE_STAT_NAMES,
  CHARGE_PER_FAILED_RUN,
  CHARGE_PER_OWN_BUG_FIX,
  CHARGE_PER_SUCCESSFUL_CHANGE,
  chargeFor,
  DAMAGE_PER_FAILURE_PAST_THE_THRESHOLD,
  deriveStats,
  emptyAccumulator,
  emptyCodingBehaviour,
  FAILURE_STREAK_FOR_DAMAGE,
  observeEdit,
  observeOwnBugFix,
  observeReasoning,
  observeTestFailed,
  observeTestPassed,
  observeToolChoice,
  settle,
  type CodingBehaviour,
} from './stats.js';

const EMPTY = emptyCodingBehaviour();

function behaviour(overrides: Partial<CodingBehaviour> = {}): CodingBehaviour {
  return { ...EMPTY, ...overrides };
}

describe('what each stat counts', () => {
  it('is six, and the six the plan names', () => {
    expect(BATTLE_STAT_NAMES).toEqual(['str', 'int', 'wis', 'luk', 'def', 'dex']);
  });

  it('maps each behaviour onto the discipline section 10.3 gives it', () => {
    const stats = deriveStats(
      behaviour({
        successfulChanges: 3,
        reasoningSteps: 7,
        toolChoices: 2,
        ownBugFixes: 1,
        testsPassed: 41,
        editAttempts: 5,
      }),
    );
    expect(stats).toEqual({ str: 3, int: 7, wis: 2, luk: 1, def: 41, dex: 5 });
  });

  it('is empty for a session that has done nothing, rather than undefined', () => {
    // Six zeros and "no data" are different readings of the same numbers, and an
    // arena that cannot tell them apart animates a participant who is idle.
    expect(deriveStats(EMPTY)).toEqual({ str: 0, int: 0, wis: 0, luk: 0, def: 0, dex: 0 });
  });
});

describe('charge and damage', () => {
  it('pays a change that works far more than a run that failed', () => {
    // Ten to one, and the ratio is the design: the arena reads as "do the work"
    // and not as "try things until something sticks".
    expect(CHARGE_PER_SUCCESSFUL_CHANGE / CHARGE_PER_FAILED_RUN).toBeGreaterThanOrEqual(5);
  });

  it('pays an edit whose verification passed and charges the failure before it', () => {
    const charge = chargeFor(behaviour({ successfulChanges: 2, testsFailed: 3 }));
    expect(charge.charge).toBe(2 * CHARGE_PER_SUCCESSFUL_CHANGE + 3 * CHARGE_PER_FAILED_RUN);
  });

  it('takes damage at five consecutive failures, and not at four', () => {
    // The plan's number. Four is a first attempt at a hard problem and must not
    // cost anything; five is a pattern.
    expect(chargeFor(behaviour({ longestFailureStreak: 4 })).damage).toBe(0);
    expect(chargeFor(behaviour({ longestFailureStreak: 5 })).damage).toBe(
      DAMAGE_PER_FAILURE_PAST_THE_THRESHOLD,
    );
  });

  it('takes a second point of damage for the sixth consecutive failure', () => {
    expect(chargeFor(behaviour({ longestFailureStreak: 6 })).damage).toBe(2);
    expect(chargeFor(behaviour({ longestFailureStreak: 11 })).damage).toBe(7);
  });

  it('counts a critical hit for fixing your own bug, and pays for it', () => {
    const charge = chargeFor(behaviour({ ownBugFixes: 2 }));
    expect(charge.criticalHits).toBe(2);
    expect(charge.charge).toBe(2 * CHARGE_PER_OWN_BUG_FIX);
  });

  it('has a failure threshold that is the plan five, not a tuned number', () => {
    expect(FAILURE_STREAK_FOR_DAMAGE).toBe(5);
  });
});

describe('the counters, folded in order', () => {
  it('turns a green run into a successful change and clears the streak', () => {
    let accumulator = emptyAccumulator();
    accumulator = observeEdit(accumulator);
    accumulator = observeEdit(accumulator);
    accumulator = observeTestFailed(accumulator);
    accumulator = observeTestFailed(accumulator);
    expect(settle(accumulator).longestFailureStreak).toBe(2);

    accumulator = observeTestPassed(accumulator);
    const settled = settle(accumulator);
    expect(settled.successfulChanges).toBe(1);
    expect(settled.testsPassed).toBe(1);
    // The live streak cleared but the LONGEST one is retained, because the arena
    // reads it after the battle and a reset would erase the record of the worst
    // thing that happened.
    expect(settled.longestFailureStreak).toBe(2);
  });

  it('keeps the live streak out of the settled record, so there is one source for each', () => {
    const accumulator = observeTestFailed(emptyAccumulator());
    expect(settle(accumulator)).not.toHaveProperty('currentFailureStreak');
    expect(settle(accumulator).longestFailureStreak).toBe(1);
  });

  it('counts a green run as an iteration whether or not an edit led to it', () => {
    // DEX is edit attempts, and a red run still shows the iteration happened. It
    // is the RATE that reads as speed, not the outcome.
    let accumulator = observeEdit(emptyAccumulator());
    accumulator = observeTestFailed(accumulator);
    expect(settle(accumulator).editAttempts).toBe(1);
    expect(settle(accumulator).successfulChanges).toBe(0);
  });

  it('counts reasoning steps and tool choices separately, because they are not the same act', () => {
    let accumulator = observeReasoning(emptyAccumulator());
    accumulator = observeReasoning(accumulator);
    accumulator = observeToolChoice(accumulator);
    expect(settle(accumulator)).toMatchObject({ reasoningSteps: 2, toolChoices: 1 });
  });

  it('counts a fixed bug of their own as a critical hit, and as LUK', () => {
    // Section 10.3's "fixing your own bug -> a critical hit". It is the one act
    // that is neither a change nor a run, and folding it into either would lose
    // the distinction the plan is drawing: a participant who breaks it and puts
    // it right has done something a participant who never broke it has not.
    let accumulator = emptyAccumulator();
    accumulator = observeTestFailed(accumulator);
    accumulator = observeOwnBugFix(accumulator);
    const settled = settle(accumulator);
    expect(settled.ownBugFixes).toBe(1);
    expect(deriveStats(settled).luk).toBe(1);
    expect(chargeFor(settled)).toMatchObject({ criticalHits: 1 });
  });

  it('does not let a red run after a green one lengthen the streak it already had', () => {
    let accumulator = emptyAccumulator();
    for (let run = 0; run < 6; run += 1) accumulator = observeTestFailed(accumulator);
    accumulator = observeTestPassed(accumulator);
    accumulator = observeTestFailed(accumulator);
    expect(settle(accumulator).longestFailureStreak).toBe(6);
    expect(chargeFor(settle(accumulator)).damage).toBe(2);
  });
});

describe('no token is a damage input, and the test is not vacuous', () => {
  /**
   * The identity this whole section exists to pin.
   *
   * Plan section 2.2 bans token-count-as-damage by name. The pure function above
   * makes the ban structural — `CodingBehaviour` has no field a cost could be
   * carried on — so this is the test that a payload extra field never reaches the
   * arithmetic, which is where a real implementation would leak one.
   */
  it('gives identical stats to identical behaviour carrying wildly different counts', () => {
    const lean = withCost(
      behaviour({ successfulChanges: 4, testsPassed: 12, editAttempts: 7, reasoningSteps: 3 }),
      { tokensSpent: 12, costCents: 1 },
    );
    const extravagant = withCost(
      behaviour({ successfulChanges: 4, testsPassed: 12, editAttempts: 7, reasoningSteps: 3 }),
      { tokensSpent: 9_400_000, costCents: 4_812 },
    );

    // A five-figure difference in what each agent was willing to spend.
    expect(deriveStats(extravagant)).toEqual(deriveStats(lean));
    expect(chargeFor(extravagant)).toEqual(chargeFor(lean));
  });

  it('gives a spender no advantage in damage either', () => {
    // The specific thing section 2.2 names. Six failures costs one point whether
    // the agent read one file or ten thousand.
    const failures = behaviour({ longestFailureStreak: 6 });
    expect(chargeFor(withCost(failures, { tokensSpent: 50_000_000 })).damage).toBe(
      chargeFor(withCost(failures, { tokensSpent: 3 })).damage,
    );
    expect(chargeFor(withCost(failures, { tokensSpent: 50_000_000 })).damage).toBe(2);
  });

  it('ignores a count arriving as a string, which is the shape an adapter would send', () => {
    const counted = behaviour({ successfulChanges: 2 });
    expect(deriveStats(withCost(counted, { tokensSpent: 'lots' }))).toEqual(deriveStats(counted));
  });
});

/**
 * A behaviour record with cost fields stuck on it.
 *
 * Built by spreading a raw `unknown`-shaped object so the extra fields are real
 * at runtime even though `CodingBehaviour` has nowhere to put them — which is
 * exactly the situation a leaked term would exploit, and the reason the cast is
 * confined to this one function.
 */
function withCost(base: CodingBehaviour, cost: Readonly<Record<string, unknown>>): CodingBehaviour {
  return { ...base, ...cost } as CodingBehaviour;
}
