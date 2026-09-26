import { describe, expect, it } from 'vitest';

import {
  ARENA_MIN_TRUST,
  BATTLE_STATUSES,
  battleCapacity,
  DEFAULT_BATTLE_MODE,
  DEFAULT_BATTLE_WEIGHTS,
  isBattleWeights,
  isKnownBattleMode,
  isTerminalBattle,
  JUDGE_CRITERIA,
  mayEnterArena,
  nextBattleStatus,
  publishWeights,
  tiePolicyFor,
  toKnownBattleStatus,
  WEIGHT_SUM_TOLERANCE,
  whyWeightsAreRejected,
} from './domain.js';

describe('the state machine', () => {
  it('names the five states section 3.2 does, and no others', () => {
    // The list is the claim. A sixth state added here is a state the plan does
    // not have, and `isTerminalBattle` is what decides whether a reward can be
    // attached to a row, so the list is load-bearing rather than documentation.
    expect(BATTLE_STATUSES).toEqual(['running', 'paused', 'completed', 'abandoned', 'expired']);
  });

  it('refuses a move the table does not allow, rather than inventing one', () => {
    // Undefined rather than a state, so a caller cannot mistake a refused move
    // for one that happened. Returning the current state instead would be the
    // same shape of bug this repository keeps finding: a refusal that reads as a
    // success.
    expect(nextBattleStatus('completed', 'resume')).toBeUndefined();
    expect(nextBattleStatus('abandoned', 'finish')).toBeUndefined();
    expect(nextBattleStatus('expired', 'pause')).toBeUndefined();
  });

  it('refuses to re-pause a paused battle, so one disconnect is one pause', () => {
    expect(nextBattleStatus('paused', 'pause')).toBeUndefined();
  });

  it('lets a paused battle resume, because the participant is still inside the window', () => {
    expect(nextBattleStatus('paused', 'resume')).toBe('running');
  });

  it('can reach every ending from every non-terminal state, and no move out of a terminal one', () => {
    // The three endings, spelled out rather than derived, because the point of
    // the assertion is that a path to each one EXISTS. Checking the exact set of
    // legal moves instead would let a fourth ending be added without anybody
    // noticing, and `expired` in particular is a state that is easy to declare
    // and never reach.
    const endings = ['finish', 'abandon', 'expire'] as const;
    for (const status of BATTLE_STATUSES) {
      for (const ending of endings) {
        const reached = nextBattleStatus(status, ending);
        if (isTerminalBattle(status)) {
          expect(reached, `${status} -> ${ending}`).toBeUndefined();
        } else {
          expect(reached, `${status} -> ${ending}`).not.toBeUndefined();
        }
      }
    }
  });

  it('refuses to move a row whose state this build cannot read', () => {
    // No invented terminal to land on. `bounty` maps an unknown status to
    // `disputed` because it OWNS a do-nothing state; this feature has no such
    // state, and mapping to `completed` would name a winner for a row nobody
    // judged.
    expect(toKnownBattleStatus('in-review')).toBeUndefined();
    expect(toKnownBattleStatus('')).toBeUndefined();
    expect(toKnownBattleStatus('running')).toBe('running');
  });
});

describe('modes', () => {
  it('knows the six the plan names for M4, and says which they are', () => {
    for (const mode of ['speed', 'quality', 'survival', 'boss', 'team', 'tournament']) {
      expect(isKnownBattleMode(mode), mode).toBe(true);
    }
    expect(isKnownBattleMode('ranked')).toBe(false);
  });

  it('gives an unrecognised mode the STRICTEST capacity, not the loosest', () => {
    // The fail-closed half of storing a mode as a string. A mode this build
    // cannot interpret has not been shown to permit a second fighter, so it
    // permits one. The looser reading — "unknown means default" — would let
    // somebody invent a mode name and get a two-fighter battle out of it.
    expect(battleCapacity('boss')).toBe(1);
    expect(battleCapacity('speed')).toBe(2);
    expect(battleCapacity('made-up-mode')).toBe(1);
  });

  it('settles a speed tie by the clock and every other tie by sharing it', () => {
    expect(tiePolicyFor('speed')).toBe('fastest-valid');
    expect(tiePolicyFor('tournament')).toBe('shared');
    // A mode nobody has described has no stated tiebreak, and inventing one is
    // how a judge becomes indefensible. Shared is also the recoverable answer:
    // a draw can be argued with on the evidence.
    expect(tiePolicyFor('quality')).toBe('shared');
    expect(tiePolicyFor('made-up-mode')).toBe('shared');
  });

  it('has a default that is one of the six', () => {
    expect(isKnownBattleMode(DEFAULT_BATTLE_MODE)).toBe(true);
  });
});

