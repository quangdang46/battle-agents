import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createInMemoryEventBus,
  createRuntime,
  InMemoryStateStore,
  type GameFeature,
  type Runtime,
} from '@battle-agents/core';
import {
  assertExtensionContract,
  assertExtensionContracts,
  EXTENSION_CONTRACT_VERSION,
  ExtensionContractMismatch,
} from '@battle-agents/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SPEEDRUN_EXTENSION_CONTRACT,
  speedrunMode,
} from '../../examples/speedrun-mode/src/index.js';

/**
 * The out-of-tree extension test, and the acceptance test for the shape chosen
 * in `docs/design/extension-surface.md`.
 *
 * WHAT IT IS. A package that lives outside this repository's workspace — not in
 * `packages/`, not in the pnpm globs, not in the layering contract — is composed
 * into a runtime through `createRuntime` and then taken back out through
 * `uninstall`. Two properties are asserted, and the second is the one that is
 * easy to omit:
 *
 *   1. it installs, and it installs through the public barrels rather than
 *      through a path into another package's source;
 *   2. uninstalling gives back every kind of registration it made, and the
 *      features that were already there keep working.
 *
 * A feature that installs but whose handlers, commands, actionDefs,
 * capabilities, declared capabilities or persisted event types are not all
 * given back is a leak, and a leak survives into every later test in the file
 * that happens to install a second thing. `packages/core/src/runtime.test.ts`
 * asserts the give-back property for internal features; this is the same
 * assertion for one that came from outside, because the internal case is the
 * one that is easy to get right by reading the same code twice.
 *
 * WHY THIS IS A UNIT TEST AND NOT AN INTEGRATION ONE. Nothing here needs a
 * server, a database or a network — the extension surface is entirely in
 * process. The claim it makes is about module resolution and registration
 * bookkeeping, and both are decided before the first request is served.
 *
 * WHAT IT CANNOT PROVE, because reading a green run as more than it says is the
 * failure this repository keeps paying for:
 *
 *   - that the package would install from a REGISTRY. It is not published, and
 *     publishing is a release step, not a property of the source. What is
 *     checked is the part of consumability that lives in the manifest: the
 *     `exports`/`types`/`main` fields and the declared peer dependencies.
 *   - that the typecheck stage compiles this package. It does not: `examples/`
 *     is outside every tsconfig project in the repository, deliberately, because
 *     a third party's package is not ours to compile. The import-resolution
 *     checks below are the substitute, and they are stronger than a typecheck
 *     for the one thing being claimed — a name that is not exported cannot be
 *     named here at all.
 *   - that `docs/design/extension-surface.md` is correct. It is prose, and prose
 *     is not a gate.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CORE_DIR = join(REPO_ROOT, 'packages/core');
const PROTOCOL_DIR = join(REPO_ROOT, 'packages/protocol');

/** The out-of-tree package, and the boundary its imports must not cross. */
const EXTERNAL_DIR = join(REPO_ROOT, 'examples/speedrun-mode');
const EXTERNAL_PACKAGE_DIRS = [EXTERNAL_DIR];

const CORE_SPECIFIER = '@battle-agents/core';
const PROTOCOL_SPECIFIER = '@battle-agents/protocol';

const AT = '2026-09-26T00:00:00.000Z';

/** The capability an external feature needs, named the way it really is. */
const BOUNTY_LIST = 'bounty.list';

const RUN_FINISHED = 'speedrun.finished';

