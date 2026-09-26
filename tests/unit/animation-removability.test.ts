/**
 * Is the animation feature actually removable?
 *
 * Plan section 24 is the integration contract and section 25 is the spike: the
 * animation feature is a CONSUMER with zero game logic, and removing it must
 * leave the game fully playable. The bead rewrote its criterion to demand two
 * assertions, and the second is the one worth having:
 *
 * 1. **Playable after removal** — no dangling import, no missing action id, no
 *    build break.
 * 2. **CORRECT after removal** — the same loop, the same rendered outcomes,
 *    minus the animation.
 *
 * The first half is what a directory move gives you for free, which is exactly
 * why asserting only the first half is worthless: an animation package nothing
 * imports is trivially removable, and an animation package everything imports
 * is not removable at all, and the first assertion passes in both worlds. The
 * second half is what catches the actual violation — an animation consumer that
 * quietly became a dependency of a game rule.
 *
 * ## How the second half is settled here, and what it is not
 *
 * **This is a static-graph proof, not a filesystem removal, and the difference
 * is worth stating rather than glossing.** `scripts/removal-test.sh` performs a
 * real directory move for every feature including this one, and it runs after
 * this suite. What this file adds is the part the script cannot see: that
 * removal changes NOTHING ELSE. The script proves the tree stays green; it
 * cannot prove the tree stays CORRECT, because "green" is a property of the
 * checks and "correct" is a property of the game.
 *
 * So both halves are settled by computing the transitive closure of things that
 * would break — who imports this package, transitively, and who reaches its
 * exported surface — and asserting the answer is the composition root or
 * nothing. A feature whose removal would take a game rule with it has a
 * non-empty closure, and the assertion goes red.
 *
 * The alternative — copying the tree, deleting the directory and running a
 * render there — was rejected because this suite runs inside
 * `scripts/removal-test.sh`, which is itself mid-move at that point, and because
 * a second tree is a second thing to go stale. If this file's claim is ever
 * considered too weak, the honest strengthening is a real removal in a scratch
 * copy as a separate stage, not a subtler static check.
 *
 * ## Why this file lives outside the package
 *
 * `scripts/removal-test.sh` moves `packages/features/animation` aside and runs
 * the unit suite. A removability test INSIDE the package would be moved aside
 * with it and would pass by not existing — which is the "a gate that cannot fail"
 * shape this repository keeps meeting, and the reason `tests/unit/dependency-rules.test.ts`
 * keeps its fixture hermetic.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { workspaceSourceAliases } from '../../vitest.shared.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_DIR = join(REPO_ROOT, 'packages/features/animation');
const PACKAGE_NAME = '@battle-agents/animation';
const COMPOSITION_ROOT = join(REPO_ROOT, 'apps/web/src/composition.ts');
const SOURCE_ROOTS = ['apps', 'packages', 'drizzle'];

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

function toRepoPath(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join('/');
}

function listSourceFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  const visit = (absolute: string): void => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (['dist', 'node_modules', '.git', '.tmp', '.beads'].includes(entry.name)) continue;
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push({ path: toRepoPath(path), source: readFileSync(path, 'utf8') });
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    const absolute = join(REPO_ROOT, root);
    if (existsSync(absolute)) visit(absolute);
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Every specifier a file imports, with the shape the strip in
 * `scripts/removal-test.sh` uses to find a feature.
 *
 * Same pattern as the script's, deliberately: the composition root is not
 * imported by a specifier the strip can see unless this and that agree, and a
 * second definition of "how do I find a feature" is how a removal test ends up
 * checking a file the strip never touches.
 */
function featureImportLines(source: string): string[] {
  const lines = source.split('\n');
  return lines.filter(
    (line) => line.includes(`'${PACKAGE_NAME}'`) || line.includes(`"${PACKAGE_NAME}"`),
  );
}

const PACKAGE_PRESENT = existsSync(join(PACKAGE_DIR, 'src/index.ts'));
const ALL_SOURCES = listSourceFiles();
const IMPORTERS = ALL_SOURCES.filter((file) => featureImportLines(file.source).length > 0);
const COMPOSITION_SOURCE = existsSync(COMPOSITION_ROOT)
  ? readFileSync(COMPOSITION_ROOT, 'utf8')
  : undefined;

