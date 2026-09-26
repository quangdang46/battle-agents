import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PULL_REQUEST_MERGED } from '@battle-agents/github';

/**
 * The GitHub boundary, as a source scan.
 *
 * The claim this file exists to protect is the bead's central one: a feature
 * never imports a GitHub SDK, and never reaches the network to find out whether
 * an issue exists. Every other guard in the repository is silent about it, and
 * their silence is structural rather than accidental:
 *
 *   architecture-rules.cjs returns null for any specifier that is neither
 *     relative nor @battle-agents/-scoped, with the comment "A genuinely
 *     external import, which this file has no opinion about." So
 *     `import { Octokit } from '@octokit/rest'` inside packages/features/bounty
 *     violates nothing it can see.
 *   tests/unit/scaffold.test.ts filters the same way before checking that a
 *     feature imports only core and protocol.
 *
 * So the rule is stated on the SPECIFIER rather than on a package name. The hole
 * is "an import that leaves the workspace", and Octokit is only today's
 * occupant of it: a feature that reached for `axios` or `undici` would break the
 * same boundary the same way.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FEATURES_DIR = join(REPO_ROOT, 'packages/features');
const IGNORED = new Set(['node_modules', 'dist', '.next', 'coverage', '.tmp']);
const WORKSPACE_SCOPE = '@battle-agents/';
const IMPORT_PATTERNS: readonly RegExp[] = [
  /(?:from|import)\s+['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Node's own modules, with the `node:` prefix Node itself also accepts.
 *
 * Allowed, and the reason is that a builtin is a fixed, auditable list this
 * repository can enumerate rather than a package tree it cannot. `crypto` for a
 * hash and `node:https` are not a way to smuggle an SDK past this rule; a
 * package name is.
 */
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function typescriptFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) typescriptFiles(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Comments go, strings stay.
 *
 * Strings have to stay, because an import specifier IS one. Comments have to go
 * because this codebase writes sentences that begin with the word "import" and
 * quote something afterwards — "a message that imports somebody\n * in another
 * guild said this" is a real line in packages/features/social, and it was
 * reported here as a dependency on the string `somebody in another guild said
 * this`. A guard that cries wolf over the repository's own prose gets switched
 * off, and this one is worth more switched on.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function specifiersInSource(source: string): string[] {
  return IMPORT_PATTERNS.flatMap((pattern) => [...stripComments(source).matchAll(pattern)]).map(
    (match) => match[1] ?? '',
  );
}

function specifiersIn(file: string): string[] {
  return specifiersInSource(readFileSync(file, 'utf8'));
}

function relativeToRepo(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

function leavesTheWorkspace(specifier: string): boolean {
  return (
    !specifier.startsWith('.') && !specifier.startsWith(WORKSPACE_SCOPE) && !BUILTINS.has(specifier)
  );
}

describe('features never reach outside the workspace', () => {
  const featureFiles = typescriptFiles(FEATURES_DIR);

  it('scanned something, so an empty list cannot pass silently', () => {
    expect(featureFiles.length).toBeGreaterThan(20);
  });

  it('has no package import in any non-test source', () => {
    // Test files are excluded from this one: a test may import vitest, and a
    // test that reaches for the real SDK is testing the SDK. The next test
    // covers tests, for Octokit specifically.
    const offenders = featureFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .flatMap((file) =>
        specifiersIn(file)
          .filter(leavesTheWorkspace)
          .map((specifier) => `${relativeToRepo(file)} imports ${specifier}`),
      );

    expect(offenders).toEqual([]);
  });

  it('has no Octokit import anywhere under features, tests included', () => {
    const offenders = featureFiles.flatMap((file) =>
      specifiersIn(file)
        .filter((specifier) => specifier.startsWith('@octokit/'))
        .map((specifier) => `${relativeToRepo(file)} imports ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('reads a specifier, rather than a word in a comment', () => {
    // The guard asserting it is not fooled, so the guard above is worth having.
    //
    // It used to read packages/features/social/src/feature.ts off disk, which
    // broke the removal test: that script strips a feature out of the
    // composition root and moves its directory, so this threw ENOENT on every
    // removal of `social` — a test failing at the boundary of a file the
    // repository is designed to be able to delete. It parses a literal now, so
    // it depends on no file that can legitimately be removed, and it is a
    // sharper statement of the same thing.
    expect(
      specifiersInSource(
        [
          "import { DatabaseSync } from 'node:sqlite';",
          '// import { x } from "somebody in another guild said this";',
          '/* the plan says features never import @octokit/rest here */',
        ].join('\n'),
      ),
    ).not.toContain('somebody in another guild said this');

    expect(specifiersInSource("import { DatabaseSync } from 'node:sqlite';")).toEqual([
      'node:sqlite',
    ]);
  });
});

describe('the event the webhook emits', () => {
  it('is not one of the two names that would double-pay', () => {
    // The double-pay this prevents is armed, not hypothetical: progression pays
    // 1000 XP for bounty.completed and 500 for pr.merged, with a handler
    // registered for each. Emitting either from the integration edge means one
    // merged pull request pays 1500 and writes two history rows the moment the
    // bounty feature lands and translates the same merge.
    expect(PULL_REQUEST_MERGED).not.toBe('pr.merged');
    expect(PULL_REQUEST_MERGED).not.toBe('bounty.completed');
  });

  it('is named by no feature but the one that translates it', () => {
    // The claim this file was written on has expired, and the way it expired is
    // the feature landing: ba-feature-bounty-xhk made the bounty feature the
    // thing that decides what a merge means, so it — and only it — names the
    // integration's event in order to subscribe to it.
    //
    // ## Why the assertion is one-sided
    //
    // Asserting "exactly one, and it is bounty" reads better and cannot survive
    // scripts/removal-test.sh, which strips a feature out of the composition
    // root, moves its directory and then runs this suite. With bounty gone the
    // honest answer is zero, and a floor demanding one would fail the removal
    // test for a feature that is perfectly removable. The direction that IS
    // load-bearing is the one that survives: NO feature other than bounty may
    // name this event, because a price row or a second subscriber is what turns
    // one merge into two awards.
    //
    // The price half of the same claim is asserted where both sides are in
    // scope: tests/integration/bounty-merge-award.test.ts holds the integration's
    // constant and progression's table at once, and fails with 1500 where this
    // file could only fail on a string.
    //
    // A source read is sound for this claim because the name is a quoted literal
    // in packages/features/bounty/src/merge.ts with no computed key. If that ever
    // stops being true, the honest fix is a test inside the bounty package — not
    // an import here.
    const offenders = typescriptFiles(FEATURES_DIR)
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes(PULL_REQUEST_MERGED))
      .map(relativeToRepo);

    const foreign = offenders.filter((file) => !file.startsWith('packages/features/bounty/'));

    expect(foreign).toEqual([]);
  });

  it('is namespaced under the integration, so its origin is legible in a log', () => {
    expect(PULL_REQUEST_MERGED.startsWith('github.')).toBe(true);
  });
});
