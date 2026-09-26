# The adapter template

Adding a coding harness is one subdirectory: copy this, delete what does not
apply, and keep the four modules. Nothing in `core/`, `cli/` or `mcp/` changes,
and that is the claim the plan makes.

This is the checklist, and the two items people most often get wrong on a first
adapter — tool-name normalisation and consent gating — are the two the modules
here exist to model.

## The checklist

1. **`package.json` — copy this one and change the name.** It declares
   `@battle-agents/core` and `@battle-agents/protocol` as `workspace:*`, which
   is right for a package in this repository and wrong for a published one; a
   package you intend to publish wants them as `peerDependencies` with a real
   range, because the host already has a core and bundling a second one inside
   the adapter puts two copies of a frozen contract in one process.

2. **`tsconfig.json` — keep the `types: ["node"]` line.** The base sets
   `types: []` on purpose so a library package does not acquire a Node
   assumption. An adapter IS a Node process: it polls files, sets an interval
   and reads the user's config. This is the first thing that goes missing in a
   new one, and nothing tells you it is missing.

3. **`parser.ts` — keep both normalisations.**
   - `canonicalToolName` → `normalizeToolName`. `shell_command`,
     `exec_command` and `Bash` are the same activity, and the activity log, the
     zone map and the game client all key on the canonical name. Skipping this
     produces a stream that is correct and unreadable, because every one of
     those names becomes a separate thing.
   - `providerId` must be namespaced and lowercase: `vendor.some-cli`. An
     unnamespaced id merges into someone else's namespace and the collision
     only shows up as a missing entry somewhere downstream.

4. **`watcher.ts` — keep `stop()` returning a Promise.** A `void` stop makes the
   shutdown flush fire-and-forget, and the session then ends with events either
   dropped or delivered after the runtime has torn down. This is a deliberate
   departure from the reference implementation the template was copied from; the
   reasoning is in `hook-provider.ts` in core.

5. **`install.ts` — keep the consent gate, and keep it global.** Two rules and
   neither is negotiable:
   - **Ask first.** A first write to a settings file is a consent gate, not an
     install step. The user sees what will be written, where, and how to undo
     it, and says yes before anything is written.
   - **Never touch the user's project.** Global agent config only. An installer
     that edits a repository is editing code the user is working in, and the
     plan forbids it outright.
   - Record the answer only _after_ the effect settled and the file agrees.
     Recording first strands the user when the write fails: the entries are not
     there, the preference says they are, and the next start skips the gate.

6. **`REQUIRED_EVENT_TYPES` — emit what the harness can and note what it
   cannot.** `session.started`, `session.ended`, `tool.started`,
   `tool.completed`. The stream is the activity log a replay and a dispute are
   settled from, so a missing event is a gap in the record rather than a reason
   to drop the session.

## Before you open the PR

- `pnpm test:unit` — `tests/unit/adapter-contract.test.ts` reads the barrel of
  every adapter under `packages/adapters/`, so a missing export fails there
  rather than at install time.
- `pnpm architecture` — an adapter imports `core` and `protocol` and nothing
  else. If you needed another workspace package to do the job, that is the
  design talking, not a missing dependency.
- Expect to be **added** to that contract test by hand, because it does not
  discover adapters: it lists six imports. It also cannot check per-harness
  event coverage, deliberately — the six shipped adapters do not all meet
  `REQUIRED_EVENT_TYPES` (Cursor writes no tool result in its format), so
  asserting the template's list would be red on day one. Matching the template's
  event coverage is a commitment you make, not one the suite will hold you to.

## The thing that is not done, so you do not discover it at the end

**This package has no `bin`, and neither do the six adapters shipped alongside
it.** Nothing in this repository starts an adapter watcher: there is no
executable entry point on any adapter package, and no non-test file anywhere
imports one. The watchers run in unit tests and nowhere else.

The shape that fixes it is a `bin` on the adapter package — the adapter is the
only thing that knows where its harness writes its files, so a host that held
the ledger would have to know too, which is a plugin registry in all but name.
`docs/design/extension-surface.md` has the reasoning and says who owns building
it. Until then, expect to be asked how to run what you just wrote.
