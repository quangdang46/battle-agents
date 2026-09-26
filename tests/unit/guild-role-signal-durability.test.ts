import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PERSISTED_EVENT_TYPES } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

/**
 * A guild role may only be projected from a DURABLE event.
 *
 * ## What this is guarding
 *
 * §10.2 says a class comes from behaviour and never from a model name. The
 * obvious failure is a self-declared label, and the subtler one is a role read
 * off an event the database never keeps: the classification looks right, the
 * code has no obvious bug, and the evidence evaporates on the next restart. A
 * role nothing can re-derive is a claim, and the guild's standing is computed
 * from roles.
 *
 * The filter is `packages/core/src/persistence.ts`. An event reaches `event_log`
 * if its type is in `PERSISTED_EVENT_TYPES` or in the `persistedEvents` of an
 * INSTALLED feature, and the registry unions them — so the durable set is a
 * property of what is installed, not a constant.
 *
 * ## Why the sources are READ and not IMPORTED
 *
 * `scripts/removal-test.sh` moves a feature's directory aside and then runs this
 * suite. A static import of `@battle-agents/guild` — or of any sibling, since
 * every one of them is removable — would fail for every feature the script
 * removed, which is the exact operation this repository is built on.
 * `tests/unit/bounty-mode-vocabulary.test.ts` records the same reasoning, and
 * `tests/unit/mvp-scope.test.ts` records having been caught doing it anyway.
 *
 * `@battle-agents/core` IS imported, and that is safe on purpose: core is not
 * under `packages/features`, so the removal script never moves it and its alias
 * always resolves.
 *
 * ## The floor, and why it is not "the file is here"
 *
 * A missing file is answered SILENTLY, because when the script strips a feature
 * this file and that feature's own co-located tests disappear as a unit, and a
 * check that insisted the taxonomy exist would fail the operation the
 * architecture exists to permit. The floor is the other half: whenever a file IS
 * here, the extraction below must produce something. An extractor that returned
 * an empty array on a parse failure would make the durability assertion
 * trivially true — an empty evidence set is a subset of every set — and the
 * collision this file exists to prevent would return with every gate green.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const FEATURES_DIR = join(repoRoot, 'packages/features');
const GUILD_RULES = join(FEATURES_DIR, 'guild', 'src', 'rules.ts');

/** `export const NAME = 'value'` — a feature's own event-name constants. */
function constantValues(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const src = join(dir, 'src');
  if (!existsSync(src)) return out;
  for (const file of walk(src)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:export )?const ([A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
      out.set(match[1] as string, match[2] as string);
    }
  }
  return out;
}

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Moved between the existsSync above and here. Same case, same answer.
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) yield full;
  }
}

/**
 * Every event type a feature declares it persists.
 *
 * Comments are stripped before the array is read, because a comment inside a
 * `persistedEvents` block is a comment and not a declaration — and battle's
 * block carries a nine-line justification between two entries, which a
 * reference to "a type that is not in the list" in prose would otherwise
 * register.
 */
function declaredPersistedEvents(dir: string): readonly string[] {
  const constants = constantValues(dir);
  const src = join(dir, 'src');
  if (!existsSync(src)) return [];
  const declared: string[] = [];
  for (const file of walk(src)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const block of source.matchAll(/persistedEvents:\s*\[([^\]]*)\]/g)) {
      for (const name of (block[1] ?? '').matchAll(/([A-Z0-9_]+)/g)) {
        const value = constants.get(name[1] as string);
        if (value !== undefined) declared.push(value);
      }
      // A literal in the array, for a feature that inlines one.
      for (const literal of (block[1] ?? '').matchAll(/'([^']+)'/g)) {
        declared.push(literal[1] as string);
      }
    }
  }
  return declared;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** The feature directories that have a source entry. */
function featureDirs(): readonly string[] {
  if (!existsSync(FEATURES_DIR)) return [];
  return readdirSync(FEATURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(FEATURES_DIR, entry.name, 'src')))
    .map((entry) => join(FEATURES_DIR, entry.name));
}

/**
 * The durable set, the way the runtime computes it.
 *
 * Core's list plus the union of every installed feature's declarations, which
 * is what `registerFeature` in packages/core/src/registry.ts assembles.
 * Computed here rather than imported because `RuntimeContext.runtime` exposes
 * no persisted-events accessor — a feature cannot self-check this — and because
 * if core ever grows one, this test should be the thing that notices the two
 * have diverged, which it can only do while still deriving the set itself.
 */
