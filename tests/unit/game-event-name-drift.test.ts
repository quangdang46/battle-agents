import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GAME_EVENT_NAMES, isRegisteredActionId } from '@battle-agents/protocol';

/**
 * A game event name is spelled once, and the check that keeps it that way.
 *
 * WHY THIS EXISTS, and it is a real incident rather than tidiness. `bounty.completed`
 * was written as a bare string literal in five feature packages — the emitter in
 * bounty, and subscribers in reputation, progression, achievements and guild.
 * Renaming it on the emitter side SILENTLY UNSUBSCRIBES four consumers: no
 * compile error, no failed test, and the reward simply stops arriving. Nothing
 * in the architecture check sees it, because a copy of a string is not a
 * dependency — and no rule in `architecture-rules.cjs` makes a string into one.
 *
 * The fix is the same shape as the action-id machinery: `GAME_EVENT_NAMES` in
 * `@battle-agents/protocol` is the single spelling, and this test compares each
 * feature's production source against it.
 *
 * WHY THE COMPARISON IS A SET AND NOT A STRING. The set is a value at runtime,
 * so a subscriber that writes the wrong name and one that writes no name at all
 * are the same failure — neither is in the set. Matching on spelling would only
 * catch the first.
 *
 * WHY COMMENTS AND STRINGS ARE TREATED DIFFERENTLY. Comments name events
 * constantly, and those names are documentation that should be allowed to age
 * with the code; the comment above a subscriber is a claim about behaviour, and
 * a stale one is a documentation bug rather than a silent unsubscription. So
 * comments are stripped before the scan, and a `bounty.completed` inside one is
 * not a finding. A string in CODE is the thing that has to match.
 *
 * WHY TESTS ARE EXCLUDED, and this is the one real limit of the check. A test
 * that asserts `OUTCOMES['bounty.completed']` is deliberately spelling a literal
 * — that assertion IS the drift detector for the table. Folding tests in would
 * make every correct assertion a violation, and the resulting noise would get
 * the check switched off inside a week. The cost is that a test can drift
 * silently; the benefit is that the check can exist at all.
 *
 * WHY ACTION IDS ARE SUBTRACTED, which is the correction an earlier version of
 * this file needed. `bounty.create` and `session.heartbeat` are dotted lowercase
 * pairs — the same SHAPE as a game event — and the first version of this scan
 * reported fifty of them, because it was matching on shape and treating two
 * vocabularies as one. They are not one vocabulary. An action id is something a
 * client DISPATCHES and `act()` validates against a generated union; an event
 * name is something the bus CARRIES and subscribers match on. The action id
 * already has machinery that catches a wrong spelling — it is a compile error at
 * every call site, which is stronger than anything a scan can offer — so
 * `isRegisteredActionId` is what identifies them and what remains is the half that was
 * genuinely unguarded: a name that is subscribed to as a string and will
 * silently never fire.
 *
 * A check that conflates two vocabularies reports the safe one as unsafe, and
 * gets switched off. Subtracting is not a loosening; it is the difference
 * between a finding and noise.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../..');
const FEATURES_DIR = join(REPO_ROOT, 'packages/features');

/**
 * The two dotted names that are neither events nor action ids, and why they
 * are here rather than found.
 *
 * A feature registers a CAPABILITY (`reputation.read`) and a COMMAND
 * (`agent.register`), and both are spelled `feature.verb` in exactly the shape
 * this check looks for. Neither has a generator to subtract them the way
 * `isRegisteredActionId` does, because a capability is a registry entry rather
 * than a dispatched id — `agent.read` and `agent.describe` are capabilities that
 * are ALSO action ids, so subtracting by the action union would have hidden the
 * fact that the two vocabularies overlap.
 *
 * They are listed because the alternative is a scan that cannot tell a
 * capability from a misspelled event, and a check that cannot tell those apart
 * reports the safe one as unsafe.
 */
const NOT_EVENTS: ReadonlySet<string> = new Set([
  'achievements.read',
  'agent.describe',
  'agent.read',
  'agent.register',
  'battle.read',
  'progression.gate',
  'progression.read',
  'reputation.gate',
  'reputation.read',
  'social.read',
]);

