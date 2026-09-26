import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The barrel of `@battle-agents/protocol` is the whole public surface of the
 * SDK, and this file is what stops that surface from rotting.
 *
 * WHY THIS EXISTS. The barrel used to be five `export *` lines. That is valid
 * TypeScript and it kept working, which is exactly why the defect it carried
 * survived: a published package whose entry point says "everything in these
 * five files" does not tell a stranger what the SDK offers, and a name added to
 * a module is re-exported without anybody deciding it should be.
 *
 * The barrel is now flat, and a flat barrel introduces the opposite failure. A
 * name added to `agent-event.ts` and forgotten in `index.ts` is invisible to
 * every consumer in the workspace and to every third party, and nothing in the
 * build notices, because the file that declares the surface is the file that
 * forgot to declare it. So the completeness of the barrel is asserted here
 * rather than trusted.
 *
 * WHY THE ENUMERATOR IS TESTED FIRST. The first version of the resolver in
 * `tests/unit/out-of-tree-extension.test.ts` tested a specifier as written,
 * found no file, skipped every branch, and returned an empty set — and the
 * suite stayed green, because a guard that returns nothing has nothing to
 * complain about. That is the shape of failure this repository keeps paying
 * for, so the last two tests here run the same functions over a fixture where
 * the answer is known. If the enumerator stops finding exports, these go red
 * before the completeness assertion above quietly passes.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PROTOCOL_SRC = join(REPO_ROOT, 'packages/protocol/src');
const BARREL = join(PROTOCOL_SRC, 'index.ts');

/**
 * Source with its comments removed, because every module here carries prose
 * that names exports and specifiers it is describing. A parser that counted
 * those would either report dependencies that do not exist or, worse, let a
 * real export hide inside a comment-shaped line.
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

/** The names inside one brace clause, with `type` and `as` modifiers removed. */
function namesIn(clause: string): string[] {
  return clause
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const bare = part.replace(/^type\s+/, '');
      const aliased = bare.split(/\s+as\s+/);
      return (aliased[aliased.length - 1] ?? '').trim();
    })
    .filter((name) => name !== '');
}

interface Exported {
  readonly value: ReadonlySet<string>;
  readonly type: ReadonlySet<string>;
}

/**
 * Every name a module exports, split by whether it is a type.
 *
 * The split is not decoration. `verbatimModuleSyntax` is on, so a type
 * re-exported through a plain `export {}` is a compile error — which means a
 * barrel that lists a name without saying which kind it is cannot be written at
 * all, and the assertion below is checking the same distinction the compiler
 * checks.
 */
function exportsOf(source: string): Exported {
  const body = code(source);
  const value = new Set<string>();
  const type = new Set<string>();

  // Leading whitespace is allowed because a formatter may indent a top-level
  // declaration, and a module whose every export is invisible to this parser
  // produces a barrel check that passes on nothing — which is the failure the
  // fixtures below exist to catch. The first version anchored at column zero
  // and read a fully indented fixture as exporting nothing at all.
  for (const match of body.matchAll(
    /^[ \t]*export\s+(?:declare\s+)?(?:abstract\s+)?(const|function|class|let|enum)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    value.add(match[2] as string);
  }

  for (const match of body.matchAll(
    /^[ \t]*export\s+(?:declare\s+)?(interface|type)\s+([A-Za-z0-9_$]+)/gm,
  )) {
    type.add(match[2] as string);
  }

  // `export { ... }` and `export type { ... }`, including a `from` clause, which
  // is the form a barrel uses. A `type` modifier on an individual entry counts
  // as well, so `export { type A, B }` puts A with the types and B with the
  // values — the mixed clause is the one a hand-written barrel is most likely
  // to produce by accident.
  for (const match of body.matchAll(/^[ \t]*export\s+(type\s+)?\{([^}]*)\}/gms)) {
    const wholeBlockIsTypes = match[1] !== undefined;
    for (const raw of (match[2] as string).split(',')) {
      const entry = raw.trim();
      if (entry === '') continue;
      const isType = wholeBlockIsTypes || /^type\s+/.test(entry);
      const name = namesIn(entry)[0];
      if (name === undefined) continue;
      (isType ? type : value).add(name);
    }
  }

  return { value, type };
}

