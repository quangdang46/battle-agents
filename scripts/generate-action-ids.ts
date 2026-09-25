import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Assembles every feature's action ids into one union.
 *
 * Why a generator rather than a hand-written list: the set of registered
 * actions is decided at runtime by independently built packages, so no type the
 * compiler can see is a function of it. Generating the union from the features
 * at build time is the only way `act()` can stop accepting a string that names
 * nothing.
 *
 * The generated file imports NOTHING. It is a list of string literals, which is
 * what lets packages/api consume it without depending on a feature — the
 * layering rules forbid that, and a generated file that named its sources would
 * smuggle the dependency through the back door. If this file ever grows an
 * import, the architecture check will find it, which is the point.
 *
 * Run by `pnpm codegen`. The output is committed, because a generated file that
 * only exists after a build is a file whose absence nobody notices.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = join(REPO_ROOT, 'packages/protocol/src/generated/action-ids.ts');
const FEATURES_DIR = join(REPO_ROOT, 'packages/features');

/** Every feature's action ids, in one place the generator reads. */
const MANIFESTS: Readonly<Record<string, readonly string[]>> = {
  agent: AGENT_ACTION_IDS,
  quest: QUEST_ACTION_IDS,
  progression: PROGRESSION_ACTION_IDS,
  reputation: REPUTATION_ACTION_IDS,
  social: SOCIAL_ACTION_IDS,
};

/**
 * Every feature that declares an action-id manifest on disk, discovered rather
 * than assumed.
 *
 * MANIFESTS above is a hand-written list, and a hand-written list is the hole
 * this whole generator exists to close. A fifth feature adds
 * `BOUNTY_ACTION_IDS` to its manifest, registers it, and ships — and the union
 * silently omits it, because nothing here knows the feature exists. `act()`
 * then rejects a legitimate id at runtime, and the type-level guarantee this
 * file buys quietly stops covering that feature. Worse, the failure is invisible
 * to a staleness check: codegen reproduces the same omission, so a gate that
 * runs codegen and diffs the result is green on a union missing a whole feature.
 *
 * Discovery does not replace the static imports above — those are what give the
 * values their types, and a computed import would give up that for a check that
 * can be a preflight instead. It asserts the two agree, loudly, before anything
 * is written.
 */
function discoverManifestOwners(): Map<string, string> {
  const owners = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(FEATURES_DIR);
  } catch {
    return owners;
  }
  for (const entry of entries) {
    const manifest = join(FEATURES_DIR, entry, 'src/manifest.ts');
    if (!existsSync(manifest)) continue;
    const source = readFileSync(manifest, 'utf8');
    for (const match of source.matchAll(/export const (?<actionIds>[A-Z0-9_]+)_ACTION_IDS\b/g)) {
      // The capture group is `string | undefined` under noUncheckedIndexedAccess
      // even though the pattern guarantees it. A named group makes the guarantee
      // part of the type instead of something the reader has to take on trust.
      const constant = match.groups?.['actionIds'];
      if (constant === undefined) continue;
      // Keyed by the FEATURE, which is how MANIFESTS is keyed. The constant name
      // is carried along only so the error can name what to go and add.
      owners.set(entry, constant);
    }
  }
  return owners;
}

function assertEveryManifestIsRegistered(): void {
  const discovered = discoverManifestOwners();
  if (discovered.size === 0) {
    // A glob that matches nothing is indistinguishable from a clean tree, and
    // that is the failure this guard exists to catch.
    throw new Error(
      'codegen: no feature manifest declaring *_ACTION_IDS was found under ' +
        'packages/features. The discovery step is not seeing the tree, so it ' +
        'cannot catch a feature that was never registered.',
    );
  }
  const missing = [...discovered].filter(([feature]) => !(feature in MANIFESTS));
  if (missing.length > 0) {
    throw new Error(
      'codegen: these features declare action ids but are not registered in ' +
        'MANIFESTS, so their ids would be missing from the union and act() ' +
        'would reject them at runtime:\n' +
        missing
          .map(
            ([feature, name]) =>
              `  - ${feature} (${name}_ACTION_IDS, packages/features/${feature})`,
          )
          .join('\n') +
        '\nAdd the import and the entry, then run pnpm codegen again.',
    );
  }
  const stale = Object.keys(MANIFESTS).filter((feature) => !discovered.has(feature));
  if (stale.length > 0) {
    throw new Error(
      'codegen: MANIFESTS registers features that declare no action-id manifest ' +
        'on disk, so the union is describing something that is not there:\n' +
        stale.map((feature) => `  - ${feature} (packages/features/${feature})`).join('\n'),
    );
  }
}

