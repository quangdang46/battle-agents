import { describe, expect, it } from 'vitest';

import {
  ACHIEVEMENT_CODES,
  ACHIEVEMENT_EVENT_TYPES,
  ACHIEVEMENT_RULES,
  describeCode,
  earnedBy,
  isAchievementCode,
  parseCode,
  RULES_BY_CODE,
  rulesForTrigger,
  versionOf,
  type AchievementRule,
  type RecordedRow,
} from './rules.js';

/**
 * The catalogue, as pure data over pure rows.
 *
 * Every case here is a hand-built log, which is the point: the rules claim to be
 * a projection over recorded outcomes, and the only way that is checkable is if
 * the projection can be run against rows somebody wrote down rather than rows
 * a database happened to hold.
 */

let sequence = 0;

function row(
  type: string,
  at: string,
  payload: Record<string, unknown> = {},
  sessionId: string | null = 'run-1',
): RecordedRow {
  sequence += 1;
  return {
    sequence,
    type,
    sessionId,
    actorId: null,
    occurredAt: at,
    payload: { ...payload, ...(sessionId === null ? {} : { sessionId }) },
  };
}

function rule(code: (typeof ACHIEVEMENT_CODES)[number]): AchievementRule {
  return RULES_BY_CODE[code];
}

const FIRST_BOUNTY = 'first-bounty.v1';
const SURVIVED = 'survived-a-crash.v1';
const CRITICAL = 'critical-hit.v1';

describe('the catalogue', () => {
  it('lists a code in the tuple for every rule in the table, and the other way round', () => {
    // The two are spelled separately on purpose — the table can be indexed by
    // code and the tuple gives a union — so the pair is a claim that has to be
    // checked rather than one that can be read off either of them. A rule added
    // without the tuple is a badge no caller can name in a type.
    expect(ACHIEVEMENT_RULES.map((entry) => entry.code).sort()).toEqual(
      [...ACHIEVEMENT_CODES].sort(),
    );
    for (const code of ACHIEVEMENT_CODES) {
      expect(RULES_BY_CODE[code]).toBeDefined();
    }
  });

  it('has more failure achievements than success ones, because that is the plan', () => {
    // Section 10.2's death rule says a crash fails the session and never the
    // character, and then says "Failure achievements included" in the same
    // breath. A catalogue that drifts to rewarding only success contradicts the
    // design it is part of, so the ratio is pinned rather than left to taste.
    const failure = ACHIEVEMENT_RULES.filter((entry) => entry.code !== FIRST_BOUNTY);
    expect(failure.length).toBeGreaterThan(ACHIEVEMENT_RULES.length - failure.length);
  });

  it('carries no score, rarity or tier on any rule', () => {
    // Section 17.8 risk 8 bans an achievement economy in the MVP, and a points
    // value on a rule is the first move towards one: a second currency with a
    // leaderboard of its own, competing with progression for what a character
    // is. An allowlist rather than a fixed list, because `requires` is
    // legitimately optional and a rule that has one has a different key set.
    const ALLOWED = new Set(['code', 'detail', 'evidence', 'requires', 'title', 'trigger']);
    for (const entry of ACHIEVEMENT_RULES) {
      for (const key of Object.keys(entry)) {
        expect(ALLOWED.has(key), `${entry.code} carries "${key}", which no rule has any business having`).toBe(true);
      }
      for (const key of Object.keys(entry.evidence)) {
        expect(['eventType', 'times', 'within']).toContain(key);
      }
    }
  });

  it('reads only recorded event types, and every one is a real type', () => {
    // A rule keyed on a type nothing emits is a badge nobody can earn, and the
    // reverse is worse: it is a handler subscribed to a name that will never
    // arrive. The durable half of this claim is the feature test; this half is
    // that the names are real, spelled the way the platform spells them.
    expect([...ACHIEVEMENT_EVENT_TYPES].sort()).toEqual([
      'bounty.completed',
      'session.ended',
      'test.failed',
      'test.passed',
    ]);
    for (const entry of ACHIEVEMENT_RULES) {
      expect(rulesForTrigger(entry.trigger)).toContain(entry);
      expect(ACHIEVEMENT_EVENT_TYPES).toContain(entry.evidence.eventType);
    }
  });

  it('groups the rules that share a trigger, so one event can complete more than one', () => {
    // The property that matters when a fourth badge lands on an existing
    // trigger: `rulesForTrigger` has to return every rule for it, not the first.
    const grouped = new Map<string, number>();
    for (const entry of ACHIEVEMENT_RULES) {
      grouped.set(entry.trigger, (grouped.get(entry.trigger) ?? 0) + 1);
    }
    for (const [trigger, expected] of grouped) {
      expect(rulesForTrigger(trigger).length).toBe(expected);
    }
    expect(rulesForTrigger('quest.completed')).toEqual([]);
  });
});

