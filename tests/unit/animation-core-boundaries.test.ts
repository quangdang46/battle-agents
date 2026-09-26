/**
 * The animation core's boundaries, read off the module graph.
 *
 * Plan section 25 puts the spike behind one file — "engine emits Pose, renderer
 * consumes" — and section 9.3 says the reference's discipline is that the editor
 * and the player SHARE a core, which is only true if the core is genuinely
 * headless. Both are claims about IMPORTS, and both are the kind of claim that
 * stays green while being false: one convenience `document.createElement` in a
 * helper, or one `import { solveTwoBone }` in the renderer, and every unit test
 * in the package still passes. The pose on screen is identical either way.
 *
 * So these tests parse the package's own import graph. Not a grep of the barrel
 * file — the barrel re-exports everything, so a grep of it says nothing about
 * what a deep module reaches for — and not a grep of one file for a word, which
 * is the check this repository already got wrong four times.
 *
 * ## Why this file lives OUTSIDE the package
 *
 * `scripts/removal-test.sh` moves `packages/features/animation` aside and runs
 * the unit suite. A boundary test inside the package would be moved aside with it
 * and would report success by not existing. Both of the guards here are about
 * the package being PRESENT, so they have to be somewhere that survives its
 * absence — and they tolerate it not being there, the same way
 * `tests/unit/feature-package-isolation.test.ts` does and for the same stated
 * reason.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_DIR = join(REPO_ROOT, 'packages/features/animation');
const SRC_DIR = join(PACKAGE_DIR, 'src');

/** One resolved import edge, and whether every occurrence of it was a type import. */
interface Edge {
  readonly target: string;
  readonly typeOnly: boolean;
}

/** A module and everything it imports, resolved to paths relative to the repo. */
interface ModuleGraph {
  readonly files: readonly { readonly path: string; readonly source: string }[];
  /** Resolved import edges per file. */
  readonly edges: ReadonlyMap<string, readonly Edge[]>;
}

function toRepoPath(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join('/');
}

function sourceFilesUnder(dir: string): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  const visit = (absolute: string): void => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.test.ts')
      ) {
        files.push({ path: toRepoPath(path), source: readFileSync(path, 'utf8') });
      }
    }
  };
  visit(dir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Every import specifier in a file, with the two syntactic forms that matter.
 *
 * `import type` is collected alongside `import`: a type-only edge is still an
 * edge a reader of the graph would have to reason about, and a renderer that
 * imports a solver's TYPES has already coupled itself to the solver. Whether an
 * edge is a type edge is reported separately below, because that is the
 * difference between "cannot reach the solver at runtime" and "cannot read
 * about the solver at all", and the first is the claim that matters.
 */
// Both spellings that erase at compile time. `export type { X } from './y'`
// is included because it is the same claim as `import type` — it puts nothing in
// the emitted module — and a graph that classified it as a value edge would
// report a real coupling that does not exist.
const TYPE_EDGE = /(?:import|export)\s+type\s+[^;]*?from\s+['"]([^'"]+)['"];?/g;

function importSpecifiers(source: string): { specifier: string; typeOnly: boolean }[] {
  const found: { specifier: string; typeOnly: boolean }[] = [];

  for (const match of source.matchAll(TYPE_EDGE)) {
    if (match[1] !== undefined) found.push({ specifier: match[1], typeOnly: true });
  }

  // The value patterns run against the source with the type imports REMOVED.
  //
  // They have to be removed rather than filtered, because `import type { A } from
  // './x'` also matches a general `import ... from` pattern — and a general
  // pattern that reports a type import as a value edge makes every "no value edge
  // to" assertion in this file fail on a file that has none. That is the shape
  // of a check that reports the opposite of what it means, and it was the first
  // version of this file.
  const valuesOnly = source.replace(TYPE_EDGE, ' ');
  const valuePatterns: readonly RegExp[] = [
    /import\s+[^;]*?from\s+['"]([^'"]+)['"]/g,
    /export\s+(?:type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of valuePatterns) {
    for (const match of valuesOnly.matchAll(pattern)) {
      if (match[1] !== undefined) found.push({ specifier: match[1], typeOnly: false });
    }
  }
  return found;
}

/** Resolves a relative specifier to a repo path, the way tsc would. */
function resolveRelative(fromPath: string, specifier: string, known: ReadonlySet<string>): string {
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  for (const candidate of [base.replace(/\.js$/, '.ts'), base, `${base}.ts`, `${base}/index.ts`]) {
    if (known.has(candidate)) return candidate;
  }
  return base;
}

function buildGraph(): ModuleGraph {
  const files = sourceFilesUnder(SRC_DIR);
  const known = new Set(files.map((file) => file.path));
  const edges = new Map<string, Edge[]>();
  for (const file of files) {
    // Grouped by target, because the two syntactic patterns below both match
    // `import type ... from '...'`. Without the grouping the renderer's single
    // seam import appears twice and "the renderer has exactly one edge" fails on
    // a duplicate rather than on a real second dependency — which is the shape of
    // a check that cries wolf.
    const byTarget = new Map<string, boolean>();
    for (const { specifier, typeOnly } of importSpecifiers(file.source)) {
      const target = specifier.startsWith('.')
        ? resolveRelative(file.path, specifier, known)
        : specifier;
      if (!known.has(target)) continue;
      // Type-only only if EVERY occurrence was: a specifier imported as a value
      // anywhere is a value edge, which is the classification that decides
      // whether a consumer can reach it at runtime.
      byTarget.set(target, (byTarget.get(target) ?? true) && typeOnly);
    }
    edges.set(
      file.path,
      [...byTarget.entries()].map(([target, typeOnly]) => ({ target, typeOnly })),
    );
  }
  return { files, edges };
}

/** Every edge, whatever its kind. */
function targetsOf(graph: ModuleGraph, from: string): string[] {
  return (graph.edges.get(from) ?? []).map((edge) => edge.target);
}

/** Only the edges that survive compilation — a value import. */
function valueTargetsOf(graph: ModuleGraph, from: string): string[] {
  return (graph.edges.get(from) ?? []).filter((edge) => !edge.typeOnly).map((edge) => edge.target);
}

/** Everything reachable from a file, itself included. */
function reachableFrom(graph: ModuleGraph, start: string): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const target of targetsOf(graph, next)) queue.push(target);
  }
  return seen;
}

