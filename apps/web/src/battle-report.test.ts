import { describe, expect, it, vi } from 'vitest';

import { buildPublicReplay, REPLAY_BEAT_NAMES } from '@battle-agents/activity';
import type { ActivityEntry } from '@battle-agents/activity';

import {
  renderReport,
  UNKNOWN_HARNESS_LABEL,
  WITHHELD_CRITERION_LABEL,
  type ReportableBeat,
  type ReportableReplay,
} from './battle-report.js';

/**
 * The report, and the claim it exists to make safe.
 *
 * ## What is asserted here, and what is not
 *
 * The happy path is asserted as PROSE — a sentence a person can read, not the
 * presence of a field — because a report that renders `beat.beat` and its
 * detail keys is a JSON dump with a `<ol>` around it, and that already exists at
 * `/replay/<id>`. Asserting the presence of a value would pass on the JSON dump.
 *
 * The security claim is asserted the other way round, and it is the one this
 * bead exists to get right: a DELIBERATELY HOSTILE projection is rendered, and
 * the report is required to contain none of it. `a reporter that renders a
 * session id is exactly the bug this bead could ship`, and the only test that
 * catches that is one where a session id is present in the input. Every
 * assertion of the form "the output does not contain X" was checked by breaking
 * the guard that produces it and watching the suite go red; the mutations are
 * named at each one.
 */

/* ───────────────────────────── fixtures ───────────────────────────── */

/** Recognisable as a handle, so a substring search finds it if it escapes. */
const ALICE_SESSION = '11111111-1111-4111-8111-111111111111';
const BOB_SESSION = '22222222-2222-4222-8222-222222222222';
/** Not a uuid, because the test should not pass merely because a filter is
 *  regex-shaped. A path, a repository, a file layout, a command fragment. */
const SECRET_PATH = '/Users/somebody/dev/secret-client/src/auth/token.ts';
const SECRET_REPO = 'private-org/embargoed-security-advisory';

const T0 = '2026-03-04T09:00:00.000Z';

function beat(
  index: number,
  name: string,
  overrides: Partial<Omit<ReportableBeat, 'at' | 'offsetMs' | 'beat'>> = {},
): ReportableBeat {
  return {
    at: new Date(Date.parse(T0) + index * 1000).toISOString(),
    offsetMs: index * 1000,
    beat: name,
    fighter: null,
    detail: {},
    ...overrides,
  };
}

/** A finished two-fighter battle: joined, worked, tested, judged. */
const FINISHED: ReportableReplay = {
  state: 'available',
  mode: 'speed',
  outcome: 'won',
  reason: 'outscored',
  rubric: { correctness: 0.4, efficiency: 0.2, quality: 0.2, regression: 0.1, tests: 0.1 },
  durationMs: 192_000,
  fighters: [
    {
      label: 'Fighter A',
      harness: 'claude',
      total: 0.82,
      won: true,
      score: [
        { criterion: 'correctness', weight: 0.4, score: 0.9, weighted: 0.36 },
        { criterion: 'efficiency', weight: 0.2, score: 0.8, weighted: 0.16 },
        { criterion: 'quality', weight: 0.2, score: 0.7, weighted: 0.14 },
        { criterion: 'regression', weight: 0.1, score: 0.9, weighted: 0.09 },
        { criterion: 'tests', weight: 0.1, score: 0.7, weighted: 0.07 },
      ],
    },
    {
      label: 'Fighter B',
      harness: 'codex',
      total: 0.41,
      won: false,
      score: [
        { criterion: 'correctness', weight: 0.4, score: 0.5, weighted: 0.2 },
        { criterion: 'efficiency', weight: 0.2, score: 0.4, weighted: 0.08 },
        { criterion: 'quality', weight: 0.2, score: 0.4, weighted: 0.08 },
        { criterion: 'regression', weight: 0.1, score: 0.5, weighted: 0.05 },
        { criterion: 'tests', weight: 0.1, score: 0, weighted: 0 },
      ],
    },
  ],
  beats: [
    beat(0, 'battle.opened', { detail: { mode: 'speed' } }),
    beat(1, 'fighter.joined', { fighter: 'Fighter A' }),
    beat(2, 'session.started', { fighter: 'Fighter A', detail: { harness: 'claude' } }),
    beat(4, 'test.passed', { fighter: 'Fighter A', detail: { suite: 'unit', count: 9 } }),
    beat(6, 'test.failed', { fighter: 'Fighter A', detail: { suite: 'integration' } }),
    beat(9, 'fighter.joined', { fighter: 'Fighter B' }),
    beat(10, 'session.started', { fighter: 'Fighter B', detail: { harness: 'codex' } }),
    beat(30, 'test.passed', { fighter: 'Fighter B', detail: { suite: 'unit', count: 4 } }),
    beat(120, 'session.ended', { fighter: 'Fighter A', detail: { reason: 'completed' } }),
    beat(185, 'battle.finished', {
      detail: { outcome: 'won', reason: 'outscored' },
    }),
  ],
};

