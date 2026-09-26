/**
 * The hook gates, as pure functions over a command and the facts about it.
 *
 * Plan section 28.1 item 4 ports four guards from `agent-dashboard`
 * (`adapters/claude-code/hooks/`, MIT, `b3c04cf7f0aa` — see
 * THIRD-PARTY-NOTICES.md): `warn-destructive`, `block-main-commit`,
 * `commit-lint` and `test-gate`. The plan's reason for wanting them is the
 * reason they are here: "a 'destructive-warn' or 'block-main-commit' gate is
 * precisely the kind of guard that makes it safe to let autonomous agents work
 * in parallel sandboxes".
 *
 * ## What was ported and what was changed, and why
 *
 * Upstream each of these is a `PreToolUse`/`PostToolUse` script: it reads a
 * JSON payload on stdin, shells out to `git` and `make`, and exits 2 to block.
 * The DECISIONS are ported; the harness is not. Three differences, each of which
 * is a hole that only opens once the thing being guarded is a match rather than
 * one developer's checkout:
 *
 * 1. **No shelling out.** Upstream `block-main-commit` runs `git branch
 *    --show-current` and upstream `test-gate` runs `make test`. In a battle
 *    workspace the second one means the PARTICIPANT decides whether the gate
 *    passes — the Makefile is their file. Both facts arrive here as fields on
 *    `GateContext` instead, so a gate can only ever report what it was told.
 * 2. **No stdin, no exit codes.** A gate returns a verdict. The caller in
 *    `workspace.ts` is the thing that refuses to start the process, and it does
 *    so BEFORE the spawn, because a block that runs first and reports after has
 *    already done the damage.
 * 3. **Destructive patterns became DATA.** Upstream hardcodes them in a module
 *    array. A table means a rule can be added without a deploy, which is the
 *    same reason the judge's security rules are a table: the alternative is that
 *    every new guard is a release.
 *
 * ## Fail-closed and fail-open, deliberately different
 *
 * A SAFETY gate (`destructive-warn`) fails closed: when it cannot show an
 * operation is confined to this participant's own workspace, it refuses. A
 * HYGIENE gate (`block-main-commit`, `commit-lint`) fails open: when it cannot
 * determine the branch, it allows, because a workspace that is not a git
 * repository has no branch and refusing there would block every commit anyone
 * makes. Upstream makes the same split and for the same reason. Conflating them
 * would mean a gate is either useless or unusable, and neither is a decision
 * anybody can review.
 */

import { resolve } from 'node:path';

import { isInside } from './workspace-paths.js';

export const GATE_NAMES = [
  'destructive-warn',
  'block-main-commit',
  'commit-lint',
  'test-gate',
] as const;
export type GateName = (typeof GATE_NAMES)[number];

/** A command a safety gate refuses when it cannot prove the operation is contained. */
export interface DestructivePattern {
  readonly id: string;
  readonly pattern: RegExp;
  /**
   * Whether the command's path arguments can confine it to the workspace.
   *
   * `true` for the rules whose damage is entirely in the paths they name, which
   * is what lets a participant delete their own scratch build. `false` for the
   * rules that destroy something the participant did not create — the base
   * checkout the regression step needs, the platform's database, another pane's
   * terminal — and those are refused whatever the paths say.
   */
  readonly pathConfined: boolean;
}

/**
 * The destructive table, ported from `warn-destructive.js` and kept as data.
 *
 * `rm -rf` is the one entry upstream special-cases with a function, because
 * `rm -rf worktrees/` is a legitimate cleanup there. Here the equivalent
 * allowance is expressed in the DATA instead: `rm` is `pathConfined`, so
 * `rm -rf build` inside the workspace passes and `rm -rf` outside it does not.
 * That is a wider allowance than upstream's, and it is deliberate — a battle
 * workspace is disposable and a participant must be able to clean up inside it —
 * which is why it is written down here rather than left to be discovered.
 */
