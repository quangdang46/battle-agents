'use strict';

// Single source of truth for the layering contract (`plan section 19`):
// presentation -> features -> core <- infrastructure, features never import each
// other, adapters and interfaces import core + protocol only. It exports the
// ARCHITECTURE RULE ENGINE. Read this before reaching for a tool.
//
// This is NOT a dependency-cruiser config and no dependency-cruiser CLI can
// consume it. The real CLI expects a config object and structured-clones the
// module; running "npx dependency-cruiser --config architecture-rules.cjs"
// fails, and "npx depcruise" resolves to an unrelated security tool that exits 0
// no matter what is in the tree. A file once named .dependency-cruiser.cjs made both
// of those look plausible, which is worse than not having the file.
//
// The single supported entry point is checkImports(). It is exercised by
// tests/unit/dependency-rules.test.ts against a fixture, and by
// scripts/check-architecture.ts against the real tree, which is a pipeline
// stage. If you add a rule, add a fixture that triggers it: the test asserts
// every declared rule is exercised, so a rule nobody watches work fails CI.
//
// Layer rules expressed as forbidden pairs plus the rule engine that
// `tests/dependency-rules.test.ts` runs over both fixtures and this repository.

const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join, posix, relative, sep } = require('node:path');

const WORKSPACE_SCOPE = '@battle-agents/';

// Returned when a specifier is inside our own scope but names no package we can
// find. It used to be null, which is the same value used for a genuinely
// external import, so a typo or a stale specifier was skipped without a word.
// The "typecheck will catch it" argument only holds if typecheck always runs
// alongside, and this config is also runnable on its own, so the file has to
// speak up for itself.
// A string, not a Symbol. The real dependency-cruiser CLI structured-clones
// module state, and Symbol cannot be cloned, so the CLI died with "Symbol(...)
// could not be cloned" on a CLEAN tree. vitest never surfaced it because it
// calls checkImports in-process, so the two paths disagreed and only one was
// ever exercised.
const UNRESOLVED_WORKSPACE_IMPORT = '@@unresolved-workspace-import@@';

// It does not fit FORBIDDEN, whose rules are shaped source-layer to
// target-layers, because there is no target: the import resolves to nothing. It
// is still a rule, and it is declared in one place so the test that asserts the
// contract is complete does not have to know the name by heart.
const UNRESOLVED_RULE = {
  name: 'unresolved-workspace-import',
  reason:
    'Specifier is inside the @battle-agents scope but no package with that name exists. ' +
    'An import nobody can resolve is also an import no rule can check, so it is reported ' +
    'rather than skipped.',
};
const UNCLASSIFIED_LAYER = 'unclassified';
const UNCLASSIFIED_RULE = 'unclassified-layer';
const UNCLASSIFIED_REASON =
  'Classify this package in architecture-rules.cjs before depending on it, otherwise the layering guarantee silently stops covering it.';