/** Nothing happened: the opening beat and no fighters, which is the shape a
 *  battle has between being created and being joined. */
const BARELY_STARTED: ReportableReplay = {
  state: 'in-progress',
  mode: 'speed',
  outcome: null,
  reason: null,
  rubric: null,
  durationMs: 0,
  fighters: [],
  beats: [beat(0, 'battle.opened', { detail: { mode: 'speed' } })],
};

/** No rows at all: the far end of the 365-day window. */
const EMPTY: ReportableReplay = {
  state: 'expired',
  mode: null,
  outcome: null,
  reason: null,
  rubric: null,
  durationMs: null,
  fighters: [],
  beats: [],
};

/* ───────────────────────────── the report reads ───────────────────────────── */

describe('a report of a finished battle', () => {
  const report = renderReport(FINISHED);

  it('says what ran, how it ended and on what, in one paragraph', () => {
    // Not "the fields are present". A summary that lists the mode, the outcome
    // and the rubric as three separate facts is a JSON dump, and this assertion
    // is the one that would notice.
    expect(report.summary).toBe(
      'A speed battle between Fighter A (claude) and Fighter B (codex). ' +
        'It ran for 3m 12s. Fighter A (claude) won it, the weighted score was higher. ' +
        'It was scored on a published rubric of 5 criteria, frozen before the battle finished.',
    );
  });

  it('turns each beat into a sentence rather than a field name and a payload', () => {
    expect(report.steps.map((step) => step.text)).toEqual([
      'The battle opened as a speed battle.',
      'Fighter A joined the battle.',
      'Fighter A started a session on claude.',
      'Fighter A ran the unit suite and 9 tests passed.',
      'Fighter A failed a test in the integration suite.',
      'Fighter B joined the battle.',
      'Fighter B started a session on codex.',
      'Fighter B ran the unit suite and 4 tests passed.',
      'Fighter A’s session ended — it completed.',
      'The battle finished — the weighted score was higher.',
    ]);
    // The machine's own vocabulary is gone. A report that kept `test.failed`
    // beside the sentence would be the JSON dump again.
    for (const step of report.steps) {
      expect(step.text).not.toMatch(/\b(battle|session|fighter|test)\.[a-z_]+\b/);
    }
  });

  it('stamps each step with when it happened, and the page does not own the format', () => {
    expect(report.steps.map((step) => step.label)).toEqual([
      '00:00',
      '00:01',
      '00:02',
      '00:04',
      '00:06',
      '00:09',
      '00:10',
      '00:30',
      '02:00',
      '03:05',
    ]);
    // The machine-readable half is carried too, so a page can put it in a
    // `datetime` without parsing the label back.
    expect(report.steps[8]?.at).toBe('2026-03-04T09:02:00.000Z');
    expect(report.steps[8]?.offsetMs).toBe(120_000);
  });

  it('breaks each fighter down criterion by criterion, with the weights beside', () => {
    const first = report.fighters[0];
    expect(first?.label).toBe('Fighter A');
    expect(first?.harness).toBe('claude');
    expect(first?.won).toBe(true);
    expect(first?.total).toBe(0.82);
    expect(first?.criteria).toEqual([
      { criterion: 'correctness', weight: 0.4, score: 0.9, weighted: 0.36 },
      { criterion: 'efficiency', weight: 0.2, score: 0.8, weighted: 0.16 },
      { criterion: 'quality', weight: 0.2, score: 0.7, weighted: 0.14 },
      { criterion: 'regression', weight: 0.1, score: 0.9, weighted: 0.09 },
      { criterion: 'tests', weight: 0.1, score: 0.7, weighted: 0.07 },
    ]);
  });

  it('publishes the rubric, because the weights are the fairness claim', () => {
    // `docs/design/public-replay.md`: the rubric is "the one thing a reader
    // cannot check for themselves, so it is published". A report that dropped it
    // would leave the scores unfalsifiable.
    expect(report.rubric).toEqual([
      { criterion: 'correctness', weight: 0.4 },
      { criterion: 'efficiency', weight: 0.2 },
      { criterion: 'quality', weight: 0.2 },
      { criterion: 'regression', weight: 0.1 },
      { criterion: 'tests', weight: 0.1 },
    ]);
  });
});

