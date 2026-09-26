import { describe, expect, it } from 'vitest';

import { DEFAULT_BATTLE_WEIGHTS, JUDGE_CRITERIA, type BattleWeights } from './domain.js';
import {
  decideOutcome,
  NO_WINNER_NO_PARTICIPANTS,
  NO_WINNER_NO_VALID_SUBMISSION,
  scoreAgainst,
  UnscorableBattle,
  type CriterionResult,
  type ScoredParticipant,
} from './judge.js';

const ALL_PASS: readonly CriterionResult[] = JUDGE_CRITERIA.map((criterion) => ({
  criterion,
  score: 1,
}));

const ALL_ZERO: readonly CriterionResult[] = JUDGE_CRITERIA.map((criterion) => ({
  criterion,
  score: 0,
}));

function at(criterion: (typeof JUDGE_CRITERIA)[number], score: number): CriterionResult {
  return { criterion, score };
}

describe('the weighted score', () => {
  it('is one for a perfect run and zero for a failed one', () => {
    expect(scoreAgainst(ALL_PASS, DEFAULT_BATTLE_WEIGHTS).total).toBe(1);
    expect(scoreAgainst(ALL_ZERO, DEFAULT_BATTLE_WEIGHTS).total).toBe(0);
  });

  it('applies the weights, so correctness carries half of a perfect score', () => {
    // Only correctness passes. Half the rubric is satisfied, and the total says
    // so — which is the whole claim about the weights being load-bearing rather
    // than decorative.
    const onlyCorrectness = [
      at('correctness', 1),
      at('tests', 0),
      at('regression', 0),
      at('quality', 0),
      at('efficiency', 0),
    ];
    expect(scoreAgainst(onlyCorrectness, DEFAULT_BATTLE_WEIGHTS).total).toBe(0.5);
  });

  it('honours a rubric that differs from the defaults', () => {
    // A battle that weighted efficiency highest has to score differently from one
    // that weighted correctness highest, or the stored weights are decoration.
    const efficiencyHeavy: BattleWeights = {
      correctness: 0.1,
      tests: 0.1,
      regression: 0.1,
      quality: 0.1,
      efficiency: 0.6,
    };
    const mostlyEfficient = [
      at('correctness', 0),
      at('tests', 0),
      at('regression', 0),
      at('quality', 0),
      at('efficiency', 1),
    ];
    const mostlyCorrect = [
      at('correctness', 1),
      at('tests', 0),
      at('regression', 0),
      at('quality', 0),
      at('efficiency', 0),
    ];
    expect(scoreAgainst(mostlyEfficient, efficiencyHeavy).total).toBe(0.6);
    expect(scoreAgainst(mostlyCorrect, efficiencyHeavy).total).toBe(0.1);
  });

  it('decomposes into one contribution per criterion, each naming its own weight', () => {
    // A total that cannot be decomposed cannot be shown to the two agents who
    // lost to it, and a score nobody can explain is a score nobody can contest.
    const score = scoreAgainst(ALL_PASS, DEFAULT_BATTLE_WEIGHTS);
    expect(score.contributions.map((entry) => entry.criterion)).toEqual([...JUDGE_CRITERIA]);
    expect(score.contributions.map((entry) => entry.weighted)).toEqual([0.5, 0.2, 0.1, 0.1, 0.1]);
  });
});

describe('determinism', () => {
  const results: readonly CriterionResult[] = [
    at('correctness', 0.9),
    at('tests', 0.8),
    at('regression', 0.7),
    at('quality', 0.6),
    at('efficiency', 0.5),
  ];

  it('gives the same answer twice for the same state', () => {
    expect(scoreAgainst(results, DEFAULT_BATTLE_WEIGHTS)).toEqual(
      scoreAgainst(results, DEFAULT_BATTLE_WEIGHTS),
    );
  });

  it('does not care what order the judge reported its checks in', () => {
    const reversed = [...results].reverse();
    const forward = scoreAgainst(results, DEFAULT_BATTLE_WEIGHTS);
    const backward = scoreAgainst(reversed, DEFAULT_BATTLE_WEIGHTS);

    // The CONTRIBUTIONS, compared in order and not just the total. A judge that
    // summed whatever it was handed would return the same last bit either way
    // here, so asserting only the total would be a test that cannot fail — the
    // contributions' order is the thing that actually changes, and it is the
    // thing a replay reads.
    expect(backward).toEqual(forward);
  });

  it('reports the same figure for a run of three decimal weights as for the halves', () => {
    // The rounding is there so a tie is a tie. 0.1 * 0.3 in binary floating point
    // is not 0.03, and two participants whose arithmetic lands a bit apart would
    // produce a winner out of the last bit of a sum.
    const thirds: BattleWeights = {
      correctness: 0.3,
      tests: 0.3,
      regression: 0.2,
      quality: 0.1,
      efficiency: 0.1,
    };
    const perfect = scoreAgainst(ALL_PASS, thirds);
    expect(perfect.total).toBe(1);
    expect(perfect.contributions.map((entry) => entry.weighted)).toEqual([0.3, 0.3, 0.2, 0.1, 0.1]);
  });
});

