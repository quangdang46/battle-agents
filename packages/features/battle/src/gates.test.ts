import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  commitLintVerdict,
  DESTRUCTIVE_PATTERNS,
  destructiveVerdict,
  evaluateCommand,
  extractCommitMessage,
  GATE_NAMES,
  isCommitOnMain,
  mainCommitVerdict,
  testGateVerdict,
  validateCommitMessage,
  VALID_COMMIT_TYPES,
  type GateContext,
} from './gates.js';

/**
 * The four gates ported from `agent-dashboard` (MIT, `b3c04cf7f0aa`).
 *
 * Plan section 28.1 item 4: port `commit-lint`, `test-gate`,
 * `destructive-warn` and `block-main-commit` into the battle's workspace
 * guards. The DoD for this file is "gate tests proving destructive-warn blocks
 * and commit-lint passes" — and that is only half of it. A test file that proves
 * one gate blocks and another passes while saying nothing about the two
 * remaining gates is a file that has counted its own assertions, and counting
 * assertions is not the same as covering a surface.
 *
 * Every gate is tested in BOTH directions, and every refusal is asserted on its
 * `rule` id rather than on "it was blocked", because a gate that blocks
 * everything passes a block-only test and is worse than no gate.
 */

const NOTHING_KNOWN: GateContext = { workspaceRoot: null, branch: null, verification: null };
const IN_WORKSPACE = (root: string): GateContext => ({ ...NOTHING_KNOWN, workspaceRoot: root });