const PACKAGE_PRESENT = existsSync(join(SRC_DIR, 'index.ts'));
const GRAPH = PACKAGE_PRESENT ? buildGraph() : { files: [], edges: new Map() };
const PKG = 'packages/features/animation/src/';

/**
 * The modules the pipeline is made of, named as files.
 *
 * Spelled out rather than discovered, because a check that resolves the very
 * names it is asserting about is a check that cannot fail: rename `ik.ts` and a
 * discovered list follows it, while this list does not, and the guard is gone
 * rather than red. A guard that disappears with the thing it guards is the
 * failure this repository keeps paying for.
 */
const IK_MODULE = `${PKG}ik.ts`;
const EVALUATE_MODULE = `${PKG}evaluate.ts`;
const POSE_MODULE = `${PKG}pose.ts`;
const RENDER_MODULE = `${PKG}render.ts`;
const GUARDED = [IK_MODULE, EVALUATE_MODULE, POSE_MODULE, RENDER_MODULE];

const describePackage = PACKAGE_PRESENT ? describe : describe.skip;

if (!PACKAGE_PRESENT) {
  // Said out loud rather than left as a silent skip, because a skip nobody reads
  // is indistinguishable from a pass. `removal-test.sh` moves this directory
  // aside on purpose; every other run should have it.
  // eslint-disable-next-line no-console
  console.warn(
    'animation-core-boundaries: packages/features/animation is not present, so its boundaries are ' +
      'not being checked. Expected unless scripts/removal-test.sh moved it aside.',
  );
}

