import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_BATTLE_WEIGHTS, JUDGE_CRITERIA, type BattleWeights } from './domain.js';
import {
  criteriaFrom,
  DEFAULT_JUDGE_PLAN,
  DEFAULT_SECURITY_RULES,
  JUDGE_STEPS,
  parseNumstat,
  runJudge,
  type JudgeStepEvent,
  type JudgeStepPlan,
  type SecurityRule,
} from './judge-run.js';
import {
  makeScratchBase,
  provisionWorkspace,
  removeScratchBase,
  type WorkspaceHandle,
  type WorkspaceRunResult,
} from './workspace.js';

/**
 * The judge RUN: an ordered, attributable stream, a stated forfeit, and a score
 * computed from the battle's own weights.
 *
 * Three of these tests exist to catch a specific wrong implementation that would
 * otherwise look right:
 *
 *   - A judge that emitted ONE event per participant instead of one per step
 *     would still produce a score, and a replay built from it would show a
 *     number with no way to ask where it came from.
 *   - A judge that read `DEFAULT_BATTLE_WEIGHTS` would produce the same total
 *     for two battles with different published rubrics, and every assertion
 *     about scoring would still pass.
 *   - A judge with no forfeit rule would hang a match whose workspace never
 *     finished installing, which is the failure this file's timeout tests are
 *     here to make impossible.
 */

let base: string | null = null;

afterEach(() => {
  if (base !== null) {
    removeScratchBase(base);
    base = null;
  }
});

function workspace(sessionId: string): WorkspaceHandle {
  const root = (base ??= makeScratchBase('battle-judge-test-'));
  return provisionWorkspace(root, 'battle-1', sessionId).handle;
}

/** A workspace with a couple of source files in it, for the security step to read. */
function workspaceWithFiles(
  sessionId: string,
  files: Readonly<Record<string, string>>,
): WorkspaceHandle {
  const handle = workspace(sessionId);
  for (const [path, contents] of Object.entries(files)) handle.writeTextFile(path, contents);
  return handle;
}

/** An executor that answers from a table, and records what it was asked. */
function executor(
  answers: Readonly<Record<string, Partial<WorkspaceRunResult>>>,
  log?: string[],
): (handle: WorkspaceHandle, step: JudgeStepPlan, command: string) => Promise<WorkspaceRunResult> {
  return async (_handle, step, command) => {
    log?.push(`${step.step}:${command}`);
    const answer = answers[step.step] ?? {};
    return {
      command,
      exitCode: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      refusedBy: null,
      refusalReason: null,
      ...answer,
    };
  };
}

/** Every command in the plan exits 0, which is the boring case worth being explicit about. */
const ALL_GREEN: Readonly<Record<string, Partial<WorkspaceRunResult>>> = {};

