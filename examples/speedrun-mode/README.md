# speedrun-mode

An out-of-tree battle-agents game feature. It exists to be the acceptance test
for the public extension surface, not to be a game anybody plays: it opens a
speedrun against a bounty and records how long it took, which is enough
behaviour to exercise every kind of declaration a `GameFeature` can make.

It is deliberately **not** under `packages/`. It is not in the pnpm workspace
globs, `architecture-rules.cjs` does not scan it, and no tsconfig project
compiles it — because it is standing in for somebody's repository, and the whole
claim is that a package in somebody else's repository works. The thing that
guards it is `tests/unit/out-of-tree-extension.test.ts`.

## Using it

```ts
import { speedrunMode } from 'speedrun-mode';
import { createRuntime, InMemoryStateStore, createInMemoryEventBus } from '@battle-agents/core';

const runtime = createRuntime({
  extensions: [speedrunMode()],
  store: new InMemoryStateStore(),
  bus: createInMemoryEventBus(),
});

await runtime.runAction('speedrun.create', { runId: 'ascent', challengerId: 'agent-7' });
```

## What it declares, and why each is here

| Declaration                                         | Why it is in the fixture                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands` (`speedrun.start`, `speedrun.stop`)      | A command returns events; it never applies anything itself.                                                                                                                                                    |
| `actionDefs` (`speedrun.create`, `speedrun.report`) | What a CLI verb or an MCP tool calls. Built with `defineAction`, so the id shape and the non-empty permissions are checked at authoring time — and spread, because `defineAction` will not take a description. |
| `capabilities`                                      | What it offers. Two of them, so the uninstall assertion has more than one to give back.                                                                                                                        |
| `requires: ['bounty.list']`                         | A capability it needs and does not provide, **as a string**. This is the whole extension model: a name crosses the package boundary and a module graph does not.                                               |
| `eventHandlers`                                     | Subscribes to `session.ended`, which core owns, without importing whatever emits it.                                                                                                                           |
| `persistedEvents`                                   | One owned type, `speedrun.finished`. An event type has exactly one owner; the second claimer is refused at install.                                                                                            |
| its own state, under `speedrun`                     | In the `StateStore` the contract hands it. No repository, no drizzle schema, no migration — which is what a third party does not have.                                                                         |

## The version pin, which is the one thing to copy carefully

```ts
export const SPEEDRUN_EXTENSION_CONTRACT = {
  packageName: 'speedrun-mode',
  version: '0.1.0', // a LITERAL, not EXTENSION_CONTRACT_VERSION
} as const;
```

`version` has to be a string literal. Writing the imported constant would
compare the SDK's value with itself, the check could never fail, and the
self-check would be a line that reads as a guard and enforces nothing. The first
version of this file had that bug and the test caught it — the test asserts the
literal, on purpose.

A third party should also run `assertExtensionContracts` over anything it loads
from someone else, because an extension that skipped its own self-check is
otherwise loaded without complaint.

## What this fixture does not prove

- That it installs from a registry. It is not published; publishing is a release
  step. What is asserted is the part of consumability that lives in the manifest.
- That it typechecks **on its own tsconfig**. It has none, and that is
  deliberate — a third party's package is not ours to configure. It IS
  typechecked anyway, and the reason is worth knowing: the root `tsconfig.json`
  does not list `examples/`, but `tests/unit/out-of-tree-extension.test.ts`
  imports it, and TypeScript compiles every file the program reaches. So `pnpm
typecheck` covers this package — through the test, and only for as long as
  that import exists. Delete the import and the coverage goes with it, silently.
  That import is the only thing making this package typechecked, which is worth
  more than the import-resolution guard below and was not the arrangement
  intended when this README was first written.
- That the extension surface is pleasant to build against. It is complete
  enough to write a feature, which is a different property from pleasant.

## Two places the frozen surface is narrower than it looks

Both are in `packages/core`, which is frozen, so this package works around the
first and reports the second rather than fixing either.

1. **`defineAction` cannot set a description.** `ActionDef` has an optional
   `description`; the parameter type of `defineAction` does not, so passing one
   is a type error. Hence the spread in `feature.ts`. A one-line widening in
   `packages/core/src/actions.ts` would remove it.
2. **A declared description goes nowhere.** `runtime.describeDomain` projects
   actions to `{ id, permissions }` and drops the field, so `inspect` returns
   `description: null` for every action in this repository, including the ones
   that declared one. `ActionSummary` in the registry has the field and
   `packages/api/src/api.ts` reads it; `packages/core/src/runtime.ts` is the one
   link that loses it.

`docs/design/extension-surface.md` has the decisions behind all of this.
