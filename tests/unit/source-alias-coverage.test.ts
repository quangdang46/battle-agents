import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { workspaceSourceAliases } from '../../vitest.shared.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const WORKSPACE_PARENTS = [
  'packages',
  'packages/features',
  'packages/adapters',
  'packages/infrastructure',
  'apps',
];

function packagesWithSource(): { name: string; dir: string }[] {
  const found: { name: string; dir: string }[] = [];
  for (const parent of WORKSPACE_PARENTS) {
    const parentDir = join(repoRoot, parent);
    if (!existsSync(parentDir)) continue;
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const dir = join(parentDir, entry.name);
      const manifestPath = join(dir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      if (!existsSync(join(dir, 'src', 'index.ts'))) continue;
      const { name } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string };
      found.push({ name, dir });
    }
  }
  return found;
}

/**
 * tsconfig.json is JSONC and its comments are load-bearing here: the paths map
 * is not self-explanatory, so the explanation lives next to it. Stripping whole
 * lines that start with `//` is enough, and unlike a blanket regex it cannot
 * eat a `//` inside a path value.
 */
function readTsconfigPaths(): Record<string, string[]> {
  const source = readFileSync(join(repoRoot, 'tsconfig.json'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const parsed = JSON.parse(source) as { compilerOptions?: { paths?: Record<string, string[]> } };
  return parsed.compilerOptions?.paths ?? {};
}

describe('test stages resolve workspace packages to source', () => {
  // The vitest configs point each @battle-agents/* specifier at src/index.ts.
  // Without that, a package's "main" points at dist/, so a suite runs whatever
  // was last built rather than the tree it is sitting in. An edit to
  // packages/core/src/persistence.ts left the apps/web tests passing until the
  // package was rebuilt, which is how a regression could have shipped.
  it('aliases every workspace package that has a source entry', () => {
    const aliased = new Set(workspaceSourceAliases().map((alias) => alias.find));

    const missing = packagesWithSource()
      .map((pkg) => pkg.name)
      .filter((name) => !aliased.has(name));

    expect(missing).toEqual([]);
  });

  it('points every alias at a file that exists', () => {
    const dangling = workspaceSourceAliases()
      .map((alias) => alias.replacement)
      .filter((replacement) => !existsSync(replacement));

    expect(dangling).toEqual([]);
  });

  it('has at least one alias, so an empty scan cannot pass silently', () => {
    // Without a floor, a glob that matches nothing makes both tests above pass
    // for the wrong reason.
    expect(workspaceSourceAliases().length).toBeGreaterThan(0);
  });

  it('covers the same packages in tsconfig paths, which is what tsc reads', () => {
    // The vitest alias and the tsconfig paths are two mechanisms for the same
    // job: the first for the test stages at runtime, the second for the
    // typechecker. Two hand-maintained lists drift, and the drift is quiet:
    // whichever one is missing an entry keeps passing while checking the last
    // build rather than the tree.
    const configured = new Set(Object.keys(readTsconfigPaths()));

    const missingFromTsconfig = workspaceSourceAliases()
      .map((alias) => alias.find)
      .filter((name) => !configured.has(name));

    expect(missingFromTsconfig).toEqual([]);
  });

  it('points every tsconfig path at a file that exists', () => {
    const dangling = Object.values(readTsconfigPaths())
      .flat()
      .map((entry) => join(repoRoot, entry))
      .filter((candidate) => !existsSync(candidate));

    expect(dangling).toEqual([]);
  });
});