/** A clock a test can move, so a timeout is a fact rather than a sleep. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let value = 1_000;
  return { now: () => value, advance: (ms: number) => (value += ms) };
}

const REQUEST = { battleId: 'battle-1', sessionId: 'session-a', weights: DEFAULT_BATTLE_WEIGHTS };

describe('the plan is the plan the plan section 22 describes', () => {
  it('runs install, typecheck, lint, test, regression, diff and security, in that order', () => {
    expect(DEFAULT_JUDGE_PLAN.map((step) => step.step)).toEqual([
      'install',
      'typecheck',
      'lint',
      'test',
      'regression',
      'diff',
      'security',
    ]);
    expect(JUDGE_STEPS).toHaveLength(DEFAULT_JUDGE_PLAN.length);
  });

  it('makes install the only required step, and says why in the plan itself', () => {
    // Only install is required. A required typecheck or lint would forfeit a
    // match over a warning the participant can see and cannot fix, and a
    // workspace with no linter configured would lose every battle it entered.
    expect(DEFAULT_JUDGE_PLAN.filter((step) => step.required).map((step) => step.step)).toEqual([
      'install',
    ]);
  });

  it('gives every criterion the rubric names at least one step that feeds it', () => {
    const fed = new Set(DEFAULT_JUDGE_PLAN.map((step) => step.criterion).filter((c) => c !== null));
    for (const criterion of JUDGE_CRITERIA) {
      expect(fed, `no step in the plan feeds "${criterion}"`).toContain(criterion);
    }
  });

  it('leaves a criterion-naming gap visible rather than silently scoring it zero', () => {
    // The shape of the bug: a plan drops the security step, the rubric still
    // names `correctness`, and every participant scores 0 on it for a reason
    // that appears nowhere. This asserts the plan and the rubric agree TODAY,
    // so dropping a step breaks a test rather than a score.
    const withoutSecurity = DEFAULT_JUDGE_PLAN.filter((step) => step.step !== 'security');
    const fed = new Set(withoutSecurity.map((step) => step.criterion));
    expect(fed.has('correctness')).toBe(false);
  });
});

describe('the stream is ordered and attributable', () => {
  it('emits one event per step, numbered in the plan’s order', async () => {
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor(ALL_GREEN),
      clock: fakeClock().now,
    });

    expect(report.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(report.events.map((event) => event.step)).toEqual(
      DEFAULT_JUDGE_PLAN.map((step) => step.step),
    );
  });

  it('names the participant on every single event, because the workspaces are isolated', async () => {
    const a = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor(ALL_GREEN),
    });
    const b = await runJudge({
      ...REQUEST,
      sessionId: 'session-b',
      workspace: workspace('session-b'),
      execute: executor(ALL_GREEN),
    });

    expect(a.events.every((event) => event.sessionId === 'session-a')).toBe(true);
    expect(b.events.every((event) => event.sessionId === 'session-b')).toBe(true);
    expect(a.events).toHaveLength(b.events.length);
  });

  it('carries the observation a replay needs, not a verdict alone', async () => {
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor({ diff: { exitCode: 0, stdout: '12\t3\tsrc/a.ts\n4\t1\tsrc/b.ts\n' } }),
    });

    const diff = report.events.find((event) => event.step === 'diff');
    expect(diff?.observation).toEqual({
      kind: 'diff',
      command: 'git diff --numstat {base}',
      exitCode: 0,
      filesChanged: 2,
      linesAdded: 16,
      linesRemoved: 4,
      paths: ['src/a.ts', 'src/b.ts'],
    });
  });

  it('substitutes the base ref a caller supplies, and leaves it literal when there is none', async () => {
    const log: string[] = [];
    await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      baseRef: 'origin/main',
      execute: executor(ALL_GREEN, log),
    });
    expect(log).toContain('regression:git checkout -q origin/main && npm test --silent');

    const withoutBase: string[] = [];
    await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor(ALL_GREEN, withoutBase),
    });
    expect(withoutBase.some((entry) => entry.includes('{base}'))).toBe(true);
  });
});

describe('the same findings always produce the same numbers', () => {
  /** The same seven events, reported in a different order. */
  function eventsIn(order: readonly number[]): JudgeStepEvent[] {
    const all: JudgeStepEvent[] = [
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 0,
        step: 'install',
        criterion: null,
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 5,
        forfeited: false,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 1,
        step: 'typecheck',
        criterion: 'quality',
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 1,
        forfeited: false,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 2,
        step: 'lint',
        criterion: 'quality',
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 1,
        forfeited: false,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 3,
        step: 'test',
        criterion: 'tests',
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 9,
        forfeited: false,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 4,
        step: 'regression',
        criterion: 'regression',
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 9,
        forfeited: false,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 5,
        step: 'diff',
        criterion: 'efficiency',
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 2,
        forfeited: false,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 6,
        step: 'security',
        criterion: 'correctness',
        outcome: 'passed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 3,
        forfeited: false,
      },
    ];
    return order.map((index) => all[index] as JudgeStepEvent);
  }

  it('does not care what order the steps were reported in', () => {
    const inOrder = criteriaFrom(eventsIn([0, 1, 2, 3, 4, 5, 6]));
    const shuffled = criteriaFrom(eventsIn([4, 0, 6, 2, 5, 1, 3]));

    expect(shuffled).toEqual(inOrder);
    expect(inOrder.every((entry) => entry.score === 1)).toBe(true);
  });

  it('does not care how long a step took, because no duration reaches the arithmetic', () => {
    // The durations here differ by four orders of magnitude. If any of it
    // reached the score, this is the test that would notice.
    const slow = eventsIn([0, 1, 2, 3, 4, 5, 6]);
    const withSlowSteps = slow.map((event) => ({ ...event, durationMs: 90_000 }));
    expect(criteriaFrom(withSlowSteps)).toEqual(criteriaFrom(slow));
  });

  it('produces the same weighted score for the same findings, run twice', async () => {
    const first = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor(ALL_GREEN),
    });
    const second = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor(ALL_GREEN),
    });

    expect(second.criteria).toEqual(first.criteria);
    expect(second.score).toEqual(first.score);
    expect(first.score.total).toBe(1);
  });

  it('scores a criterion 0 when any step that fed it failed, and explains it in the stream', () => {
    const withAFailedLint = eventsIn([0, 1, 2, 3, 4, 5, 6]).map((event) =>
      event.step === 'lint' ? { ...event, outcome: 'failed' as const } : event,
    );
    const criteria = criteriaFrom(withAFailedLint);

    expect(criteria.find((entry) => entry.criterion === 'quality')?.score).toBe(0);
    // The other quality step passed, and the replay can say which one did not.
    expect(withAFailedLint.find((event) => event.step === 'lint')?.outcome).toBe('failed');
  });
});