const SOURCE_ROOTS = ['apps', 'packages', 'drizzle'];
// packages/db holds the schema source and the database client, which the plan
// taxonomy puts in infrastructure. It is scanned because an import that resolves
// to nothing in the schema is as invisible as one in a package, and while it
// lived at the repository root the engine skipped the one directory the
// schema-hygiene gate cares about. Unclassified code is reported rather than
// ignored, so adding a root without classifying it fails loudly, which is the
// behaviour that makes this safe to extend.
const FEATURES_DIR = 'packages/features';
const ADAPTERS_DIR = 'packages/adapters';
const PACKAGE_CONTAINERS = [...SOURCE_ROOTS, ADAPTERS_DIR, FEATURES_DIR];
const IGNORED_DIRECTORY_NAMES = ['dist', 'node_modules', '.git', '.tmp', '.beads'];
const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
// A NUL cannot occur in a rule name, path or specifier, so it joins the dedupe key
// without the ambiguity a space or a dash would introduce. Written as an escape so the
// file stays plain text and every text tool can read it.
const VIOLATION_KEY_SEPARATOR = '\0';
const IMPORT_SPECIFIER_PATTERNS = [
  /(?:from|import)\s+['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const FEATURE_PATH = `${FEATURES_DIR}/*/**/*.ts`;

const LAYERS = [
  {
    name: 'feature',
    instance: /^packages\/features\/([^/]+)(?:\/|$)/,
    files: [FEATURE_PATH],
  },
  {
    name: 'adapter',
    instance: /^packages\/adapters\/([^/]+)(?:\/|$)/,
    files: ['packages/adapters/*/**/*.ts'],
  },
  {
    name: 'interface',
    // packages/api is the shared Application API the three surfaces consume.
    // It is classified here rather than given a layer of its own because it
    // imports core and nothing else: it decides nothing about the game, it
    // reads the registry and calls through it. A layer of its own would let it
    // grow imports the other consumers are forbidden.
    instance: /^(?:packages\/(?:api|cli|mcp-server)(?:\/|$)|packages\/interfaces\/[^/]+(?:\/|$))/,
    files: [
      'packages/api/**/*.ts',
      'packages/cli/**/*.ts',
      'packages/mcp-server/**/*.ts',
      'packages/interfaces/*/**/*.ts',
    ],
  },
  {
    name: 'infrastructure',
    instance: /^(?:drizzle(?:\/|$)|packages\/(?:infrastructure(?:\/[^/]+)?|db)(?:\/|$))/,
    files: ['packages/infrastructure/*/**/*.ts', 'packages/db/**/*.ts'],
  },
  {
    name: 'core',
    instance: /^packages\/core(?:\/|$)/,
    files: ['packages/core/**/*.ts'],
  },
  {
    name: 'protocol',
    instance: /^packages\/protocol(?:\/|$)/,
    files: ['packages/protocol/**/*.ts'],
  },
  {
    name: 'presentation',
    instance:
      /^(?:apps\/web|apps\/presentation\/[^/]+|packages\/game-client|packages\/presentation\/[^/]+)(?:\/|$)/,
    files: [
      'apps/web/**/*.ts',
      'apps/presentation/*/**/*.ts',
      'packages/game-client/**/*.ts',
      'packages/presentation/*/**/*.ts',
    ],
  },
];

const FORBIDDEN = [
  {
    name: 'no-feature-cross-import',
    from: { layer: 'feature' },
    to: { layers: ['feature'], differentInstance: true },
    reason:
      'Features never import each other; a cross-feature need goes through a capability declared in core (plan section 19).',
  },
  {
    name: 'no-feature-import-of-outer-layers',
    from: { layer: 'feature' },
    to: { layers: ['adapter', 'interface', 'infrastructure', 'presentation'] },
    reason:
      'A feature depends on core and protocol only; features never import Docker, Compose or Postgres-container concepts (plan sections 19 and 37).',
  },
  {
    name: 'no-core-import-of-outer-layers',
    from: { layer: 'core' },
    to: { layers: ['feature', 'adapter', 'interface', 'infrastructure', 'presentation'] },
    reason:
      'Core knows only primitives, so core importing a feature, adapter, interface or infrastructure package is the God-Engine antipattern (plan section 19).',
  },
  {
    name: 'no-adapter-game-code',
    from: { layer: 'adapter' },
    to: { layers: ['feature', 'adapter', 'interface', 'infrastructure', 'presentation'] },
    reason:
      'Adapters import core and protocol only; no adapter imports game code (plan sections 19 and 23).',
  },
  {
    name: 'no-interface-feature-implementation',
    from: { layer: 'interface' },
    to: { layers: ['feature', 'adapter', 'infrastructure', 'presentation'] },
    reason:
      'Interfaces consume features through the capability registry, never by importing a feature implementation (plan section 36).',
  },
  {
    name: 'no-infrastructure-import-of-upper-layers',
    from: { layer: 'infrastructure' },
    to: { layers: ['feature', 'adapter', 'interface', 'presentation'] },
    reason:
      'Infrastructure implements the core persistence boundary, so it must not depend on the layers that consume it (plan section 19).',
  },
];

function toPosix(filePath) {
  return filePath.split(sep).join('/');
}

function toPosixRelative(repoRoot, absolutePath) {
  return toPosix(relative(repoRoot, absolutePath));
}

function isContainerDir(repoRelativeDir) {
  return repoRelativeDir === FEATURES_DIR || repoRelativeDir === ADAPTERS_DIR;
}

function listDirectoryNames(absoluteDir) {
  if (!existsSync(absoluteDir)) {
    return [];
  }
  return readdirSync(absoluteDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORY_NAMES.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function readManifestName(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return typeof manifest.name === 'string' ? manifest.name : null;
}

function discoverWorkspacePackages(repoRoot) {
  const packages = [];
  for (const container of PACKAGE_CONTAINERS) {
    for (const name of listDirectoryNames(join(repoRoot, container))) {
      const dir = toPosix(join(container, name));
      if (isContainerDir(dir)) {
        continue;
      }
      const manifestPath = join(repoRoot, dir, 'package.json');
      const packageName = existsSync(manifestPath) ? readManifestName(manifestPath) : null;
      if (packageName !== null) {
        packages.push({ dir, name: packageName });
      }
    }
  }
  return packages.sort((left, right) => left.dir.localeCompare(right.dir));
}

function listFeatureInstances(repoRoot) {
  return listDirectoryNames(join(repoRoot, FEATURES_DIR));
}

function listSourceFiles(repoRoot) {
  const files = [];
  const visit = (absoluteDir) => {
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      if (IGNORED_DIRECTORY_NAMES.includes(entry.name)) {
        continue;
      }
      const absolutePath = join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (TYPESCRIPT_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        files.push({
          path: toPosixRelative(repoRoot, absolutePath),
          source: readFileSync(absolutePath, 'utf8'),
        });
      }
    }
  };
  for (const root of SOURCE_ROOTS) {
    if (existsSync(join(repoRoot, root))) {
      visit(join(repoRoot, root));
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * The package a repo-relative path belongs to: everything up to and including
 * the leaf package directory, so `packages/adapters/claude/src/parser.ts` and
 * `packages/adapters/claude/src/index.ts` share `packages/adapters/claude`.
 *
 * A package importing its own files is not crossing a layer. The rule set has
 * to say so explicitly, because `no-adapter-game-code` lists 'adapter' among
 * the forbidden targets to stop one adapter reaching into another, and without
 * this that same rule flags an adapter importing a sibling file in its own
 * directory. That is not a cosmetic difference: it would make "a new CLI is one
 * subdirectory" impossible to keep, because any adapter with more than one file
 * would fail the gate.
 */
function packageRootOf(repoRelativePath) {
  const parts = repoRelativePath.split('/');
  // FEATURES_DIR and ADAPTERS_DIR are full prefixes like 'packages/features',
  // so the test is on the first two segments, not on a leaf name. Comparing
  // the wrong thing here silently collapsed every feature into one package,
  // and the exemption then swallowed feature-to-feature imports, which is the
  // one thing the rule exists to catch.
  const head = parts.slice(0, 2).join('/');
  const featuresAt = head === FEATURES_DIR ? 1 : -1;
  const adaptersAt = head === ADAPTERS_DIR ? 1 : -1;
  const cut =
    featuresAt === -1
      ? adaptersAt
      : adaptersAt === -1
        ? featuresAt
        : Math.min(featuresAt, adaptersAt);
  if (cut === -1) {
    // Not a nested package: apps/web, or a top-level package like core.
    return parts.slice(0, 2).join('/');
  }
  return parts.slice(0, cut + 2).join('/');
}

function isSamePackage(fromPath, toPath) {
  return packageRootOf(fromPath) === packageRootOf(toPath);
}

function classifyPath(repoRelativePath) {
  for (const layer of LAYERS) {
    const match = layer.instance.exec(repoRelativePath);
    if (match) {
      return { layer: layer.name, instance: match[1] ?? null };
    }
  }
  return { layer: UNCLASSIFIED_LAYER, instance: null };
}

function collectImportSpecifiers(source) {
  return IMPORT_SPECIFIER_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)])
    .map((match) => match[1])
    .filter((specifier) => specifier !== undefined);
}

function candidateModulePaths(resolvedPath) {
  const withoutJsExtension = resolvedPath.endsWith('.js')
    ? `${resolvedPath.slice(0, -'.js'.length)}.ts`
    : resolvedPath;
  return [
    withoutJsExtension,
    resolvedPath,
    `${withoutJsExtension}.ts`,
    `${withoutJsExtension}.tsx`,
    posix.join(withoutJsExtension, 'index.ts'),
  ];
}

function resolveRelativeImport(fromPath, specifier, knownPaths) {
  const resolvedPath = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  return (
    candidateModulePaths(resolvedPath).find((candidate) => knownPaths.has(candidate)) ??
    resolvedPath
  );
}

function resolveWorkspaceTarget({ fromPath, specifier, knownPaths, packageDirsByName }) {
  if (specifier.startsWith('.')) {
    return resolveRelativeImport(fromPath, specifier, knownPaths);
  }
  if (!specifier.startsWith(WORKSPACE_SCOPE)) {
    return null;
  }
  return packageDirsByName.get(specifier) ?? UNRESOLVED_WORKSPACE_IMPORT;
}

function violatesRule(rule, source, target) {
  if (source.layer !== rule.from.layer || !rule.to.layers.includes(target.layer)) {
    return false;
  }
  if (!rule.to.differentInstance) {
    return true;
  }
  return (
    source.instance !== null && target.instance !== null && source.instance !== target.instance
  );
}

function buildViolation({ rule, from, to, specifier, reason }) {
  const subject = specifier === null ? from : `${from} imports '${specifier}'`;
  return {
    rule,
    from,
    to,
    specifier,
    message: `${rule}: ${subject} (resolves to ${to}). ${reason}`,
  };
}

function violationKey(violation) {
  return [violation.rule, violation.from, violation.to, violation.specifier].join(
    VIOLATION_KEY_SEPARATOR,
  );
}

function checkImports({ files, packages }) {
  const knownPaths = new Set(files.map((file) => file.path));
  const packageDirsByName = new Map(packages.map((entry) => [entry.name, entry.dir]));
  const violations = [];

  for (const file of files) {
    const source = classifyPath(file.path);
    if (source.layer === UNCLASSIFIED_LAYER) {
      violations.push(
        buildViolation({
          rule: UNCLASSIFIED_RULE,
          from: file.path,
          to: file.path,
          specifier: null,
          reason: UNCLASSIFIED_REASON,
        }),
      );
      continue;
    }
    for (const specifier of collectImportSpecifiers(file.source)) {
      const target = resolveWorkspaceTarget({
        fromPath: file.path,
        specifier,
        knownPaths,
        packageDirsByName,
      });
      if (target === null) {
        // A genuinely external import, which this file has no opinion about.
        continue;
      }
      if (target === UNRESOLVED_WORKSPACE_IMPORT) {
        violations.push(
          buildViolation({
            rule: 'unresolved-workspace-import',
            from: file.path,
            to: specifier,
            specifier,
            reason: UNRESOLVED_RULE.reason,
          }),
        );
        continue;
      }
      // An import that stays inside one package is not a layer crossing, and
      // several rules list their own layer among the forbidden targets. Check
      // this before consulting the rules, or a multi-file adapter cannot exist.
      if (isSamePackage(file.path, target)) {
        continue;
      }

      const rule = FORBIDDEN.find((candidate) =>
        violatesRule(candidate, source, classifyPath(target)),
      );
      if (rule) {
        violations.push(
          buildViolation({
            rule: rule.name,
            from: file.path,
            to: target,
            specifier,
            reason: rule.reason,
          }),
        );
      }
    }
  }

  const deduplicated = new Map(violations.map((violation) => [violationKey(violation), violation]));
  return [...deduplicated.values()].sort((left, right) =>
    violationKey(left).localeCompare(violationKey(right)),
  );
}

function formatReport(violations) {
  return violations.map((violation) => violation.message).join('\n');
}

module.exports = {
  FORBIDDEN,
  UNRESOLVED_RULE,
  UNRESOLVED_WORKSPACE_IMPORT,
  LAYERS,
  checkImports,
  classifyPath,
  discoverWorkspacePackages,
  formatReport,
  listFeatureInstances,
  listSourceFiles,
};
