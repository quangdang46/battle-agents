import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A feature's action ids and its action definitions are two files agreeing.
 *
 * Nothing checked that they agreed, and the failure mode is quiet in the worst
 * way. `scripts/generate-action-ids.ts` reads each feature's `*_ACTION_IDS`
 * const and builds the RegisteredActionId union from it. `act()` then checks the
 * caller's id against BOTH that union and `runtime.actions()` — which come from
 * the feature's `actionDefs`. So a feature that adds an id to its manifest and
 * forgets the matching `defineAction` gets: an id that typechecks at every call
 * site, an entry in the generated union, a `discover` listing that advertises it
 * as available, and a runtime refusal naming it as UNKNOWN. Every gate is green
 * and the action does not exist.
 *
 * That is the same shape as the 8921 comment and the payout-intent CHECK — a
 * claim in one place that another place quietly contradicts — except those were
 * found by reading and this one is the DEFAULT outcome of adding a feature.
 *
 * Both directions are asserted. The reverse (an actionDef whose id is missing
 * from the manifest) is caught by `codegen-drift` refusing to emit a union that
 * omits a FEATURE, but that guard fires per feature and would not notice one
 * stray id inside a feature it already knows about.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const featuresDir = join(repoRoot, 'packages/features');

function manifestSource(feature: string): string | undefined {
  const path = join(featuresDir, feature, 'src', 'manifest.ts');
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function manifestIds(feature: string): string[] | undefined {
  const source = manifestSource(feature);
  if (source === undefined) return undefined;
  const block = /ACTION_IDS\s*=\s*\[([\s\S]*?)\]/.exec(source)?.[1];
  if (block === undefined) return undefined;
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

/**
 * `export const FOO = 'a.b'` — the const a defineAction refers to by name.
 *
 * Scanned across the whole package, not just the manifest: features declare the
 * constant next to the feature that uses it (SESSION_CREATE lives in
 * feature.ts, not manifest.ts), and reading only the manifest resolves nothing
 * and fails every feature for the wrong reason.
 */
function constValues(feature: string): Map<string, string> {
  const out = new Map<string, string>();
  const src = join(featuresDir, feature, 'src');
  if (!existsSync(src)) return out;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(/(?:export )?const ([A-Z0-9_]+)\s*=\s*'([^']+)'/g)) {
        out.set(`const:${match[1]}`, match[2] as string);
      }
    }
  };
  walk(src);
  return out;
}

/** Ids the feature actually defines a handler for, constants still unresolved. */
function definedIds(feature: string): string[] {
  const src = join(featuresDir, feature, 'src');
  if (!existsSync(src)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      // Comments are stripped BEFORE the distance is measured, because a comment
      // is not part of the object: battle.weights puts a three-line justification
      // between `id:` and `permissions:`, which pushed it past the window and made
      // the check report a real action as undefined. A guard that fails on
      // well-documented code gets switched off.
      const source = stripComments(readFileSync(full, 'utf8'));
      // Matched on `id:` FOLLOWED BY `permissions:`, not on the helper's name.
      // A feature may wrap defineAction — social's describeAction adds a
      // description, which defineAction will not take because core is frozen —
      // and a check that only recognises the literal call reads that as a feature
      // with no actions at all. `permissions` is what makes it an ActionDef.
      for (const match of source.matchAll(
        /id:\s*([A-Z0-9_]+|'[^']+'),[\s\S]{0,120}?permissions:/g,
      )) {
        const name = match[1] as string;
        found.push(name.startsWith("'") ? `lit:${name.slice(1, -1)}` : `const:${name}`);
      }
    }
  };
  walk(src);
  return found;
}

/** Same technique as scaffold.test.ts, for the same reason. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FEATURES = readdirSync(featuresDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => manifestIds(name) !== undefined);

describe('a feature defines every action it declares, and declares every action it defines', () => {
  it('found the features to check, so an empty scan cannot pass', () => {
    // A directory walk that finds nothing and a repository with no features look
    // identical from here, and only one of them is a pass.
    expect(FEATURES.length).toBeGreaterThan(4);
  });

  for (const feature of FEATURES) {
    it(`${feature}: every declared id has a matching action definition`, () => {
      const declared = manifestIds(feature) ?? [];
      const constants = constValues(feature);
      const defined = new Set(
        definedIds(feature).map((id) => {
          const resolved = constants.get(id) ?? id.replace(/^lit:/, '');
          return resolved;
        }),
      );

      const missing = declared.filter((id) => !defined.has(id));
      expect(
        missing,
        `${feature} declares ${missing.join(', ')} in its manifest but defines no action for it. ` +
          `The generator will put it in RegisteredActionId, every call site will typecheck, ` +
          `discover will advertise it, and act() will refuse it as UNKNOWN.`,
      ).toEqual([]);
    });
  }
});