/** Every `.ts` file in the package that is not the barrel and not a test. */
function moduleFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      moduleFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The `from './x.js'` targets the barrel re-exports from, as repo-relative paths. */
function barrelModules(source: string): string[] {
  const found = new Set<string>();
  for (const match of code(source).matchAll(/from\s+'\.\/([^']+)\.js'/g)) {
    found.add(match[1] as string);
  }
  return [...found].sort();
}

describe('the protocol barrel declares the whole surface it publishes', () => {
  it('re-exports every export of every module in the package', () => {
    const barrel = exportsOf(readFileSync(BARREL, 'utf8'));
    const missing: string[] = [];

    for (const file of moduleFiles(PROTOCOL_SRC).sort()) {
      const moduleKey = relative(PROTOCOL_SRC, file).split(sep).join('/').replace(/\.ts$/, '');
      const declared = exportsOf(readFileSync(file, 'utf8'));

      for (const name of declared.value) {
        if (!barrel.value.has(name)) missing.push(`${moduleKey}: value ${name}`);
      }
      for (const name of declared.type) {
        if (!barrel.type.has(name)) missing.push(`${moduleKey}: type ${name}`);
      }
    }

    // Reported as a list rather than name by name, because the failure a
    // contributor hits is "the name I added is not exported" and the useful
    // thing to show them is every one of those at once.
    expect(
      missing,
      'these are exported by a module but not by the barrel, so no consumer can import them',
    ).toEqual([]);
  });

  it('re-exports from every module that exists, so a new file cannot sit outside the surface', () => {
    // The assertion above is only as good as the module list it walks, and a
    // list built FROM the barrel cannot notice a module the barrel forgot. So
    // the list is built from the directory instead, and the two are compared.
    const onDisk = moduleFiles(PROTOCOL_SRC)
      .map((file) => relative(PROTOCOL_SRC, file).split(sep).join('/').replace(/\.ts$/, ''))
      .filter((name) => name !== 'index')
      .sort();

    expect(onDisk.length).toBeGreaterThan(0);
    expect(barrelModules(readFileSync(BARREL, 'utf8')).sort()).toEqual(onDisk);
  });

  it('has no star-export, which is what let an omission go unnoticed', () => {
    // A single `export *` reintroduces the exact failure the flat barrel
    // removed: a name added to a module becomes public without anybody
    // deciding it should be, and the completeness test above goes on passing
    // because the barrel no longer claims to be exhaustive — it just forwards.
    const starExports = code(readFileSync(BARREL, 'utf8')).match(/export\s+\*/g) ?? [];
    expect(
      starExports,
      'a star-export makes the barrel non-exhaustive again, which is what this file exists to prevent',
    ).toEqual([]);
  });
});

describe('the barrel enumerator is watched working, because a resolver that finds nothing passes', () => {
  it('reads declarations, braces, `as`, and per-entry `type` modifiers', () => {
    const found = exportsOf(`
      import { thing } from './elsewhere.js';
      /** a comment naming FakeCommentExport, and export { NotReal } inside it */
      export const aValue = 1;
      export function doThing(): void {}
      export class AClass {}
      export interface AnInterface {}
      export type AType = string;
      export { thing as renamed };
      export { type OnlyAType, onlyAValue };
      export type { Aliased as Public };
      export { aMixedClauseValue, type AndATypeInTheSameClause };
    `);

    expect([...found.value].sort()).toEqual([
      'AClass',
      'aMixedClauseValue',
      'aValue',
      'doThing',
      'onlyAValue',
      'renamed',
    ]);
    expect([...found.type].sort()).toEqual([
      'AType',
      'AnInterface',
      'AndATypeInTheSameClause',
      'OnlyAType',
      'Public',
    ]);

    // And the comment did not contribute, which is the failure a fixture that
    // only asserted a positive would miss.
    expect([...found.value]).not.toContain('FakeCommentExport');
    expect([...found.value]).not.toContain('NotReal');
  });

  it('reports a module export the barrel omitted, rather than finding nothing and passing', () => {
    // The exact shape that made the out-of-tree resolver useless: a barrel that
    // forwards to a module the reader cannot resolve, so every branch is
    // skipped and the result is an empty set that matches anything. Here the
    // fixture is complete and deliberate, and the omitted name must be named.
    const moduleExports = exportsOf(`export const forgotten = 1;\nexport const kept = 2;`);
    const barrelExports = exportsOf(`export { kept } from './x.js';`);

    const missing = [...moduleExports.value].filter((name) => !barrelExports.value.has(name));
    expect(missing).toEqual(['forgotten']);
  });
});
