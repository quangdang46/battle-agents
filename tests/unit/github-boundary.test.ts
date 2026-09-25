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

function specifiersIn(file: string): string[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  return IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)]).map(
    (match) => match[1] ?? '',
  );
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
    expect(specifiersIn(join(FEATURES_DIR, 'social/src/feature.ts'))).not.toContain(
      'somebody in another guild said this',
    );
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

  it('is named by no feature at all, so no price row can attach to it', () => {
    // The claim that matters is not "progression's table omits it" but "nothing
    // under features/ subscribes to it", so the assertion covers every feature
    // rather than one file. That is the stronger claim — a row added to any
    // feature is what would start the double-pay — and it is also the only shape
    // that survives scripts/removal-test.sh, which deletes each feature in turn
    // and then runs the unit suite.
    //
    // A source read is sound for this claim because every OUTCOME_TYPES entry
    // and every OUTCOMES key is a quoted literal and there is no computed key.
    // If that ever stops being true, the honest fix is a test inside the
    // progression package — not an import here.
    const offenders = typescriptFiles(FEATURES_DIR)
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes(PULL_REQUEST_MERGED))
      .map(relativeToRepo);

    expect(offenders).toEqual([]);
  });

  it('is namespaced under the integration, so its origin is legible in a log', () => {
    expect(PULL_REQUEST_MERGED.startsWith('github.')).toBe(true);
  });
});