describe('the score comes from THIS battle’s weights', () => {
  /** A rubric that is not the default, and is published before the match. */
  const SPEED_RUBRIC: BattleWeights = Object.freeze({
    correctness: 0.1,
    tests: 0.1,
    regression: 0.1,
    quality: 0.6,
    efficiency: 0.1,
  });

  it('refuses a weight set that is not a rubric rather than falling back to the defaults', async () => {
    const broken = {
      correctness: 0.5,
      tests: 0.2,
      regression: 0.1,
      quality: 0.1,
    } as unknown as BattleWeights;
    await expect(
      runJudge({
        ...REQUEST,
        weights: broken,
        workspace: workspace('session-a'),
        execute: executor(ALL_GREEN),
      }),
    ).rejects.toThrow(/not a rubric/);
  });

  it('gives two battles with different rubrics two different totals for the SAME findings', async () => {
    // The bug this test exists for: a judge that reached for
    // DEFAULT_BATTLE_WEIGHTS. Both runs would return 1.0 here, so only a
    // non-default rubric on the other side can tell the difference.
    const typed = executor({ typecheck: { exitCode: 1 }, lint: { exitCode: 0 } });
    const underDefault = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: typed,
    });
    const underSpeed = await runJudge({
      ...REQUEST,
      weights: SPEED_RUBRIC,
      workspace: workspace('session-a'),
      execute: typed,
    });

    // typecheck failed, so `quality` is 0 either way. Everything else passed,
    // so the two totals are just each rubric's weight on the four passing
    // criteria: 0.2+0.1+0.1+0.1 under the default, 0.1+0.1+0.1+0.1 under the
    // speed rubric, which puts its 0.6 on the one criterion that failed.
    expect(underDefault.criteria).toEqual(underSpeed.criteria);
    expect(underDefault.score.total).toBe(0.9);
    expect(underSpeed.score.total).toBe(0.4);
    expect(underSpeed.score.total).not.toBe(underDefault.score.total);
  });

  it('decomposes the total into a contribution per criterion, so it can be shown', async () => {
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor(ALL_GREEN),
    });
    expect(report.score.contributions.map((entry) => entry.criterion)).toEqual([...JUDGE_CRITERIA]);
    const summed = report.score.contributions.reduce((total, entry) => total + entry.weighted, 0);
    expect(Number(summed.toFixed(6))).toBe(report.score.total);
  });
});

