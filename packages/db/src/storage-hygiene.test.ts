import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

function read(relativePath: string): string {
  return readFileSync(join(PACKAGE_ROOT, relativePath), 'utf8');
}

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

  it('is imported rather than redeclared by both repositories', () => {
    for (const repository of ['repositories/agents.ts', 'repositories/social.ts']) {
      const source = read(repository);
      expect(source).toMatch(/import \{ toHarness \} from '\.\.\/harness\.js';/);
      expect(source).not.toMatch(/const HARNESSES\b/);
      expect(source).not.toMatch(/function toHarness\b/);
    }
  });
});

describe('the build list is written down once', () => {
  it('derives BuildName from BUILD_NAMES rather than restating it', () => {
    // The two idioms used to sit either side of each other holding the same
    // eight names: a union, and a `Set` for `isBuildName` to consult. Adding a
    // build meant editing both. Editing only the union compiles cleanly and
    // narrows nothing at all, because the guard kept reading the old Set.
    const source = read('repositories/progression.ts');
    expect(source).toContain('type BuildName = (typeof BUILD_NAMES)[number];');
    // A union member is a line starting with `|` and a quoted build name. There
    // must be none: the only build names allowed to appear are inside the
    // BUILD_NAMES array literal.
    expect(source).not.toMatch(/^\s*\|\s*'generalist'/m);
    expect(source).not.toMatch(/type BuildName\s*=\s*\|/);
  });

  it('spells the build list out in exactly one place', () => {
    // The derivation check above does NOT catch the reverse mistake, and the
    // first version of this file proved it: re-adding the redundant `Set` while
    // leaving the derived union in place passed every assertion here, because
    // the union was still derived and still correct. The two facts that drift
    // are "the list is written once" and "the union is derived", and only the
    // first one notices a second copy appearing.
    //
    // `Exclude<BuildName, 'generalist'>` in StoredSignal is a legitimate second
    // mention of a build name and is deliberately not a list, which is why this
    // counts bracketed literals rather than occurrences of the word.
    const literals = [...read('repositories/progression.ts').matchAll(/\[([^\][]*)\]/g)]
      .map((match) => match[1] ?? '')
      .filter((body) => body.includes("'generalist'"));
    expect(literals).toHaveLength(1);
  });

  it('keeps the same idiom for the skills it already used', () => {
    // The skills were already `as const` array with a derived union, and that is
    // the shape the builds were being brought to. Asserting both means a future
    // edit cannot introduce a third idiom for the same job.
    const source = read('repositories/progression.ts');
    expect(source).toMatch(/const SKILL_NAMES = \[/);
    expect(source).toContain('type SkillName = (typeof SKILL_NAMES)[number];');
  });
});

describe('the payout upsert narrows once', () => {
  it('builds the row it inserts and the row it updates from one expression', () => {
    // The insert and the conflict update each called `toIntentState`,
    // `toIntentMode` and `new Date(...)` separately. Two independent branches
    // that must be edited together: a fourth state narrowed on the way in and
    // left un-narrowed on the way through the conflict, which is a write that
    // only happens on the retry path — the one path nobody exercises by hand.
    const source = read('repositories/bounties.ts');
    const record = source.slice(
      source.indexOf('async record(intent:'),
      source.indexOf('async currentFor('),
    );
    expect(record).toMatch(/const row = \{/);
    for (const call of ['toIntentState(', 'toIntentMode(', 'new Date(intent.recordedAt)']) {
      expect(record.split(call)).toHaveLength(2);
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
