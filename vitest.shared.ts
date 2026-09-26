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

/**
 * JSX in a test, which nothing here could do before.
 *
 * Vite reads the nearest tsconfig for its TypeScript options, and
 * `apps/web/tsconfig.json` sets `jsx: "preserve"` because that is the value
 * Next.js's own SWC transform expects. So the stages handed every `.tsx` file to
 * the transformer with the JSX still in it, and the transform failed with
 * "the content contains invalid JS syntax... make sure to not set jsx to
 * preserve". `esbuild: { jsx: 'automatic' }` does not override it — Vite 8
 * transforms with oxc, and the tsconfig is read per file with nothing above it
 * to override.
 *
 * Measured rather than assumed: a probe that rendered a `.tsx` component passed
 * once and then failed with the cache cleared, which is the shape of a check
 * that was green for a reason nobody could name. `oxc.jsx` is the override that
 * held, and `{ runtime: 'automatic' }` is its TYPED form: the string
 * `'react-jsx'` runs and does not typecheck, because Vite's `oxc.jsx` is
 * `'preserve' | JsxOptions` and that spelling is in neither. The root typecheck
 * reads these config files, so an untyped override would have been a red gate
 * introduced by the same commit that fixed a green one.
 *
 * It applies only to `.jsx`/`.tsx`; a `.ts` file is untouched, so no existing
 * test changes behaviour.
 */
export function jsxSourceTransform() {
  return { oxc: { jsx: { runtime: 'automatic' as const } } };
}
