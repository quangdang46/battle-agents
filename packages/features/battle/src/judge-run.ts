/**
 * The judge RUN: provision, execute, time out, report — as an ordered stream.
 *
 * `judge.ts` holds the scoring POLICY and says in its own header that this file
 * is the other half: "ba-battle-workspace-judge-jc9 owns the judge RUN —
 * provisioning the workspace, invoking the suite, timing a participant out — and
 * produces one 0..1 result per criterion." That sentence is the division of
 * labour, and this is the side of it. The policy reads results; this produces
 * them, plus the record of what it did to produce them.
 *
 * ## The constraint that shapes every decision here
 *
 * Plan section 22, last line: "Judge output IS the replay seed." The replay bead
 * (ba-battle-replay-yjb) requires the seed to be the ordered, attributable event
 * stream rather than a collapsed score, and requires that stream to be DURABLE
 * so a replay is reconstructable from storage. So:
 *
 *   - Every step emits one `JudgeStepEvent`, carrying which step ran, on whose
 *     workspace, what it found, and its position in the order. The two
 *     workspaces are isolated, so "whose" is not a formality: an unattributed
 *     finding is a finding nobody can contest or appeal.
 *   - `criteriaFrom` is a PURE function of that stream. Same stream, same
 *     criteria, whatever order the executor happened to report in. This is the
 *     determinism hinge, and it is separate from `runJudge` on purpose so it can
 *     be tested without a process being spawned.
 *   - The stream is what `emitJudgeEvents` writes, one event per step, as
 *     `battle.judge.step`. Nothing here decides whether that is durable; that is
 *     a `persistedEvents` declaration in `feature.ts`, and a judge event is NOT
 *     durable merely because it was emitted.
 *
 * ## The weights come from the battle, never from a default
 *
 * The weights are stored per battle and readable while it is still running, and
 * that is the fairness claim. A judge that reached for `DEFAULT_BATTLE_WEIGHTS`
 * would be a bug that looks correct: two battles with different rubrics would be
 * scored by the same numbers and nobody would notice until a participant asked.
 * So `weights` is a required argument with no fallback, and it is validated
 * before a single command runs — a battle judged by a weight set that does not
 * sum to one is a battle whose total nobody can reproduce.
 */

import {
  JUDGE_CRITERIA,
  isBattleWeights,
  type BattleWeights,
  type JudgeCriterion,
} from './domain.js';
import { scoreAgainst, type CriterionResult, type WeightedScore } from './judge.js';
import type { GateContext } from './gates.js';
import type { Runtime } from '@battle-agents/core';
import type { WorkspaceHandle, WorkspaceRunResult } from './workspace.js';

/* ───────────────────────────── the security rule table ───────────────────────────── */

/**
 * A security rule, as DATA.
 *
 * The plan asks for this explicitly: "keep them as DATA (a rules table), not
 * hardcoded branches, so rules can be updated without a deploy of the battle
 * engine." A hardcoded rule is a `if (language === 'ts' && pattern === ...)`
 * in the middle of a function that is deciding somebody's score, and the next
 * rule that arrives is a release.
 *
 * `pattern` is a string rather than a RegExp on purpose. A table that ships
 * pre-compiled patterns cannot be loaded from configuration without `eval`, and
 * a table that can only be written in TypeScript is not a table.
 */
export interface SecurityRule {
  readonly id: string;
  readonly description: string;
  readonly pattern: string;
  readonly flags: string;
  /**
   * `blocker` findings zero the criterion; `warning` findings are recorded and
   * do not. Split because "this is a hardcoded credential" and "this is a
   * substring that sometimes looks like one" must not cost the same, and a table
   * that cannot express the difference forces that choice onto whoever reads it.
   */
  readonly severity: 'blocker' | 'warning';
  /** Extensions this rule applies to, e.g. `['.ts', '.js']`. Empty means every file. */
  readonly extensions?: readonly string[];
}

export interface SecurityFinding {
  readonly ruleId: string;
  readonly severity: 'blocker' | 'warning';
  readonly path: string;
  readonly line: number;
  readonly excerpt: string;
}

/** A rule that would not compile. Recorded rather than thrown: see `scanWithRules`. */
export interface RejectedRule {
  readonly id: string;
  readonly reason: string;
}

