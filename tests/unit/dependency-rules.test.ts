import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';
const CONTRACT_FILENAME = 'architecture-rules.cjs';
const nodeRequire = createRequire(import.meta.url);

// Walking up to the workspace marker keeps the gate working wherever this file
// sits under `tests/`, so relocating the suite cannot make it scan nothing.
function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`No ${WORKSPACE_MARKER} found above ${startDir}`);
    }
    current = parent;
  }
}

const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const CONTRACT_MODULE_PATH = join(REPO_ROOT, CONTRACT_FILENAME);

interface WorkspacePackage {
  readonly dir: string;
  readonly name: string;
}

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

interface Violation {
  readonly rule: string;
  readonly from: string;
  readonly to: string;
  readonly specifier: string | null;
  readonly message: string;
}

interface CheckImportsInput {
  readonly files: readonly SourceFile[];
  readonly packages: readonly WorkspacePackage[];
}

interface LayerContract {
  readonly FORBIDDEN: readonly { readonly name: string }[];
  readonly UNRESOLVED_RULE: { readonly name: string; readonly reason: string };
  readonly checkImports: (input: CheckImportsInput) => readonly Violation[];
  readonly discoverWorkspacePackages: (repoRoot: string) => readonly WorkspacePackage[];
  readonly formatReport: (violations: readonly Violation[]) => string;
  readonly listSourceFiles: (repoRoot: string) => readonly SourceFile[];
}

function isLayerContract(value: unknown): value is LayerContract {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate['FORBIDDEN']) &&
    typeof candidate['checkImports'] === 'function' &&
    typeof candidate['discoverWorkspacePackages'] === 'function' &&
    typeof candidate['formatReport'] === 'function' &&
    typeof candidate['listSourceFiles'] === 'function'
  );
}

function loadContract(): LayerContract {
  const loaded: unknown = nodeRequire(CONTRACT_MODULE_PATH);
  if (!isLayerContract(loaded)) {
    throw new Error(
      `${CONTRACT_FILENAME} must export FORBIDDEN, checkImports, discoverWorkspacePackages, formatReport and listSourceFiles`,
    );
  }
  return loaded;
}

const contract = loadContract();

function sourceFile(path: string, specifiers: readonly string[]): SourceFile {
  return { path, source: specifiers.map((specifier) => `import '${specifier}';`).join('\n') };
}

function summarize(
  violations: readonly {
    readonly rule: string;
    readonly from: string;
    readonly specifier: string | null;
  }[],
): string[] {
  return violations
    .map((violation) => `${violation.rule} ${violation.from} '${violation.specifier ?? ''}'`)
    .sort();
}

const packages = contract.discoverWorkspacePackages(REPO_ROOT);