describe('a match that cannot finish is a match that forfeits', () => {
  it('forfeits when a required step is killed for exceeding its timeout', async () => {
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor({ install: { timedOut: true, exitCode: null } }),
    });

    expect(report.forfeit).toEqual({
      battleId: 'battle-1',
      sessionId: 'session-a',
      step: 'install',
      reason: 'the required step "install" timed out',
    });
    expect(report.events[0]?.outcome).toBe('timed-out');
  });

  it('stops the run at the forfeit rather than executing the rest of the plan', async () => {
    const log: string[] = [];
    await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor({ install: { exitCode: 1 } }, log),
    });

    expect(log).toEqual(['install:npm ci --no-audit --no-fund']);
    const outcomes = (
      await runJudge({
        ...REQUEST,
        workspace: workspace('session-b'),
        execute: executor({ install: { exitCode: 1 } }),
      })
    ).events.map((event) => event.outcome);
    expect(outcomes).toEqual([
      'failed',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });

  it('records the remaining steps as skipped, so a replay shows a forfeit and not a crash', async () => {
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor({ install: { exitCode: 1 } }),
    });

    const skipped = report.events.filter((event) => event.outcome === 'skipped');
    expect(skipped).toHaveLength(6);
    expect(skipped.every((event) => event.forfeited === false)).toBe(true);
    expect(report.events[0]?.forfeited).toBe(true);
  });

  it('STILL produces one score per criterion after a forfeit, so the battle can be scored at all', async () => {
    // `scoreAgainst` refuses a criterion the rubric names but the judge did not
    // score, and it should: a half-judged battle is a refusal, not a zero. A
    // forfeit therefore has to be expressed AS zeros for what did not run, or
    // the winner of a match whose install died would be undecidable.
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor({ install: { exitCode: 1 } }),
    });

    expect(report.criteria.map((entry) => entry.criterion)).toEqual([...JUDGE_CRITERIA]);
    expect(report.score.total).toBe(0);
  });

  it('does not count a skipped step against the work the participant did', () => {
    // A forfeit on install must not turn a passing test suite into a failing
    // one. The distinction is that a step that RAN and failed is evidence, and a
    // step that was skipped because the match was already over is not.
    const events: JudgeStepEvent[] = [
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 0,
        step: 'install',
        criterion: null,
        outcome: 'failed',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 1,
        forfeited: true,
      },
      {
        battleId: 'b',
        sessionId: 's',
        sequence: 1,
        step: 'test',
        criterion: 'tests',
        outcome: 'skipped',
        summary: '',
        observation: { kind: 'none', reason: '' },
        durationMs: 0,
        forfeited: false,
      },
    ];
    // `tests` had no step that ran, so it is 0 — but the step that DID run and
    // pass, had there been one, would count. Proven by the run above.
    expect(criteriaFrom(events).find((entry) => entry.criterion === 'tests')?.score).toBe(0);
  });

  it('forfeits and stops when the whole run exceeds its budget, naming the budget', async () => {
    const clock = fakeClock();
    const log: string[] = [];
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      totalBudgetMs: 1_000,
      clock: () => {
        const value = clock.now();
        clock.advance(600);
        return value;
      },
      execute: executor(ALL_GREEN, log),
    });

    expect(report.forfeit?.step).toBe('total-budget');
    expect(report.forfeit?.reason).toContain('1000ms budget');
    expect(log.length).toBeLessThan(DEFAULT_JUDGE_PLAN.length);
    expect(report.criteria).toHaveLength(JUDGE_CRITERIA.length);
  });

  it('treats a gate refusal as a failed step, not as a silent pass', async () => {
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      execute: executor({
        install: {
          refusedBy: 'destructive-warn',
          refusalReason: 'rm -rf names a path outside the workspace',
        },
      }),
    });

    expect(report.events[0]?.outcome).toBe('refused');
    expect(report.forfeit?.step).toBe('install');
  });

  it('refuses to run a plan step that declares no command, rather than scoring it green', async () => {
    const plan: JudgeStepPlan[] = [
      { step: 'install', criterion: null, required: false, timeoutMs: 1_000 },
      { step: 'test', criterion: 'tests', required: false, timeoutMs: 1_000, command: 'npm test' },
    ];
    const report = await runJudge({
      ...REQUEST,
      workspace: workspace('session-a'),
      plan,
      execute: executor(ALL_GREEN),
    });

    expect(report.events[0]?.outcome).toBe('errored');
    // A mistyped criterion name would throw out of the map lookup; the guard
    // that matters is that an unrunnable step is not a passing one.
    expect(report.criteria.find((entry) => entry.criterion === 'tests')?.score).toBe(1);
  });
});