/**
 * The shipped rules.
 *
 * A starting table, and a small one. Every entry here is a claim about what is
 * worth a participant's score, and the correct number of claims at M4 is the
 * number somebody has argued for — a list of thirty patterns nobody has tested
 * is a scoring function that mostly measures which regexes a linter happens to
 * share.
 */
export const DEFAULT_SECURITY_RULES: readonly SecurityRule[] = Object.freeze([
  {
    id: 'hardcoded-private-key',
    description: 'A private key committed in source.',
    pattern: '-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----',
    flags: '',
    severity: 'blocker',
  },
  {
    id: 'hardcoded-aws-key',
    description: 'An AWS access key id in source.',
    pattern: '\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b',
    flags: '',
    severity: 'blocker',
  },
  {
    id: 'hardcoded-github-token',
    description: 'A GitHub token in source.',
    pattern: '\\bgh[pousr]_[A-Za-z0-9]{36,}\\b',
    flags: '',
    severity: 'blocker',
  },
  {
    id: 'eval-of-runtime-input',
    description: 'eval or new Function on anything that is not a literal.',
    pattern: '\\beval\\s*\\(|\\bnew\\s+Function\\s*\\(',
    flags: '',
    severity: 'warning',
    extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'],
  },
]);

/**
 * Compile a rule table, keeping the rules that will not compile out of the way.
 *
 * A malformed pattern is a REJECTION and not a crash. A judge that throws
 * halfway through a match has produced a battle that cannot terminate, and
 * `feature.ts` records the rule this file exists to satisfy: a battle that
 * cannot terminate is worse than no battle. The rejection travels in the step's
 * observation so the mismatch is visible rather than silent.
 */
