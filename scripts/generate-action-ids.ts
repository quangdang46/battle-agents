import { mkdirSync, writeFileSync } from 'node:fs';
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

/** Every feature's action ids, in one place the generator reads. */
const MANIFESTS: Readonly<Record<string, readonly string[]>> = {
  agent: AGENT_ACTION_IDS,
  quest: QUEST_ACTION_IDS,
  progression: PROGRESSION_ACTION_IDS,
  reputation: REPUTATION_ACTION_IDS,
};

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

main();
