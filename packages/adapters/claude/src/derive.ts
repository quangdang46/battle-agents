import { FILE_READ_TOOLS, FILE_WRITE_TOOLS } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * What a tool call means, in the events the protocol describes for it.
 *
 * `tool.started` says an agent used a tool. It does not say the agent read a
 * file, changed one, or ran a command — and those are the facts the game shows.
 * The protocol has a type for each of them, and the classification that decides
 * which type a tool call earns already ships in `tool-map.ts` as
 * `FILE_READ_TOOLS` and `FILE_WRITE_TOOLS`. Before this file those two sets had
 * no consumer anywhere in the tree, which is the shape of a rule somebody wrote
 * down and nobody wired up.
 *
 * Two functions, not one, because the two halves of a tool call know different
 * things. The call announces what the agent is about to touch; the result says
 * what came back. Deriving the file events from the call is right for both
 * planes, but only the hook plane ever sees the result, and only the hook plane
 * can therefore say whether a command succeeded or whether tests passed. The
 * split is not tidiness — it is the honest limit of what each plane knows.
 *
 * The test heuristic below is deliberately reluctant. `test.passed` is worth 100
 * experience in `features/progression`, so a false one is not a cosmetic bug: it
 * pays an agent for work that never happened, and it builds the character as a
 * tester. Every rule in here therefore requires affirmative evidence, and the
 * common case where the harness reports nothing conclusive reports nothing.
 */

export interface EventBase {
  readonly sessionId: string;
  /** ISO 8601 with an offset. The protocol rejects a local timestamp. */
  readonly at: string;
}

/** The canonical tool name a call derives from. Matches the tool.* events. */
const BASH = 'Bash';

/** A path in a normalized tool input, under the key every file tool uses. */
const PATH_KEY = 'file_path';

/**
 * Commands that are themselves a test runner.
 *
 * Matched on the first token only, so `vitest` is caught and `npx vitest` is
 * not — see the note on SUBCOMMAND_RUNNERS for why that trade was taken.
 */
const TEST_RUNNER_EXECUTABLES: ReadonlySet<string> = new Set([
  'jest',
  'vitest',
  'pytest',
  'rspec',
  'phpunit',
  'mocha',
  'cucumber',
  'tox',
]);

/**
 * Tools whose `test` SUB-COMMAND runs tests: `go test`, `cargo test`,
 * `gradlew test`, `pnpm test`.
 *
 * The sub-command list is exactly `test`. It does not include `run`, because
 * `npm run dev` is a dev server and calling that a test suite is the specific
 * false positive this heuristic cannot afford — see `testOutcome`.
 */
const SUBCOMMAND_RUNNERS: ReadonlySet<string> = new Set([
  'go',
  'cargo',
  'dotnet',
  'gradle',
  'gradlew',
  'mvn',
  'swift',
  'npm',
  'pnpm',
  'yarn',
  'bun',
]);

/** The only sub-command under a runner that means tests. */
const TEST_SUBCOMMANDS: ReadonlySet<string> = new Set(['test', 't']);

/** Interpreters that reach a runner through `-m`. */
const PYTHON_EXECUTABLES: ReadonlySet<string> = new Set(['python', 'python3']);

/**
 * Launchers that run a named program, so the program is the NEXT token.
 *
 * `npx vitest run` is a test run and `npx serve` is not, so the token after the
 * launcher has to be a runner this file already knows by name.
 */
const PROGRAM_LAUNCHERS: ReadonlySet<string> = new Set(['npx', 'pnpx', 'bunx', 'bun']);

/**
 * Claude's marker for a tool call it refused to make.
 *
 * A denied or blocked command never ran, so it is neither a passed test suite
 * nor a failed one. Emitting `test.failed` for one would report a red test run
 * for a command that produced no test output at all.
 */
const REFUSAL_MARKER = '<tool_use_error>';

/**
 * Where this harness puts a command's exit code.
 *
 * Two places, and only two, both anchored rather than scanned: some results
 * begin `Exit code 1`, others — the ones the command wrapper timed — end
 * `Command exited with code 1`. Across the 24,000 `tool_result` blocks in the
 * transcripts on the machine this was written against, every non-zero exit
 * carried `is_error: true` and none of them carried a zero.
 *
 * Deliberately not a general output parser. A test runner that prints the
 * phrase "exit code 1" in its own output while passing is a false failure, and
 * no heuristic over free text is worth that; anchoring at the very end of the
 * string is what keeps this a read of the wrapper's trailer rather than a
 * guess about the text in between.
 */