export const DESTRUCTIVE_PATTERNS: readonly DestructivePattern[] = Object.freeze([
  {
    id: 'rm-recursive-force',
    pattern: /\brm\s+-[^\s]*[rR][^\s]*f|\brm\s+-[^\s]*f[^\s]*[rR]/,
    pathConfined: true,
  },
  { id: 'git-reset-hard', pattern: /\bgit\s+reset\s+--hard\b/, pathConfined: false },
  {
    id: 'git-push-force',
    pattern: /\bgit\s+push\b[^;&|]*(--force\b|(?:^|\s)-f(?:\s|$))/,
    pathConfined: false,
  },
  { id: 'git-clean-force', pattern: /\bgit\s+clean\b[^;&|]*-[^\s]*f/, pathConfined: false },
  { id: 'git-checkout-dot', pattern: /\bgit\s+checkout\s+\.\s*([;&|]|$)/, pathConfined: false },
  { id: 'git-restore-dot', pattern: /\bgit\s+restore\s+\.\s*([;&|]|$)/, pathConfined: false },
  { id: 'drop-table', pattern: /\bdrop\s+table\b/i, pathConfined: false },
  { id: 'drop-database', pattern: /\bdrop\s+database\b/i, pathConfined: false },
  { id: 'truncate-table', pattern: /\btruncate\s+table\b/i, pathConfined: false },
  // Kept from upstream, where it stops one agent typing into another agent's
  // terminal pane. The same reasoning is what stops one participant reaching
  // another's, so it is the same rule rather than a dashboard quirk.
  { id: 'cross-pane-injection', pattern: /\btmux\s+send-keys\b/, pathConfined: false },
]);

/** The conventional-commit types upstream accepts, ported verbatim. */
export const VALID_COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'docs',
  'test',
  'chore',
  'perf',
  'ci',
] as const;

const CONVENTIONAL_COMMIT = new RegExp(`^(${VALID_COMMIT_TYPES.join('|')}):\\s+\\S`);

/**
 * The facts a gate cannot discover for itself, and must therefore be told.
 *
 * Nothing here is a callback. A gate that could call `git` could be made to call
 * whatever the participant's repository makes `git` do.
 */
export interface GateContext {
  /** This participant's workspace root. `null` disables the containment rules. */
  readonly workspaceRoot: string | null;
  /** The checked-out branch, or `null` when nothing can say. */
  readonly branch: string | null;
  /**
   * Whether the verification the test gate trusts has run and passed.
   *
   * `null` is "not known" and ALLOWS, matching upstream's behaviour when there
   * is no Makefile to run. The judge is what actually runs the suite; this only
   * reports what the judge told it.
   */
  readonly verification: { readonly ran: boolean; readonly passed: boolean } | null;
  /** The upstream bypass, carried through the environment. */
  readonly skipTestGate?: boolean;
}

export type GateVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly gate: GateName;
      readonly rule: string;
      readonly reason: string;
    };

export type CommandGuard = (command: string, context: GateContext) => GateVerdict;

const ALLOW: GateVerdict = Object.freeze({ allowed: true });

function blocked(gate: GateName, rule: string, reason: string): GateVerdict {
  return { allowed: false, gate, rule, reason };
}

/** A verdict, or the first refusal any gate produced. Gates are ordered, so it is stable. */
function firstRefusal(...verdicts: readonly GateVerdict[]): GateVerdict {
  for (const verdict of verdicts) {
    if (!verdict.allowed) return verdict;
  }
  return ALLOW;
}

/* ───────────────────────────── destructive-warn ───────────────────────────── */

/**
 * The path-shaped tokens of a command, resolved against a root.
 *
 * A heuristic and labelled as one: it is a second line of defence behind the
 * handle's own containment, not a parser. A token is treated as a path when it
 * is absolute, starts with a dot segment, or carries a separator — which covers
 * `../sibling`, `/etc`, `./build` and `src/../../other`, and ignores `git`,
 * `-m` and the text of a commit message.
 */
function pathTokens(command: string): readonly string[] {
  return command
    .split(/[\s;&|]+/)
    .filter((token) => token !== '')
    .filter(
      (token) =>
        token.startsWith('/') ||
        token.startsWith('./') ||
        token.startsWith('../') ||
        token === '..' ||
        token.startsWith('~') ||
        token.includes('/'),
    );
}