describe('a report of a battle that has barely begun', () => {
  const report = renderReport(BARELY_STARTED);

  it('reads as a battle waiting for a fighter rather than a broken one', () => {
    expect(report.summary).toBe(
      'A speed battle with no fighters recorded. It is still running. Everything recorded so far is below.',
    );
    expect(report.steps.map((step) => step.text)).toEqual(['The battle opened as a speed battle.']);
    expect(report.fighters).toEqual([]);
    expect(report.rubric).toEqual([]);
  });
});

describe('an empty stream, which is the case that renders as a crash', () => {
  it('reports rather than throws, and claims only what the log can support', () => {
    const report = renderReport(EMPTY);
    // `docs/design/public-replay.md`: `expired` claims "no events for this
    // battle are present" and not one word more — whether they were pruned or
    // never written is not answerable from the log. A summary saying "the battle
    // was deleted" would be inventing a history.
    //
    // The wording is asserted on the negative too, because the first draft said
    // "older than the activity log keeps" and that is precisely the inference
    // the design document forbids. `buildPublicReplay` hands `expired` to a
    // battle with no beats for ANY reason, and running the report against a
    // real database produced a `running` battle that had never been joined
    // being told its events had aged out.
    expect(report.summary).toBe(
      'A battle with no fighters recorded. The activity log holds no events for this battle, ' +
        'so there is no step-by-step account to read.',
    );
    expect(report.summary).not.toMatch(/older|pruned|deleted|retention|expired/i);
    expect(report.steps).toEqual([]);
    expect(report.fighters).toEqual([]);
  });

  it('does not claim a duration, an outcome or a rubric it has none of', () => {
    const report = renderReport(EMPTY);
    expect(report.summary).not.toMatch(/\d/);
    expect(report.rubric).toEqual([]);
  });
});

/* ───────────────────────────── the boundary ───────────────────────────── */

