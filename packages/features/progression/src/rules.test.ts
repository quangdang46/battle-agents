import { describe, expect, it } from 'vitest';

import {
  BUILDS,
  classifyBuild,
  DEFAULT_BUILD,
  DEFAULT_BUILD_WEIGHTS,
  explainBuild,
  isOutcomeType,
  LEVEL_GATES,
  levelForXp,
  meetsGate,
  OUTCOMES,
  OUTCOME_TYPES,
  outcomeFor,
  qualifies,
  totalXpToReach,
  xpToAdvanceFrom,
  type BehaviourSignal,
  type BuildWeights,
} from './rules.js';

const NOW = '2026-09-24T12:00:00.000Z';

function signals(build: BehaviourSignal['build'], count: number): BehaviourSignal[] {
  return Array.from({ length: count }, (_, index) => ({
    build,
    weight: 1,
    at: `${NOW}#${index}`,
  }));
}

describe('experience comes from outcomes, and only outcomes', () => {
  it('pays the amount the plan sets for each real outcome', () => {
    expect(OUTCOMES['bounty.completed'].xp).toBe(1000);
    expect(OUTCOMES['pr.merged'].xp).toBe(500);
    expect(OUTCOMES['session.recovered'].xp).toBe(150);
    expect(OUTCOMES['test.passed'].xp).toBe(100);
  });

  it('prices a merge once, and says in the table which merge pays', () => {
    // The claim this asserts is the one the bounty feature's existence made
    // urgent: `bounty.completed` pays 1000 and `pr.merged` pays 500, and a merge
    // that completed a bounty produces both. The exclusion is a row in the PRICE
    // TABLE rather than a promise about which events a feature emits, so it
    // holds however the events are produced.
    expect(OUTCOMES['bounty.completed'].xp).toBe(1000);
    expect(OUTCOMES['pr.merged'].xp).toBe(500);
    expect(OUTCOMES['pr.merged'].requires).toEqual({ field: 'completedBounty', equals: false });
    expect(qualifies(OUTCOMES['pr.merged'], { completedBounty: true })).toBe(false);
    expect(qualifies(OUTCOMES['pr.merged'], { completedBounty: false })).toBe(true);
    // A payload that never stated the case does not pay. The 1000 + 500 that the
    // old table would have handed out is what this replaces.
    expect(qualifies(OUTCOMES['pr.merged'], {})).toBe(false);
    expect(qualifies(OUTCOMES['pr.merged'], { completedBounty: false, agentId: 'a' })).toBe(true);
  });

  it('pays nothing for an event that is not an outcome', () => {
    expect(outcomeFor('file.write')).toBeUndefined();
    expect(outcomeFor('thinking')).toBeUndefined();
    expect(outcomeFor('session.heartbeat')).toBeUndefined();
  });

  it('lists a battle under the name the plan uses, and no longer under a name it does not', () => {
    // The brief and section 24 both name battle.finished, and reputation already
    // models that exact event. A second spelling for the same thing means the
    // two features subscribe to different events and neither one ever fires.
    expect(OUTCOME_TYPES).toContain('battle.finished');
    expect(isOutcomeType('battle.finished')).toBe(true);
    expect(isOutcomeType('battle.won')).toBe(false);
  });

  it('has no way to pay from a token count', () => {
    // The structural claim, asserted. Experience is a lookup in a closed table
    // and nothing else, so a token event cannot reach it. If a future edit adds
    // arithmetic on a token field, or a key with "token" in it, this fails —
    // and it is the test the bead asks for, rather than a promise in a comment.
    for (const type of OUTCOME_TYPES) {
      expect(type.toLowerCase(), `${type} must not be token-derived`).not.toContain('token');
    }
    for (const outcome of Object.values(OUTCOMES)) {
      // Literal amounts only. A computed value here is where a token economy
      // would sneak in.
      expect(Number.isInteger(outcome.xp)).toBe(true);
      expect(outcome.xp).toBeGreaterThan(0);
    }
  });

  it('recognises exactly the outcome types it pays', () => {
    for (const type of OUTCOME_TYPES) {
      expect(isOutcomeType(type), type).toBe(true);
    }
    for (const type of ['bounty.claimed', 'agent.level_up', 'nonsense']) {
      expect(isOutcomeType(type), type).toBe(false);
    }
  });
});

