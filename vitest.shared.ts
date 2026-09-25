import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every workspace package resolves to its built `dist/` by default, because that
 * is what the `exports` field in each package.json points at. Tests must not
 * depend on that: a test run then exercises whatever was last built, so a source
 * edit can be invisible to the suite. That is not hypothetical — an edit to
 * `packages/core/src/persistence.ts` changed nothing in the apps/web tests until
 * the package was rebuilt, which would have let a regression pass unnoticed.
 *
 * So the test stages point each `@battle-agents/*` specifier at its source
 * entry, and the suite always tests the code that is actually in the tree.
 *
 * The mapping is derived from the workspace directories rather than written out,
 * so a newly added package is covered without editing this file. A package with
 * no `src/index.ts` gets no alias and falls back to normal resolution.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));

const WORKSPACE_PARENTS = [
  'packages',
  'packages/features',
  'packages/adapters',
  'packages/infrastructure',
  'apps',
];

type PackageAlias = { find: string; replacement: string };

function packageDirs(): string[] {
  const dirs: string[] = [];
  for (const parent of WORKSPACE_PARENTS) {
    const parentDir = join(repoRoot, parent);
    if (!existsSync(parentDir)) continue;
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const dir = join(parentDir, entry.name);
      if (existsSync(join(dir, 'package.json'))) dirs.push(dir);
    }
  }
  return dirs;
}

export function workspaceSourceAliases(): PackageAlias[] {
  const aliases: PackageAlias[] = [];
  for (const dir of packageDirs()) {
    let name: string | undefined;
    try {
      name = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string })
        .name;
    } catch {
      continue;
    }
    if (!name) continue;
    const sourceEntry = join(dir, 'src', 'index.ts');
    if (!existsSync(sourceEntry)) continue;
    aliases.push({ find: name, replacement: sourceEntry });
  }
  return aliases;
}