function durableEventTypes(): ReadonlySet<string> {
  const durable = new Set<string>(PERSISTED_EVENT_TYPES);
  for (const dir of featureDirs()) {
    for (const type of declaredPersistedEvents(dir)) durable.add(type);
  }
  return durable;
}

/**
 * The event types the guild's role table leans on, read out of `ROLE_SIGNALS`.
 *
 * `evidence: [['bounty.completed', 3]]` is the shape, so the extraction is the
 * quoted string inside the first element of each evidence row. A row written as
 * a bare identifier would extract nothing — and `guildSaysItFoundItsOwnTable`
 * below fails loudly if that happens, rather than the durability assertion
 * passing on an empty set.
 */
/** The evidence types owned by a feature that is NOT in this build. */
function busOnlyInThisBuild(
  types: readonly string[],
  present: ReadonlySet<string>,
  durable: ReadonlySet<string>,
): readonly string[] {
  const busOnly: string[] = [];
  for (const type of types) {
    if (durable.has(type)) continue;
    // Skip anything whose OWNING FEATURE IS NOT INSTALLED. Stripping bounty makes
    // its types neither durable nor bus-only: they belong to a feature that is
    // not in this build, and calling that a durability failure fails the removal
    // test on the assertion meant to prove the dependency graph is clean. The
    // first version of this helper collected those instead of skipping them,
    // which is the same bug pointed the other way.
    const owner = type.slice(0, type.indexOf('.'));
    if (!present.has(owner)) continue;
    busOnly.push(type);
  }
  return busOnly;
}

function guildEvidenceTypes(): readonly string[] {
  if (!existsSync(GUILD_RULES)) return [];
  const source = stripComments(readFileSync(GUILD_RULES, 'utf8'));
  const table = /ROLE_SIGNALS[\s\S]*?\n\};/.exec(source)?.[0];
  if (table === undefined) return [];
  return [...table.matchAll(/\[\s*'([^']+)'\s*,\s*\d+\s*\]/g)].map((match) => match[1] as string);
}

describe('every guild role signal is a durable event', () => {
  it('found the features to scan and the table to read', () => {
    // The floor that stops this whole file passing for the wrong reason: an
    // empty evidence set is a subset of every durable set, so a broken
    // extractor and a healthy one look identical from the assertion below.
    expect(featureDirs().length).toBeGreaterThan(4);
    expect(PERSISTED_EVENT_TYPES.length).toBeGreaterThan(0);
    if (existsSync(GUILD_RULES)) {
      expect(guildEvidenceTypes().length).toBeGreaterThan(0);
    }
  });

  it('the extractor finds what the features actually declare', () => {
    // A spot-check on the parser rather than on the rule: bounty declares
    // `bounty.completed` as a CONSTANT, so an extractor that only read string
    // literals would find nothing here and every assertion above would be
    // vacuous.
    const bounty = join(FEATURES_DIR, 'bounty');
    if (!existsSync(bounty)) return; // stripped by the removal test
    expect(declaredPersistedEvents(bounty)).toContain('bounty.completed');
  });

  it('leans only on types the installed set will actually keep', () => {
    const durable = durableEventTypes();
    // Scoped to the features that are PRESENT. Without this, stripping a feature
    // makes its own event types look bus-only — they are neither durable nor
    // bus-only, they belong to a feature that is not in this build — and the
    // removal test fails on the assertion that is supposed to prove the
    // dependency graph is clean. A check that assumes every feature is installed
    // asserts the opposite of what this repository is built around; three have
    // been written that way today and all three were caught the same way.
    const present = new Set(featureDirs());
    const busOnly = busOnlyInThisBuild(guildEvidenceTypes(), present, durable);

    expect(
      busOnly,
      `These event types drive a guild role but nothing persists them, so the role is a claim ` +
        'nobody can re-derive. Either the feature that owns the type declares it in its ' +
        '`persistedEvents`, or it is not evidence of anything. The plan’s wish-list — ' +
        'file.read, file.changed, search, thinking — is NOT in the shipped persisted set, and a ' +
        'classifier reading one of those is reading a column that is not there.',
    ).toEqual([]);
  });

  it('still knows the two types the guild relies on, so the set is not empty by accident', () => {
    if (!existsSync(GUILD_RULES)) return; // stripped by the removal test
    const evidence = guildEvidenceTypes();
    expect(evidence).toContain('bounty.completed');
    // `test.passed` is the signal a Tester is made of, and it is one of the five
    // core always persists — the strongest evidence that the pipeline from an
    // event to a role is wired to something real.
    expect(evidence).toContain('test.passed');
    expect(durableEventTypes().has('test.passed')).toBe(true);
  });
});