function posix(path: string): string {
  return path.split(sep).join('/');
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every source file in the out-of-tree package. */
function externalSources(): string[] {
  return EXTERNAL_PACKAGE_DIRS.flatMap((dir) => listSourceFiles(dir));
}

/**
 * Every `.ts` file under a directory, with a content digest, as one sorted
 * string. Both halves matter: the list catches a file added or removed, and the
 * digest catches an edit to one that was already there.
 */
function treeFingerprint(dir: string): string {
  const parts = listSourceFiles(dir).map((file) => {
    const bytes = readFileSync(file);
    return `${posix(relative(dir, file))}:${createHash('sha256').update(bytes).digest('hex')}`;
  });
  return parts.sort().join('\n');
}

/**
 * Source with its comments removed, so prose about an import is not read as an
 * import.
 *
 * Both kinds, because the fixture this guards is full of prose that NAMES the
 * specifiers it is describing — a guard that counted those would either invent
 * dependencies that do not exist or, worse, let a real import hide inside a
 * comment-shaped line. Stripping the whole block comment removes the ambiguity
 * in one direction, and no TypeScript file here puts a specifier inside a
 * comment-shaped line of code.
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

/**
 * Every import specifier in a source file.
 *
 * The two patterns are the ones `architecture-rules.cjs` uses, deliberately: a
 * guard that found imports a different way from the rule engine could miss one
 * the rule engine catches, and the whole value of this is that it is a second
 * reader of the same thing rather than a special case.
 */
function importSpecifiers(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of [
    /(?:from|import)\s+['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of code(source).matchAll(pattern)) {
      found.add(match[1] as string);
    }
  }
  return [...found].sort();
}

/**
 * One name out of a brace clause, with the modifiers removed.
 *
 * `type` and the `as` form are both stripped because the names a barrel holds
 * are plain identifiers, and leaving a modifier attached compares `type
 * ExtensionContract` against a set containing `ExtensionContract` — a
 * violation reported for correct TypeScript. That is not hypothetical: this
 * function's first caller wrote `import { a, type B }` on its first run and the
 * guard called it a missing export.
 *
 * `exportKind` is 'import' or 'export' because the two disagree about which
 * half of `X as Y` is the name the barrel publishes: an import binds `X`
 * locally, an export publishes `Y`.
 */
function specifierName(clause: string, exportKind: 'import' | 'export'): string | undefined {
  const parts = clause
    .trim()
    .replace(/^type\s+/, '')
    .split(/\s+as\s+/)
    .map((part) => part.trim());
  const name = exportKind === 'import' ? parts[0] : parts[parts.length - 1];
  return name === undefined || name === '' ? undefined : name;
}

/** The `names` each specifier is asked for through a named import. */
function namedImports(source: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names: string[] = [];
  // The brace class cannot cross a `}`, so this cannot run past the end of the
  // clause and pick up a name from the following import.
  for (const match of code(source).matchAll(
    new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`, 'g'),
  )) {
    for (const part of (match[1] as string).split(',')) {
      const name = specifierName(part, 'import');
      if (name !== undefined) names.push(name);
    }
  }
  return names.sort();
}

/**
 * Whether a source file takes a default import from a barrel.
 *
 * Separate because the named-import pattern above cannot see one, and neither
 * barrel has a default export — so a default import here is a name that does
 * not exist, and it is the one import shape a reader would not notice is wrong.
 */
function takesDefaultImport(source: string, specifier: string): boolean {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`import\\s+[A-Za-z_$][\\w$]*\\s+from\\s*['"]${escaped}['"]`).test(code(source));
}

/**
 * A source path a `.js` specifier points at, which is a `.ts` file on disk.
 *
 * The barrels are written with ESM specifiers — `from './agent-event.js'` — and
 * the file on disk is `agent-event.ts`, because a build is what turns one into
 * the other. Testing the literal path therefore finds nothing, and the hop this
 * exists to serve was silently dead: `existsSync` was false for every
 * `export *` in both barrels, so `barrelExports` returned only the names the
 * barrels enumerate by hand and the comment claiming it followed one hop was
 * false. Nothing noticed, because the guard has a use either way.
 */
function sourcePathFor(pkgDir: string, specifier: string): string | undefined {
  const joined = resolve(pkgDir, 'src', specifier);
  const candidates = [joined, joined.replace(/\.js$/, '.ts')];
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * The names one module exports, following its `export *` until it stops.
 *
 * The hop exists because `@battle-agents/protocol`'s barrel is five `export *`
 * lines, so it does not enumerate its own surface and a name a third party can
 * import is not visible in the file that is supposed to list them. That is a
 * real defect in the published SDK and it is reported in
 * `docs/design/extension-surface.md` rather than fixed here, because rewriting
 * a barrel that four other packages in this workspace import is a change with a
 * blast radius, and this bead's job is to find the gap and name it.
 *
 * It recurses on FILES, not on package directories, and `seen` holds file
 * paths. A `export *` target is a sibling of the barrel inside `src/`, so
 * recursing on the package directory asked for `src/src/index.ts` — the shape
 * the first version had was only ever right because the hop never ran.
 */
function exportsOfFile(
  file: string,
  pkgDir: string,
  unresolved: string[],
  seen: Set<string>,
): Set<string> {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const names = new Set<string>();
  const source = code(readFileSync(file, 'utf8'));
  for (const match of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const part of (match[1] as string).split(',')) {
      const name = specifierName(part, 'export');
      if (name !== undefined) names.add(name);
    }
  }
  // Declarations, which is most of what a module exports. A resolver that
  // reads only re-export lists sees a barrel as far smaller than it is, and a
  // barrel it believes is smaller is one where a correct import of
  // `createIngestSender` is reported as a name that does not exist. That is a
  // guard that cries wolf on the most ordinary code there is, and this one did
  // exactly that until `sees past a barrel` below pinned it.
  for (const match of source.matchAll(
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(match[1] as string);
  }
  for (const _ of source.matchAll(/export\s+default\s/g)) {
    names.add('default');
  }
  for (const match of source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const target = sourcePathFor(pkgDir, match[1] as string);
    // Recorded rather than skipped, because a branch that resolves to nothing
    // costs the guard its coverage silently: the barrel would look enumerated
    // and every name behind it would read as unexported. `resolves every
    // export *` is the assertion that keeps that from being invisible.
    if (target === undefined) {
      unresolved.push(`${posix(relative(REPO_ROOT, file))} exports * from ${match[1]}`);
      continue;
    }
    for (const name of exportsOfFile(target, pkgDir, unresolved, seen)) names.add(name);
  }
  return names;
}

/** Both barrels, and the `export *` branches that could not be followed. */
function resolvedBarrels(): {
  readonly exported: Map<string, Set<string>>;
  readonly unresolved: string[];
} {
  const unresolved: string[] = [];
  const exported = new Map([
    [
      CORE_SPECIFIER,
      exportsOfFile(join(CORE_DIR, 'src/index.ts'), CORE_DIR, unresolved, new Set()),
    ],
    [
      PROTOCOL_SPECIFIER,
      exportsOfFile(join(PROTOCOL_DIR, 'src/index.ts'), PROTOCOL_DIR, unresolved, new Set()),
    ],
  ]);
  return { exported, unresolved };
}

interface Harness {
  readonly runtime: Runtime;
  readonly store: InMemoryStateStore;
}

/**
 * A stand-in for a feature that is already installed.
 *
 * It declares `bounty.list` — the real capability name the platform ships —
 * because that string is the entire coupling between this package and the rest
 * of the game, and a stand-in under a made-up name would prove less. It is a
 * stand-in rather than the real `bounty` feature so this stays a unit test: the
 * real one needs a repository, and what is under test is the runtime's
 * give-back, not the bounty feature's behaviour.
 */
function neighbour(): GameFeature {
  return {
    id: 'neighbour',
    capabilities: [{ name: BOUNTY_LIST, description: 'Stand-in for the bounty feature.' }],
    actionDefs: [
      {
        id: 'neighbour.ping',
        permissions: ['neighbour.ping'],
        description: 'Answer, so the test can tell the neighbour still runs.',
        run: async () => 'pong',
      },
    ],
    eventHandlers: [
      {
        on: 'neighbour.probe',
        handle: async () => {},
      },
    ],
    persistedEvents: ['neighbour.pinged'],
  };
}

function harness(extensions: readonly GameFeature[]): Harness {
  const store = new InMemoryStateStore();
  const bus = createInMemoryEventBus();
  return {
    runtime: createRuntime({ extensions, store, bus, now: () => AT }),
    store,
  };
}

describe('the out-of-tree package is consumable', () => {
  it('declares the manifest fields a consumer resolves it by', () => {
    const manifest = JSON.parse(readFileSync(join(EXTERNAL_DIR, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;

    // The `exports` map is what a modern resolver reads; `main` and `types` are
    // what a consumer that ignores it falls back to. All three, because a
    // package with only `main` is consumable by a bundler and not by Node.
    expect(manifest['type']).toBe('module');
    expect(typeof manifest['main']).toBe('string');
    expect(typeof manifest['types']).toBe('string');
    const exports = manifest['exports'] as Record<string, unknown>;
    expect(Object.keys(exports)).toEqual(['.']);
    expect(exports['.']).toMatchObject({
      types: expect.stringContaining('index.d.ts'),
      default: expect.stringContaining('index.js'),
    });
  });

  it('depends on the platform only as peers, so a host supplies the versions', () => {
    const manifest = JSON.parse(readFileSync(join(EXTERNAL_DIR, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;

    // A peer dependency is the correct shape for an extension: the host already
    // has a core, and bundling a second one inside the extension is how two
    // copies of a frozen contract end up in one process.
    expect(Object.keys(manifest['peerDependencies'] as Record<string, string>).sort()).toEqual([
      CORE_SPECIFIER,
      PROTOCOL_SPECIFIER,
    ]);
    expect(manifest['dependencies']).toBeUndefined();
  });
});

describe('the out-of-tree package imports nothing but public barrels', () => {
  /**
   * The core-diff guard, in the form the brief asks for: an extension that
   * reaches into core internals FAILS rather than being discouraged.
   *
   * `@battle-agents/core` is a frozen package, so "without patching core" cannot
   * be asserted by diffing core — the extension is not modifying core, it is
   * depending on a file core never meant to publish, and the file exists and
   * typechecks perfectly well. Reaching past the barrel is the failure that
   * looks least like one: there is no error, the build is green, and the
   * dependency on a private module is invisible in the manifest.
   *
   * So the guard is on the EXTENSION's imports, and it is the only assertion in
   * this file that would catch it. Every specifier is checked twice: that it
   * resolves to a package the platform publishes, and that a relative one stays
   * inside the extension's own directory.
   */
  it('reaches core and protocol only through their public entries', () => {
    const files = externalSources();
    expect(files.length, 'the out-of-tree package has source to check').toBeGreaterThan(0);

    const allowed = new Set([CORE_SPECIFIER, PROTOCOL_SPECIFIER]);
    const violations: string[] = [];

    for (const file of files) {
      const where = posix(relative(REPO_ROOT, file));
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('.')) {
          // A relative import is legitimate inside a package and illegitimate
          // across one, so the check is where it RESOLVES rather than how it is
          // written. `../../packages/core/src/registry.js` starts with `..` and
          // is exactly the case this has to catch.
          const resolvedPath = resolve(dirname(file), specifier);
          if (!resolvedPath.startsWith(EXTERNAL_DIR + sep)) {
            violations.push(`${where} imports ${specifier}, which leaves the package`);
          }
          continue;
        }
        if (!allowed.has(specifier)) {
          violations.push(`${where} imports ${specifier}, which is not a platform barrel`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('resolves every export * in both barrels, so the enumeration below is whole', () => {
    // The guard below reads each barrel by hand and follows its `export *`
    // branches. A branch it cannot follow is not an error there — it is
    // silently missing names, which would make every name behind it read as
    // unexported. This is the assertion that stops that being invisible, and it
    // is here because the first version of the resolver tested
    // `packages/protocol/src/./agent-event.js`, a path that does not exist, so
    // every branch was skipped and only the hand-written exports were seen. The
    // suite was green the whole time.
    const { unresolved } = resolvedBarrels();
    expect(unresolved).toEqual([]);
  });

  it('sees past a barrel, rather than trusting the file that is meant to list it', () => {
    // The guard below decides whether a name exists by reading the barrels. A
    // reader that undercounts does not merely miss violations — it invents
    // them, reporting a correct `import { createIngestSender } from
    // '@battle-agents/protocol'` as a name that does not exist, because that
    // name is declared in `ingest.ts` and reaches `index.ts` through an
    // `export *` rather than through a re-export list. That is a guard crying
    // wolf on the most ordinary import there is, which is worse than no guard
    // because it teaches a reader to ignore it.
    //
    // These names are each reachable only one way, so each pins one hop: the
    // declarations behind `export *`, and PROTOCOL_VERSION as the control that
    // the obvious path still works.
    const { exported } = resolvedBarrels();
    const protocol = exported.get(PROTOCOL_SPECIFIER) as Set<string>;
    const core = exported.get(CORE_SPECIFIER) as Set<string>;

    for (const name of ['createIngestSender', 'normalizeToolName', 'EventBuffer']) {
      expect(protocol, `protocol resolves ${name}`).toContain(name);
    }
    for (const name of ['PROTOCOL_VERSION', 'AgentEventSchema', 'IngestRefusedError']) {
      expect(protocol, `protocol resolves ${name}`).toContain(name);
    }
    for (const name of ['createRuntime', 'HOOK_PROVIDER_ID_PATTERN', 'namespacedSessionId']) {
      expect(core, `core resolves ${name}`).toContain(name);
    }
  });

  it('names only what each barrel actually exports', () => {
    const { exported } = resolvedBarrels();

    const unexported: string[] = [];
    for (const file of externalSources()) {
      const where = posix(relative(REPO_ROOT, file));
      const source = readFileSync(file, 'utf8');
      for (const [specifier, names] of exported) {
        if (takesDefaultImport(source, specifier)) {
          unexported.push(`${where} takes a default import from ${specifier}, which has none`);
        }
        const available = names as Set<string>;
        expect(available.size, `${specifier}'s barrel resolved to no names`).toBeGreaterThan(0);
        for (const name of namedImports(source, specifier)) {
          if (!available.has(name)) {
            unexported.push(`${where} imports ${name} from ${specifier}, which does not export it`);
          }
        }
      }
    }

    expect(unexported).toEqual([]);
  });

  it('sits outside the workspace, so nothing inside packages/ can import it', () => {
    // The composition root is the only thing allowed to hold this feature, and
    // in this build that is nothing at all. If the package were under
    // `packages/` the layering engine would cover it; being outside is what
    // makes this file, rather than `architecture-rules.cjs`, the thing that has
    // to be right about it.
    expect(posix(relative(REPO_ROOT, EXTERNAL_DIR)).startsWith('packages/')).toBe(false);

    const workspace = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).not.toMatch(/examples/);
  });
});

describe('installing the out-of-tree feature through the public API', () => {
  it('registers every kind of declaration and reports itself as a domain', () => {
    const { runtime } = harness([speedrunMode()]);

    expect(runtime.domains()).toContain('speedrun');
    expect(runtime.commands().sort()).toEqual(['speedrun.start', 'speedrun.stop']);
    expect(runtime.actions().sort()).toEqual(['speedrun.create', 'speedrun.report']);
    expect(runtime.capabilities().sort()).toEqual(['speedrun.create', 'speedrun.report']);

    const detail = runtime.describeDomain('speedrun');
    expect(detail.capabilities.map((capability) => capability.name).sort()).toEqual([
      'speedrun.create',
      'speedrun.report',
    ]);
    expect(detail.actions.map((action) => action.id).sort()).toEqual([
      'speedrun.create',
      'speedrun.report',
    ]);
  });

  it('declares a description on every action, which defineAction alone will not let it do', () => {
    // `ActionDef` carries an optional `description` and `defineAction` omits it
    // from its parameter type, so the fixture has to spread the result to set
    // one. That is a workaround for a gap in a frozen package, and a workaround
    // nobody checks is one that quietly stops working — or that gets
    // "simplified" back into a type error. So the DECLARATION is asserted here.
    //
    // Asserted on the declaration and not on `describeDomain`, because core
    // currently projects actions to `{ id, permissions }` and drops the
    // description on the way: `runtime.describeDomain('speedrun').actions[0]`
    // has no `description` key at all, so `inspect` returns `null` for every
    // action in this repository, described or not. `ActionSummary` in the
    // registry has the field, `packages/api/src/api.ts` reads it, and
    // `packages/core/src/runtime.ts` is the one link that loses it. Core is
    // frozen, so this is reported in `docs/design/extension-surface.md` rather
    // than fixed here, and asserted as a fact about the DECLARATION so that the
    // extension is already correct on the day core is.
    const declared = speedrunMode().actionDefs ?? [];
    expect(declared).toHaveLength(2);
    for (const action of declared) {
      expect(action.description, `${action.id} declares no description`).toBeTruthy();
    }
  });

  it('runs an action, records its own state, and persists the event it owns', async () => {
    const { runtime, store } = harness([neighbour(), speedrunMode()]);

    const opened = await runtime.runAction('speedrun.create', {
      runId: 'ascent',
      challengerId: 'agent-7',
    });
    expect(opened).toMatchObject({ runId: 'ascent', startedAt: AT });

    // Its own state, under its own key, through the store the contract hands it.
    expect(store.load('speedrun')).toHaveLength(1);

    // The type it declared as worth a row reached the store. A type it did not
    // declare did not, which is the persistence policy holding for a package
    // nobody in this repository wrote.
    await runtime.runAction('speedrun.report', { runId: 'ascent' });
    const persisted = store.recorded().map((event) => event.type);
    expect(persisted).toContain(RUN_FINISHED);
    expect(persisted).not.toContain('speedrun.started');
  });

  it('dispatches a command and gets the event trail back', async () => {
    const { runtime } = harness([neighbour(), speedrunMode()]);

    const events = await runtime.dispatch({
      type: 'speedrun.start',
      issuedAt: AT,
      issuerId: 'agent-7',
      payload: { runId: 'descent', challengerId: 'agent-7' },
    });

    expect(events.map((event) => event.type)).toEqual(['speedrun.started']);
  });

  it('subscribes to a core-owned event type without importing its emitter', async () => {
    const seen: string[] = [];
    const feature = speedrunMode();
    // Rewriting the handler keeps the declaration under test and lets the test
    // observe the subscription, which is otherwise an empty function.
    const observed: GameFeature = {
      ...feature,
      eventHandlers: [
        {
          on: 'session.ended',
          handle: async (event) => void seen.push(event.type),
        },
      ],
    };
    const { runtime } = harness([neighbour(), observed]);

    await runtime.emit({ type: 'session.ended', occurredAt: AT, actorId: 'agent-7', payload: {} });

    expect(seen).toEqual(['session.ended']);
  });

  it('degrades rather than throwing when the capability it requires is absent', async () => {
    const { runtime } = harness([speedrunMode()]);

    expect(runtime.degraded().get('speedrun')).toEqual([BOUNTY_LIST]);

    // Degraded means reduced, not broken: the feature is installed, it is
    // visible, and the action refuses in a sentence that names what is missing.
    await expect(runtime.runAction('speedrun.create', { runId: 'r' })).rejects.toThrow(
      /bounty\.list, which is not installed/,
    );
  });

  it('stops reporting degradation once the capability is installed', () => {
    const { runtime } = harness([speedrunMode()]);
    expect(runtime.degraded().size).toBe(1);

    runtime.install(neighbour());

    // Recomputed on every install, not cached at construction — a feature that
    // degrades on load and never recovers is a bug that reads as intent.
    expect(runtime.degraded().get('speedrun')).toBeUndefined();
  });
});

describe('uninstalling the out-of-tree feature gives all of it back', () => {
  it('gives back every registration kind, and the core leaves no trace', async () => {
    const handled: string[] = [];
    const feature: GameFeature = {
      ...speedrunMode(),
      eventHandlers: [
        {
          on: 'probe.fired',
          handle: async (event) => void handled.push(event.type),
        },
      ],
    };

    const { runtime, store } = harness([neighbour(), feature]);

    // Something the feature persisted while installed, so the persisted-event
    // half of the give-back is observed rather than inferred.
    await runtime.runAction('speedrun.create', { runId: 'ascent', challengerId: 'agent-7' });
    await runtime.runAction('speedrun.report', { runId: 'ascent' });
    const persistedBefore = store.recorded().filter((event) => event.type === RUN_FINISHED);
    expect(persistedBefore).toHaveLength(1);

    await runtime.emit({ type: 'probe.fired', occurredAt: AT, actorId: 'tester', payload: {} });
    expect(handled).toEqual(['probe.fired']);

    runtime.uninstall('speedrun');

    // commands, actionDefs, capabilities. Asserted as exact lists rather than
    // as "does not contain": the neighbour installed one of each, so an empty
    // list would be an assertion about the neighbour rather than about the
    // give-back, and an implementation that dropped every feature's
    // registrations on any uninstall would satisfy it.
    expect(runtime.commands()).toEqual([]);
    expect(runtime.actions()).toEqual(['neighbour.ping']);
    expect(runtime.capabilities()).toEqual([BOUNTY_LIST]);

    // declaredCapabilities: the per-domain list is a second copy of the same
    // capabilities, and an implementation that cleaned only the first would
    // leave `discover` still advertising a feature that is gone.
    expect(runtime.domains()).not.toContain('speedrun');
    expect(runtime.describeDomain('speedrun').capabilities).toEqual([]);
    expect(runtime.describeDomain('speedrun').actions).toEqual([]);

    // eventHandlers
    await runtime.emit({ type: 'probe.fired', occurredAt: AT, actorId: 'tester', payload: {} });
    expect(handled).toEqual(['probe.fired']);

    // requires: the degraded map is recomputed on uninstall, so a feature that
    // was degraded stops appearing at all.
    expect(runtime.degraded().get('speedrun')).toBeUndefined();

    // persistedEvents: the type is given back, so the same event is no longer
    // worth a row. This is the assertion that would fail if unregister forgot
    // the set while cleaning every other collection, because nothing else in the
    // runtime reads it.
    const before = store.recorded().length;
    await runtime.emit({ type: RUN_FINISHED, occurredAt: AT, actorId: 'tester', payload: {} });
    expect(store.recorded()).toHaveLength(before);
  });

  it('leaves the surrounding features working, which is the half that is easy to omit', async () => {
    const { runtime, store } = harness([neighbour(), speedrunMode()]);

    runtime.uninstall('speedrun');

    expect(await runtime.runAction('neighbour.ping', {})).toBe('pong');
    await runtime.emit({ type: 'neighbour.probe', occurredAt: AT, actorId: 'tester', payload: {} });
    await runtime.emit({
      type: 'neighbour.pinged',
      occurredAt: AT,
      actorId: 'tester',
      payload: {},
    });

    // The neighbour's OWN persisted type still reaches the store after the
    // removal. If uninstalling one feature had emptied the set, the remaining
    // features would silently stop being recorded, and nothing would say so.
    expect(store.recorded().map((event) => event.type)).toEqual(['neighbour.pinged']);
  });

  it('refuses to install a second feature claiming the same persisted event type', () => {
    const { runtime } = harness([speedrunMode()]);

    // Declares the contested type and nothing else, so the refusal is about the
    // persisted event type rather than about whichever collection the registry
    // happens to walk first.
    const contender: GameFeature = {
      id: 'contender',
      persistedEvents: [RUN_FINISHED],
    };

    // A collision on a persisted event type is a registration-time refusal, not
    // a later surprise: an event type has exactly one owner, and two features
    // writing the same rows means a replay cannot say which produced them.
    expect(() => runtime.install(contender)).toThrow(
      new RegExp(`duplicate persisted event type ${RUN_FINISHED}`),
    );

    // And it is a refusal, not a half-install: the registry checks everything
    // before it mutates anything.
    expect(runtime.domains()).toEqual(['speedrun']);
  });
});

describe('the extension contract version, and whether the pin is load-bearing', () => {
  it('agrees between what the package declares and what the SDK implements', () => {
    expect(SPEEDRUN_EXTENSION_CONTRACT.version).toBe(EXTENSION_CONTRACT_VERSION);
    expect(EXTENSION_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('refuses an extension written against a different contract', () => {
    expect(() =>
      assertExtensionContract({ packageName: 'speedrun-mode', version: '0.0.9' }),
    ).toThrow(ExtensionContractMismatch);

    // Both versions in the message, because the only useful response is to
    // decide which side moves, and neither decision is possible without them.
    try {
      assertExtensionContract({ packageName: 'speedrun-mode', version: '0.0.9' });
      expect.unreachable('the assertion should have thrown');
    } catch (error) {
      const mismatch = error as ExtensionContractMismatch;
      expect(mismatch.declared).toBe('0.0.9');
      expect(mismatch.expected).toBe(EXTENSION_CONTRACT_VERSION);
      expect(mismatch.packageName).toBe('speedrun-mode');
      expect(mismatch.message).toContain('0.0.9');
      expect(mismatch.message).toContain(EXTENSION_CONTRACT_VERSION);
    }
  });

  it('is load-bearing at the factory, so the extension refuses to be built', () => {
    // The self-check is only a check if the two sides are independent. A
    // fixture that wrote `version: EXTENSION_CONTRACT_VERSION` would compare
    // the SDK's constant with itself, could never fail, and would be a line
    // that reads as a guard and enforces nothing — so the literal is asserted
    // here, and the first version of this file had it wrong.
    const source = readFileSync(join(EXTERNAL_DIR, 'src/feature.ts'), 'utf8');
    expect(source).toMatch(/version: '\d+\.\d+\.\d+'/);
    expect(source).not.toMatch(/version: EXTENSION_CONTRACT_VERSION/);

    // And the two agree today, which is the only reason the factory builds.
    expect(SPEEDRUN_EXTENSION_CONTRACT.version).toBe(EXTENSION_CONTRACT_VERSION);
    expect(() => speedrunMode()).not.toThrow();

    // Which is the half that was missing, and its absence is worth recording.
    // The three assertions above describe the SOURCE, and a source assertion
    // cannot tell whether the check is called: deleting
    // `assertExtensionContract(contract)` from the factory left this file
    // entirely green, because nothing here ever asked the factory to refuse.
    // That is a gate that cannot fail, which is worse than no gate.
    //
    // So the factory is asked to refuse, and the refusal is the assertion. It
    // takes the contract as a parameter precisely so a test can hand it one the
    // SDK does not implement — a caller that reads only the factory's
    // signature could not otherwise observe the guard at all.
    expect(() => speedrunMode({ packageName: 'speedrun-mode', version: '0.0.9' })).toThrow(
      ExtensionContractMismatch,
    );

    // A refusal that names neither side is a refusal the caller cannot act on,
    // so the message has to carry both versions. Built from the constant rather
    // than typed out, so a deliberate bump of the contract does not turn this
    // assertion into a second pin to update by hand.
    expect(() => speedrunMode({ packageName: 'speedrun-mode', version: '0.0.9' })).toThrow(
      new RegExp(`0\\.0\\.9.*${EXTENSION_CONTRACT_VERSION}`, 's'),
    );
  });

  it('is load-bearing at the host, so an extension that skipped the check is still caught', () => {
    // This is the half that makes it a gate rather than a convention. A package
    // that omitted its own `assertExtensionContract` would still hand the host a
    // feature, and the host has one list to check.
    const smuggled: GameFeature = { ...speedrunMode(), id: 'smuggled' };

    expect(() => assertExtensionContracts([SPEEDRUN_EXTENSION_CONTRACT])).not.toThrow();
    expect(() =>
      assertExtensionContracts([
        SPEEDRUN_EXTENSION_CONTRACT,
        { packageName: 'smuggled', version: '0.0.9' },
      ]),
    ).toThrow(/smuggled was written against extension contract 0\.0\.9/);

    // And the feature the host accepted is installable, so the check is a gate
    // on composition rather than a type that cannot be satisfied.
    const { runtime } = harness([smuggled]);
    expect(runtime.domains()).toContain('speedrun');
  });
});

describe('installing an extension changes nothing in the packages it composes with', () => {
  let scratch = '';
  let coreBefore: string;
  let protocolBefore: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'out-of-tree-fingerprint-'));
    coreBefore = treeFingerprint(CORE_DIR);
    protocolBefore = treeFingerprint(PROTOCOL_DIR);
  });

  afterAll(() => {
    rmSync(scratch, { force: true, recursive: true });
  });

  it('compares trees by content, and the comparison is not vacuous', () => {
    // The cross-cycle assertion below is close to a tautology on its own —
    // nothing in one test process edits a file. What makes it worth keeping is
    // that it is asserting composition is PURE, and a comparison that silently
    // compared nothing would let the first half of that claim rot. So the
    // comparison itself is watched working here, on a scratch tree, before it
    // is trusted on core.
    mkdirSync(join(scratch, 'src'));
    writeFileSync(join(scratch, 'src/one.ts'), 'export const one = 1;\n');
    const before = treeFingerprint(scratch);

    writeFileSync(join(scratch, 'src/one.ts'), 'export const one = 2;\n');
    expect(treeFingerprint(scratch)).not.toBe(before);

    // And the file LIST, not only the contents: a loader that wrote a new file
    // into core would leave every existing file byte-identical.
    writeFileSync(join(scratch, 'src/two.ts'), 'export const two = 2;\n');
    expect(treeFingerprint(scratch)).not.toBe(before);
  });

  it('leaves core and protocol byte-identical across a full install and uninstall', async () => {
    const { runtime } = harness([neighbour()]);
    runtime.install(speedrunMode());
    await runtime.runAction('speedrun.create', { runId: 'ascent', challengerId: 'agent-7' });
    runtime.uninstall('speedrun');

    expect(treeFingerprint(CORE_DIR)).toBe(coreBefore);
    expect(treeFingerprint(PROTOCOL_DIR)).toBe(protocolBefore);
  });
});

describe('the layering engine does not cover the out-of-tree package, and says so', () => {
  it('is not a workspace package, so architecture-rules.cjs never sees it', () => {
    // Stated as an assertion because it is the honest shape of this bead's
    // coverage. The public surface of an external package is enforced by this
    // file and by nothing else, which is why the file has to exist rather than
    // being assumed.
    const sourceRoots = readFileSync(join(REPO_ROOT, 'architecture-rules.cjs'), 'utf8');
    const declared = /const SOURCE_ROOTS = \[([^\]]*)\]/.exec(sourceRoots)?.[1] ?? '';
    expect(declared).not.toMatch(/examples/);
  });

  it('and no test stage claims a test placed beside it', () => {
    // The mechanism, not a comment about it: each stage's `include` globs are
    // what decides whether a file is run at all, and a test written into
    // `examples/` is outside every one of them. A test beside this fixture would
    // not fail — it would simply never execute, which is the outcome
    // `no-orphan-tests.test.ts` exists to prevent elsewhere in the repository.
    const configs = [
      'vitest.unit.config.ts',
      'vitest.integration.config.ts',
      'vitest.e2e.config.ts',
    ];
    for (const config of configs) {
      const source = readFileSync(join(REPO_ROOT, config), 'utf8');
      expect(
        source,
        `${config} would start running tests nobody can see the results of`,
      ).not.toMatch(/examples/);
    }

    const own = listSourceFiles(EXTERNAL_DIR).filter((file) => file.endsWith('.test.ts'));
    expect(own, 'a test beside the fixture would be run by nobody').toEqual([]);
  });
});