describe('codes are versioned so a rename costs no history', () => {
  it('splits a code into a slug and a major version', () => {
    expect(parseCode('first-bounty.v1')).toEqual({ slug: 'first-bounty', version: 1 });
    expect(parseCode('back-from-five.v12')).toEqual({ slug: 'back-from-five', version: 12 });
  });

  it('refuses a code with no version, and one with a leading zero in it', () => {
    // A code that parses two ways is a code whose meaning depends on who reads
    // it, so the pattern is strict: v0 does not exist as a first version and
    // `v01` is not a spelling of it.
    expect(parseCode('first-bounty')).toBeUndefined();
    expect(parseCode('first-bounty.v0')).toBeUndefined();
    expect(parseCode('first-bounty.v01')).toBeUndefined();
    expect(parseCode('First-Bounty.v1')).toBeUndefined();
    expect(parseCode('first_bounty.v1')).toBeUndefined();
  });

  it('still renders a badge whose code this build has never heard of', () => {
    // The failure this exists to prevent: a renamed achievement, or one a newer
    // build awarded, becoming an invisible badge. The award is real; only the
    // wording is missing, and that is a different thing from the badge being
    // gone.
    const described = describeCode('first-bounty.v9');
    expect(described.code).toBe('first-bounty.v9');
    expect(described.slug).toBe('first-bounty');
    expect(described.version).toBe(9);
    expect(described.title).toBeNull();
    expect(described.detail).toBeNull();
  });

  it('describes a code it knows, from the catalogue and never from a row', () => {
    expect(describeCode(FIRST_BOUNTY).title).toBe('First Bounty');
    expect(describeCode('not-a-code').slug).toBeNull();
    expect(versionOf('nonsense')).toBeNull();
    expect(isAchievementCode('first-bounty.v1')).toBe(true);
    expect(isAchievementCode('first-bounty.v2')).toBe(false);
  });
});

describe('first-bounty', () => {
  it('is earned by the log holding one completed bounty', () => {
    const history = [row('bounty.completed', '2026-09-26T10:00:00.000Z', { agentId: 'a1' })];
    expect(earnedBy(rule(FIRST_BOUNTY), history[0]!, history)).toBe(true);
  });

  it('is not earned by an unrelated event, and not by no history at all', () => {
    const trigger = row('bounty.completed', '2026-09-26T10:00:00.000Z', { agentId: 'a1' });
    expect(earnedBy(rule(FIRST_BOUNTY), trigger, [])).toBe(false);
    const other = row('quest.completed', '2026-09-26T10:00:00.000Z', { agentId: 'a1' });
    expect(earnedBy(rule(FIRST_BOUNTY), other, [other])).toBe(false);
  });

  it('counts a lifetime, so it does not care which run it happened in', () => {
    const trigger = row('bounty.completed', '2026-09-26T10:00:00.000Z', {}, 'run-9');
    const history = [
      row('bounty.completed', '2026-01-01T00:00:00.000Z', {}, 'run-1'),
      trigger,
    ];
    expect(earnedBy(rule(FIRST_BOUNTY), trigger, history)).toBe(true);
  });
});