describe('a report cannot publish an internal handle', () => {
  /**
   * A projection carrying, in every field a report reads:
   *
   * - a session id in `beat.fighter` where the label is a different string;
   * - a session id and a path in `detail`, under keys the report has no phrase
   *   for;
   * - a session id in `detail.suite` — which passes every character class a
   *   uuid passes, which is why the suite guard is an allow-list and not a
   *   shape heuristic;
   * - a harness and a mode that are not on their lists;
   * - a criterion name that is a path;
   * - a beat name that is a raw protocol event type.
   *
   * Nothing here can come out of `buildPublicReplay` today. That is the point of
   * building it: each item is one place the projection could be widened by a
   * future row, and the report is the last place before a permanent public page.
   */
  const HOSTILE: ReportableReplay = {
    state: 'available',
    mode: `speed-${ALICE_SESSION}`,
    outcome: SECRET_REPO,
    reason: SECRET_PATH,
    rubric: { [SECRET_PATH]: 0.5, correctness: 0.5 },
    durationMs: 1000,
    fighters: [
      {
        label: 'Fighter A',
        harness: ALICE_SESSION,
        total: 1,
        won: true,
        score: [
          { criterion: SECRET_PATH, weight: 0.5, score: 1, weighted: 0.5 },
          { criterion: 'correctness', weight: 0.5, score: 0.5, weighted: 0.25 },
        ],
      },
    ],
    beats: [
      beat(0, 'battle.opened', { detail: { mode: `speed-${ALICE_SESSION}` } }),
      beat(1, 'fighter.joined', { fighter: ALICE_SESSION }),
      beat(2, 'session.started', { fighter: ALICE_SESSION, detail: { harness: ALICE_SESSION } }),
      beat(3, 'test.passed', {
        fighter: ALICE_SESSION,
        detail: { suite: ALICE_SESSION, count: 1 },
      }),
      beat(4, 'test.failed', { fighter: ALICE_SESSION, detail: { suite: SECRET_PATH } }),
      // A detail key the report has no phrase for, and keys it does.
      beat(5, 'fighter.joined', {
        fighter: 'Fighter A',
        detail: { sessionId: BOB_SESSION, path: SECRET_PATH, command: `rm -rf ${SECRET_PATH}` },
      }),
      beat(6, 'battle.finished', {
        detail: { outcome: SECRET_REPO, reason: SECRET_PATH, sessionId: BOB_SESSION },
      }),
      // A RAW PROTOCOL EVENT TYPE, which is what a projection that fell through
      // a `default` arm would publish wearing a friendly name.
      beat(7, 'file.write', { fighter: 'Fighter A', detail: { path: SECRET_PATH } }),
    ],
  };

  const report = renderReport(HOSTILE);
  const rendered = JSON.stringify(report);

  it('prints no session id from any field', () => {
    // Removing the membership test in `stepOf` and the phrase-level guards turns
    // this red with BOTH uuids in the output. Verified by mutation, not by
    // reading: the test is only worth having if it can fail.
    expect(rendered).not.toContain(ALICE_SESSION);
    expect(rendered).not.toContain(BOB_SESSION);
  });

  it('prints no path, no repository and no command', () => {
    expect(rendered).not.toContain(SECRET_PATH);
    expect(rendered).not.toContain(SECRET_REPO);
  });

  it('names a fighter only by the label the same replay published', () => {
    // The beat said `Fighter A` in one row and a session id in another. The
    // report uses the label and drops the other — and it KEEPS the step, so a
    // reader can tell a withheld name from a missing event.
    const joined = report.steps
      .map((step) => step.text)
      .filter((text) => text.endsWith('joined the battle.'));
    expect(joined).toEqual(['A fighter joined the battle.', 'Fighter A joined the battle.']);
  });

  it('keeps the row whose fields it can speak, and withholds only the ones it cannot', () => {
    // Withholding a name must not blank the row: the weight and the score are
    // numbers from the judge and they are what makes the rubric legible. A
    // report that dropped the whole row would be safe and useless, and the
    // distinction is the reason this is a narrowing rather than a filter.
    const first = report.fighters[0];
    expect(first?.criteria).toEqual([
      { criterion: null, weight: 0.5, score: 1, weighted: 0.5 },
      { criterion: 'correctness', weight: 0.5, score: 0.5, weighted: 0.25 },
    ]);
    expect(report.rubric).toEqual([
      { criterion: null, weight: 0.5 },
      { criterion: 'correctness', weight: 0.5 },
    ]);
    expect(WITHHELD_CRITERION_LABEL).not.toBe('');
  });

  it('does not repeat a beat name it has no sentence for', () => {
    // `file.write` is a protocol event type. A step that quoted it would put
    // `docs/design/public-replay.md`'s "everything else → nothing" back on the
    // page, and it would do it while looking like a report of the work.
    expect(rendered).not.toContain('file.write');
    expect(report.steps.at(-1)?.text).toBe(
      'The log recorded a step this report does not describe.',
    );
  });

  it('drops a harness that is not one the protocol still accepts', () => {
    expect(report.fighters[0]?.harness).toBeNull();
    expect(UNKNOWN_HARNESS_LABEL).not.toBe('');
  });

  it('still renders every step, so the account is not silently shorter', () => {
    // A boundary that DELETES is a boundary that can be defeated by deleting:
    // a reader told a timeline is complete cannot tell a withheld step from a
    // missing one. The step is kept and says it is undescribed.
    expect(report.steps).toHaveLength(HOSTILE.beats.length);
  });
});

