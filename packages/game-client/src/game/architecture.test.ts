import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix as posixModule, relative, sep } from 'node:path';

const posixJoin = (...parts: string[]): string => posixModule.join(...parts);
const posixDirname = (path: string): string => posixModule.dirname(path);
const posixNormalize = (path: string): string => posixModule.normalize(path);
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The client's own architecture rules.
 *
 * `tests/unit/dependency-rules.test.ts` already runs the shared engine over the
 * whole tree, and `scripts/check-architecture.ts` runs it as a pipeline stage.
 * This file is not a duplicate of that. It asserts three things the global
 * engine deliberately does not, because each is a question about the GAME CLIENT
 * specifically rather than about the layer graph:
 *
 * 1. The client imports no feature. Presentation -> feature is a LEGAL
 *    direction, so no rule fires on it — but the removal test strips each
 *    feature from `apps/web`, and a client that reached into a feature would
 *    break the moment that feature moved. A legal import that no rule catches
 *    is exactly the gap a targeted test exists for.
 * 2. The client reaches no package by relative path. Same reasoning, and the
 *    shared rule already covers it; asserting it here means a violation names
 *    the client rather than appearing in a list of forty.
 * 3. **There is exactly ONE tool->zone table in this repository.** This is the
 *    one the bead cares most about. `TOOL_ZONE_MAP` belongs to
 *    `@battle-agents/protocol`; a second copy in the client would agree with it
 *    until the day a harness added a tool to one of them, and then the client
 *    would route somewhere the server does not. Nothing in the type system or
 *    the layer graph can catch that, because both copies are individually
 *    well-typed.
 */

const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const nodeRequire = createRequire(import.meta.url);

function findRepoRoot(start: string): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`No pnpm-workspace.yaml above ${start}`);
    current = parent;
  }
}

const contract = nodeRequire(join(REPO_ROOT, 'architecture-rules.cjs')) as {
  checkImports: (input: {
    files: readonly { path: string; source: string }[];
    packages: readonly { dir: string; name: string }[];
  }) => readonly { message: string }[];
  discoverWorkspacePackages: (repoRoot: string) => readonly { dir: string; name: string }[];
  formatReport: (violations: readonly { message: string }[]) => string;
  listSourceFiles: (repoRoot: string) => readonly { path: string; source: string }[];
};

function sourceFilesUnder(dir: string): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  const visit = (absolute: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = join(absolute, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push({ path: relative(REPO_ROOT, path).split(sep).join('/'), source: readFileSync(path, 'utf8') });
      }
    }
  };
  visit(dir);
  return files;
}

const CLIENT_DIR = join(REPO_ROOT, 'packages/game-client/src');
const clientFiles = sourceFilesUnder(CLIENT_DIR);
const workspacePackages = contract.discoverWorkspacePackages(REPO_ROOT);
const featureNames = new Set(
  workspacePackages
    .filter((pkg) => pkg.dir.startsWith('packages/features/'))
    .map((pkg) => pkg.name),
);