describe('every gate is exercised', () => {
  it('has a context for each of the four names, so one cannot be dropped silently', () => {
    // The shape of the failure this guards: a fifth gate is added, three are
    // tested, and the file still reads as coverage.
    expect([...GATE_NAMES].sort()).toEqual([
      'block-main-commit',
      'commit-lint',
      'destructive-warn',
      'test-gate',
    ]);
  });

  it('has a destructive pattern table that is DATA, so a rule needs no deploy', () => {
    // Proved by reading the evaluator, not by trusting this comment. If
    // `destructiveVerdict` ever grew an `if (rule.id === 'rm-recursive-force')`
    // — a hardcoded branch per rule, which is what the plan rules out — then the
    // next rule to arrive would be a release, and every test above would still
    // pass. Comments and literals are stripped for the same reason
    // scaffold.test.ts strips them: the ids live in the table, and a mention in
    // prose must not read as a branch.
    const source = readFileSync(new URL('./gates.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (literal) => literal.replace(/[^\r\n]/g, ' '));

    expect(DESTRUCTIVE_PATTERNS.length).toBeGreaterThan(0);
    for (const rule of DESTRUCTIVE_PATTERNS) {
      expect(rule.id).not.toBe('');
      expect(rule.pattern).toBeInstanceOf(RegExp);
      // The only place a rule id may appear is the table it is declared in.
      expect(
        new RegExp(`\\b${rule.id}\\b`).test(source),
        `${rule.id} is named outside the table, so the evaluator has a branch for it`,
      ).toBe(false);
    }
  });
});

describe('destructive-warn', () => {
  it('blocks each of the ported rules, by name', () => {
    const cases: readonly [string, string][] = [
      ['rm-recursive-force', 'rm -rf build'],
      ['git-reset-hard', 'git reset --hard origin/main'],
      ['git-push-force', 'git push --force origin work'],
      ['git-clean-force', 'git clean -fd'],
      ['git-checkout-dot', 'git checkout .'],
      ['git-restore-dot', 'git restore .'],
      ['drop-table', 'psql -c "DROP TABLE battles"'],
      ['drop-database', 'psql -c "drop database battle_test"'],
      ['truncate-table', 'psql -c "TRUNCATE TABLE events"'],
      ['cross-pane-injection', 'tmux send-keys -t 2 "ls" Enter'],
    ];
    for (const [ruleId, command] of cases) {
      const verdict = destructiveVerdict(command, NOTHING_KNOWN);
      expect(verdict.allowed, `"${command}" should be refused`).toBe(false);
      if (!verdict.allowed) {
        expect(verdict.gate).toBe('destructive-warn');
        expect(verdict.rule, `"${command}" should name ${ruleId}`).toBe(ruleId);
      }
    }
  });

  it('passes the ordinary commands a coding agent actually runs', () => {
    const safe = [
      'npm test',
      'git status',
      'git add -A',
      'git commit -m "fix: handle the empty workspace"',
      'git diff origin/main',
      'ls -la',
      'pnpm build && pnpm test',
    ];
    for (const command of safe) {
      expect(destructiveVerdict(command, NOTHING_KNOWN), command).toEqual({ allowed: true });
    }
  });

  it('refuses a command whose TEXT contains a destructive rule, even inside a quoted argument', () => {
    // A commit message ABOUT this gate is refused by it, and that is the
    // deliberate trade rather than an oversight. The alternative — strip quoted
    // arguments before scanning — opens `sh -c "rm -rf /"`, which is the exact
    // command the gate exists to stop. A false positive costs a participant the
    // ability to use one phrase in a commit message; a false negative costs the
    // workspace. Upstream makes the same trade on the same string.
    const aboutTheGate = 'git commit -m "fix: block rm -rf outside the workspace"';
    expect(destructiveVerdict(aboutTheGate, NOTHING_KNOWN).allowed).toBe(false);

    // And the hole the trade closes is not hypothetical, so it is named here.
    expect(destructiveVerdict('sh -c "rm -rf /"', NOTHING_KNOWN).allowed).toBe(false);
  });

  it('refuses a confined rule whose path leaves the workspace', () => {
    const verdict = destructiveVerdict(
      'rm -rf ../other-session',
      IN_WORKSPACE('/tmp/battle-1/session-a'),
    );
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.rule).toBe('rm-recursive-force');
  });

  it('allows the same rule when every path it names is inside the workspace', () => {
    const root = '/tmp/battle-1/session-a';
    expect(destructiveVerdict('rm -rf build', IN_WORKSPACE(root)).allowed).toBe(true);
    expect(destructiveVerdict('rm -rf ./dist src/generated', IN_WORKSPACE(root)).allowed).toBe(
      true,
    );
  });

  it('refuses a path-confined rule that names an absolute path outside the workspace', () => {
    const verdict = destructiveVerdict(
      'rm -rf /tmp/somewhere-else',
      IN_WORKSPACE('/tmp/battle-1/session-a'),
    );
    expect(verdict.allowed).toBe(false);
  });

  it('refuses a shell expansion rather than trusting what the shell will do with it', () => {
    expect(destructiveVerdict('rm -rf ~/keys', IN_WORKSPACE('/tmp/w')).allowed).toBe(false);
  });
});

describe('block-main-commit', () => {
  it('blocks a commit on main and on master', () => {
    expect(isCommitOnMain('git commit -m "chore: x"', 'main')).toBe(true);
    expect(isCommitOnMain('git commit -m "chore: x"', 'master')).toBe(true);
  });

  it('passes a commit on a branch', () => {
    expect(
      mainCommitVerdict('git commit -m "feat: x"', { ...NOTHING_KNOWN, branch: 'feature/x' })
        .allowed,
    ).toBe(true);
  });

  it('sees a commit hiding behind a cd, which is upstream’s split and the reason for it', () => {
    expect(isCommitOnMain('cd /repo && git commit -m "chore: x"', 'main')).toBe(true);
    expect(
      mainCommitVerdict('cd /repo; git commit -m "chore: x"', { ...NOTHING_KNOWN, branch: 'main' })
        .allowed,
    ).toBe(false);
  });

  it('fails OPEN when the branch cannot be determined, and the test says so', () => {
    // Upstream lets it through when `git branch --show-current` fails, and so
    // does this. A hygiene gate that failed closed would block every commit in
    // a workspace that is not a git repository, which is a gate switched off
    // within a week. The difference from destructive-warn is deliberate and is
    // documented in gates.ts.
    expect(mainCommitVerdict('git commit -m "feat: x"', NOTHING_KNOWN).allowed).toBe(true);
    expect(
      mainCommitVerdict('git commit -m "feat: x"', { ...NOTHING_KNOWN, branch: null }).allowed,
    ).toBe(true);
  });

  it('ignores commands that are not commits at all', () => {
    expect(
      mainCommitVerdict('git log --oneline', { ...NOTHING_KNOWN, branch: 'main' }).allowed,
    ).toBe(true);
    expect(
      mainCommitVerdict('echo "git commit"', { ...NOTHING_KNOWN, branch: 'main' }).allowed,
    ).toBe(true);
  });
});

describe('commit-lint', () => {
  it('passes every conventional type the plan lists', () => {
    for (const type of VALID_COMMIT_TYPES) {
      expect(commitLintVerdict(`git commit -m "${type}: something"`).allowed, type).toBe(true);
    }
  });

  it('blocks a message that is not conventional, and quotes it back', () => {
    const verdict = commitLintVerdict('git commit -m "fixed the thing"');
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) {
      expect(verdict.gate).toBe('commit-lint');
      expect(verdict.reason).toContain('fixed the thing');
    }
  });

  it('blocks a type that is not in the list rather than accepting any word', () => {
    expect(commitLintVerdict('git commit -m "wip: something"').allowed).toBe(false);
    expect(commitLintVerdict('git commit -m "feat:"').allowed).toBe(false);
  });

  it('reads a single-quoted message as well as a double-quoted one', () => {
    expect(extractCommitMessage("git commit -m 'fix: quoted'")).toBe('fix: quoted');
    expect(extractCommitMessage('git commit -m "fix: quoted"')).toBe('fix: quoted');
  });

  it('reads the heredoc form upstream special-cases, because it is the least likely to be shadowed', () => {
    const command = ["git commit -m \"$(cat <<'EOF'", 'feat: from a heredoc', 'EOF', ')"'].join(
      '\n',
    );
    expect(extractCommitMessage(command)).toBe('feat: from a heredoc');
  });

  it('passes a commit that sets no message, rather than inventing a verdict', () => {
    // An amend and a --reuse-message carry their message from elsewhere. Upstream
    // passes those and so does this; refusing them would make a gate that can
    // only be satisfied by a flag.
    expect(extractCommitMessage('git commit --amend --no-edit')).toBeNull();
    expect(commitLintVerdict('git commit --amend --no-edit').allowed).toBe(true);
  });

  it('judges the first line only, so a trailer does not make a message conventional', () => {
    const verdict = validateCommitMessage('not conventional\n\nCo-Authored-By: someone');
    expect(verdict.allowed).toBe(false);
    expect(validateCommitMessage('feat: real\n\nCo-Authored-By: someone').allowed).toBe(true);
  });
});