describe('a report is a pure function of the projection', () => {
  it('reads no clock, so two readers of one link see the same bytes', async () => {
    // The claim `docs/design/public-replay.md` makes about the projection —
    // "two people opening the same link see the same bytes" — is only true of
    // the report if the report adds nothing of its own. A `new Date()` in a
    // formatter would satisfy every other assertion in this file and break that
    // one, silently.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
      const first = JSON.stringify(renderReport(FINISHED));
      vi.setSystemTime(new Date('2031-11-05T18:22:07.000Z'));
      expect(JSON.stringify(renderReport(FINISHED))).toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mutates nothing it was given', () => {
    // A report that sorted `fighters` in place would leave the projection behind
    // it in a different order than the one the og card and the share metadata
    // read, and the difference would only show on a page that renders both.
    const before = JSON.stringify(FINISHED);
    renderReport(FINISHED);
    expect(JSON.stringify(FINISHED)).toBe(before);
  });
});

/* ───────────────────────────── the real projection ───────────────────────────── */

describe('the report over the projection the tree actually builds', () => {
  /** A log with a secret in every field a projection reads. */
  const logWithSecrets: readonly ActivityEntry[] = [
    {
      sequence: 1,
      type: 'battle.created',
      actorId: 'battle',
      sessionId: null,
      causationId: null,
      occurredAt: T0,
      payload: {
        battleId: 'battle-1',
        bountyId: SECRET_REPO,
        mode: 'speed',
        participants: [ALICE_SESSION],
      },
    },
    {
      sequence: 2,
      type: 'session.started',
      actorId: ALICE_SESSION,
      sessionId: ALICE_SESSION,
      causationId: null,
      occurredAt: T0,
      payload: {
        agentId: BOB_SESSION,
        installationId: SECRET_PATH,
        projectId: SECRET_REPO,
        harness: 'claude',
      },
    },
    {
      sequence: 3,
      type: 'file.write',
      actorId: ALICE_SESSION,
      sessionId: ALICE_SESSION,
      causationId: null,
      occurredAt: T0,
      payload: { path: SECRET_PATH, bytes: 'x' },
    },
    {
      sequence: 4,
      type: 'test.failed',
      actorId: ALICE_SESSION,
      sessionId: ALICE_SESSION,
      causationId: null,
      occurredAt: T0,
      // The suite name is a repository path on purpose: the live stream
      // publishes this as-is and the replay narrows it, so it is the field where
      // the two documents disagree and the one this bead must not undo.
      payload: { suite: 'packages/db/src/verify.test.ts', failure: SECRET_PATH },
    },
    {
      sequence: 5,
      type: 'test.passed',
      actorId: ALICE_SESSION,
      sessionId: ALICE_SESSION,
      causationId: null,
      occurredAt: T0,
      payload: { suite: 'unit', count: 12 },
    },
    {
      sequence: 6,
      type: 'battle.finished',
      actorId: 'battle',
      sessionId: null,
      causationId: null,
      occurredAt: T0,
      payload: {
        battleId: 'battle-1',
        outcome: 'won',
        reason: 'outscored',
        winnerSessionIds: [ALICE_SESSION],
        scores: [
          {
            sessionId: ALICE_SESSION,
            total: 0.9,
            criteria: [{ criterion: 'correctness', weight: 1, score: 0.9, weighted: 0.9 }],
          },
        ],
      },
    },
  ];

  const report = renderReport(
    buildPublicReplay({
      replayId: '11111111-1111-4111-8111-999999999999',
      entries: logWithSecrets,
    }),
  );
  const rendered = JSON.stringify(report);

  it('carries no session id out of a real log row', () => {
    expect(rendered).not.toContain(ALICE_SESSION);
    expect(rendered).not.toContain(BOB_SESSION);
  });

  it('carries no path, no repository and no failure text', () => {
    expect(rendered).not.toContain(SECRET_PATH);
    expect(rendered).not.toContain(SECRET_REPO);
  });

  it('keeps the suite name the replay narrowed to, and drops the one it refused', () => {
    // `pnpm test packages/db/src/verify.test.ts` is an ordinary value for a
    // suite name and it is a repository path, which is why `replay.ts` holds it
    // to a shape. The report must not undo that narrowing by being more
    // permissive than the projection it reads.
    const texts = report.steps.map((step) => step.text);
    expect(texts).toContain('Fighter A ran the unit suite and 12 tests passed.');
    expect(texts.some((text) => text.includes('verify.test.ts'))).toBe(false);
    // The `file.write` row produced no beat, so no step narrates it.
    expect(texts.some((text) => text.includes('write') || text.includes('file.'))).toBe(false);
  });

  it('reports the verdict and the score the judge recorded', () => {
    expect(report.summary).toContain('Fighter A (claude) won it, the weighted score was higher.');
    expect(report.fighters[0]?.criteria).toEqual([
      { criterion: 'correctness', weight: 1, score: 0.9, weighted: 0.9 },
    ]);
  });
});