const EXIT_CODE_HEAD = /^Exit code (\d+)/;
const EXIT_CODE_TAIL = /Command exited with code (\d+)\s*$/;

/**
 * The events a tool call announces, from the call alone.
 *
 * Both planes can produce these: the hook plane on PreToolUse, the tail on the
 * transcript's tool_use line. A file action is knowable at the moment it is
 * announced, because the path is in the input and the intent is the event.
 */
export function deriveCallEvents(
  tool: string,
  input: Record<string, unknown>,
  base: EventBase,
): readonly AgentEvent[] {
  const path = pathOf(input);
  if (path === undefined) {
    // Glob and Grep are in FILE_READ_TOOLS but name a PATTERN, not a file, and
    // `file.read` has one required field that has to be a path. Reporting a
    // search as a file read is a lie the activity feed would render as one.
    return [];
  }
  if (FILE_WRITE_TOOLS.has(tool)) {
    return [{ ...base, type: 'file.write', path }];
  }
  if (FILE_READ_TOOLS.has(tool)) {
    return [{ ...base, type: 'file.read', path }];
  }
  return [];
}

/**
 * What a command's completion adds: its exit code, and — for a command that is
 * recognisably a test runner — whether the tests passed.
 *
 * Only the hook plane can call this. A transcript writes the tool_use line and
 * the tool_result as separate lines, and pairing them needs state held across
 * both; the hooks are handed the two halves of the same fact in one payload. A
 * session whose hooks were down therefore reports which files it touched and
 * not whether its tests passed, which is the truth rather than a guess.
 */
export function deriveOutcomeEvents(
  tool: string,
  input: Record<string, unknown>,
  result: unknown,
  base: EventBase,
): readonly AgentEvent[] {
  if (tool !== BASH) {
    return [];
  }
  const command = stringField(input, 'command');
  const argv0 = command === undefined ? undefined : argv0Of(command);
  if (command === undefined || argv0 === undefined) {
    return [];
  }
  const events: AgentEvent[] = [{ ...base, type: 'command.run', argv0, ...withExitCode(result) }];
  const outcome = testOutcome(command, result);
  if (outcome !== undefined) {
    events.push({ ...base, ...outcome });
  }
  return events;
}

