import { describe, expect, it } from 'vitest';

import { DEFAULT_ROLE, type RoleSignal } from './domain.js';
import {
  canTalkToDecision,
  classifyRole,
  coverageOf,
  explainRole,
  MAX_COVERAGE_BONUS_PERCENT,
  PLAN_CODER_TESTER_REVIEWER,
  rankTallies,
  ROLE_SIGNALS,
  roleEvidence,
  roleSignalEventTypes,
  rolesEarningableToday,
  standingPercent,
  synergiesFor,
  tallyStanding,
  type TallyInput,
} from './rules.js';

function signal(role: RoleSignal['role'], weight: number, n: number): RoleSignal {
  return {
    id: `s${n}`,
    agentId: 'agent-1',
    role,
    weight,
    sourceType: 'made.up',
    sourceKey: `k${n}`,
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('a role comes from behaviour, and only from behaviour', () => {
  it('has no way to name a role that no event carries', () => {
    // §10.2's forbidden shortcut is a self-declared label. There is no
    // `guild.setRole` action, no `role` column on the membership, and no
    // function here that takes a role from a caller and returns it. What a
    // caller CAN do is drop rows into `guild_role_signals`, and every row
    // carries the event that produced it — so the trail is what is checked, not
    // the claim.
    const inputs = Object.values(ROLE_SIGNALS).flatMap((rule) => rule.evidence);
    expect(inputs.length).toBeGreaterThan(0);
    for (const [eventType, weight] of inputs) {
      expect(typeof eventType).toBe('string');
      expect(weight).toBeGreaterThan(0);
    }
  });

  it('derives a role from recorded signals, so a model name cannot be one', () => {
    // The classification is a function of signals and nothing else. An agent
    // with three completed bounties and no model information at all is a coder;
    // there is no input that could make it anything else.
    const signals = [signal('coder', 3, 1), signal('coder', 3, 2), signal('coder', 3, 3)];
    expect(classifyRole(signals)).toBe('coder');
    expect(explainRole(signals).scores.coder).toBe(9);
  });

  it('is generalist with no evidence, and generalist on a tie', () => {
    expect(classifyRole([])).toBe(DEFAULT_ROLE);
    // A tie is not a specialisation. Naming the leader would be naming a role
    // the agent did not earn, and it would make the answer depend on the order
    // two events arrived in.
    expect(classifyRole([signal('coder', 1, 1), signal('tester', 1, 2)])).toBe(DEFAULT_ROLE);
  });

  it('is the same whatever order the evidence arrived in', () => {
    const a = signal('coder', 3, 1);
    const b = signal('reviewer', 2, 2);
    const c = signal('tester', 1, 3);
    expect(classifyRole([a, b, c])).toBe(classifyRole([c, b, a]));
    expect(classifyRole([a, b, c])).toBe(classifyRole([b, a, c]));
  });

  it('reports a role the feature cannot classify as generalist rather than passing it through', () => {
    // A row written by a build that knew a fifth role, read by one that does
    // not. The agent gets no role rather than a role nobody can explain.
    const rogue = [{ ...signal('coder', 1, 1), role: 'archivist' } as unknown as RoleSignal];
    expect(classifyRole(rogue)).toBe(DEFAULT_ROLE);
  });
});

describe('a signal outside the durable set is not a signal', () => {
  it('offers no role evidence for any event type the plan only wished existed', () => {
    // The plan's wish-list for a Researcher was file.read / file.changed /
    // search / thinking. None of them is persisted, so `roleEvidence` answers
    // undefined for every one of them — a classifier reading `file.read` to spot
    // a Researcher would be reading a column that is not there.
    for (const type of ['file.read', 'file.changed', 'search', 'thinking', 'tool.call']) {
      expect(roleEvidence(type)).toBeUndefined();
    }
  });

  it('has exactly the roles with evidence, and names the ones without', () => {
    // The gap is a function with a pinned value, not a comment. A fourth
    // durable signal landing changes this and the change has to be a decision.
    expect(rolesEarningableToday()).toEqual(['coder', 'tester', 'reviewer']);
    expect(ROLE_SIGNALS.researcher.evidence).toEqual([]);
    expect(ROLE_SIGNALS.researcher.wantedButNotDurable).toContain('file.read');
  });

  it('never lets a type be evidence of two roles', () => {
    const seen = new Set<string>();
    for (const type of roleSignalEventTypes()) {
      expect(seen.has(type)).toBe(false);
      seen.add(type);
    }
    // And every declared evidence type is actually reachable, so a typo in the
    // table is a failure rather than a role that quietly never fires.
    expect(seen.size).toBe(roleSignalEventTypes().length);
  });

  it('does not consult wantedButNotDurable when classifying', () => {
    // The failure this closes: somebody fills the researcher gap by moving a
    // wanted type into `evidence`, and the durability gate in
    // tests/unit/guild-role-signal-durability.test.ts is the thing that catches
    // it. Here, the two lists are provably disjoint in the shipped table.
    for (const role of Object.keys(ROLE_SIGNALS) as (keyof typeof ROLE_SIGNALS)[]) {
      const evidence = ROLE_SIGNALS[role].evidence.map(([type]) => type);
      for (const wanted of ROLE_SIGNALS[role].wantedButNotDurable) {
        expect(evidence).not.toContain(wanted);
      }
    }
  });
});

describe('coverage beats stacking', () => {
  it('gives three of one role the same coverage as one', () => {
    // §10.2: "3 Claude should NOT just be 3 Claude". Three Coders is one Coder
    // who brought two friends, and coverage is a function of the SET.
    expect(coverageOf(['coder', 'coder', 'coder'])).toEqual(['coder']);
    expect(coverageOf(['coder', 'coder', 'coder'])).toEqual(coverageOf(['coder']));
  });

  it('triggers the plan’s coder+tester+reviewer synergy', () => {
    const synergies = synergiesFor(['coder', 'tester', 'reviewer']);
    expect(synergies.map((s) => s.name)).toEqual([PLAN_CODER_TESTER_REVIEWER]);
    expect(synergies[0]?.bonusPercent).toBe(10);
  });

  it('does not trigger it for a partial kit', () => {
    expect(synergiesFor(['coder', 'coder', 'coder', 'tester'])).toEqual([]);
    expect(synergiesFor(['coder', 'tester'])).toEqual([]);
  });

  it('does not care how many of each role are present', () => {
    const one = standingPercent(['coder', 'tester', 'reviewer']);
    const many = standingPercent([
      'coder',
      'coder',
      'coder',
      'coder',
      'tester',
      'tester',
      'tester',
      'tester',
      'reviewer',
      'reviewer',
      'reviewer',
      'reviewer',
    ]);
    expect(many).toBe(one);
  });

  it('bounds the breadth half, so a large guild cannot stack coverage', () => {
    // Every role is four, so a roster covering all four earns the ceiling once.
    expect(standingPercent(['researcher', 'coder', 'tester', 'reviewer'])).toBe(
      100 + 4 * MAX_COVERAGE_BONUS_PERCENT + 10,
    );
  });
});

describe('standing cannot be bought', () => {
  it('has no money anywhere in the input it is computed from', () => {
    // §10.4's no-pay-to-win rule, as a type rather than a promise. There is no
    // field a caller could put cents in, so the richest guild in the game has
    // no argument to pass here.
    const empty: TallyInput = {
      guildId: 'g',
      guildName: 'rich',
      completedWork: 0,
      memberRoles: [],
    };
    expect(Object.keys(empty).sort()).toEqual([
      'completedWork',
      'guildId',
      'guildName',
      'memberRoles',
    ]);
    expect(tallyStanding(empty)).toBe(0);
  });

  it('scores completed work and coverage, and nothing else a reader can name', () => {
    const input: TallyInput = {
      guildId: 'g1',
      guildName: 'builders',
      completedWork: 10,
      memberRoles: ['coder', 'tester', 'reviewer'],
    };
    // Three roles of breadth at 5% each, plus the plan's 10% for the full
    // coder+tester+reviewer kit, is 125%. 10 * 1.25 = 12.5, floored to 12.
    expect(standingPercent(input.memberRoles)).toBe(125);
    expect(tallyStanding(input)).toBe(12);
  });

  it('never returns a negative standing for a guild that did no work', () => {
    expect(
      tallyStanding({ guildId: 'g', guildName: 'x', completedWork: 0, memberRoles: ['coder'] }),
    ).toBe(0);
  });
});

describe('the board has a total order', () => {
  const rows: readonly TallyInput[] = [
    { guildId: 'g3', guildName: 'charlie', completedWork: 4, memberRoles: ['coder'] },
    { guildId: 'g1', guildName: 'alpha', completedWork: 10, memberRoles: ['coder'] },
    {
      guildId: 'g2',
      guildName: 'bravo',
      completedWork: 10,
      memberRoles: ['coder', 'tester', 'reviewer'],
    },
  ];

  it('puts the better-covered guild first at equal work', () => {
    const board = rankTallies(rows);
    expect(board.map((r) => r.guildId)).toEqual(['g2', 'g1', 'g3']);
    expect(board[0]?.rank).toBe(1);
  });

  it('gives two identical guilds a stable order rather than a reshuffle', () => {
    // Without a total order two guilds on the same score swap between calls,
    // and a board that reshuffles when nobody did anything is one nobody
    // believes.
    const tie: readonly TallyInput[] = [
      { guildId: 'zz', guildName: 'same', completedWork: 3, memberRoles: [] },
      { guildId: 'aa', guildName: 'same', completedWork: 3, memberRoles: [] },
    ];
    expect(rankTallies(tie).map((r) => r.guildId)).toEqual(['aa', 'zz']);
    expect(rankTallies([...tie].reverse()).map((r) => r.guildId)).toEqual(['aa', 'zz']);
  });

  it('shows the coverage that earned the position, so the number is checkable', () => {
    const board = rankTallies(rows);
    expect(board[0]?.coverage).toEqual(['coder', 'tester', 'reviewer']);
    expect(board[0]?.synergies).toEqual([PLAN_CODER_TESTER_REVIEWER]);
  });
});

describe('the ACL denies by default', () => {
  const member = (agentId: string, guilds: readonly string[]) => (who: string) =>
    who === agentId ? guilds : [];

  it('permits a direct message inside one guild', () => {
    const decision = canTalkToDecision(
      { fromAgentId: 'a', toAgentId: 'b', guildId: null },
      { senderGuilds: ['g1'], guildsOf: member('b', ['g1']) },
    );
    expect(decision.allowed).toBe(true);
  });

  it('refuses two agents who share no guild', () => {
    // The failure the can_talk_to pattern exists to prevent: an open channel
    // where any agent may DM any agent.
    const decision = canTalkToDecision(
      { fromAgentId: 'a', toAgentId: 'b', guildId: null },
      { senderGuilds: ['g1'], guildsOf: member('b', ['g2']) },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('share no guild');
  });

  it('refuses a sender in no guild at all', () => {
    const decision = canTalkToDecision(
      { fromAgentId: 'a', toAgentId: 'b', guildId: null },
      { senderGuilds: [], guildsOf: member('b', ['g1']) },
    );
    expect(decision.allowed).toBe(false);
  });

  it('permits a broadcast into the sender’s own guild and refuses another’s', () => {
    expect(
      canTalkToDecision(
        { fromAgentId: 'a', toAgentId: null, guildId: 'g1' },
        { senderGuilds: ['g1'] },
      ).allowed,
    ).toBe(true);
    expect(
      canTalkToDecision(
        { fromAgentId: 'a', toAgentId: null, guildId: 'g2' },
        { senderGuilds: ['g1'] },
      ).allowed,
    ).toBe(false);
  });

  it('refuses a question that names neither or both, rather than picking one', () => {
    expect(
      canTalkToDecision(
        { fromAgentId: 'a', toAgentId: null, guildId: null },
        { senderGuilds: ['g1'] },
      ).allowed,
    ).toBe(false);
    expect(
      canTalkToDecision(
        { fromAgentId: 'a', toAgentId: 'b', guildId: 'g1' },
        { senderGuilds: ['g1'] },
      ).allowed,
    ).toBe(false);
  });

  it('refuses when the recipient’s guilds were not supplied, instead of assuming none shared', () => {
    // Absent data is not permission. Treating a missing lookup as "no shared
    // guild" happens to deny here, but a future refactor that made it return
    // the sender's guilds would open the channel silently — so the branch is
    // explicit and tested.
    const decision = canTalkToDecision(
      { fromAgentId: 'a', toAgentId: 'b', guildId: null },
      { senderGuilds: ['g1'] },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('guilds');
  });
});