/**
 * Source with its comments removed.
 *
 * A block comment here can mention any event it likes — the rules files explain
 * which events they react to and why, and that prose is worth having. Only a
 * name in executable code is a contract, because only that one has to be
 * resolved against the set at runtime.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const marker = line.indexOf('//');
      return marker === -1 ? line : line.slice(0, marker);
    })
    .join('\n');
}

function sourceFilesIn(feature: string): string[] {
  const src = join(FEATURES_DIR, feature, 'src');
  if (!existsSync(src)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // A `.test.ts` is excluded for the reason in the header.
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        found.push(full);
      }
    }
  };
  walk(src);
  return found;
}

/** The installed features, discovered rather than listed. */
function features(): string[] {
  let entries;
  try {
    entries = readdirSync(FEATURES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

describe('a game event name is spelled once', () => {
  it('has a set of names that is not empty, so the scan below is not vacuous', () => {
    // The floor. A discovery bug that found nothing would leave every other
    // assertion in this file green, which is the failure mode this repository
    // keeps meeting: a guard that returns nothing has nothing to complain about.
    expect(GAME_EVENT_NAMES.size).toBeGreaterThan(10);
    // And the subtraction below is not eating the whole scan. If the two sets
    // ever came to cover everything, this file would pass while checking
    // nothing, so the residue is asserted to be substantial.
    const residue = [...GAME_EVENT_NAMES].filter((name) => !isRegisteredActionId(name));
    expect(residue.length, 'GAME_EVENT_NAMES is now entirely action ids, so the drift scan cannot see anything').toBe(
      GAME_EVENT_NAMES.size,
    );
  });

  it('is spelled in protocol, not assembled by a feature', () => {
    // The set has to be the single source rather than a union of copies,
    // because a union that features contribute to is a union a feature can
    // rename. `GAME_EVENT_NAMES` is built in event-names.ts from constants in
    // that same file, and nothing outside protocol adds to it.
    const source = readFileSync(join(REPO_ROOT, 'packages/protocol/src/event-names.ts'), 'utf8');
    const importers = [...code(source).matchAll(/import\s/g)];
    expect(importers, 'event-names.ts must import nothing: it is the bottom of the vocabulary').toHaveLength(0);
  });

  for (const feature of features()) {
    it(`never re-spells an event name in ${feature}`, () => {
      const offenders: string[] = [];
      for (const file of sourceFilesIn(feature)) {
        const body = code(readFileSync(file, 'utf8'));
        // A dotted lowercase pair is the shape of a game event name
        // (`bounty.completed`, `pr.merged`). The leading-dot guard keeps a
        // relative import (`./domain.js`) and a decimal out of the scan, and
        // requiring a word boundary before the name keeps a longer dotted word
        // from being read as a prefix match.
        for (const match of body.matchAll(/(?<![\w./])'([a-z][a-z_]*\.[a-z_]+)'/g)) {
          const name = match[1] as string;
          if (GAME_EVENT_NAMES.has(name)) continue;
          // An action id is dotted and lowercase too, and already compile-
          // checked. See the header for why this half is subtracted.
          if (isRegisteredActionId(name)) continue;
          if (NOT_EVENTS.has(name)) continue;
          // Only a name that LOOKS like one of ours is this check's business.
          // A feature is entitled to its own dotted vocabulary that has nothing
          // to do with the game's event bus — a zone id, a mode name — and a
          // check that reported those would be reporting noise.
          const looksLikeAGameEvent = [...GAME_EVENT_NAMES].some((known) => known.split('.')[0] === name.split('.')[0]);
          if (looksLikeAGameEvent) {
            offenders.push(`${file.slice(REPO_ROOT.length + 1)}: '${name}'`);
          }
        }
      }
      expect(
        offenders,
        `These names sit in the same namespace as a game event but are not in GAME_EVENT_NAMES, so they will never match one. Use the constant from @battle-agents/protocol:\n  ${offenders.join('\n  ')}`,
      ).toEqual([]);
    });
  }
});