describe('test-gate', () => {
  const green: GateContext = { ...NOTHING_KNOWN, verification: { ran: true, passed: true } };
  const red: GateContext = { ...NOTHING_KNOWN, verification: { ran: true, passed: false } };

  it('blocks a commit whose verification was red', () => {
    const verdict = testGateVerdict('git commit -m "feat: x"', red);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.gate).toBe('test-gate');
  });

  it('blocks a commit made before anything was verified', () => {
    const neverRan: GateContext = { ...NOTHING_KNOWN, verification: { ran: false, passed: true } };
    expect(testGateVerdict('git commit -m "feat: x"', neverRan).allowed).toBe(false);
  });

  it('passes when the verification is green', () => {
    expect(testGateVerdict('git commit -m "feat: x"', green).allowed).toBe(true);
  });

  it('passes when nothing is known, and says why in its own test name', () => {
    // There is no Makefile to run, or nobody has run the suite. Upstream warns
    // and allows in both cases, and the honest judge here is that this gate
    // REPORTS what it was told; it does not run anything.
    expect(testGateVerdict('git commit -m "feat: x"', NOTHING_KNOWN).allowed).toBe(true);
  });

  it('honours the upstream bypass when a caller sets it', () => {
    expect(testGateVerdict('git commit -m "feat: x"', { ...red, skipTestGate: true }).allowed).toBe(
      true,
    );
  });

  it('does not decide the commit by asking the participant’s own Makefile', () => {
    // The change from upstream, and the reason it was worth making. Upstream
    // runs `make test` in the workspace — so in a battle workspace the
    // participant's own Makefile decides whether this gate passes. Here the
    // result arrives as a field, which is why the assertion above about a red
    // verification is checkable at all.
    expect(testGateVerdict('git commit -m "feat: x"', red).allowed).toBe(false);
  });
});

describe('the gates together', () => {
  it('reports the safety gate first, so a destructive command is never asked about its message', () => {
    const verdict = evaluateCommand('git reset --hard && git commit -m "fixed the thing"', {
      ...NOTHING_KNOWN,
      branch: 'main',
    });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.gate).toBe('destructive-warn');
  });

  it('is order-stable: the same command always reports the same gate', () => {
    const context: GateContext = {
      ...NOTHING_KNOWN,
      branch: 'main',
      verification: { ran: true, passed: false },
    };
    const first = evaluateCommand('git commit -m "bad message"', context);
    const second = evaluateCommand('git commit -m "bad message"', context);
    expect(first).toEqual(second);
    if (!first.allowed) expect(first.gate).toBe('block-main-commit');
  });

  it('lets a clean commit through all four', () => {
    const verdict = evaluateCommand('git commit -m "fix: the thing"', {
      workspaceRoot: '/tmp/w',
      branch: 'work',
      verification: { ran: true, passed: true },
    });
    expect(verdict).toEqual({ allowed: true });
  });
});