function escapesWorkspace(root: string, token: string): boolean {
  const cleaned = token.replace(/^['"]|['"]$/g, '');
  // `~` is refused outright rather than resolved. A shell would expand it to a
  // HOME this runner sets to the workspace root, but the token is what the
  // command SAYS, and a gate that trusts what the shell will do with it is
  // trusting the thing it exists to constrain.
  if (cleaned.startsWith('~')) return true;
  return !isInside(root, resolve(root, cleaned));
}

export function destructiveVerdict(command: string, context: GateContext): GateVerdict {
  for (const rule of DESTRUCTIVE_PATTERNS) {
    if (!rule.pattern.test(command)) continue;
    if (rule.pathConfined && context.workspaceRoot !== null) {
      const escapes = pathTokens(command).filter((token) =>
        escapesWorkspace(context.workspaceRoot as string, token),
      );
      if (escapes.length === 0) continue;
      return blocked(
        'destructive-warn',
        rule.id,
        `"${rule.id}" names ${escapes[0] as string}, which is outside this participant's workspace`,
      );
    }
    return blocked(
      'destructive-warn',
      rule.id,
      `"${rule.id}" destroys something this participant did not create, and no path argument confines it`,
    );
  }
  return ALLOW;
}

/* ───────────────────────────── block-main-commit ───────────────────────────── */

/**
 * A commit on main or master.
 *
 * Ported from upstream's `isCommitOnMain`: branch is checked first, and the
 * command is split on `;`/`&` so a commit hiding behind a `cd` is still seen.
 * A detached HEAD reports no branch, which is `null` here, and allows.
 */
export function isCommitOnMain(command: string, branch: string | null): boolean {
  if (branch !== 'main' && branch !== 'master') return false;
  return command.split(/[;&]+/).some((segment) => /^\s*git\s+commit\b/.test(segment.trim()));
}

export function mainCommitVerdict(command: string, context: GateContext): GateVerdict {
  if (!/\bgit\s+commit\b/.test(command)) return ALLOW;
  if (isCommitOnMain(command, context.branch)) {
    return blocked(
      'block-main-commit',
      'commit-on-protected-branch',
      'a battle participant commits to a branch, not to main or master',
    );
  }
  return ALLOW;
}

/* ───────────────────────────── commit-lint ───────────────────────────── */

/**
 * The commit message a `git commit -m` carries, or `null`.
 *
 * Upstream's three shapes, in upstream's order: the heredoc first because it is
 * the most specific and the least likely to be shadowed, then double, then
 * single quotes. `null` means "this command sets no message" — an amend, a
 * `--reuse-message` — and upstream passes those rather than inventing a verdict.
 */
export function extractCommitMessage(command: string): string | null {
  const heredoc = command.match(/-m\s+"\$\(cat\s+<<'?EOF'?\n([\s\S]*?)\nEOF\n?\s*\)"/);
  if (heredoc?.[1] !== undefined) return heredoc[1].trim();
  const doubleQuoted = command.match(/\bgit\s+commit\b[^]*?-m\s+"([^"]+)"/);
  if (doubleQuoted?.[1] !== undefined) return doubleQuoted[1];
  const singleQuoted = command.match(/\bgit\s+commit\b[^]*?-m\s+'([^']+)'/);
  if (singleQuoted?.[1] !== undefined) return singleQuoted[1];
  return null;
}

/** The first line only: a `Co-Authored-By` trailer is not what makes a message conventional. */
export function validateCommitMessage(message: string | null): GateVerdict {
  if (message === null) return ALLOW;
  const firstLine = message.split('\n')[0]?.trim() ?? '';
  if (CONVENTIONAL_COMMIT.test(firstLine)) return ALLOW;
  return blocked(
    'commit-lint',
    'conventional-commit',
    `"${firstLine}" is not conventional; expected <type>: <description> with type one of ` +
      VALID_COMMIT_TYPES.join(', '),
  );
}

export function commitLintVerdict(command: string): GateVerdict {
  if (!/\bgit\s+commit\b/.test(command)) return ALLOW;
  return validateCommitMessage(extractCommitMessage(command));
}

/* ───────────────────────────── test-gate ───────────────────────────── */

/**
 * A commit whose verification is known to be red.
 *
 * `null` verification allows, and that is the honest answer to "we have no
 * Makefile" AND to "nobody has run the suite yet". A gate that blocked on
 * `null` would block every commit in a workspace whose project has no Makefile,
 * which is a gate that gets switched off within a week.
 */
export function testGateVerdict(command: string, context: GateContext): GateVerdict {
  if (!/\bgit\s+commit\b/.test(command)) return ALLOW;
  if (context.skipTestGate === true) return ALLOW;
  if (context.verification === null) return ALLOW;
  if (context.verification.ran && context.verification.passed) return ALLOW;
  return blocked(
    'test-gate',
    'red-verification',
    context.verification.ran
      ? 'the last verification in this workspace was red'
      : 'a commit went in before anything was verified',
  );
}

/* ───────────────────────────── all of them ───────────────────────────── */

/**
 * Every gate, in a fixed order.
 *
 * Safety first and destructive first within it, because a command that would
 * have destroyed the workspace must not get as far as being asked about its
 * commit message. The order is the point: a caller that reported "the last gate
 * to object" would report a different gate for the same command depending on
 * how the list was written.
 */
export function evaluateCommand(command: string, context: GateContext): GateVerdict {
  return firstRefusal(
    destructiveVerdict(command, context),
    mainCommitVerdict(command, context),
    commitLintVerdict(command),
    testGateVerdict(command, context),
  );
}
