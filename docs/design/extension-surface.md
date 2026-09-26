# The extension surface: what a stranger may depend on

Written 2026-09-26 for `ba-protocol-sdk-ecosystem-3ro`. The bead's question was
"what is public and what is internal, and be explicit that the answer constrains
everything after it". This is that answer, plus the two questions that were
parked on it: where an adapter's watcher process comes from, and whether the
version pin is load-bearing or decorative.

Read the last section first if you only read one. It is the honest summary of
what this decision does and does not buy.

## The decision

**Public — a stranger may install these and depend on them:**

| Package                   | What it publishes                                                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@battle-agents/core`     | The barrel at `packages/core/src/index.ts`, and nothing else. `GameFeature`, `createRuntime`, `defineAction`, `InMemoryStateStore`, `createInMemoryEventBus`, `PartialDispatchError`, and the types beside them. |
| `@battle-agents/protocol` | `PROTOCOL_VERSION` and the event vocabulary: the zod union, `normalizeToolName`, `EventBuffer`, the ingest client, the batching limits.                                                                          |
| The HTTP surface          | `/api/discover`, `/api/search`, `/api/inspect`, `/api/act`, `/api/events`. Published in `apps/web/public/*.md`.                                                                                                  |

**Internal — a third party may read it, and must not depend on it:**

`packages/api`, `packages/db`, `apps/web`, `packages/cli`,
`packages/mcp-server`, and every `@battle-agents/<feature>` package. A third
party needs none of them: a feature is composed from a `GameFeature` object, and
`packages/db` is ours to migrate.

**The consequence, stated plainly because it is the load-bearing part.** This is
a small public surface and it stays small. Every name below the line is a name
we can change, so an ecosystem built on the line is an ecosystem a fork does not
have to track. The cost is that a third party's feature cannot reach the
database, cannot call another feature, and cannot define a new HTTP route. All
three are real wants, and the answer to each is the same: a capability declared
in the feature, or an event on the bus. If a third party's package cannot be
written that way, the design is wrong — but the fix is a new capability in the
public contract, decided on its own evidence, not a hole punched for one
contributor.

`FeatureRegistry` is deliberately **not** exported. A consumer holding one could
register features without the runtime re-checking requirements, which is the
signal the removal test depends on. That reasoning is in the barrel's own header
and it is the right one.

## The one thing that constrains everything after this

`packages/core` is frozen and its barrel is the whole contract. So a third
party's package can be written today, and the guarantee they get is:

> Every export in that barrel, and the shape of every type in it, until it is
> deliberately changed.

Everything downstream of that sentence is bookkeeping. Which means the honest
measure of this bead is not "the ecosystem is open" — it is that
`examples/speedrun-mode` compiles against nothing but those two barrels, and
`tests/unit/out-of-tree-extension.test.ts` fails if it ever stops doing so.

## The version pin, and whether it is load-bearing

There are **two** version numbers and they answer different questions. Keeping
them distinct is most of the work.

### `PROTOCOL_VERSION` — the wire, and it is already load-bearing

An event batch declares `protocolVersion`; `parseEventBatch` exact-matches it
against the constant and refuses a mismatch with a `400` carrying **both**
versions, before a single event is validated. That is a real handshake on the
server side, and `tests/integration/event-ingest.test.ts` exercises it.

What it is not is a client-side negotiation, and the published docs say so in
`skill.md` §7 and in `skill.json`'s own `note` field. That honesty is the right
answer to `docs/research/moltbook.md`'s C11: Moltbook's `skill.json` `"1.7.0"` is
a string compare a client does against a moving branch, and this repository
refuses to ship a pin that looks load-bearing and is not. A number that looks
like a handshake and is not will let a client sail through a protocol change
until it fails in a way nobody can explain.

So: `PROTOCOL_VERSION` is **enforced by the server, descriptive for the client**,
and the published documents say exactly that. That half was
`ba-skill-md-protocol-72x`'s and it is done. Nothing here changes it.

### `EXTENSION_CONTRACT_VERSION` — the extension, and it was missing entirely

Before this bead, **an extension package declared nothing**. `PROTOCOL_VERSION`
describes the `AgentEvent` union. It says nothing about whether a `GameFeature`
written against last month's frozen contract still fits this month's runtime,
and a feature that does not fit loads cleanly and fails somewhere later that
nobody can trace back to a version.

So the extension side needed its own number, and the bead's pressure test was
whether it would be load-bearing or a string nobody reads. The answer is in
`packages/protocol/src/extension-contract.ts`, and it is load-bearing at **both**
ends:

- **At the extension.** `speedrunMode()` calls `assertExtensionContract` before
  it builds anything, and the version it checks against is a **string literal**,
  not the imported constant. That detail is the whole check: writing
  `version: EXTENSION_CONTRACT_VERSION` would compare the SDK's constant with
  itself, could never fail, and would be a line that reads as a guard and
  enforces nothing. The first version of `examples/speedrun-mode` had exactly
  that bug and the test caught it.
- **At the host.** `assertExtensionContracts(list)` is exported so a host can
  check a list it was handed, which catches a package that skipped the
  self-check. Without this, the extension-side check would be a convention —
  exactly the kind of thing this repository keeps being wrong about.

Neither half can live in `core`: the registry has no idea an extension exists,
and adding a check to a frozen contract three packages of features are written
against is the change `AGENTS.md` calls an architecture failure. The constant
therefore lives in `packages/protocol`, next to the other version string, and
the file's header says why that looks wrong and what to do when the freeze
lifts. **This is a real consequence of the freeze, recorded rather than hidden,
and it is the one place in this bead where a decision leaked past its own
boundary.**

## Where an adapter's watcher process comes from

This answers the question `ba-adapter-claude-fbc` parked here: _"There is no
long-lived process to start the watcher. Every adapter package is private: true
with no bin. So the options are a bin on the adapter package — or something in
the composition root, which is legal and is the wrong shape."_

**The composition root is the wrong shape, and the reason is structural.** A
host that held a local transcript ledger would have to know where each of the
six harnesses writes its files, what its record format is, and which tool names
it uses. That is precisely the knowledge adapters exist to isolate. A host that
imports all six adapters and branches on which is installed is a plugin registry
in everything but name, which section 29.2 bans. So the process belongs to the
adapter.

**The answer is a `bin` on the adapter package.** Not a new package, not a
loader: one entry point per adapter, which reads the harness's own files and
runs the watcher until SIGINT. The adapter is the only thing that knows the
file layout, so the adapter is the only thing that can hold the ledger. A `bin`
is a process entry point, not an installer — it reads files the harness already
wrote and writes nothing to the user's config — so section 29.2 is not
violated.

**It is deliberately not built here.** A `bin` that no test spawns is a comment
with a shebang, which is the failure mode `scripts/stages.manifest` exists to
catch. Shipping one untested here would have been the same mistake the pin was
almost about to make. What _is_ pinned down is the contract a runner would
consume: an adapter's barrel exports a `*Watcher` class with a `start` and an
awaitable `stop`, which `tests/unit/adapter-contract.test.ts` asserts for all six
— by hand, not by discovery: the test lists its six imports rather than globbing
the tree, so a seventh adapter has to be added to it deliberately. That is the
whole surface a runner needs, and it is short.

**The claim that could not be made, and the hole it was covering.** While
verifying the paragraph above, this bead planted a real import — the template's
parser reaching for `'../../../core/src/runtime.js'` — and `pnpm architecture`
reported **no violations**. Every rule in the contract is a question about
_direction_: may this layer depend on that one. An adapter may depend on `core`,
so nothing fired, and the file it reached is in the one package that is frozen.
The guarantee this document's own first section rests on — a third party may
depend on the barrel and nothing else — was, for adapters, being kept by the
convention that people import packages by name.

That is now a rule rather than a convention. `no-cross-package-relative-import`
in `architecture-rules.cjs` fires when a relative import resolves into a
different package **and** no layer rule has already spoken, so it is purely
additive: an import that breaks a layer rule is still reported under that rule,
and every existing fixture keeps tripping what it was written to trip. The same
planted import now fails the gate. There was no migration to write, because the
tree had no cross-package relative import outside
`tests/unit/dependency-rules.test.ts`'s own fixture — which is also the
evidence that this was a hole rather than a house style.

**The thing that needs saying, because it is a finding and not a design choice:**
as of this writing, **nothing in this repository runs an adapter.** There is no
`bin` on any of the six, and no non-test file anywhere imports
`@battle-agents/claude`, `@battle-agents/codex`, or any of the other four —
`apps/web/src/composition.ts` does not mention an adapter. The watchers run in
unit tests and nowhere else. M1's "two different harnesses visible
simultaneously" is discharged by the contract, not by a process. That is a
legitimate state to be in, but it is not the state M7's "adding a coding harness
is one subdirectory" implies, and the six shipped adapters do not have the
`bin` the template's promise describes. A contributor copying the template today
gets a library with no way to run it.

## Two places the frozen surface is narrower than the contract reads

Both are in `packages/core`, which is frozen, so neither is fixed here. They are
listed because they are what a third party hits first, and because a public
surface whose limits are discovered by running into them is not a documented
one.

1. **`defineAction` cannot set an action's description.** `ActionDef` in
   `core/src/contracts.ts` carries an optional `description`, and its own comment
   calls it load-bearing: "`inspect` has to describe an operation without running
   it". But the parameter type of `defineAction` in `core/src/actions.ts` is
   `{ id, permissions, run }`, and TypeScript's excess-property check makes
   passing a description a **type error** rather than a silent drop. So an
   extension written the recommended way — through `defineAction` — cannot
   describe its actions at all. `examples/speedrun-mode` spreads the result to
   work around it, and the out-of-tree test asserts the description is present,
   because a workaround nobody checks is one that gets "simplified" back into a
   build error. The fix is one line in a frozen file: widen the parameter to
   `ActionDef`'s own shape.

2. **A description that IS declared never reaches the caller.**
   `runtime.describeDomain` in `core/src/runtime.ts` projects each action to
   `{ id, permissions }` and drops the field. `ActionSummary` in the registry
   has it, and `packages/api/src/api.ts` reads `summary.description ?? null` —
   so `inspect` returns `null` for every action in this repository, described or
   not. Verified directly rather than inferred: a runtime with one action
   declared with a description returns a summary object with **no**
   `description` key. `packages/api/src/api.test.ts` covers `found: false` and
   nothing else, which is why this was not noticed. The extension declares its
   descriptions anyway, so it is already correct on the day core is.

Neither is an argument against the shape. Both are arguments for thawing
`packages/core`, which is a decision this bead does not own and does not make.

## What is NOT here, on purpose

- **No marketplace, installer, dynamic or remote plugin loading.** Section 29.2
  bans all four, and the extension test above asserts that a full
  install/uninstall cycle touches no file on disk — composition is pure. A
  loader that wrote to disk would make that assertion go red.
- **No `private: false` anywhere.** Every package in this workspace is
  `private: true` with version `0.0.0`. Flipping that is a release decision, not
  an architecture one, and a half-published SDK is worse than an unpublished
  one. What the test checks is the part of consumability that lives in a
  manifest — `exports`, `types`, `main`, peer dependencies — which is a property
  of the source and is therefore worth asserting now.
- **The barrel of `@battle-agents/protocol` is now flat, and flattening it found
  a real hole.** It was five `export *` lines, so it did not list its own surface
  and a third party could not read the package to learn what it offers. It is now
  flat, which is the shape `@battle-agents/core` — the frozen reference surface —
  has always had, and `tests/unit/protocol-barrel.test.ts` fails on an export a
  module declares and the barrel omits, on a module the barrel does not
  re-export at all, and on a star-export creeping back in.

  **The hole was not the one the star-exports were hiding.**
  `generated/action-ids.ts` exports nine per-feature action id unions, and the
  old barrel listed six of them by hand. `BattleActionId`, `SocialActionId` and
  `AchievementsActionId` were added when those three features landed and were
  never added to the barrel, so they were in the package and unreachable from
  it: a third party dispatching a battle action had `RegisteredActionId` to
  check against and no way to name the subset it belonged to, which is the only
  reason the per-feature unions exist. Nothing caught it, because nothing
  imported them and `tsc` cannot see a name nobody asks for.

  That resolution is worth its own note, because getting it wrong is invisible
  in the obvious direction and loud in the other one. The resolver reads a
  barrel by following `export *`; the first version tested the specifier as
  written, so `export * from './agent-event.js'` was checked for a file that
  does not exist on disk (`agent-event.ts` does, and a build is what turns one
  into the other). Every branch was skipped, the resolver returned only the
  hand-written exports, and the suite was green throughout — a guard that had
  quietly stopped guarding.

  **Flattening both barrels then made that guard vacuous, which is recorded
  here rather than left to be noticed.** With no `export *` anywhere, "resolves
  every `export *`" compared an empty list with an empty list and could not
  fail — the same failure, one level up, inside the guard written to prevent it.
  Both barrels are now pinned flat, and the resolver's resolved-name counts are
  asserted, so it cannot stop reading and start reporting ordinary imports as
  unexported. Collapsing the resolver to return nothing now fails three
  assertions, and reintroducing a single star-export fails a fourth.

## Does M7 hold

M7's definition of done (§27) is _"contributor adds Amp support without touching
core."_ Against that:

- **A third-party FEATURE: yes, today.** `examples/speedrun-mode` is the
  proof, and `tests/unit/out-of-tree-extension.test.ts` is the acceptance test.
  It installs through `createRuntime`, gives back all seven registration kinds
  on uninstall, degrades rather than throws when a required capability is
  missing, and refuses to build against a contract version the SDK does not
  implement.
- **A third-party ADAPTER: the pieces are there, the entry point is not.** A
  contributor can copy `packages/adapters/_template`, which is one subdirectory
  and touches nothing frozen — that part of the promise holds, and it is now
  enforced rather than assumed: `no-cross-package-relative-import` fails the
  build if the new adapter reaches past a barrel, so "without touching core" is
  a gate and not a habit. They will arrive at a library with no `bin`, for the
  reason in the section above, and the fix belongs to
  `ba-third-party-adapter-proof-2wp` together with the process question this
  document settles.
- **"removal-test CI green" (M7): unaffected.** The removal test removes
  `packages/features/*`; this package is in neither `packages/` nor any pnpm
  glob, so it is outside that test by construction, which is the correct
  behaviour for something that is not ours.

The one thing a green run does **not** say: none of this proves the public
surface is _ergonomic_. It proves a feature can be written against it. Whether
a third party finds it pleasant is the property the docs-only client test
belongs to, and that is `ba-skill-md-protocol-72x`'s, not this bead's.
