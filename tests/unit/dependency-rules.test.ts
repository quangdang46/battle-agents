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

interface CheckContentInput {
  readonly files: readonly SourceFile[];
}

interface LayerContract {
  readonly FORBIDDEN: readonly { readonly name: string }[];
  readonly CONTENT_RULES: readonly { readonly name: string }[];
  readonly UNRESOLVED_RULE: { readonly name: string; readonly reason: string };
  readonly CROSS_PACKAGE_RELATIVE_RULE: { readonly name: string; readonly reason: string };
  readonly checkContent: (input: CheckContentInput) => readonly Violation[];
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
    Array.isArray(candidate['CONTENT_RULES']) &&
    typeof candidate['checkContent'] === 'function' &&
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
      `${CONTRACT_FILENAME} must export FORBIDDEN, CONTENT_RULES, checkContent, checkImports, discoverWorkspacePackages, formatReport and listSourceFiles`,
    );
  }
  return loaded;
}

const contract = loadContract();

function sourceFile(path: string, specifiers: readonly string[]): SourceFile {
  return { path, source: specifiers.map((specifier) => `import '${specifier}';`).join('\n') };
}

/** A content fixture carries real source, because the rule reads the text. */
function contentFile(path: string, body: string): SourceFile {
  return { path, source: `${body}\n` };
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
  // A legal dependency taken illegally. An adapter MAY depend on core, so no
  // layer rule has anything to say; but it is core's barrel that is the
  // published surface, and this line walks past it into the file underneath.
  // Planting this exact import in the template's parser left `pnpm
  // architecture` reporting "no violations", which is the whole reason the
  // rule exists.
  sourceFile('packages/adapters/amp/src/watcher.ts', ['../../../core/src/runtime.js']),
  // The same route taken from a feature, so the rule is not a rule about
  // adapters. A feature reaching into core's source is the identical defect.
  sourceFile('packages/features/battle/src/hostile.ts', ['../../../core/src/registry.js']),
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

/**
 * The content-rule fixture, held apart from the import one because the two
 * engines read different things: checkImports reads specifiers, and every
 * fixture above is generated from a list of them, so none of them contains any
 * source text a content rule could look at.
 *
 * Four positives and four negatives, and the negatives are the point. A scanner
 * with no negatives is a scanner nobody has learned what to catch, and one that
 * reports a comment is a scanner that gets switched off — which is what happened
 * to the game-vocabulary scanner in tests/unit/scaffold.test.ts and is why it
 * strips comments first.
 */
const CONTENT_FIXTURES: readonly SourceFile[] = [
  // The shape a token economy would actually be written in.
  contentFile(
    'packages/features/quest/src/award.ts',
    'export const experienceFor = (payload) => Math.floor(payload.tokensUsed / 100);',
  ),
  // The object-literal form, which is how a price row is written everywhere in
  // this tree. A regex that only caught the first shape would be a rule that
  // catches the shape its author imagined.
  contentFile(
    'packages/features/bounty/src/price.ts',
    ['export const PRICE = { xp: outcome.totalTokens * 0.1 };', ''].join('\n'),
  ),
  // A bare local named for what it holds. No division, no property access.
  contentFile('packages/features/agent/src/wallet.ts', 'const xp = tokens;'),
  // A test file is production code as far as this rule is concerned. Excluding
  // them would be a hole with a plausible-looking sign on it: the natural place
  // to demonstrate the economy you were told not to build is a fixture.
  contentFile(
    'packages/features/quest/src/award.test.ts',
    'expect(reward).toMatchObject({ xp: event.inputTokens / 4 });',
  ),
  // A comment naming the forbidden pair. The guard against the economy must not
  // be reported as an instance of it.
  contentFile(
    'packages/features/reputation/src/domain.ts',
    ['// experience is never derived from tokens.', 'export const TRUST = 1;'].join('\n'),
  ),
  // A string naming the forbidden pair, which is how a rule test and an error
  // message both say the thing out loud.
  contentFile(
    'packages/features/reputation/src/feature.ts',
    ['export const why = "xp must not come from tokens";', ''].join('\n'),
  ),
  // The credential sense of the same word. `packages/features/agent` mints
  // bearer tokens, which is an identity concern and has no business being read
  // as a price, so the rule is scoped by what the line is FOR rather than by
  // keeping a list of the words that are innocent.
  contentFile(
    'packages/features/agent/src/credential.ts',
    'const token = random(TOKEN_BYTES).toString("base64url");',
  ),
  // Outside a feature. The rule is about what a feature awards, and an adapter
  // that counts tokens to bill somebody is a different question with a different
  // answer.
  contentFile('packages/adapters/claude/src/usage.ts', 'const xp = payload.totalTokens;'),
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
    rule: 'no-cross-package-relative-import',
    from: 'packages/adapters/amp/src/watcher.ts',
    specifier: '../../../core/src/runtime.js',
  },
  {
    rule: 'no-cross-package-relative-import',
    from: 'packages/features/battle/src/hostile.ts',
    specifier: '../../../core/src/registry.js',
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
      // Not in FORBIDDEN because it is not a layer pair: it fires only after
      // every layer rule has declined, so it has to be listed here separately
      // or this assertion would call its absence a completeness rather than
      // notice that a rule stopped firing.
      contract.CROSS_PACKAGE_RELATIVE_RULE.name,
    ]);
    // The content rules are declared in the same file and asserted here rather
    // than in a describe block of their own, because the failure this catches is
    // a rule nobody ever tripped: a content rule with no fixture would otherwise
    // sit in the contract looking enforced and being checked by no one.
    const contentRuleNames = contract.CONTENT_RULES.map((rule) => rule.name);
    expect(contentRuleNames.length).toBeGreaterThan(0);
    const contentViolations = contract.checkContent({ files: CONTENT_FIXTURES });
    for (const name of contentRuleNames) {
      expect(
        contentViolations.map((violation) => violation.rule),
        `${name} has no fixture that trips it`,
      ).toContain(name);
    }

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