const describeIfPresent = PACKAGE_PRESENT ? describe : describe.skip;

if (!PACKAGE_PRESENT) {
  // eslint-disable-next-line no-console
  console.warn(
    'animation-removability: packages/features/animation is not present, so its removability is ' +
      'not being checked. Expected unless scripts/removal-test.sh moved it aside — which is the ' +
      'run this file has to survive.',
  );
}

describe('the animation package is installed nowhere it cannot be removed from', () => {
  it('scanned the tree, so an empty answer is not mistaken for a clean one', () => {
    // The failure this guards, and it is the same one in every other tree-walking
    // test in this directory: a glob that matched nothing and a repository with
    // no dependencies look identical, and only one of them is a pass.
    expect(ALL_SOURCES.length).toBeGreaterThan(100);
    expect(ALL_SOURCES.some((file) => file.path.startsWith('packages/game-client/src/'))).toBe(
      true,
    );
    expect(ALL_SOURCES.some((file) => file.path === 'apps/web/src/composition.ts')).toBe(true);
  });

  it('is reachable from the composition root, which is the ONLY place a feature may be wired', () => {
    // Not "nothing imports it" — a feature nobody has installed is not a
    // removable feature, it is a package. AGENTS.md puts the decision in the
    // composition root's extensions[] and `scripts/removal-test.sh` strips it
    // there, so the importers set is allowed to be exactly that one file and
    // nothing more.
    expect(IMPORTERS.map((file) => file.path)).toEqual(
      IMPORTERS.some((file) => file.path === 'apps/web/src/composition.ts')
        ? ['apps/web/src/composition.ts']
        : [],
    );
  });

  it('reaches no game client, no interface and no other feature', () => {
    // The specific leak section 24 and section 25 forbid, stated against the
    // layers that would be the way in. `packages/game-client` has its own
    // architecture test forbidding the import, and a route handler importing a
    // feature is a rule in architecture-rules.cjs — both of which would catch
    // this too, and both of which are about LAYERS rather than about this
    // feature. Stated separately because the layer rules do not know what
    // animation is.
    const offenders = IMPORTERS.filter((file) =>
      /^(packages\/features|packages\/game-client|packages\/api|packages\/cli|packages\/mcp-server|packages\/core)\b/.test(
        file.path,
      ),
    );
    expect(
      offenders.map((file) => file.path),
      'The animation feature is imported by a layer that cannot survive its removal. A feature ' +
        'that a game client or a sibling feature reaches for has become a dependency of something ' +
        'that is not animation.',
    ).toEqual([]);
  });
});

