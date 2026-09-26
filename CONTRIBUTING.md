# Contributing

This file is for humans. If you are a coding agent, read
[AGENTS.md](AGENTS.md) instead: it is the same territory arranged as a map
rather than a narrative.

Everything here assumes you want to change something and get it merged. If you
are here to run the thing instead, the [Quickstart](README.md#quickstart) is
all you need.

## Get to a green run first

Do this before you read anything else. It is the fastest way to find out
whether your machine can run the project at all, and it separates "my change
is broken" from "my setup is broken" — a distinction you cannot make later.

```bash
git clone https://github.com/quangdang46/battle-agents.git
cd battle-agents
pnpm install
cp .env.example .env
docker compose up          # the app, on http://127.0.0.1:3000
```

Then, in another terminal, the whole gate:

```bash
pnpm test:m0
```

`test:m0` brings up its own throwaway Postgres and runs every stage in the
pipeline. It is the same file, same order and same exit code that CI runs, so
a green local run means what a green CI run means. It is not fast; budget
several minutes.

You do not need OAuth keys for the gate — they are only for logging into the
app. You do need them for the app itself, and the next section is about the
three ways that goes wrong.

### While you iterate

The full gate is too slow to run on every save:

```bash
pnpm test:unit          # no database needed
pnpm typecheck          # tsc over the build graph and the test graph
pnpm architecture       # the layering rules
pnpm test:integration   # needs Postgres; export DATABASE_URL first
```

`pnpm test:integration` is the one that surprises people: it does not start a
database. It reads `DATABASE_URL` from your environment, so with the app stack
already up:

```bash
export DATABASE_URL=postgresql://battle_agents:battle_agents@127.0.0.1:5432/battle_agents
pnpm db:migrate && pnpm db:seed
pnpm test:integration
```

## When it goes wrong

Three failure modes account for nearly every blocked first run. All three are
written up in full, with symptom, cause and fix, in
[apps/web/README.md](apps/web/README.md#when-it-fails). Naming them here so
you can recognise one from the symptom alone:

**`redirect_uri_mismatch`** — everything starts, the login button works, and
GitHub shows an error mentioning `redirect_uri_mismatch`. GitHub matches the
callback URL exactly and treats `127.0.0.1` and `localhost` as different
origins, so the OAuth app has to be registered with the `127.0.0.1` form.
This is the single most likely reason a first run fails, and it fails late.

**Auth environment incomplete** — the app refuses to start with `auth is not
configured` and a list of missing variable names. `cp .env.example .env` and
fill in `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `GITHUB_CLIENT_ID`
and `GITHUB_CLIENT_SECRET`.

**The database is unreachable or empty** — a connection error names the URL it
tried, or the app starts and then complains about a missing relation, often
from the seed step rather than from auth. Run `pnpm db:migrate && pnpm db:seed`
and check with `pnpm db:verify`. Do not trust a migration that reported
success: drizzle-kit keeps its ledger in a separate schema, so dropping the
application schema leaves it believing everything applied while no table
exists. The gate's `migrations` stage checks for the tables directly for
exactly this reason, and so should you.

That list is not exhaustive and is meant to grow. If you hit a fourth thing,
it is a documentation bug: write it up in the same shape and add it.

## The four contracts, and why they came first

Four things were locked before any feature work, because getting them wrong
means every feature written against them is wrong too. They are in
[README.md](README.md#the-four-contracts-and-why-they-came-first); the reason
to read them here is that you will hit them whether or not you go looking.

1. **The Extension API** — the `GameFeature` shape and `createRuntime` in
   `packages/core`. `emit()` persists, then runs handlers, then publishes, in
   that order. Adding a domain operation to core is the failure this prevents.
2. **Agent identity** — an `agents` row and a credential. A GitHub OAuth token
   is **never** an agent identity; it identifies a _person_.
3. **Session** — `sessions.agent_id -> agents.id`. Never `sessions.user_id` as
   agent identity. A session is one _run_; an agent outlives it.
4. **The Agent protocol** — the Application API. CLI, MCP and web are three
   consumers of one implementation, not three implementations.

Two of these are easy to get backwards, and both are checked:

- **A session is not an agent.** Closing a terminal does not delete the
  character, its XP or its history.
- **The auth/game boundary in the web app.** `apps/web/src/auth/server.ts`
  decides who is logged in and must know nothing about agents, characters or
  progression. `server.test.ts` strips comments and literals and fails on game
  vocabulary in that file.

## The rule you are most likely to break

```
presentation  ->  features  ->  core  <-  infrastructure
```

- **Features never import each other.** A feature that needs another feature's
  data subscribes to its events, or declares `requires` and degrades.
- **Adapters import `core` and `protocol` and nothing else.**
- **`core` knows no game vocabulary.** A unit test strips comments and
  literals, then fails on a Bounty, Guild, Battle, XP or Quest identifier in
  `packages/core`. The words do appear in comments there, because the comments
  explain the rule; what must not exist is the code.

And the one that decides whether your PR is an architecture failure:

> **Adding a feature must never require editing `core/`, `cli/` or
> `mcp-server/`.** Those three are frozen. A new feature is a new package and a
> manifest entry.

This is not a preference. It is checked twice: `pnpm architecture` fails the
build on a layering violation, and review rejects a PR that had to touch those
three. If your work seems to need one of them, that is a finding about the
design, not a hurdle to route around — open an issue and describe what you
were trying to express. `scripts/removal-test.sh` is the machine version of
the same rule: it strips one feature out of the composition root and rebuilds,
so a feature that quietly became load-bearing cannot be removed.

## Adding a package

This is the part people have to look up, so here it is in one place. The vitest
alias is derived from the workspace directories and needs no edit; everything
else does.

For an adapter (`packages/adapters/<harness>/`):

| File                                  | What to add                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/adapters/<harness>/`        | `package.json` (`@battle-agents/<harness>`), `tsconfig.json`, `src/index.ts` |
| `tsconfig.json`                       | a `@battle-agents/<harness>` path entry                                      |
| `tsconfig.build.json`                 | a project reference entry                                                    |
| `tests/unit/adapter-contract.test.ts` | the import and the name in the `ADAPTERS` array                              |

`pnpm-workspace.yaml` already globs `packages/adapters/*`, so it needs nothing.
`source-alias-coverage.test.ts` asserts the vitest aliases and the tsconfig
paths cover the same set, so a missing path entry fails the unit stage even
though nothing imports the package yet — that is the check working, not a
mystery.

For a feature (`packages/features/<concept>/`): the new package, a path entry
in `tsconfig.json`, a project reference in `tsconfig.build.json`, and a line in
the `extensions` array in `apps/web/src/composition.ts`. There is no
adapter-contract entry, because that suite is about watchers, not features.

`composition.ts` is the composition root and the only place allowed to decide
which features exist. Keep each feature on **one line** — the removal test
strips that line by pattern, and a call wrapped across two lines survives the
strip and fails the removal test for the wrong reason.

If the feature declares action ids, add it to `MANIFESTS` in
`scripts/generate-action-ids.ts` and run `pnpm codegen`. The generator
discovers every `*_ACTION_IDS` and refuses to emit a union that would omit one,
so skipping this makes the build say so.

## Working a bead

Work is tracked with `br`, and the tracker is the source of truth for what to
do next:

```bash
br ready      # what is unblocked
br show <id>  # the full brief, including the reasoning
br close <id> --reason "what actually landed, and what you did not"
```

A bead is a whole brief. It carries why the work exists, the decisions already
made, and the traps. Read it before touching the tree — most of the mistakes
available here are avoidable by reading two paragraphs.

When you close one, the reason is the only record of a decision that went the
other way. Write what you chose _and_ what you did not.

## Good first issues

Three are open now, all fun-visible: you ship something that shows up on
screen rather than fixing an internal chore.

| Bead                                | You would add                                      |
| ----------------------------------- | -------------------------------------------------- |
| `ba-adapter-goose-good-first-cpd`   | an adapter, so Goose joins the roster              |
| `ba-adapter-aider-good-first-9f1`   | an adapter, so Aider joins the roster              |
| `ba-battle-reporter-good-first-rxz` | a page that renders a session as a readable report |

Read one with `br show <id>`; each names the files, the traps, and how you
will know it worked. They are also labelled `good-first-issue` in the tracker,
so `br list --label good-first-issue` finds all of them.

If none of those appeal: any harness nobody has added yet, any reporter, any
battle mode. The protocol is the part worth contributing to — a thin core that
normalizes many CLIs into one vocabulary, so a harness gets a game character
without knowing a game exists.

## House style

Short, because [AGENTS.md](AGENTS.md#house-style) is the long version.

- **Comments explain why, not what.** If a comment could be deleted without
  losing information about behaviour, delete it. Several comments in this
  repository asserted behaviour that turned out to be false, and the way that
  happened is that nobody ever tried to break the claim.
- **A gate that cannot fail is worse than no gate.** When you write a check,
  break the thing it guards and watch it go red before you believe it. If your
  mutation is a no-op, say so rather than reporting a pass.
- **Comments are claims.** A comment describing behaviour is only true once
  something tried to break it.
- **Public interfaces are typed.** `any` at a boundary is a bug report you
  have not filed yet.
- **Prefer a named constant** to a number whose meaning is in the commit
  history.
- **Use the vocabulary precisely.** A session is a run, an agent is the
  character, a capability is a registry entry, an action is a typed dispatch.
  Using the words loosely is how a feature ends up owning a tool.

## Before you open the PR

```bash
pnpm test:m0
```

Same command, same images, same stage order as CI. It is faster than a review
round trip. If a stage fails and you think the stage is wrong, say so in the
PR — several gates here were once green while checking nothing, and a
suspicious stage is worth more than a red one.