describe('the security rules are a table', () => {
  const PLAN_WITH = (rules: readonly SecurityRule[]): JudgeStepPlan[] => [
    { step: 'install', criterion: null, required: false, timeoutMs: 1_000, command: 'true' },
    { step: 'security', criterion: 'correctness', required: false, timeoutMs: 1_000, rules },
  ];

  it('finds a shipped rule in a participant’s file and zeroes the criterion', async () => {
    const handle = workspaceWithFiles('session-a', {
      'config.ts': 'const key = "AKIAIOSFODNN7EXAMPLE";\n',
    });
    const report = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan: PLAN_WITH(DEFAULT_SECURITY_RULES),
    });

    const security = report.events.find((event) => event.step === 'security');
    expect(security?.outcome).toBe('failed');
    expect(security?.observation.kind).toBe('security');
    if (security?.observation.kind === 'security') {
      expect(security.observation.findings).toEqual([
        {
          ruleId: 'hardcoded-aws-key',
          severity: 'blocker',
          path: 'config.ts',
          line: 1,
          excerpt: 'const key = "AKIAIOSFODNN7EXAMPLE";',
        },
      ]);
    }
    expect(report.criteria.find((entry) => entry.criterion === 'correctness')?.score).toBe(0);
  });

  it('adds a rule to the table and it takes effect, with no change to the engine', async () => {
    // The DoD, made mechanical. A hardcoded rule set would ignore the extra rule
    // and this test would pass anyway if the engine only read DEFAULT_SECURITY_RULES.
    const handle = workspaceWithFiles('session-a', {
      'app.ts': 'const unsafe = "TODO: wire the real key";\n',
    });

    const withDefault = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan: PLAN_WITH(DEFAULT_SECURITY_RULES),
    });
    expect(withDefault.criteria.find((entry) => entry.criterion === 'correctness')?.score).toBe(1);

    const extended = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan: PLAN_WITH([
        ...DEFAULT_SECURITY_RULES,
        {
          id: 'local-rule',
          description: 'A rule this deployment added.',
          pattern: 'TODO: wire the real key',
          flags: '',
          severity: 'blocker',
        },
      ]),
    });
    const security = extended.events.find((event) => event.step === 'security');
    expect(security?.outcome).toBe('failed');
    if (security?.observation.kind === 'security') {
      expect(security.observation.findings.map((finding) => finding.ruleId)).toEqual([
        'local-rule',
      ]);
    }
  });

  it('records a malformed rule as a rejection instead of throwing mid-match', async () => {
    // A judge that throws halfway through has produced a battle that cannot
    // terminate, which the bead's own consideration calls worse than no battle.
    const handle = workspaceWithFiles('session-a', { 'a.ts': 'export const a = 1;\n' });
    const report = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan: PLAN_WITH([
        ...DEFAULT_SECURITY_RULES,
        {
          id: 'broken',
          description: 'Not a regex.',
          pattern: '([unclosed',
          flags: '',
          severity: 'blocker',
        },
      ]),
    });

    const security = report.events.find((event) => event.step === 'security');
    expect(security?.observation.kind).toBe('security');
    if (security?.observation.kind === 'security') {
      expect(security.observation.rejectedRules.map((rule) => rule.id)).toEqual(['broken']);
    }
  });

  it('separates a blocker from a warning, because they must not cost the same', async () => {
    const handle = workspaceWithFiles('session-a', { 'a.ts': 'eval(payload);\n' });
    const report = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan: PLAN_WITH(DEFAULT_SECURITY_RULES),
    });

    const security = report.events.find((event) => event.step === 'security');
    expect(security?.outcome).toBe('passed');
    if (security?.observation.kind === 'security') {
      expect(security.observation.findings.map((finding) => finding.severity)).toEqual(['warning']);
    }
    expect(report.criteria.find((entry) => entry.criterion === 'correctness')?.score).toBe(1);
  });

  it('scans the files the diff step reported, so the base checkout is not the participant’s finding', async () => {
    const handle = workspaceWithFiles('session-a', {
      'theirs.ts': 'const key = "AKIAIOSFODNN7EXAMPLE";\n',
      'mine.ts': 'export const fine = true;\n',
    });
    const plan: JudgeStepPlan[] = [
      { step: 'install', criterion: null, required: false, timeoutMs: 1_000, command: 'true' },
      {
        step: 'diff',
        criterion: 'efficiency',
        required: false,
        timeoutMs: 1_000,
        command: 'git diff --numstat',
      },
      {
        step: 'security',
        criterion: 'correctness',
        required: false,
        timeoutMs: 1_000,
        rules: DEFAULT_SECURITY_RULES,
      },
    ];
    const report = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan,
      execute: executor({ diff: { exitCode: 0, stdout: '1\t0\tmine.ts\n' } }),
    });

    const security = report.events.find((event) => event.step === 'security');
    if (security?.observation.kind === 'security') {
      expect(security.observation.filesScanned).toBe(1);
      expect(security.observation.findings).toEqual([]);
    }
  });

  it('falls back to the whole workspace when there is no diff, and records how much it read', async () => {
    const handle = workspaceWithFiles('session-a', { 'a.ts': 'export const a = 1;\n' });
    mkdirSync(join(handle.root, 'src'), { recursive: true });
    writeFileSync(join(handle.root, 'src', 'b.ts'), 'export const b = 2;\n');

    const report = await runJudge({
      ...REQUEST,
      workspace: handle,
      plan: PLAN_WITH(DEFAULT_SECURITY_RULES),
    });
    const security = report.events.find((event) => event.step === 'security');
    if (security?.observation.kind === 'security') {
      expect(security.observation.filesScanned).toBe(2);
    }
  });
});

describe('reading the diff', () => {
  it('counts a binary file as changed and adds no lines, which is what git means by `-`', () => {
    expect(parseNumstat('-\t-\tlogo.png\n5\t2\tsrc/a.ts\n')).toEqual({
      filesChanged: 2,
      linesAdded: 5,
      linesRemoved: 2,
      paths: ['logo.png', 'src/a.ts'],
    });
  });

  it('reads an empty diff as no change rather than as a failure', () => {
    expect(parseNumstat('')).toEqual({
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
      paths: [],
    });
  });
});