describe('the rubric', () => {
  it('carries the plan weights, and they sum to one', () => {
    expect(DEFAULT_BATTLE_WEIGHTS).toEqual({
      correctness: 0.5,
      tests: 0.2,
      regression: 0.1,
      quality: 0.1,
      efficiency: 0.1,
    });
    const total = JUDGE_CRITERIA.reduce(
      (sum, criterion) => sum + DEFAULT_BATTLE_WEIGHTS[criterion],
      0,
    );
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(WEIGHT_SUM_TOLERANCE);
  });

  it('refuses a rubric that does not sum to one, because normalisation is where a rigged judge lives', () => {
    // A weight set that sums to 1.4 is not a rubric with a scale, it is a
    // preference ordering with a total attached, and whoever normalises it picks
    // the number. Refusing is the only answer that cannot transfer by accident.
    expect(whyWeightsAreRejected({ ...DEFAULT_BATTLE_WEIGHTS, correctness: 0.9 })).toEqual({
      reason: 'weights-do-not-sum-to-one',
    });
  });

  it('names the criterion that is missing rather than scoring around it', () => {
    const { correctness, ...rest } = DEFAULT_BATTLE_WEIGHTS;
    void correctness;
    expect(whyWeightsAreRejected(rest)).toEqual({ reason: 'criterion-missing' });
  });

  it('refuses a NaN, because NaN survives `typeof` and fails every comparison', () => {
    const broken = { ...DEFAULT_BATTLE_WEIGHTS, tests: Number.NaN };
    expect(whyWeightsAreRejected(broken)).toEqual({ reason: 'criterion-not-finite' });
  });

  it('refuses a negative weight even when the set still sums to one', () => {
    // The set is made to sum to exactly one on purpose, so the only thing left to
    // reject it is the negative. A rubric that sums to one is not thereby a
    // rubric: -0.1 on quality with 0.3 on efficiency is a preference the other
    // way round, and accepting it would let a battle be judged by a score some
    // criteria take points off.
    expect(
      whyWeightsAreRejected({ ...DEFAULT_BATTLE_WEIGHTS, quality: -0.1, efficiency: 0.3 }),
    ).toEqual({ reason: 'weight-negative' });
  });

  it('refuses something that is not a weight set at all', () => {
    expect(whyWeightsAreRejected(null)).toEqual({ reason: 'not-an-object' });
    expect(whyWeightsAreRejected([0.5, 0.5])).toEqual({ reason: 'not-an-object' });
  });

  it('publishes the criterion list beside the weights, so a reader can tell 0.5 from 0.1', () => {
    const published = publishWeights(DEFAULT_BATTLE_WEIGHTS);
    expect(published.criteria).toEqual(JUDGE_CRITERIA);
    expect(published.published).toBe(true);
    // The same object, not a copy: a published rubric that could be written
    // through would be a rubric the arena had not actually agreed to.
    expect(published.weights).toBe(DEFAULT_BATTLE_WEIGHTS);
  });

  it('agrees with its own guard', () => {
    expect(isBattleWeights(DEFAULT_BATTLE_WEIGHTS)).toBe(true);
    expect(isBattleWeights({ correctness: 1 })).toBe(false);
  });
});

describe('the arena gate', () => {
  it('refuses a character with no record, because a battle is not where a first record is earned', () => {
    // The other half of the constant's own reasoning: admitting an agent that
    // has never finished anything admits somebody who has not shown they can.
    expect(ARENA_MIN_TRUST).toBeGreaterThan(0);
    expect(mayEnterArena(0)).toBe(false);
  });

  it('opens exactly at the floor, and the floor is one named constant', () => {
    expect(mayEnterArena(ARENA_MIN_TRUST)).toBe(true);
    expect(mayEnterArena(ARENA_MIN_TRUST - 1)).toBe(false);
  });

  it('refuses a trust that is not a finite number, rather than comparing against NaN', () => {
    // `NaN >= x` is false and `Infinity >= x` is true, so an unguarded comparison
    // would refuse one and admit the other for reasons that have nothing to do
    // with trust. Trust is an integer this platform computed, so a non-finite
    // value is corruption and is refused as such.
    expect(mayEnterArena(Number.NaN)).toBe(false);
    expect(mayEnterArena(Number.POSITIVE_INFINITY)).toBe(false);
    expect(mayEnterArena(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