// Held in memory rather than on disk so the deliberate violations below stay out
// of the repository tsconfig, which typechecks every `tests/**/*.ts` file.
const FIXTURE_FILES: readonly SourceFile[] = [
  // Names no real package, so the resolver has nothing to classify and the
  // unresolved rule has to be the one that speaks up.
  sourceFile('packages/core/src/index.ts', ['@battle-agents/typo-not-a-package']),
  sourceFile('packages/features/quest/src/index.ts', ['@battle-agents/guild']),
  sourceFile('packages/features/guild/src/index.ts', ['../../battle/src/index.js']),
  sourceFile('packages/features/quest/src/infra.ts', [
    '../../../infrastructure/postgres/src/index.js',
  ]),
  sourceFile('packages/features/battle/src/index.ts', [
    '@battle-agents/core',
    '@battle-agents/protocol',
    './local.js',
  ]),
  sourceFile('packages/features/battle/src/local.ts', []),
  sourceFile('packages/features/guild/src/registry.ts', ['@battle-agents/guild']),
  sourceFile('packages/features/social/src/index.ts', []),
  sourceFile('packages/core/src/registry.ts', ['@battle-agents/quest']),
  sourceFile('packages/core/src/contracts.ts', ['@battle-agents/protocol']),
  sourceFile('packages/adapters/claude/src/hooks.ts', ['@battle-agents/bounty']),
  sourceFile('packages/adapters/codex/src/index.ts', ['@battle-agents/protocol']),
  // The two adapter-adapter routes the rule has to catch, one per resolution
  // path. A workspace specifier is resolved through the package table, and a
  // relative one through the file list, so a rule that only handled the first
  // would pass these fixtures while a cursor file reaching into apps/web by
  // relative path sailed through. Both are the same rule: an adapter importing
  // another adapter, or the presentation layer, is adapter-game-code.
  sourceFile('packages/adapters/cursor/src/parsers/transcript.ts', ['@battle-agents/gemini']),
  sourceFile('packages/adapters/gemini/src/watcher.ts', [
    '../../../../apps/web/src/event-batch.js',
  ]),
  sourceFile('packages/cli/src/index.ts', ['@battle-agents/quest']),
  sourceFile('packages/mcp-server/src/tools/discover.ts', [
    '../../../features/social/src/index.js',
  ]),
  sourceFile('packages/infrastructure/postgres/src/index.ts', []),
  sourceFile('packages/infrastructure/postgres/src/repository.ts', ['@battle-agents/progression']),
  sourceFile('packages/infrastructure/postgres/src/schema.ts', ['@battle-agents/core']),
  sourceFile('apps/web/src/index.ts', ['@battle-agents/battle']),
  // A route handler reaching into a feature. The composition root one line
  // above importing the same package is legal and produces no violation, so
  // this pair is what proves the rule is scoped to the route tree rather than
  // to the presentation layer as a whole.
  sourceFile('apps/web/app/api/quest/route.ts', ['@battle-agents/quest']),
  // Presentation importing a feature is an ALLOWED direction, and animation is
  // a package that exists, so this produces no violation. It is kept in the
  // fixture to prove the engine distinguishes "legal" from "unresolvable":
  // removing the animation package turns this exact line into a violation.
  sourceFile('packages/game-client/src/view.ts', ['@battle-agents/animation']),
];

const EXPECTED_FIXTURE_VIOLATIONS = [
  {
    rule: 'no-adapter-game-code',
    from: 'packages/adapters/claude/src/hooks.ts',
    specifier: '@battle-agents/bounty',
  },
  {
    rule: 'no-adapter-game-code',
    from: 'packages/adapters/cursor/src/parsers/transcript.ts',
    specifier: '@battle-agents/gemini',
  },
  {
    rule: 'no-adapter-game-code',
    from: 'packages/adapters/gemini/src/watcher.ts',
    specifier: '../../../../apps/web/src/event-batch.js',
  },
  {
    rule: 'no-core-import-of-outer-layers',
    from: 'packages/core/src/registry.ts',
    specifier: '@battle-agents/quest',
  },
  {
    rule: 'no-feature-cross-import',
    from: 'packages/features/guild/src/index.ts',
    specifier: '../../battle/src/index.js',
  },
  {
    rule: 'no-feature-cross-import',
    from: 'packages/features/quest/src/index.ts',
    specifier: '@battle-agents/guild',
  },
  {
    rule: 'no-feature-import-of-outer-layers',
    from: 'packages/features/quest/src/infra.ts',
    specifier: '../../../infrastructure/postgres/src/index.js',
  },
  {
    rule: 'no-infrastructure-import-of-upper-layers',
    from: 'packages/infrastructure/postgres/src/repository.ts',
    specifier: '@battle-agents/progression',
  },
  {
    rule: 'no-interface-feature-implementation',
    from: 'packages/cli/src/index.ts',
    specifier: '@battle-agents/quest',
  },
  {
    rule: 'no-interface-feature-implementation',
    from: 'packages/mcp-server/src/tools/discover.ts',
    specifier: '../../../features/social/src/index.js',
  },
  {
    rule: 'no-route-handler-game-logic',
    from: 'apps/web/app/api/quest/route.ts',
    specifier: '@battle-agents/quest',
  },
  {
    // A specifier inside our own scope that names no package. There is no
    // target to classify, so this exercises the unresolved rule rather than
    // any of the layering rules.
    rule: contract.UNRESOLVED_RULE.name,
    from: 'packages/core/src/index.ts',
    specifier: '@battle-agents/typo-not-a-package',
  },
];

