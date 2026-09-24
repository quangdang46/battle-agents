import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Every test file must be claimed by at least one pipeline stage.
 *
 * This exists because of a real regression. The stages are split by config, each
 * with its own include globs, and a test file placed outside those globs is not
 * reported as failing. It is simply never run, and the stage still reports green.
 * A 10KB rule engine plus its test sat at the root of tests/ while the unit
 * stage only matched tests/unit, so the architecture engine enforced nothing at
 * all and nothing said so.
 *
 * A silently skipped test is worse than a missing one, because a missing test
 * shows up in the file list and a skipped one only shows as a quiet gap in
 * coverage.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const STAGE_CONFIGS: readonly string[] = [
  'vitest.unit.config.ts',
  'vitest.integration.config.ts',
  'vitest.e2e.config.ts',
];

const TEST_ROOTS: readonly string[] = ['tests', 'packages', 'apps', 'drizzle', 'scripts'];
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.next',
  '.tmp',
  '.beads',
  'coverage',
]);

function listFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listFiles(full, out);
    } else if (entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Read the include globs out of a stage config, so the two cannot drift apart. */
function includesOf(configName: string): string[] {
  const source = readFileSync(join(REPO_ROOT, configName), 'utf8');
  const body = /include:\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? '';
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '');
}

// Sentinels rather than literal text, because "**/" must be replaced before
// "**" and "*", and whatever it becomes must not itself contain a "*" for the
// later replacements to chew on.
const MANY_DIRECTORIES = '@@many-dirs@@';
const ANY_CHARACTERS = '@@any-chars@@';

// Glob to RegExp for the two forms these configs actually use.
//
// The subtle one is "**/", meaning zero or more whole directories rather than
// one or more. The unit config's first include has to match a test sitting
// directly in tests/unit, where the slash-star-star-slash spans nothing at all,
// and mapping it to a plain dot-star gets that wrong because it leaves the
// slash it consumed behind.
//
// NOTE for whoever edits this: do NOT put a glob ending in **/ inside a block
// comment. The "*/" closes the comment early and the rest of the line is
// parsed as code, which is exactly the kind of error that reads like a
// corrupted file rather than a typo.
function globToRegExp(glob: string): RegExp {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, MANY_DIRECTORIES)
    .replace(/\*\*/g, ANY_CHARACTERS)
    .replace(/\*/g, '[^/]*')
    .replaceAll(MANY_DIRECTORIES, '(?:[^/]+/)*')
    .replaceAll(ANY_CHARACTERS, '.*');
  return new RegExp(`^${source}$`);
}

describe('test stage coverage', () => {
  const configs = STAGE_CONFIGS.map((name) => ({ name, patterns: includesOf(name) }));
  const allPatterns = configs.flatMap((config) => config.patterns.map(globToRegExp));

  it('every stage config exposes at least one include', () => {
    const empty = configs
      .filter((config) => config.patterns.length === 0)
      .map((config) => config.name);
    expect(empty).toEqual([]);
  });

  it('has no orphaned test files', () => {
    const orphans: string[] = [];
    for (const root of TEST_ROOTS) {
      for (const file of listFiles(join(REPO_ROOT, root))) {
        // The include globs in the stage configs are written with forward
        // slashes, and path.relative() emits backslashes on Windows. Without
        // this normalization every file is an orphan on Windows, so the guard
        // reported the whole suite as unclaimed instead of passing.
        const repoRelative = relative(REPO_ROOT, file).split(sep).join('/');
        if (!allPatterns.some((pattern) => pattern.test(repoRelative))) {
          orphans.push(repoRelative);
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});