describe('a battle that was only half judged', () => {
  it('refuses to score when a criterion produced no result', () => {
    // Zero means "this check ran and the work did not pass it", which is a
    // finding. Missing means the check never ran, and scoring a battle on
    // checks that did not run is how a broken workspace produces a winner.
    const missingEfficiency = resultsWithout('efficiency');
    expect(() => scoreAgainst(missingEfficiency, DEFAULT_BATTLE_WEIGHTS)).toThrow(UnscorableBattle);
  });

  it('says which criterion was missing', () => {
    try {
      scoreAgainst(resultsWithout('efficiency'), DEFAULT_BATTLE_WEIGHTS);
      expect.unreachable('an unscorable battle must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnscorableBattle);
      expect((error as UnscorableBattle).rejection).toEqual({ reason: 'criterion-not-scored' });
    }
  });

  it('refuses a criterion scored twice, because the weight would apply twice', () => {
    expect(() => scoreAgainst([...ALL_PASS, at('tests', 0.5)], DEFAULT_BATTLE_WEIGHTS)).toThrow(
      UnscorableBattle,
    );
  });

  it('refuses a score outside 0..1, in both directions', () => {
    const high = [...ALL_ZERO.slice(0, 4), at('efficiency', 1.4)];
    const low = [...ALL_ZERO.slice(0, 4), at('efficiency', -0.1)];
    expect(() => scoreAgainst(high, DEFAULT_BATTLE_WEIGHTS)).toThrow(UnscorableBattle);
    expect(() => scoreAgainst(low, DEFAULT_BATTLE_WEIGHTS)).toThrow(UnscorableBattle);
  });

  it('refuses a criterion this build does not judge', () => {
    const invented = [...ALL_ZERO, { criterion: 'vibes' as never, score: 1 }];
    expect(() => scoreAgainst(invented, DEFAULT_BATTLE_WEIGHTS)).toThrow(UnscorableBattle);
  });
});

describe('who won', () => {
  const submitted = (sessionId: string, score: number, at: string): ScoredParticipant => ({
    sessionId,
    score,
    submittedAt: at,
  });

  it('gives it to the higher score, and says why', () => {
    const outcome = decideOutcome(
      [
        submitted('s1', 0.4, '2026-09-26T10:00:00.000Z'),
        submitted('s2', 0.9, '2026-09-26T10:00:00.000Z'),
      ],
      'shared',
    );
    expect(outcome).toEqual({ kind: 'won', winnerSessionIds: ['s2'], reason: 'outscored' });
  });

  it('gives a speed tie to the earlier valid submission', () => {
    const outcome = decideOutcome(
      [
        submitted('s1', 0.7, '2026-09-26T10:05:00.000Z'),
        submitted('s2', 0.7, '2026-09-26T10:02:00.000Z'),
      ],
      'fastest-valid',
    );
    expect(outcome).toEqual({ kind: 'won', winnerSessionIds: ['s2'], reason: 'fastest-valid' });
  });

  it('shares a tournament tie, because that is the stated rule', () => {
    const outcome = decideOutcome(
      [
        submitted('s1', 0.7, '2026-09-26T10:05:00.000Z'),
        submitted('s2', 0.7, '2026-09-26T10:02:00.000Z'),
      ],
      'shared',
    );
    // Sorted, so a caller rendering the result does not depend on row order.
    expect(outcome).toEqual({ kind: 'won', winnerSessionIds: ['s1', 's2'], reason: 'shared' });
  });

  it('shares a speed tie the clock cannot break, rather than taking the first row', () => {
    // Two submissions at the same instant. Resolving by the order the rows came
    // back would make the winner a function of the database's mood.
    const outcome = decideOutcome(
      [
        submitted('s1', 0.7, '2026-09-26T10:02:00.000Z'),
        submitted('s2', 0.7, '2026-09-26T10:02:00.000Z'),
      ],
      'fastest-valid',
    );
    expect(outcome).toEqual({ kind: 'won', winnerSessionIds: ['s1', 's2'], reason: 'shared' });
  });

  it('shares a tie at zero, because two agents who submitted and failed everything have still played', () => {
    // The difference between "nobody won" and "everybody tied" is the difference
    // between an empty match and a draw. Calling it a draw credits nobody with
    // beating anybody, which is the only defensible reading of a rubric they both
    // failed.
    const outcome = decideOutcome(
      [
        submitted('s1', 0, '2026-09-26T10:00:00.000Z'),
        submitted('s2', 0, '2026-09-26T10:00:00.000Z'),
      ],
      'shared',
    );
    expect(outcome).toEqual({ kind: 'won', winnerSessionIds: ['s1', 's2'], reason: 'shared' });
  });

  it('names nobody when nobody submitted, rather than awarding a match nobody played', () => {
    const outcome = decideOutcome(
      [
        { sessionId: 's1', score: 0, submittedAt: null },
        { sessionId: 's2', score: 0, submittedAt: null },
      ],
      'shared',
    );
    expect(outcome).toEqual({ kind: 'no-winner', reason: NO_WINNER_NO_VALID_SUBMISSION });
  });

  it('ignores a participant who submitted nothing when somebody else did', () => {
    // A high score from a session that never entered the arena is not a score.
    const outcome = decideOutcome(
      [
        { sessionId: 's1', score: 0, submittedAt: null },
        submitted('s2', 0.2, '2026-09-26T10:00:00.000Z'),
      ],
      'shared',
    );
    expect(outcome).toEqual({ kind: 'won', winnerSessionIds: ['s2'], reason: 'outscored' });
  });

  it('names nobody when there were no participants at all', () => {
    expect(decideOutcome([], 'shared')).toEqual({
      kind: 'no-winner',
      reason: NO_WINNER_NO_PARTICIPANTS,
    });
  });
});

function resultsWithout(omitted: (typeof JUDGE_CRITERIA)[number]): readonly CriterionResult[] {
  return JUDGE_CRITERIA.filter((criterion) => criterion !== omitted).map((criterion) => ({
    criterion,
    score: 1,
  }));
}
