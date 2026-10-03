import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HARNESSES, toHarness, UNKNOWN_HARNESS } from './harness.js';

/**
 * Four facts about this package that were each written down in a comment, and
 * each of which was true of the code at the time it was written and stopped
 * being true afterwards.
 *
 * ## Why these read source instead of importing it
 *
 * The duplication these guard is not observable from outside. A second copy of
 * a seven-element list produces the same answers as the first; a second object
 * literal in an upsert produces the same row. The compiler has nothing to say
 * about either, and a test that imported the module would be asserting the
 * behaviour of a list that is already correct — which is exactly the check that
 * stays green while somebody edits one copy and not the other.
 *
 * So these assert on the shape of the source. That is a real trade: a
 * reformatting that changes the shape fails them. Each one below is written
 * against the thing that actually went wrong, and each is narrow enough that
 * renaming a variable does not trip it.
 *
 * ## And what a source check is NOT
 *
 * It does not prove the lists agree with the features' copies. That is the job
 * of the conformance check in apps/web, which may see both sides; this package
 * may not. What it proves is the narrower thing that was broken: that a fact
 * with two copies inside this package has one.
 *
 * ## The removal test is why this reads nothing outside packages/db
 *
 * `scripts/removal-test.sh` strips each feature in turn and re-runs the unit
 * suite. A test here that reached into `packages/features/*` would fail on the
 * removal it was meant to prove clean, so every path below is under this
 * package.
 */

const PACKAGE_ROOT = fileURLToPath(new URL('./', import.meta.url));

/**
 * Every .ts source file in this package's `src`, recursively.
 *
 * Scoped to `src` rather than the package root because the package root also
 * holds `dist`, and AGENTS.md is explicit that `dist` is build output and not
 * source. The first version of this file walked the package root and read
 * `dist/schema/features/guild.d.ts` — stale build output still carrying the
 * comment this test exists to catch, which reported the bug as unfixed after it
 * had been fixed, and would have reported a fix as unfixed the moment someone
 * forgot to rebuild.
 */
function sourcesUnder(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'dist' || entry === 'node_modules') continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourcesUnder(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      found.push(full);
    }
  }
  return found;
}

const SOURCES = sourcesUnder(PACKAGE_ROOT);

describe('the harness list has one copy in this package', () => {
  it('narrows every known harness and sends everything else to other', () => {
    for (const harness of HARNESSES) {
      expect(toHarness(harness)).toBe(harness);
    }
    expect(toHarness('a-harness-from-a-newer-build')).toBe(UNKNOWN_HARNESS);
    expect(toHarness('')).toBe(UNKNOWN_HARNESS);
  });

  it('names a harness in exactly one file', () => {
    // Naming a harness anywhere else in this package means a second list, and
    // that is the whole defect: `agents.ts` and `social.ts` each carried one,
    // they agreed, and nothing had ever compared them. A character could read as
    // one harness on a profile and another on the leaderboard.
    const naming = SOURCES.filter((path) => readFileSync(path, 'utf8').includes("'gemini'"));
    expect(naming.map((path) => path.replace(PACKAGE_ROOT, ''))).toEqual(['harness.ts']);
  });

  it('is imported rather than redeclared by any repository', () => {
    // The two files that used to carry their own list are gone. The property
    // this asserts is still the one that matters, and it is now stated over
    // whatever repositories remain: none of them may declare the mapping, and
    // every one that narrows a harness must import `toHarness` to do it.
    const repositories = SOURCES.filter((path) => path.includes(`${sep}repositories${sep}`));
    expect(repositories.length).toBeGreaterThan(0);

    for (const repository of repositories) {
      const source = readFileSync(repository, 'utf8');
      expect(source).not.toMatch(/const HARNESSES\b/);
      expect(source).not.toMatch(/function toHarness\b/);
    }
  });
});

describe('a comment naming one of this package\'s checks must name a real one', () => {
  it('resolves every check* function cited in a comment to an export', () => {
    // `schema/features/guild.ts` said `checkNoCachedGuildTotals` fails the build
    // if a balance column appears. No such function has ever existed; the real
    // one is `checkNoCachedTotals`. A reader who went looking for the guard the
    // comment promised would have found nothing, and the schema it described
    // had no obvious protection — which is a comment that makes a codebase look
    // wrong rather than one that is.
    // Declared as a function or a const, exported or not. `checkSeedIsIdempotent`
    // is a private helper in seed.ts and a comment cites it, which is correct;
    // `checkConstraints` is a field of SchemaSnapshot and is not a check at all,
    // which is why the rule is about declarations rather than a word list.
    const declared = new Set<string>();
    for (const path of SOURCES) {
      for (const match of readFileSync(path, 'utf8').matchAll(
        /(?:function|const)\s+(check[A-Z]\w*)/g,
      )) {
        declared.add(match[1] ?? '');
      }
    }

    const cited = new Map<string, string>();
    for (const path of SOURCES) {
      const source = readFileSync(path, 'utf8');
      for (const comment of source.matchAll(/\/\*([\s\S]*?)\*\/|\/\/([^\n]*)/g)) {
        const text = comment[1] ?? comment[2] ?? '';
        for (const match of text.matchAll(/\b(check[A-Z]\w*)\b/g)) {
          const name = match[1] ?? '';
          // A name in the declaration that defines it is not a citation of it.
          if (new RegExp(`(?:function|const)\\s+${name}\\b`).test(source)) continue;
          if (!cited.has(name)) cited.set(name, path.replace(PACKAGE_ROOT, ''));
        }
      }
    }

    expect([...cited.entries()].filter(([name]) => !declared.has(name))).toEqual([]);
  });
});