export function compileRules(rules: readonly SecurityRule[]): {
  readonly compiled: readonly { rule: SecurityRule; pattern: RegExp }[];
  readonly rejected: readonly RejectedRule[];
} {
  const compiled: { rule: SecurityRule; pattern: RegExp }[] = [];
  const rejected: RejectedRule[] = [];
  for (const rule of rules) {
    try {
      compiled.push({ rule, pattern: new RegExp(rule.pattern, rule.flags) });
    } catch (error) {
      rejected.push({
        id: rule.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { compiled, rejected };
}

/* ───────────────────────────── the plan ───────────────────────────── */

export const JUDGE_STEPS = [
  'install',
  'typecheck',
  'lint',
  'test',
  'regression',
  'diff',
  'security',
] as const;
export type JudgeStepName = (typeof JUDGE_STEPS)[number];

export type JudgeStepOutcome =
  'passed' | 'failed' | 'timed-out' | 'errored' | 'refused' | 'skipped';

/** What a step found. One shape per step kind, so a replay can render each without guessing. */
export type JudgeObservation =
  | {
      readonly kind: 'command';
      readonly command: string;
      readonly exitCode: number | null;
      readonly output: string;
    }
  | {
      readonly kind: 'diff';
      readonly command: string;
      readonly exitCode: number | null;
      readonly filesChanged: number;
      readonly linesAdded: number;
      readonly linesRemoved: number;
      readonly paths: readonly string[];
    }
  | {
      readonly kind: 'security';
      readonly filesScanned: number;
      readonly findings: readonly SecurityFinding[];
      readonly rejectedRules: readonly RejectedRule[];
    }
  | { readonly kind: 'none'; readonly reason: string };

export interface JudgeStepPlan {
  readonly step: JudgeStepName;
  /** The criterion this step feeds, or `null` for a step that only gates. */
  readonly criterion: JudgeCriterion | null;
  /**
   * Whether failing this step forfeits the match.
   *
   * Only `install` is required by default, and the reason is in
   * `DEFAULT_JUDGE_PLAN`: a workspace whose dependencies never installed cannot
   * run a suite, and scoring a participant on a suite that never ran is how a
   * broken workspace produces a winner.
   */
  readonly required: boolean;
  readonly timeoutMs: number;
  readonly command?: string;
  readonly rules?: readonly SecurityRule[];
}

/** What a run looks like when nothing overrides it. */
export const DEFAULT_JUDGE_PLAN: readonly JudgeStepPlan[] = Object.freeze([
  {
    step: 'install',
    criterion: null,
    required: true,
    timeoutMs: 15 * 60_000,
    command: 'npm ci --no-audit --no-fund',
  },
  {
    step: 'typecheck',
    criterion: 'quality',
    required: false,
    timeoutMs: 5 * 60_000,
    command: 'npm run -s typecheck',
  },
  {
    step: 'lint',
    criterion: 'quality',
    required: false,
    timeoutMs: 5 * 60_000,
    command: 'npm run -s lint',
  },
  {
    step: 'test',
    criterion: 'tests',
    required: false,
    timeoutMs: 15 * 60_000,
    command: 'npm test --silent',
  },
  {
    step: 'regression',
    criterion: 'regression',
    required: false,
    timeoutMs: 15 * 60_000,
    command: 'git checkout -q {base} && npm test --silent',
  },
  {
    step: 'diff',
    criterion: 'efficiency',
    required: false,
    timeoutMs: 60_000,
    command: 'git diff --numstat {base}',
  },
  { step: 'security', criterion: 'correctness', required: false, timeoutMs: 5 * 60_000 },
] satisfies JudgeStepPlan[]);

/* ───────────────────────────── the stream ───────────────────────────── */

export interface JudgeStepEvent {
  readonly battleId: string;
  /** Which participant's workspace. The isolation is what makes this necessary. */
  readonly sessionId: string;
  /** 0-based position in the run. Assigned by the plan, not by completion time. */
  readonly sequence: number;
  readonly step: JudgeStepName;
  readonly criterion: JudgeCriterion | null;
  readonly outcome: JudgeStepOutcome;
  readonly summary: string;
  readonly observation: JudgeObservation;
  readonly durationMs: number;
  /** True when this step's failure ended the run. */
  readonly forfeited: boolean;
}

export interface JudgeForfeit {
  readonly battleId: string;
  readonly sessionId: string;
  readonly step: JudgeStepName | 'total-budget';
  readonly reason: string;
}

export interface JudgeReport {
  readonly battleId: string;
  readonly sessionId: string;
  /** Ordered by `sequence`. */
  readonly events: readonly JudgeStepEvent[];
  readonly criteria: readonly CriterionResult[];
  /** Scored with THIS battle's weights, never a default. */
  readonly score: WeightedScore;
  readonly forfeit: JudgeForfeit | null;
}

export interface JudgeRunRequest {
  readonly battleId: string;
  readonly sessionId: string;
  readonly workspace: WorkspaceHandle;
  /**
   * The battle's own rubric. Required, validated, and never defaulted: see the
   * header for why a fallback here is a bug that looks correct.
   */
  readonly weights: BattleWeights;
  readonly plan?: readonly JudgeStepPlan[];
  /**
   * The whole run's budget.
   *
   * Separate from the per-step timeouts because they answer different
   * questions. A step timeout says "this command is too slow"; the run budget
   * says "this match is over". Without the second, a plan of seven steps at
   * fifteen minutes each is a hundred and seventy-five minutes of one battle
   * holding a connection, which is a denial of service with a scoring UI.
   */
  readonly totalBudgetMs?: number;
  /** Substituted for `{base}` in a step's command. */
  readonly baseRef?: string;
  /** Injected so a unit test does not need a git repository. */
  readonly clock?: () => number;
  /** Injected so a unit test decides what each command does. */
  readonly execute?: (
    workspace: WorkspaceHandle,
    step: JudgeStepPlan,
    command: string,
  ) => Promise<WorkspaceRunResult>;
  /** The facts the gates need; the run passes them down to the workspace runner. */
  readonly gateContext?: GateContext;
}

const DEFAULT_TOTAL_BUDGET_MS = 60 * 60_000;
const MAX_EXCERPT = 200;

/** How much command output a DURABLE judge event carries. */
const MAX_EVENT_OUTPUT = 2_000;

/* ───────────────────────────── the durable stream ───────────────────────────── */

/**
 * The two event types the run emits.
 *
 * Two, not one with optional fields, and the plan asks for it that way: "prefer
 * adding a new event type to the union over overloading an existing one with
 * optional fields; overloading makes every consumer's switch ambiguous." A
 * `battle.judge.step` and a `battle.judge.result` are different facts with
 * different shapes — one finding, one verdict — and a replay consumer that has
 * to ask "is this a step or a result" is a consumer with a branch that will be
 * wrong.
 *
 * They are `GameEvent` types, not `AgentEvent` types: this is the platform
 * reporting on a match, not a harness reporting on a session. Nothing in
 * `packages/protocol` changes, which is why the event vocabulary stays frozen.
 */
export const BATTLE_JUDGE_STEP = 'battle.judge.step';
export const BATTLE_JUDGE_RESULT = 'battle.judge.result';

/**
 * The types that must be in `battleFeature.persistedEvents` for a replay to
 * work.
 *
 * Declared here, next to the emitters that produce them, and CONSUMED by
 * `feature.ts`. The alternative is a string typed in two places, and a string
 * typed in two places is how a feature emits a durable-looking event that a
 * restart erases — the exact failure this bead's DoD is about.
 */
export const JUDGE_PERSISTED_EVENT_TYPES: readonly string[] = Object.freeze([
  BATTLE_JUDGE_STEP,
  BATTLE_JUDGE_RESULT,
]);

/** What one step's event carries. Command output is trimmed; the report keeps all of it. */
function stepPayload(event: JudgeStepEvent): Record<string, unknown> {
  const observation =
    event.observation.kind === 'command'
      ? { ...event.observation, output: event.observation.output.slice(-MAX_EVENT_OUTPUT) }
      : event.observation;
  return {
    battleId: event.battleId,
    sessionId: event.sessionId,
    sequence: event.sequence,
    step: event.step,
    criterion: event.criterion,
    outcome: event.outcome,
    summary: event.summary,
    durationMs: event.durationMs,
    forfeited: event.forfeited,
    observation,
  };
}

/**
 * Write the report to the runtime, one event per step plus one per verdict.
 *
 * Takes a `Runtime` rather than a `RuntimeContext` because a `Runtime` is what a
 * caller outside the feature actually holds, and `runtime.emit` is the same
 * method the feature's own handlers call — so the persistence filter, the
 * ordering, and the durable store are all the ones the rest of the system uses.
 * A caller that has a `RuntimeContext` passes `context.runtime` and
 * `context.now`.
 *
 * The runtime persists -> handles -> publishes, in that order, so an event
 * emitted here is in `event_log` before any replay consumer sees it on the bus.
 * Whether it is in `event_log` AT ALL is decided by the persistence filter, and
 * a judge event is NOT durable merely because it was emitted: `feature.ts`
 * declares these two types in `persistedEvents`, and
 * `tests/integration/battle-judge-persistence.test.ts` exists because that
 * declaration is the only thing standing between a judge run and a replay that
 * renders nothing after a restart.
 *
 * The forfeit rides on the step event that caused it rather than on its own
 * type, so "this step ended the match" is readable from the one row that says
 * the step failed.
 */
export async function emitJudgeEvents(
  runtime: Runtime,
  report: JudgeReport,
  now: () => string = (): string => new Date().toISOString(),
): Promise<void> {
  for (const stepEvent of report.events) {
    await runtime.emit({
      type: BATTLE_JUDGE_STEP,
      occurredAt: now(),
      actorId: JUDGE_ACTOR_ID,
      payload: stepPayload(stepEvent),
    });
  }
  await runtime.emit({
    type: BATTLE_JUDGE_RESULT,
    occurredAt: now(),
    actorId: JUDGE_ACTOR_ID,
    payload: {
      battleId: report.battleId,
      sessionId: report.sessionId,
      criteria: report.criteria,
      contributions: report.score.contributions,
      total: report.score.total,
      forfeit: report.forfeit,
      steps: report.events.length,
    },
  });
}

/** The actor the judge speaks as. A participant id would let it forge a participant's own event. */
const JUDGE_ACTOR_ID = 'judge';

/* ───────────────────────────── running ───────────────────────────── */

/**
 * Run the plan against one participant's workspace.
 *
 * Sequential and in the declared order, deliberately. The order IS the stream,
 * and a replay that shows "tests passed" before "dependencies installed" is a
 * replay nobody believes. Running steps concurrently would buy wall-clock time
 * at the cost of the one property the replay depends on.
 *
 * The run STOPS at the first required step that does not pass. It does not throw
 * and it does not continue: the remaining steps are recorded `skipped` so the
 * stream says the match ended rather than looking like a crash, and a forfeit
 * record names the step.
 */
export async function runJudge(request: JudgeRunRequest): Promise<JudgeReport> {
  if (!isBattleWeights(request.weights)) {
    throw new Error(
      `battle ${request.battleId} was handed a weight set that is not a rubric; ` +
        'a judge that falls back to the defaults is a judge that hides a broken battle',
    );
  }

  const plan = request.plan ?? DEFAULT_JUDGE_PLAN;
  const clock = request.clock ?? (() => Date.now());
  const totalBudgetMs = request.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
  const startedAt = clock();

  const events: JudgeStepEvent[] = [];
  let forfeit: JudgeForfeit | null = null;

  for (const [index, step] of plan.entries()) {
    if (forfeit !== null) {
      events.push(skippedEvent(request, index, step));
      continue;
    }
    if (clock() - startedAt >= totalBudgetMs) {
      forfeit = {
        battleId: request.battleId,
        sessionId: request.sessionId,
        step: 'total-budget',
        reason: `the run exceeded its ${totalBudgetMs}ms budget before ${step.step} could start`,
      };
      events.push(budgetEvent(request, index, step, forfeit.reason));
      continue;
    }

    const event = await runStep(request, index, step, clock, events);
    if (step.required && event.outcome !== 'passed') {
      forfeit = {
        battleId: request.battleId,
        sessionId: request.sessionId,
        step: step.step,
        reason: `the required step "${step.step}" ${describeOutcome(event.outcome)}`,
      };
      // Marked on the step that caused it, not on a separate event. A replay
      // reads one row per step and has to be able to say "this is the one that
      // ended the match" without correlating against a report object it does
      // not have.
      events.push({ ...event, forfeited: true });
      continue;
    }
    events.push(event);
  }

  const criteria = criteriaFrom(events);
  return {
    battleId: request.battleId,
    sessionId: request.sessionId,
    events,
    // Derived once and used twice. Two calls are the same pure function on the
    // same input today, and the first thing a future edit to `criteriaFrom`
    // would break is this pairing — the score computed from a different set than
    // the one the report publishes.
    criteria,
    score: scoreAgainst(criteria, request.weights),
    forfeit,
  };
}

function describeOutcome(outcome: JudgeStepOutcome): string {
  switch (outcome) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'timed-out':
      return 'timed out';
    case 'errored':
      return 'could not be run';
    case 'refused':
      return 'was refused by a workspace gate';
    case 'skipped':
      return 'was skipped';
  }
}

function baseEvent(
  request: JudgeRunRequest,
  index: number,
  step: JudgeStepPlan,
): Omit<JudgeStepEvent, 'outcome' | 'summary' | 'observation' | 'durationMs' | 'forfeited'> {
  return {
    battleId: request.battleId,
    sessionId: request.sessionId,
    sequence: index,
    step: step.step,
    criterion: step.criterion,
  };
}

function skippedEvent(
  request: JudgeRunRequest,
  index: number,
  step: JudgeStepPlan,
): JudgeStepEvent {
  return {
    ...baseEvent(request, index, step),
    outcome: 'skipped',
    summary: 'not run: the match had already been forfeited',
    observation: { kind: 'none', reason: 'forfeited earlier in this run' },
    durationMs: 0,
    forfeited: false,
  };
}

function budgetEvent(
  request: JudgeRunRequest,
  index: number,
  step: JudgeStepPlan,
  reason: string,
): JudgeStepEvent {
  return {
    ...baseEvent(request, index, step),
    outcome: 'skipped',
    summary: reason,
    observation: { kind: 'none', reason },
    durationMs: 0,
    forfeited: true,
  };
}

function expand(command: string, baseRef: string | undefined): string {
  return baseRef === undefined ? command : command.replaceAll('{base}', baseRef);
}

async function runStep(
  request: JudgeRunRequest,
  index: number,
  step: JudgeStepPlan,
  clock: () => number,
  eventsSoFar: readonly JudgeStepEvent[],
): Promise<JudgeStepEvent> {
  const base = baseEvent(request, index, step);

  if (step.step === 'security') {
    return scanForSecrets(request, step, clock, base, eventsSoFar);
  }

  if (step.command === undefined) {
    return {
      ...base,
      outcome: 'errored',
      summary: `the plan declares "${step.step}" with no command to run`,
      observation: { kind: 'none', reason: 'no command declared' },
      durationMs: 0,
      forfeited: false,
    };
  }

  const command = expand(step.command, request.baseRef);
  const startedAt = clock();
  const run =
    request.execute ??
    ((workspace, plan, cmd) =>
      workspace.run(cmd, {
        timeoutMs: plan.timeoutMs,
        ...(request.gateContext === undefined ? {} : { gateContext: request.gateContext }),
      }));
  const result = await run(request.workspace, step, command);
  const durationMs = Math.max(0, clock() - startedAt);

  if (result.refusedBy !== null) {
    return {
      ...base,
      outcome: 'refused',
      summary: `the ${result.refusedBy} gate refused this command: ${result.refusalReason ?? 'no reason given'}`,
      observation: { kind: 'command', command, exitCode: null, output: '' },
      durationMs,
      forfeited: false,
    };
  }
  if (result.timedOut) {
    return {
      ...base,
      outcome: 'timed-out',
      summary: `"${step.step}" exceeded its ${step.timeoutMs}ms limit and was killed`,
      observation: { kind: 'command', command, exitCode: result.exitCode, output: result.stderr },
      durationMs,
      forfeited: false,
    };
  }

  const passed = result.exitCode === 0;
  if (step.step === 'diff') {
    const stats = passed
      ? parseNumstat(result.stdout)
      : { filesChanged: 0, linesAdded: 0, linesRemoved: 0, paths: [] };
    return {
      ...base,
      outcome: passed ? 'passed' : 'failed',
      summary: passed
        ? `${stats.filesChanged} file(s) changed, +${stats.linesAdded}/-${stats.linesRemoved}`
        : `"${step.step}" could not read the base ref (exit ${result.exitCode ?? 'none'})`,
      observation: {
        kind: 'diff',
        command,
        exitCode: result.exitCode,
        filesChanged: stats.filesChanged,
        linesAdded: stats.linesAdded,
        linesRemoved: stats.linesRemoved,
        paths: stats.paths,
      },
      durationMs,
      forfeited: false,
    };
  }

  return {
    ...base,
    outcome: passed ? 'passed' : 'failed',
    summary: passed
      ? `"${step.step}" exited 0`
      : `"${step.step}" exited ${result.exitCode ?? 'with no exit code'}`,
    observation: {
      kind: 'command',
      command,
      exitCode: result.exitCode,
      output: tail(result.stdout, result.stderr),
    },
    durationMs,
    forfeited: false,
  };
}

function tail(stdout: string, stderr: string): string {
  const combined = `${stdout}${stdout !== '' && stderr !== '' ? '\n' : ''}${stderr}`;
  return combined.length <= MAX_EXCERPT ? combined : `…${combined.slice(-MAX_EXCERPT)}`;
}

/**
 * `git diff --numstat` output, as numbers.
 *
 * Parsed rather than reported raw because the diff step exists to produce three
 * counts, and a replay that has to parse them again is doing this work twice.
 * A binary file's `-`/`-` line counts as changed and adds nothing, which is what
 * git means by it.
 */
export function parseNumstat(output: string): {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  paths: readonly string[];
} {
  const paths: string[] = [];
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of output.split('\n')) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (match === null) continue;
    paths.push((match[3] as string).trim());
    linesAdded += match[1] === '-' ? 0 : Number(match[1]);
    linesRemoved += match[2] === '-' ? 0 : Number(match[2]);
  }
  return { filesChanged: paths.length, linesAdded, linesRemoved, paths };
}

/* ───────────────────────────── the security step ───────────────────────────── */

function scanForSecrets(
  request: JudgeRunRequest,
  step: JudgeStepPlan,
  clock: () => number,
  base: Omit<JudgeStepEvent, 'outcome' | 'summary' | 'observation' | 'durationMs' | 'forfeited'>,
  eventsSoFar: readonly JudgeStepEvent[],
): JudgeStepEvent {
  const startedAt = clock();
  const { compiled, rejected } = compileRules(step.rules ?? DEFAULT_SECURITY_RULES);

  // The files to scan come from the diff step when it ran, because a scan of
  // the whole tree reports the base checkout's own findings as the
  // participant's. Falling back to everything is the honest answer when there
  // is no diff to narrow it, and the event records how many files were read so
  // a reader can tell the two apart.
  const diffEvent = eventsSoFar.find((event) => event.step === 'diff');
  const fromDiff =
    diffEvent?.observation.kind === 'diff'
      ? diffEvent.observation.paths.map((path) => path.trim())
      : [];
  const candidates = fromDiff.length > 0 ? fromDiff : [...request.workspace.files()];

  const findings: SecurityFinding[] = [];
  let filesScanned = 0;
  for (const path of candidates) {
    let contents: string;
    try {
      contents = request.workspace.readTextFile(path);
    } catch {
      // A path git reported that the handle refuses is a containment decision,
      // not a scan failure, and it is left to `resolveInside` to refuse. Here
      // it just means there is nothing to read.
      continue;
    }
    filesScanned += 1;
    findings.push(...applyRules(compiled, path, contents));
  }
  findings.sort((left, right) =>
    left.path === right.path ? left.line - right.line : left.path.localeCompare(right.path),
  );

  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  return {
    ...base,
    outcome: blockers.length === 0 ? 'passed' : 'failed',
    summary:
      blockers.length === 0
        ? `no blocking finding in ${filesScanned} changed file(s); ${findings.length} warning(s)`
        : `${blockers.length} blocking finding(s) in ${filesScanned} changed file(s)`,
    observation: { kind: 'security', filesScanned, findings, rejectedRules: rejected },
    durationMs: Math.max(0, clock() - startedAt),
    forfeited: false,
  };
}

function applyRules(
  compiled: readonly { rule: SecurityRule; pattern: RegExp }[],
  path: string,
  contents: string,
): readonly SecurityFinding[] {
  const applicable = compiled.filter(
    ({ rule }) =>
      rule.extensions === undefined || rule.extensions.some((ext) => path.endsWith(ext)),
  );
  if (applicable.length === 0) return [];
  const found: SecurityFinding[] = [];
  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] as string;
    for (const { rule, pattern } of applicable) {
      if (!pattern.test(text)) continue;
      found.push({
        ruleId: rule.id,
        severity: rule.severity,
        path,
        line: index + 1,
        excerpt: text.trim().slice(0, MAX_EXCERPT),
      });
    }
  }
  return found;
}