const banner = `/**
 * GENERATED FILE — do not edit. Run \`pnpm codegen\` instead.
 *
 * The action ids this build can dispatch, assembled from each feature's manifest
 * at build time. It exists because the set is decided at runtime by
 * independently built packages, so nothing the compiler can see is a function of
 * it — and a union assembled by hand is a union that was correct the day it was
 * written.
 *
 * No imports, on purpose. packages/api consumes this without depending on a
 * feature, which the layering rules forbid and which a generated file that named
 * its sources would route around.
 *
 * The ids are real and checked. The input and output shapes are not here yet:
 * each feature has to declare its own payloads first, and emitting placeholder
 * helpers that resolve to unknown would be a union that looks typed and is not.
 */`;

function unionOf(names: readonly string[]): string {
  return names.map((name) => `  | ${JSON.stringify(name)}`).join('\n');
}

function main(): void {
  assertEveryManifestIsRegistered();
  const byFeature = Object.entries(MANIFESTS)
    .map(
      ([feature, ids]) =>
        `/** ${feature} */\nexport type ${camel(feature)}ActionId =\n${unionOf(ids)};`,
    )
    .join('\n\n');

  const every = [...new Set(Object.values(MANIFESTS).flat())].sort();
  const duplicates = every.length - new Set(every).size;

  const body = `${banner}

${byFeature}

/** Every action id in this build, sorted. The type \`act()\` is checked against. */
export type RegisteredActionId =
${unionOf(every)};

/**
 * Whether a string names an action this build registers.
 *
 * The narrowing a dynamic caller needs. Without it, a caller holding a string
 * from a URL or a command line has to either cast to the union — which moves the
 * check rather than performing it — or give up the compile-time guarantee
 * entirely by widening act() to accept any string. Narrowing here keeps both:
 * the surface stays five primitives, and the call after the guard is typed.
 */
export function isRegisteredActionId(value: string): value is RegisteredActionId {
  return (REGISTERED_ACTION_IDS as readonly string[]).includes(value);
}

export const REGISTERED_ACTION_IDS: readonly RegisteredActionId[] = [
${every.map((name) => `  ${JSON.stringify(name)},`).join('\n')}
];

`;

  if (duplicates > 0) {
    throw new Error(
      `${duplicates} action id(s) are declared by more than one feature. An id is ` +
        'the dispatch key, so a duplicate means one feature silently answers for another.',
    );
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, body);
  // Format the output before anyone looks at it. The generated file is
  // committed, and this repository's own `pnpm lint` is `prettier --check .`,
  // so an unformatted artifact fails the gate on style while reading like a
  // real drift. Worse, it makes the freshness check ambiguous: "does codegen
  // reproduce the committed file" has two answers — ids or quoting style — and
  // only one of them is the question anyone is asking. Formatting here means
  // codegen's output is what gets committed, and the comparison has exactly one
  // thing left to be about.
  execFileSync('npx', ['--no-install', 'prettier', '--write', OUTPUT], {
    stdio: 'ignore',
  });
  process.stdout.write(
    `codegen: ${every.length} action id(s) across ${Object.keys(MANIFESTS).length} feature(s) -> ${OUTPUT}\n`,
  );
}

function camel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Imported after the helpers so the "no imports in the OUTPUT" rule is about
// the generated file, not about this one, which legitimately reads the features.
import { AGENT_ACTION_IDS } from '../packages/features/agent/src/manifest.js';
import { PROGRESSION_ACTION_IDS } from '../packages/features/progression/src/manifest.js';
import { QUEST_ACTION_IDS } from '../packages/features/quest/src/manifest.js';
import { REPUTATION_ACTION_IDS } from '../packages/features/reputation/src/manifest.js';
import { SOCIAL_ACTION_IDS } from '../packages/features/social/src/manifest.js';

main();