describe('an event name is not always the whole condition', () => {
  const battle = OUTCOMES['battle.finished'];

  it('pays a won battle and not a lost one', () => {
    expect(qualifies(battle, { agentId: 'a-1', won: true })).toBe(true);
    expect(qualifies(battle, { agentId: 'a-1', won: false })).toBe(false);
  });

  it('pays nothing when the payload never says how the battle went', () => {
    // Absent is not won. A battle whose result nobody recorded is the one case
    // where guessing would hand experience to an agent that may have lost it.
    expect(qualifies(battle, { agentId: 'a-1' })).toBe(false);
    expect(qualifies(battle, undefined)).toBe(false);
    expect(qualifies(battle, null)).toBe(false);
    expect(qualifies(battle, 'battle.finished')).toBe(false);
  });

  it('is not fooled by a won that is not a boolean', () => {
    expect(qualifies(battle, { won: 'true' })).toBe(false);
    expect(qualifies(battle, { won: 1 })).toBe(false);
  });

  it('leaves an outcome with no condition always applicable', () => {
    // The skip list is the outcomes that DO have a condition, and it is written
    // out rather than derived from `requires` — deriving it would make the
    // assertion vacuous, since a row that gained a condition would be skipped
    // and the test would report green having checked nothing. Adding a
    // condition to a row is therefore a two-line edit, and one of them is
    // thinking about it.
    //
    // `pr.merged` joined this list when ba-feature-bounty-xhk landed: a merge
    // that completed a bounty is already paid by `bounty.completed`, and saying
    // so in the price row is what stops one merge paying twice.
    const conditioned = new Set(['battle.finished', 'pr.merged']);
    for (const [type, outcome] of Object.entries(OUTCOMES)) {
      if (conditioned.has(type)) {
        expect(outcome.requires, type).toBeDefined();
        continue;
      }
      expect(outcome.requires, type).toBeUndefined();
      expect(qualifies(outcome, undefined), type).toBe(true);
      expect(qualifies(outcome, { anything: 'at all' }), type).toBe(true);
    }
  });
});

describe('the level curve', () => {
  it('follows the formula in section 24 as the cost of leaving a level', () => {
    // 100 * n * (n+1) / 2. Reading it as a running total would make a brand-new
    // character level 0, which is not a state this game has.
    expect(xpToAdvanceFrom(1)).toBe(100);
    expect(xpToAdvanceFrom(2)).toBe(300);
    expect(xpToAdvanceFrom(3)).toBe(600);
  });

  it('starts at level 1 for nothing, and totals what each level cost', () => {
    expect(totalXpToReach(1)).toBe(0);
    expect(totalXpToReach(2)).toBe(100);
    expect(totalXpToReach(3)).toBe(400);
    expect(totalXpToReach(4)).toBe(1000);
  });

  it('gets harder each level, so a high level is not a formality', () => {
    const costs = [1, 2, 3, 4].map((level) => xpToAdvanceFrom(level));
    for (const [index, cost] of costs.entries()) {
      if (index > 0) {
        expect(cost).toBeGreaterThan(costs[index - 1] ?? 0);
      }
    }
  });

  it('inverts: the level a given experience has earned', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(399)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    // With the cost of leaving each level, 100k is a level in the teens rather
    // than thirty. Pinned so a change to the curve is a visible decision
    // rather than a surprise somebody notices on a leaderboard.
    expect(levelForXp(100_000)).toBe(18);
  });

  it('refuses a level or an experience count that cannot exist', () => {
    expect(() => xpToAdvanceFrom(0)).toThrow(RangeError);
    expect(() => totalXpToReach(0)).toThrow(RangeError);
    expect(() => levelForXp(-1)).toThrow(RangeError);
  });
});