/* ───────────────────────────── the drift guard ───────────────────────────── */

describe('the report narrates every beat the projection can publish', () => {
  const UNDESCRIBED = 'The log recorded a step this report does not describe.';

  it('covers the closed set, so a new beat is a decision rather than a blank', () => {
    // `REPLAY_BEAT_NAMES` is the projection's exhaustive set, asserted against
    // the REAL constant rather than a copy, so a beat added to `replay.ts` lands
    // here as a failure. This is not a formality: the first draft of `PHRASES`
    // keyed the join as `battle.joined` when the projection publishes
    // `fighter.joined`, so two of ten steps rendered as undescribed and nothing
    // else in the suite noticed. A closed set with no coverage check is a set
    // somebody reads rather than one that is checked.
    const narrated = renderReport({
      ...FINISHED,
      beats: REPLAY_BEAT_NAMES.map((name) => beat(0, name, { fighter: 'Fighter A' })),
    });
    expect(narrated.steps.filter((step) => step.text === UNDESCRIBED)).toEqual([]);
    expect(narrated.steps).toHaveLength(REPLAY_BEAT_NAMES.length);
  });

  it('is a list this file owns, so the guard above is not a tautology', () => {
    // The assertion above would pass trivially if `PHRASES` were keyed by the
    // same constant. A guard that cannot fail is worse than none, so this pins
    // the other direction: a beat the report has no entry for DOES produce an
    // undescribed step, and a named one does not.
    const report = renderReport({
      ...FINISHED,
      beats: [
        beat(0, 'battle.opened', { detail: { mode: 'speed' } }),
        beat(1, 'tool.started', { fighter: 'Fighter A' }),
        beat(2, 'battle.opened', { detail: { mode: 'speed' } }),
      ],
    });
    expect(report.steps.map((step) => step.text)).toEqual([
      'The battle opened as a speed battle.',
      UNDESCRIBED,
      'The battle opened as a speed battle.',
    ]);
  });
});