describe('no feature may price experience in tokens', () => {
  // The integrity property no layering rule can express. An award computed from
  // a token count imports nothing, typechecks, and passes all seven forbidden
  // pairs, because what it breaks is an economy rather than a dependency. Plan
  // sections 10.2, 10.3 and 17 say experience comes from work and never from
  // tokens, and before this rule the only thing saying so in the tree was
  // packages/features/progression/src/rules.test.ts — which proves the award
  // TABLE has no such column and says nothing about a feature that computes an
  // award before it ever reaches the table.
  const violations = contract.checkContent({ files: CONTENT_FIXTURES });

  it('catches every token-derived award in the fixture, in every shape it is written in', () => {
    const reported = violations.map((violation) => violation.from.split(':')[0]).sort();

    expect(reported).toEqual([
      'packages/features/agent/src/wallet.ts',
      'packages/features/bounty/src/price.ts',
      'packages/features/quest/src/award.test.ts',
      'packages/features/quest/src/award.ts',
    ]);
  });

  it('says which line and what it said', () => {
    const [first] = violations.filter(
      (violation) => violation.from === 'packages/features/quest/src/award.ts:1',
    );
    expect(first).toBeDefined();
    // A report a reader cannot act on is a report nobody acts on, and the line
    // is the thing they have to find.
    expect(first?.to).toContain('tokensUsed');
    expect(first?.message).toContain('no-token-derived-experience');
  });

  it('does not read the word out of a comment or a string', () => {
    // Both files above name the forbidden pair and neither is a violation. This
    // is the half of the check that decides whether it is still running in a
    // month: a scanner that reports the guard against the economy is a scanner
    // that gets switched off.
    const reported = violations.map((violation) => violation.from);
    expect(reported.some((from) => from.includes('reputation'))).toBe(false);
  });

  it('is not fooled by the credential sense of the same word, or by a package outside a feature', () => {
    // `packages/features/agent/src/credential.ts` mints bearer tokens and is in
    // the fixture. Neither it nor an adapter's usage counter is an award.
    const reported = violations.map((violation) => violation.from);
    expect(reported.some((from) => from.includes('credential'))).toBe(false);
    expect(reported.some((from) => from.includes('adapters'))).toBe(false);
  });

  it('reports nothing for the repository as it stands', () => {
    const sourceFiles = contract.listSourceFiles(REPO_ROOT);
    expect(contract.formatReport(contract.checkContent({ files: sourceFiles }))).toBe('');
  });
});