describe('a level is access, not a number that looks like progress', () => {
  it('unlocks content rather than cosmetics', () => {
    for (const gate of LEVEL_GATES) {
      expect(gate.level, `${gate.unlocks} has no level`).toBeGreaterThan(0);
      expect(gate.unlocks.length).toBeGreaterThan(0);
    }
  });

  it('gates at the level it names and not one either side', () => {
    for (const gate of LEVEL_GATES) {
      expect(meetsGate(gate.level - 1, gate.level), `${gate.unlocks} below`).toBe(false);
      expect(meetsGate(gate.level, gate.level), `${gate.unlocks} at`).toBe(true);
    }
  });

  it('is a plain comparison, so a level nobody can reach is simply not met', () => {
    expect(meetsGate(1, 999)).toBe(false);
    expect(meetsGate(999, 1)).toBe(true);
  });
});

describe('a model is not a class', () => {
  it('gives two behaviour histories two different builds', () => {
    // The M3 definition of done, in the shape the plan describes: the same
    // model, two histories, two specialisations. Nothing here knows what agent
    // ran it, because nothing here is told.
    const fixedTheBuild = signals('debugger', 6);
    const shippedTheFeature = signals('builder', 6);

    expect(classifyBuild(fixedTheBuild)).toBe('debugger');
    expect(classifyBuild(shippedTheFeature)).toBe('builder');
    expect(classifyBuild(fixedTheBuild)).not.toBe(classifyBuild(shippedTheFeature));
  });

  it('leaves a character generalist until there is any evidence at all', () => {
    // One-sided is enough: a single recovered failure is the only evidence there
    // is, and calling that unspecialised would make a character wait for an
    // arbitrary count before it is allowed to be anything.
    expect(classifyBuild([])).toBe(DEFAULT_BUILD);
    expect(classifyBuild(signals('debugger', 1))).toBe('debugger');
  });

  it('does not specialise a character that has done everything equally', () => {
    const scattered = [
      ...signals('debugger', 3),
      ...signals('builder', 3),
      ...signals('tester', 3),
    ];

    expect(classifyBuild(scattered)).toBe(DEFAULT_BUILD);
  });

  it('classifies the same history the same way whatever order it arrived in', () => {
    // A tie that resolved by insertion order would make a character change
    // specialisation for no reason, which is a visible, unexplained bug.
    const history: BehaviourSignal[] = [
      { build: 'debugger', weight: 2, at: `${NOW}#a` },
      { build: 'tester', weight: 2, at: `${NOW}#b` },
    ];

    const first = classifyBuild(history);
    const shuffled = classifyBuild([...history].reverse());
    const repeated = [first, classifyBuild(history), shuffled];

    expect(new Set(repeated).size).toBe(1);
  });

  it('honours weights, so a retune changes the answer without a code change', () => {
    // A genuine lead at default weights, so the only thing the retune changes is
    // which way the evidence points. A tie would be generalist and prove nothing.
    const history = [...signals('debugger', 6), ...signals('security', 4)];
    const securityHeavy: BuildWeights = { ...DEFAULT_BUILD_WEIGHTS, security: 5 };

    expect(classifyBuild(history)).toBe('debugger');
    expect(classifyBuild(history, securityHeavy)).toBe('security');
  });

  it('explains itself, so a surprising result is debuggable', () => {
    const classification = explainBuild(signals('debugger', 3));

    expect(classification.build).toBe('debugger');
    expect(classification.considered).toBe(3);
    expect(classification.scores.debugger).toBe(3);
    expect(classification.scores.builder).toBe(0);
  });

  it('never classifies to generalist by scoring it against the specialists', () => {
    // generalist wins by not competing, so adding signals for it cannot make a
    // specialist lose to it. A weight on it that did would be a silent bug.
    const history = signals('tester', 5);
    const generalistHeavy: BuildWeights = { ...DEFAULT_BUILD_WEIGHTS, generalist: 100 };

    expect(classifyBuild(history, generalistHeavy)).toBe('tester');
  });

  it('offers only the builds a history can actually reach', () => {
    for (const build of BUILDS) {
      // Compared to the literal rather than to DEFAULT_BUILD, which is typed
      // as the whole union and would narrow nothing.
      if (build === 'generalist') {
        expect(classifyBuild([])).toBe('generalist');
        continue;
      }
      expect(classifyBuild(signals(build, 3))).toBe(build);
    }
  });
});