describe('the game client obeys the layering contract', () => {
  it('has source files to check', () => {
    // A glob that quietly matched nothing is the failure this repository keeps
    // meeting: a check that passes while examining nothing.
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it('produces no layering violation', () => {
    const violations = contract.checkImports({ files: clientFiles, packages: workspacePackages });
    expect(contract.formatReport(violations)).toBe('');
  });

  it('imports no feature at all', () => {
    // Legal by the layer rules and still wrong here: the removal test moves
    // each feature aside and re-typechecks, and a client coupled to one would
    // fail that stage for a reason that has nothing to do with the client.
    const offenders: string[] = [];
    for (const file of clientFiles) {
      // The whole match, not `[match]` — destructuring the first element gives
      // match[0], and `match[1]` on THAT is a character of the matched text.
      // That bug made this assertion compare single characters against package
      // names and pass while checking nothing at all.
      for (const match of file.source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const specifier = match[1];
        if (specifier !== undefined && featureNames.has(specifier)) {
          offenders.push(`${file.path} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches no other package by relative path', () => {
    // Scoped to the PACKAGE boundary, not to the leading `..`. A first version
    // of this test flagged any specifier starting with `../` and so reported
    // sixteen "violations" that were all `../state/store.js` — a sibling
    // directory inside this same package, which is the ordinary way a file in
    // one subdirectory reaches another. The shared engine gets this right
    // through `isSamePackage`, and a duplicate that gets it wrong is worse than
    // no duplicate: it cries wolf on legal code and gets switched off.
    const offenders: string[] = [];
    for (const file of clientFiles) {
      for (const match of file.source.matchAll(/from\s+['"](\.\.[^'"]*)['"]/g)) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        const resolved = posixNormalize(
          posixJoin(posixDirname(file.path), specifier),
        );
        if (resolved.startsWith('packages/game-client/')) continue;
        offenders.push(`${file.path} imports ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('there is exactly one tool->zone table in the repository', () => {
  it('defines TOOL_ZONE_MAP in the protocol package and nowhere else', () => {
    // The whole reason `zoneForTool` is a re-export rather than a function. A
    // second table would typecheck, would pass every test in the client, and
    // would disagree with the server the first time a tool was added to one of
    // them — which is the definition of a bug nobody can find by reading the
    // client.
    const definitions: string[] = [];
    for (const file of contract.listSourceFiles(REPO_ROOT)) {
      if (/(?:const|let|var)\s+TOOL_ZONE_MAP\s*[:=]/.test(file.source)) {
        definitions.push(file.path);
      }
    }
    expect(definitions).toEqual(['packages/protocol/src/tool-map.ts']);
  });

  it('has the client consume the protocol table rather than restate it', () => {
    const zonesSource = readFileSync(join(CLIENT_DIR, 'zones.ts'), 'utf8');
    // No second lookup table, in any spelling. A record literal of tool names
    // would satisfy the test above and fail this one, which is the point.
    expect(zonesSource).not.toMatch(/['"]Bash['"]\s*:/);
    expect(zonesSource).not.toMatch(/['"]Read['"]\s*:/);
    expect(zonesSource).not.toMatch(/['"]Grep['"]\s*:/);
    // And it must actually re-export the protocol's function.
    expect(zonesSource).toMatch(/getZoneForTool/);
  });

  it('keeps the placement table total over the protocol zone union', () => {
    // A zone the client cannot place is an agent standing at (0,0) forever.
    // The type catches a new zone at build time; this catches the case where
    // the table was widened with a wrong answer instead of a right one.
    const protocolZones = [
      'idle',
      'files',
      'terminal',
      'search',
      'web',
      'thinking',
      'messaging',
      'tasks',
      'spawn',
      'bounty-board',
      'battle-arena',
      'guild-hall',
    ];
    const zonesSource = readFileSync(join(CLIENT_DIR, 'zones.ts'), 'utf8');
    const block = zonesSource.slice(
      zonesSource.indexOf('ZONE_PLACEMENT'),
      zonesSource.indexOf('ZONE_FOR_EVENT'),
    );
    for (const zone of protocolZones) {
      // Accepts either quoting: the two game zones are hyphenated, so a
      // literal `bounty-board:` would not parse and the key is quoted.
      const key = new RegExp(`['"]?${zone}['"]?\\s*:`);
      expect(key.test(block), `ZONE_PLACEMENT is missing ${zone}`).toBe(true);
    }
  });
});

describe('the package builds as a workspace project', () => {
  it('has a tsconfig and a src entry the build can reach', () => {
    // `pnpm build` runs `tsc -b tsconfig.build.json`, which references this
    // package. A missing entry means the build silently compiles nothing here.
    expect(existsSync(join(REPO_ROOT, 'packages/game-client/tsconfig.json'))).toBe(true);
    expect(statSync(join(CLIENT_DIR, 'index.ts')).isFile()).toBe(true);
  });

  it('is referenced by the build project graph', () => {
    // The same class of quiet failure: a package the build does not reference
    // is a package whose source is never typechecked by `pnpm build`.
    const buildConfig = readFileSync(join(REPO_ROOT, 'tsconfig.build.json'), 'utf8');
    expect(buildConfig).toMatch(/"path":\s*"packages\/game-client"/);
  });
});