describePackage('the animation core is headless', () => {
  it('has the modules the pipeline is made of, so the checks below examine something', () => {
    // A glob that matched nothing would make every assertion in this file pass
    // for the wrong reason, and the module names are the assertions.
    expect(GRAPH.files.length).toBeGreaterThan(8);
    for (const module of GUARDED) {
      expect(GRAPH.edges.has(module), `${module} is not in the package`).toBe(true);
    }
  });

  /**
   * No React, no DOM, no WebMCP, no GPU — anywhere in the package, not just at
   * the entry point.
   *
   * The bead's criterion, and the reason it says "module graph" rather than "grep
   * the top-level entry file": the reference's discipline is that an editor and a
   * player can share a core, and that is only true if the core is headless all
   * the way down. One convenience `document.createElement` in a helper and the
   * whole property is gone, with every unit test still green.
   *
   * Comments and string literals are stripped first, for the reason
   * `tests/unit/scaffold.test.ts` records: these files are FULL of prose saying
   * "no DOM here", and a guard that fires on that prose is a guard that gets
   * switched off. The strings have to go too, because a file may legitimately
   * NAME a forbidden thing while never importing it — `attachEvent` as a method
   * name, `document` in an error message.
   */
  it('imports nothing from React, the DOM, a browser API or a WebGL library', () => {
    const FORBIDDEN_PACKAGES = [
      'react',
      'react-dom',
      'pixi.js',
      '@pixi/',
      'webmcp',
      'next',
      'zod',
      'node:fs',
      'node:path',
      'node:http',
    ];
    const offenders: string[] = [];

    for (const file of GRAPH.files) {
      for (const { specifier } of importSpecifiers(file.source)) {
        const hit = FORBIDDEN_PACKAGES.find(
          (forbidden) => specifier === forbidden || specifier.startsWith(forbidden),
        );
        if (hit !== undefined) offenders.push(`${file.path} imports "${specifier}"`);
      }
    }
    expect(
      offenders,
      'The core is headless so an editor and a player can share it (plan 9.3). A React, DOM, ' +
        'browser or GPU import anywhere in the package ends that, and nothing else in the build ' +
        'would say so.',
    ).toEqual([]);
  });

  it('names no browser global in executable code', () => {
    // The half a specifier list cannot see: `document`, `window`, `navigator`,
    // `requestAnimationFrame` and `localStorage` are globals, so a file can reach
    // one with no import at all. Which is exactly the "one convenience
    // `document.createElement` in a helper" the criterion names.
    const stripped = GRAPH.files.map((file) => ({
      path: file.path,
      code: file.source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (literal) => literal.replace(/[^\r\n]/g, ' ')),
    }));
    const GLOBALS = [
      'document',
      'window',
      'navigator',
      'localStorage',
      'requestAnimationFrame',
      'HTMLCanvasElement',
      'OffscreenCanvas',
      'WebGLRenderingContext',
    ];
    const offenders: string[] = [];
    for (const file of stripped) {
      for (const name of GLOBALS) {
        if (new RegExp(`\\b${name}\\b`).test(file.code))
          offenders.push(`${file.path} uses ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no wall clock and no randomness, so an evaluation is a function of its arguments', () => {
    // Not in the bead, and included because the determinism test would pass
    // against an evaluator that read a clock: two runs in the same test are the
    // same run as far as `Date.now()` is concerned. `evaluatePose` takes no
    // clock and no seed, and this is the check that keeps it that way.
    const stripped = GRAPH.files
      .map((file) =>
        file.source
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/(^|[^:])\/\/.*$/gm, '$1')
          .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (literal) => literal.replace(/[^\r\n]/g, ' ')),
      )
      .join('\n');
    for (const forbidden of [
      'Date.now',
      'new Date',
      'Math.random',
      'performance.now',
      'process.hrtime',
    ]) {
      expect(stripped, `the evaluator must not reach for ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describePackage('the renderer receives computed geometry and cannot solve anything', () => {
  it('reaches the IK solver from exactly one module, and that module is the evaluator', () => {
    // The criterion the whole split is built around, stated as a graph property
    // rather than as a review instruction. A renderer that solved IK would look
    // identical on screen; what it destroys is the guarantee that two consumers
    // of a pose cannot disagree, and the disagreement surfaces as "the animation
    // looks off in the editor" with nothing in the build to explain it.
    // The VALUE importers, which is the claim: exactly one module in the package
    // can call the solver, and it is the evaluator.
    const callers = GRAPH.files
      .filter((file) => valueTargetsOf(GRAPH, file.path).includes(IK_MODULE))
      .map((file) => file.path);
    expect(callers).toEqual([EVALUATE_MODULE]);

    // Any OTHER edge to the solver has to be the barrel re-exporting the
    // diagnostic TYPE, which compiles to nothing. A type edge is allowed there
    // and only there, because a caller that can read what a solve reported is
    // useful and a caller that can re-run a solve is the thing this whole file
    // exists to prevent. Listed rather than excluded by name, so a third module
    // acquiring an edge — even a type one — fails instead of being absorbed.
    const otherImporters = GRAPH.files
      .filter((file) => targetsOf(GRAPH, file.path).includes(IK_MODULE))
      .filter((file) => file.path !== EVALUATE_MODULE);
    expect(otherImporters.map((file) => file.path)).toEqual([`${PKG}index.ts`]);
    for (const file of otherImporters) {
      for (const edge of GRAPH.edges.get(file.path) ?? []) {
        if (edge.target !== IK_MODULE) continue;
        expect(edge.typeOnly, `${file.path} imports the solver as a value`).toBe(true);
      }
    }
  });

  it('keeps the solver off the other side of the seam as well', () => {
    // The graph check above is about direct importers. This one is about
    // REACHABILITY, which is the property the criterion is really asking about:
    // a renderer that reaches the solver through a helper that reaches the
    // solver imports no solver itself, and an importer check passes it.
    const fromRenderer = reachableFrom(GRAPH, RENDER_MODULE);
    expect(fromRenderer.has(IK_MODULE)).toBe(false);
    // And from the seam itself, which is what makes the seam a boundary: if
    // `pose.ts` reached the solver, every consumer of the seam would inherit it.
    expect(reachableFrom(GRAPH, POSE_MODULE).has(IK_MODULE)).toBe(false);
  });

  it('keeps the seam free of every other module in the package', () => {
    // `pose.ts` importing nothing is what makes the boundary structural rather
    // than conventional. One import of one type from `skeleton.ts` and a renderer
    // that depends on the seam has a path to the rig.
    expect(targetsOf(GRAPH, POSE_MODULE)).toEqual([]);
  });

  it('gives the renderer exactly one edge, and it is the seam', () => {
    expect(targetsOf(GRAPH, RENDER_MODULE)).toEqual([POSE_MODULE]);
  });

  it('imports the seam as a TYPE, so the compiled renderer has no dependency at all', () => {
    // The distinction between "cannot reach the solver at runtime" and "cannot
    // even read about it". A value import of the seam's types would still be a
    // runtime edge, and `import type` is what removes it — asserted here because
    // it is a one-word change that nothing else in the build would notice.
    const renderSource = readFileSync(join(SRC_DIR, 'render.ts'), 'utf8');
    expect(renderSource).toMatch(/^import type \{[^}]*\} from '\.\/pose\.js';$/m);
    expect(renderSource).not.toMatch(/^import \{[^t]/m);
  });
});

describePackage('the stages are the stages', () => {
  it('runs FK before IK, and IK before both attachment stages', () => {
    // The order is the pipeline. Checked by reachability rather than by reading
    // `evaluate.ts`, because a stage that reaches another stage's OUTPUT is in
    // the order even if the import arrows do not say so, and a stage that does
    // not is out of it even if they do.
    //
    // Concretely: FK must not depend on the solver, the solver must not depend on
    // the attachment stages, and the attachment stages must depend on neither
    // each other nor anything they should be downstream of.
    const fkModule = `${PKG}fk.ts`;
    const skinning = `${PKG}skinning.ts`;
    const regions = `${PKG}regions.ts`;

    expect(targetsOf(GRAPH, fkModule)).not.toContain(IK_MODULE);
    expect(targetsOf(GRAPH, skinning)).not.toContain(IK_MODULE);
    expect(targetsOf(GRAPH, regions)).not.toContain(IK_MODULE);

    // The two attachment stages take world transforms and nothing else, and that
    // is asserted as a VALUE-edge claim rather than an any-edge one. Naming a
    // rig type is how a stage stays typed — `MeshAttachment`, `RegionAttachment`,
    // `Slot` — and requiring the stage to reach its input through `unknown`
    // instead would be insisting on worse code. What must not survive
    // compilation is a stage holding a rig, because a stage that holds a rig can
    // place things from a REST transform instead of a solved one, which is the
    // same bug as solving IK a second time downstream.
    for (const stage of [skinning, regions]) {
      expect(valueTargetsOf(GRAPH, stage), `${stage} holds a rig at runtime`).not.toContain(
        `${PKG}skeleton.ts`,
      );
      expect(valueTargetsOf(GRAPH, stage), `${stage} reaches the solver at runtime`).not.toContain(
        IK_MODULE,
      );
    }
  });
});