function pathOf(input: Record<string, unknown>): string | undefined {
  return stringField(input, PATH_KEY);
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * The exit code, from wherever this harness chose to put it.
 *
 * Spread into the event rather than assigned, because the key is optional: a
 * harness that reports no exit code produces a `command.run` without one,
 * which the schema allows, and a `command.run` with a made-up 0 would be a
 * success claim nobody made.
 */
function withExitCode(result: unknown): { exitCode?: number } {
  const exitCode = exitCodeOf(result);
  return exitCode === undefined ? {} : { exitCode };
}

function exitCodeOf(result: unknown): number | undefined {
  const record = recordOf(result);
  for (const key of ['exit_code', 'exitCode', 'code']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
  }
  const nested = recordOf(record.error);
  for (const key of ['exit_code', 'exitCode', 'code']) {
    const value = nested[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
  }
  const content = record.content;
  if (typeof content === 'string') {
    const match = EXIT_CODE_HEAD.exec(content) ?? EXIT_CODE_TAIL.exec(content);
    if (match?.[1] !== undefined) {
      return Number.parseInt(match[1], 10);
    }
  }
  return undefined;
}

/** The two outcomes a test run can have, as the protocol spells them. */
type TestOutcome = { readonly type: 'test.passed' } | { readonly type: 'test.failed' };

/**
 * Whether a command is recognisably a test run, from its argv alone.
 *
 * WHAT THIS DOES NOT CATCH, because a heuristic that hides its misses is how an
 * adapter ends up quietly reporting no test activity for a whole project:
 * a project script (`pnpm check`, `make test-all`, `./scripts/verify.sh`),
 * a runner behind a wrapper or a Makefile, a task-runner alias, a test invoked
 * through a tool that is not Bash, and anything run on another machine. Those
 * sessions report their file activity and no test outcome, which is the correct
 * thing to report about work this adapter cannot see.
 */
export function looksLikeTestCommand(command: string): boolean {
  const argv = commandTokens(command);
  const [head, second, third] = argv;
  if (head === undefined) {
    return false;
  }
  if (TEST_RUNNER_EXECUTABLES.has(head)) {
    return true;
  }
  if (PYTHON_EXECUTABLES.has(head)) {
    return second === '-m' && third !== undefined && TEST_RUNNER_EXECUTABLES.has(third);
  }
  // `bun` is in both sets, so the order these two are checked in decides
  // whether `bun test` is reachable at all: a launcher read that returns early
  // on anything but a runner name never gets to the sub-command, and `bun test`
  // is the one spelling in this file that a launcher-first check silently
  // loses. Both spellings are therefore accepted here, and a launcher that
  // runs neither a known runner nor `test` still reports nothing.
  if (PROGRAM_LAUNCHERS.has(head)) {
    return (
      second !== undefined && (TEST_RUNNER_EXECUTABLES.has(second) || TEST_SUBCOMMANDS.has(second))
    );
  }
  if (SUBCOMMAND_RUNNERS.has(head)) {
    return second !== undefined && TEST_SUBCOMMANDS.has(second);
  }
  return false;
}

/**
 * `test.passed` or `test.failed`, or nothing at all.
 *
 * Nothing is the common answer, and it is the honest one. `test.passed` pays
 * 100 experience, so it is emitted only where the harness actually reported a
 * completed, unremarkable run; every other shape — a blocked command, a result
 * the adapter could not read, a command it does not recognise as tests —
 * produces no outcome rather than a hopeful one.
 */
function testOutcome(command: string, result: unknown): TestOutcome | undefined {
  if (!looksLikeTestCommand(command)) {
    return undefined;
  }
  if (wasRefused(result)) {
    return undefined;
  }
  const exitCode = exitCodeOf(result);
  if (exitCode !== undefined) {
    return exitCode === 0 ? { type: 'test.passed' } : { type: 'test.failed' };
  }
  // No exit code anywhere, so the harness's own flag is the only evidence left.
  // It has to be PRESENT and false to count: every Bash result in the
  // transcripts this was written against carries `is_error`, so requiring the
  // field rather than merely its absence costs nothing on a real payload and
  // removes the failure this branch is most likely to cause — a future harness,
  // or a truncated result, that reports nothing at all and would be scored as a
  // green suite. `test.passed` pays 100 experience, so a payload that says
  // nothing earns no claim.
  const verdict = harnessVerdict(result);
  if (verdict === 'ok') {
    return { type: 'test.passed' };
  }
  if (verdict === 'failed') {
    return { type: 'test.failed' };
  }
  return undefined;
}

/** Whether the harness refused to run the command at all. */
function wasRefused(result: unknown): boolean {
  const record = recordOf(result);
  if (typeof record.content === 'string' && record.content.includes(REFUSAL_MARKER)) {
    return true;
  }
  const error = record.error;
  return typeof error === 'string' && error.includes(REFUSAL_MARKER);
}

/**
 * What the harness said about the run, or nothing if it said nothing.
 *
 * Three-valued on purpose. A two-valued read of "is it an error" cannot tell a
 * harness that reported success from a harness that reported nothing, and those
 * two are the difference between a green suite and a guess.
 */
function harnessVerdict(result: unknown): 'ok' | 'failed' | undefined {
  const record = recordOf(result);
  for (const key of ['is_error', 'isError']) {
    if (record[key] === true) {
      return 'failed';
    }
    if (record[key] === false) {
      return 'ok';
    }
  }
  return undefined;
}

/**
 * The words of a shell command, without the parts that are not argv.
 *
 * `FOO=bar cargo test` has a first token that names no program, and reporting
 * `argv0: FOO=bar` is a fact about a shell feature rather than about a
 * command. Assignments and a leading `env`/`sudo` are skipped so the token
 * that survives is the one a reader would call the program.
 */

const COMMAND_PREFIXES: ReadonlySet<string> = new Set(['env', 'sudo']);
function commandTokens(command: string): readonly string[] {
  const raw = command.split(/\s+/).filter((token) => token !== '');
  let index = 0;
  // One loop, not one loop per prefix. `env NODE_ENV=test vitest` puts the two
  // kinds in the other order, and a reader that finished with assignments before
  // it started on `env` would stop one token early and name `NODE_ENV=test` the
  // program that ran.
  while (index < raw.length && isShellPrefix(raw[index] as string)) {
    index += 1;
  }
  return raw.slice(index);
}

const SHELL_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function isShellPrefix(token: string): boolean {
  return SHELL_ASSIGNMENT.test(token) || COMMAND_PREFIXES.has(token);
}

/**
 * The program a command runs, for `command.run.argv0`.
 *
 * A leading path is kept whole — `/usr/bin/git` is what ran, and trimming it to
 * `git` would be a guess about how the shell resolved it.
 */
export function argv0Of(command: string): string | undefined {
  return commandTokens(command)[0];
}