describe('layering rule engine', () => {
  // The fixture must be hermetic. Deriving its package list from the live tree
  // meant that removing a real package changed what the fixture meant: the
  // game-client import of @battle-agents/animation resolved on a full tree and
  // became an unresolved violation the moment the removal test moved that
  // directory aside, so a test about synthetic imports failed because of
  // something happening to the real repository.
  const fixturePackages: readonly WorkspacePackage[] = [
    { dir: 'packages/features/animation', name: '@battle-agents/animation' },
    { dir: 'packages/features/battle', name: '@battle-agents/battle' },
    { dir: 'packages/features/bounty', name: '@battle-agents/bounty' },
    { dir: 'packages/cli', name: '@battle-agents/cli' },
    { dir: 'packages/core', name: '@battle-agents/core' },
    { dir: 'packages/adapters/cursor', name: '@battle-agents/cursor' },
    { dir: 'packages/adapters/gemini', name: '@battle-agents/gemini' },
    { dir: 'packages/game-client', name: '@battle-agents/game-client' },
    { dir: 'packages/features/guild', name: '@battle-agents/guild' },
    { dir: 'packages/mcp-server', name: '@battle-agents/mcp-server' },
    { dir: 'packages/infrastructure/postgres', name: '@battle-agents/postgres' },
    { dir: 'packages/features/progression', name: '@battle-agents/progression' },
    { dir: 'packages/protocol', name: '@battle-agents/protocol' },
    { dir: 'packages/features/quest', name: '@battle-agents/quest' },
  ];
  const violations = contract.checkImports({ files: FIXTURE_FILES, packages: fixturePackages });

  it('catches every violation type in the fixture tree and nothing else', () => {
    expect(summarize(violations)).toEqual(summarize(EXPECTED_FIXTURE_VIOLATIONS));
  });

  it('exercises every rule declared in the contract', () => {
    const expectedRules = new Set([
      ...contract.FORBIDDEN.map((rule) => rule.name),
      contract.UNRESOLVED_RULE.name,
    ]);
    expect(new Set(violations.map((violation) => violation.rule))).toEqual(expectedRules);
  });

  it('names the violated rule in the report', () => {
    for (const violation of violations) {
      expect(violation.message).toContain(violation.rule);
    }
  });

  it('reports a package that no layer covers', () => {
    const unclassified = contract.checkImports({
      files: [sourceFile('packages/legacy/src/index.ts', ['@battle-agents/core'])],
      packages,
    });
    expect(summarize(unclassified)).toEqual([`unclassified-layer packages/legacy/src/index.ts ''`]);
  });
});

describe('repository layering', () => {
  const sourceFiles = contract.listSourceFiles(REPO_ROOT);
  const violations = contract.checkImports({ files: sourceFiles, packages });

  it('discovers the workspace packages and their sources', () => {
    // Asserts that discovery works, not that any particular feature exists.
    // Pinning a feature here meant the removal test could never remove it,
    // because the tree went missing mid-run and this assertion failed for a
    // reason that had nothing to do with coupling.
    const discovered = packages.map((entry) => entry.dir);
    expect(discovered).toContain('packages/core');
    expect(discovered).toContain('packages/protocol');
    expect(discovered.some((dir) => dir.startsWith('packages/features/'))).toBe(true);
    expect(sourceFiles.map((file) => file.path)).toContain('packages/core/src/index.ts');
  });

  it('reports no dependency violations', () => {
    expect(contract.formatReport(violations)).toBe('');
  });
});