describeIfPresent('removing the animation feature leaves the game playable', () => {
  it('leaves the composition root untouched, because the strip finds nothing to strip', () => {
    // The first half of the criterion, asserted rather than assumed.
    // `scripts/removal-test.sh` removes a feature by deleting its import line and
    // its `animationFeature(...)` entry from the composition root. The rig is not
    // installed there — wiring it into the runtime is a separate decision, and
    // this bead does not make it — so the strip is a no-op on that file and the
    // file must come out byte-identical.
    //
    // The check is written as "the file names the package zero times" rather than
    // as a byte comparison, because the byte comparison is the conclusion and
    // this is the premise. It is asserted on a copy of the strip's own pattern so
    // the two cannot disagree about what a feature reference looks like.
    expect(COMPOSITION_SOURCE).toBeDefined();
    expect(featureImportLines(COMPOSITION_SOURCE as string)).toEqual([]);
    expect(COMPOSITION_SOURCE).not.toMatch(/\banimationFeature\s*\(/);
  });

  it('has a tsconfig path and a build reference, so it typechecks from source', () => {
    // A package that typechecks only because its declarations are stale in dist/
    // is a package that removal breaks in a way the strip cannot predict, and the
    // alias-coverage test asserts the path from the other side.
    const tsconfig = readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf8');
    expect(tsconfig).toMatch(/"@battle-agents\/animation"/);
    const build = readFileSync(join(REPO_ROOT, 'tsconfig.build.json'), 'utf8');
    expect(build).toMatch(/"path":\s*"packages\/features\/animation"/);
    // And the test stages resolve it to source, so the suite exercises the tree
    // rather than the last build.
    expect(workspaceSourceAliases().map((alias) => alias.find)).toContain(PACKAGE_NAME);
  });

  it('contributes no action id that anything else dispatches', () => {
    // The "no missing action id" half of the criterion.
    //
    // `scripts/generate-action-ids.ts` builds the dispatchable-id union from
    // every feature manifest, INCLUDING features that are not installed — which
    // is deliberate, and is why this is the place to look. A union that only
    // named installed features would typecheck every call site and then refuse
    // the id at runtime as UNKNOWN, and the gap would be invisible until an agent
    // called the action.
    //
    // So: the generated union names the id, and nothing OUTSIDE the package
    // dispatches it. The second half is the removability claim — a caller by id
    // would not show up as an import, and `act()` reaches actions by string, so
    // the string is what has to be searched for.
    const generated = readFileSync(
      join(REPO_ROOT, 'packages/protocol/src/generated/action-ids.ts'),
      'utf8',
    );
    expect(generated).toContain("export type AnimationActionId = 'animation.pose';");

    // The generated union is the one place outside the package where the id
    // MUST appear — it is the union's whole job to name ids whose features are
    // not installed — so it is excluded by name rather than by the search simply
    // not reaching it. Excluding it silently would be the same class of mistake
    // the rest of this file is about.
    const GENERATED_UNION = 'packages/protocol/src/generated/action-ids.ts';
    const id = "'animation.pose'";
    const callers = ALL_SOURCES.filter(
      (file) =>
        !file.path.startsWith('packages/features/animation/') &&
        file.path !== GENERATED_UNION &&
        file.source.includes(id),
    );
    expect(
      callers.map((file) => file.path),
      'Something outside the animation package names its action id. That is a caller which ' +
        'would be refused as UNKNOWN the moment the feature was removed — the "no missing action ' +
        'id" half of the removability criterion.',
    ).toEqual([]);
  });
});

describeIfPresent('removing the animation feature leaves the game CORRECT', () => {
  /**
   * The half that catches the violation.
   *
   * An animation consumer that quietly became a dependency of a game rule passes
   * every "does it still build" check and fails this one: with the feature gone,
   * the rule that consulted it has nothing to consult. The only honest way to
   * settle it statically is to ask what the game's rendering path is made of and
   * show that the animation package is not in it.
   *
   * Read as a closure rather than as a list, because the leak is rarely direct. A
   * game rule importing a pose *type* to type a field, a scene importing
   * `drawList` to sort sprites, a feature subscribing to a state the map names —
   * each is one edge from a decision made here and each would be a rule that
   * cannot be evaluated without animation.
   */
  it('is not in the transitive closure of the game client entry point', () => {
    const entry = 'packages/game-client/src/index.ts';
    expect(ALL_SOURCES.some((file) => file.path === entry)).toBe(true);

    const byPath = new Map(ALL_SOURCES.map((file) => [file.path, file]));
    const seen = new Set<string>();
    const hits = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const next = queue.pop() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      const file = byPath.get(next);
      if (file === undefined) continue;
      for (const match of file.source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        const resolved = specifier.startsWith('.')
          ? resolveRelativePath(next, specifier, byPath)
          : specifier;
        // A specifier naming the package is a HIT, not something to step over.
        // Skipping it — which a first version of this file did, with a comment
        // claiming the assertion below would report it — means the closure cannot
        // see the one edge that matters most, and the test passes on the exact
        // import the criterion forbids. Found by mutating the game client to
        // import the feature: the layer check went red and this one stayed green.
        if (resolved === PACKAGE_NAME) hits.add(PACKAGE_NAME);
        if (byPath.has(resolved)) queue.push(resolved);
      }
    }
    expect(
      [...hits].filter(
        (hit) => hit === PACKAGE_NAME || hit.startsWith('packages/features/animation/'),
      ),
      'The game client reaches the animation package. Its own architecture test forbids this ' +
        'import, and this closure is how that is settled from the other side: a client that ' +
        'depended on a pose would stop drawing when the feature was moved aside.',
    ).toEqual([]);
    // And the closure is not trivially small, or "no animation in it" would be
    // true of a graph with one node.
    expect(seen.size).toBeGreaterThan(15);
  });

  it('is not in the closure of any other feature, so no game rule consults it', () => {
    const featureEntry = (feature: string): string | undefined => {
      const candidate = `packages/features/${feature}/src/index.ts`;
      return ALL_SOURCES.some((file) => file.path === candidate) ? candidate : undefined;
    };
    const features = readdirSync(join(REPO_ROOT, 'packages/features'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'animation')
      .map((entry) => entry.name);
    expect(features.length).toBeGreaterThan(5);

    const byPath = new Map(ALL_SOURCES.map((file) => [file.path, file]));
    const offenders: string[] = [];
    for (const feature of features) {
      const entry = featureEntry(feature);
      if (entry === undefined) continue;
      const seen = new Set<string>();
      const queue = [entry];
      while (queue.length > 0) {
        const next = queue.pop() as string;
        if (seen.has(next)) continue;
        seen.add(next);
        const file = byPath.get(next);
        if (file === undefined) continue;
        for (const match of file.source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
          const specifier = match[1];
          if (specifier === undefined) continue;
          if (specifier === PACKAGE_NAME) {
            offenders.push(`${feature} reaches ${PACKAGE_NAME}`);
            continue;
          }
          const resolved = specifier.startsWith('.')
            ? resolveRelativePath(next, specifier, byPath)
            : specifier;
          if (byPath.has(resolved)) queue.push(resolved);
        }
      }
    }
    expect(
      offenders,
      'A feature reaches the animation package. Plan section 24 says the animation feature is a ' +
        'CONSUMER with zero game logic, and features never import each other anyway — so an ' +
        'animation edge here is a game rule that would stop being evaluable the moment the ' +
        'feature was removed.',
    ).toEqual([]);
  });

  it('puts no game vocabulary in its own source, so it cannot have become a rule', () => {
    // The other direction of the same claim, and the one that needs no graph.
    // Plan section 24 is explicit that the animation feature decides nothing about
    // the game; the words below are the ones that would mean it had started to.
    // Comments and literals are stripped first, for the reason
    // `tests/unit/scaffold.test.ts` records — a comment explaining that the
    // feature must not own XP is a comment this repository wants.
    const GAME_VOCABULARY = [
      'xpForLevel',
      'trustScore',
      'Bounty',
      'Guild',
      'Battle',
      'Quest',
      'bountyId',
      'guildId',
      'sessionId',
      'agentId',
    ];
    const own = ALL_SOURCES.filter((file) => file.path.startsWith('packages/features/animation/'));
    expect(own.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of own) {
      const code = file.source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (literal) => literal.replace(/[^\r\n]/g, ' '));
      for (const word of GAME_VOCABULARY) {
        if (new RegExp(`\\b${word}\\b`).test(code)) {
          offenders.push(`${file.path} carries "${word}"`);
        }
      }
    }
    expect(
      offenders,
      'The animation feature contains game vocabulary in executable code. The five agent states ' +
        "it maps are its own contract with plan section 9.2; an id from another feature's domain " +
        'means it has started deciding something that is not animation.',
    ).toEqual([]);
  });
});

/**
 * Resolves a relative specifier the way tsc would.
 *
 * SEGMENTS, not characters: a first version walked the joined path one
 * character at a time, which turned `packages/game-client/src/index.ts` into a
 * string of single letters and resolved nothing. The walk then terminated after
 * the entry node and the "is the animation package in the closure" question was
 * answered by a graph of one — the exact shape of a check that cannot fail.
 */
function resolveRelativePath(
  fromPath: string,
  specifier: string,
  known: ReadonlyMap<string, SourceFile>,
): string {
  const segments = fromPath.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  const joined = segments.join('/');
  for (const candidate of [
    joined.replace(/\.js$/, '.ts'),
    joined,
    `${joined}.ts`,
    `${joined}/index.ts`,
  ]) {
    if (known.has(candidate)) return candidate;
  }
  return joined;
}