/* ───────────────────────────── the pure half ───────────────────────────── */

/**
 * The criteria, as a pure function of the stream.
 *
 * THE determinism property, and it is worth stating exactly: this function reads
 * only `events`. It does not read a clock, a workspace, a plan or an order of
 * arrival, so two runs of the same match that recorded the same findings produce
 * the same numbers no matter which executor reported first. A judge that
 * accumulated a running total as steps completed would be decided by scheduling,
 * which is invisible in the result and indistinguishable from rigging to anybody
 * watching.
 *
 * A criterion scores 1 when at least one step fed it and every step that fed it
 * passed; 0 otherwise — including when nothing fed it at all. All-or-nothing
 * per criterion is chosen over a mean because the per-step events are in the
 * stream: a mean invites "why 0.6", and a per-step event answers it exactly.
 */
export function criteriaFrom(events: readonly JudgeStepEvent[]): readonly CriterionResult[] {
  const byCriterion = new Map<JudgeCriterion, { ran: number; passed: number }>();
  for (const criterion of JUDGE_CRITERIA) {
    byCriterion.set(criterion, { ran: 0, passed: 0 });
  }
  for (const event of events) {
    if (event.criterion === null) continue;
    const tally = byCriterion.get(event.criterion);
    if (tally === undefined) continue;
    // A step that was skipped because the match was already forfeited is not
    // evidence about the work, so it does not count as a failure. A step that
    // ran and failed does.
    if (event.outcome === 'skipped') continue;
    tally.ran += 1;
    if (event.outcome === 'passed') tally.passed += 1;
  }

  return JUDGE_CRITERIA.map((criterion) => {
    const tally = byCriterion.get(criterion) as { ran: number; passed: number };
    return {
      criterion,
      score: tally.ran > 0 && tally.passed === tally.ran ? 1 : 0,
    };
  });
}