describe('survived-a-crash — the death rule, made recordable', () => {
  it('is earned when a session ended in a crash', () => {
    const trigger = row('session.ended', '2026-09-26T10:00:00.000Z', { reason: 'crashed' });
    expect(earnedBy(rule(SURVIVED), trigger, [trigger])).toBe(true);
  });

  it('is not earned by a session that completed or was abandoned', () => {
    // `session.ended` arrives for all three reasons and the badge means the
    // third. A rule keyed on the event name alone would hand it to every
    // session that ever finished, which is most of them.
    for (const reason of ['completed', 'abandoned']) {
      const trigger = row('session.ended', '2026-09-26T10:00:00.000Z', { reason });
      expect(earnedBy(rule(SURVIVED), trigger, [trigger])).toBe(false);
    }
  });

  it('is not earned by a payload that says nothing about why, because silence is not a crash', () => {
    const trigger = row('session.ended', '2026-09-26T10:00:00.000Z', {});
    expect(earnedBy(rule(SURVIVED), trigger, [trigger])).toBe(false);
  });
});

describe('critical-hit — five failures in a run, then a green one', () => {
  function failures(count: number, sessionId: string | null, at: string): RecordedRow[] {
    return Array.from({ length: count }, (_unused, index) =>
      row('test.failed', at, { failure: `case-${index}` }, sessionId),
    );
  }

  it('is earned by the pass that follows five failures in the same run', () => {
    const history = [
      ...failures(5, 'run-1', '2026-09-26T10:00:00.000Z'),
      row('test.passed', '2026-09-26T10:05:00.000Z', { suite: 'unit' }, 'run-1'),
    ];
    const trigger = history[history.length - 1]!;
    expect(earnedBy(rule(CRITICAL), trigger, history)).toBe(true);
  });

  it('is not earned by four failures, however many runs they are spread over', () => {
    const history = [
      ...failures(2, 'run-1', '2026-09-26T10:00:00.000Z'),
      ...failures(2, 'run-2', '2026-09-26T11:00:00.000Z'),
      row('test.passed', '2026-09-26T12:00:00.000Z', {}, 'run-2'),
    ];
    const trigger = history[history.length - 1]!;
    expect(earnedBy(rule(CRITICAL), trigger, history)).toBe(false);
  });

  it('is not earned by a pass that came BEFORE the fifth failure', () => {
    // The case that makes the projection order-sensitive, and the reason a
    // backfill replays rows instead of evaluating them as a set. Against the
    // same five rows in the same log, a set-valued evaluation says yes here and
    // the character sheet is wrong about the order things happened.
    const history = [
      row('test.passed', '2026-09-26T09:00:00.000Z', {}, 'run-1'),
      ...failures(5, 'run-1', '2026-09-26T10:00:00.000Z'),
    ];
    const trigger = history[0]!;
    expect(earnedBy(rule(CRITICAL), trigger, history)).toBe(false);
  });

  it('is not earned by a pass that belongs to a different run', () => {
    const history = [
      ...failures(5, 'run-1', '2026-09-26T10:00:00.000Z'),
      row('test.passed', '2026-09-26T12:00:00.000Z', {}, 'run-2'),
    ];
    const trigger = history[history.length - 1]!;
    expect(earnedBy(rule(CRITICAL), trigger, history)).toBe(false);
  });

  it('is not earned by a pass with no session, because it cannot be placed in a run', () => {
    // Attributing it to whichever run was current would award the badge on a
    // guess about what the agent was doing.
    const history = [
      ...failures(5, 'run-1', '2026-09-26T10:00:00.000Z'),
      row('test.passed', '2026-09-26T12:00:00.000Z', {}, null),
    ];
    const trigger = history[history.length - 1]!;
    expect(trigger.sessionId).toBeNull();
    expect(earnedBy(rule(CRITICAL), trigger, history)).toBe(false);
  });

  it('does not count failures with no session either', () => {
    const history = [
      ...failures(5, null, '2026-09-26T10:00:00.000Z'),
      row('test.passed', '2026-09-26T12:00:00.000Z', {}, 'run-1'),
    ];
    const trigger = history[history.length - 1]!;
    expect(earnedBy(rule(CRITICAL), trigger, history)).toBe(false);
  });
});
