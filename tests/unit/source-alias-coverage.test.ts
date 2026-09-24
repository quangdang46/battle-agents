import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { workspaceSourceAliases } from '../../vitest.shared.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const WORKSPACE_PARENTS = ['packages', 'packages/features', 'packages/adapters', 'apps'];

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
});
