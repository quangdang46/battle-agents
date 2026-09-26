# Docket: cloud deploy (ba-neon-cloud-deploy-zn4)

Split on 2026-09-26 into what can be settled without a cloud account and what
cannot. The first half is settled and each claim below says how it was checked,
including the things that were broken to find out. The second half is a
procedure: the assertions, the commands, and the order they run in, so whoever
holds the Vercel and Neon credentials executes rather than re-derives.

## Settled here, offline

**Local development never requires Neon.** True, and now guarded rather than
asserted. Measured: `@neondatabase/serverless` is not installed in any package —
it appears in `pnpm-lock.yaml` only as an *optional peer* of `drizzle-kit` — and
there is no `neonctl` invocation, no Neon host, and no Neon import anywhere in
`packages/`, `apps/` or `scripts/`. The local default is container Postgres
(§37). `packages/db/src/env.ts` `requireDatabaseUrl()` throws
`MissingDatabaseUrlError` when the variable is absent rather than falling back
to anything, so a missing `DATABASE_URL` cannot quietly become a cloud
connection.

One correction to the previous version of this file, which sent a reader
hunting: there IS a connection-string literal in the tree, in
`packages/db/drizzle.config.ts` as `OFFLINE_GENERATION_URL`. It is used only by
`drizzle-kit generate`, which diffs the schema against the journal and never
connects; `migrate` and `seed` surface a connection error or a missing-variable
message instead. It is not a fallback and not a Neon default, and it is not what
criterion 3 is about. It is named here so the next person looking for a
hardcoded string finds it already explained rather than removing it.

**The pooled driver is used, and the pool is a singleton.**
`packages/db/src/client.ts` builds one node-postgres `Pool` (max 4 connections);
`apps/web/src/shared-runtime.ts` builds it once on first use and memoises it,
deliberately not at module scope because the Next.js route adapters import their
gateway at module scope and a module-scope pool is opened while `next build` is
still walking the tree.

`tests/integration/shared-runtime-fold.test.ts` asserts
`(await sharedRuntime()).database` is the same object on every call, which is
pool identity seen from the outside — a fresh `Pool` yields a fresh drizzle
handle. **That assertion was mutation-tested, not assumed:** deleting the
`cached = { shared, close }` assignment in `sharedRuntime()` turned the file red
5/5, and the pool-identity assertion failed with a diff showing a different
`Symbol(async_id_symbol)` on the underlying socket — a different connection, not
a cosmetic difference. The file was restored byte-identical afterwards.

The grep half of the guard is `scripts/check-pooled-driver.sh`, wired as stage
`pooled-driver` (`scripts/stages.manifest`, and `OWNER_POOLED_DRIVER` in
`scripts/test-m0.sh` names this bead). It allows connections in exactly two
files, `packages/db/src/client.ts` and `scripts/check-postgres.ts`, and carries
a self-test that plants a connection in a file the scan reads and fails if the
scan does not find it. The allowlist has one surprising entry: `check-postgres.ts`
builds a `new Client` for a one-shot preflight that connects, runs
`select current_database()` and exits — it exists because `docker compose up
--wait` once reported success while the published port belonged to another
project's container. The first version of the guard allowlisted neither file and
fired on it, which is the standing reminder that a guard red on a correct tree
gets switched off.

## Not settled here: criterion 1, a merge to main produces a working deployment

### The assertion, and what each part catches

A deploy is not observable from inside the repository, and a Next.js shell with
no API behind it renders fine, so "the host answered" is not evidence. The
substance is four probes against the deployed URL, each paired with the
deployment defect it catches. **Every status below was measured** against a real
instance of this app — configured, migrated, serving — not read off the handlers:

| Probe | Measured | The defect it catches |
| --- | --- | --- |
| `GET /` | `200`, `text/html`, body contains `<html` | A deployment that never happened, or one whose root 500s. |
| `GET /api/auth/ok` | `200`, `{"ok":true}` | A deployment missing its auth environment. An unconfigured auth server **throws on every `/api/auth` path and answers 500 while the root still serves 200** — observed, not hypothesised: this repository's own local dev container serves its root 200 and answers 500 on `/api/auth/ok` with `MissingAuthConfigurationError: auth is not configured: BETTER_AUTH_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET`. |
| `POST /api/events`, valid batch, no `Authorization` | `401`, `{"error":"no credential presented; …","reason":"missing"}` | A telemetry edge that is not mounted (`404`) or, worse, one that ingests unauthenticated batches (`200`) — an open write path into every session's event log. |
| `POST /api/events`, 101 events | `413`, `retry-after: 1`, `{"error":"batch too large","limit":100,"retryAfterSeconds":1}` | The size gate not running before authentication, which is the documented step order in `apps/web/src/event-routes.ts`. Asserted on the body, not only the status, because a hosting platform's own request limit also answers 413 and the two are not the same finding. |

Note for whoever writes the workflow: the events route's JSON bodies arrive with
`content-type: text/plain;charset=UTF-8`, because the Next.js adapter constructs
`new Response(JSON.stringify(...))` without setting the header. Assert on the
status and the body, never on that header.

**Criterion 1's authenticated variant**, for when a deployment has a
provisioned installation. Measured against a real installation, session and
credential, a valid single-event batch with `Authorization: Bearer <token>`
answers:

```
200  {"accepted":1,"sessionId":"<the session's id>","resumed":false}
```

and the refusals are `400 {"error":"protocol version mismatch","expectedProtocol":"0.1.0","receivedProtocol":"…"}`
for a wrong `protocolVersion`, `404 {"error":"no such session"}` for a session
the installation does not own, and `413` as above. The batch body is
`{"protocolVersion":"0.1.0","events":[…]}` — `PROTOCOL_VERSION` is
`packages/protocol/src/version.ts`, and each event is validated by the
protocol package's own zod schema, so this route cannot drift from what the
adapters emit.

### The command

```bash
DEPLOY_URL=https://<the deployment> bash scripts/check-deploy-smoke.sh
bash scripts/check-deploy-smoke.sh --self-test   # exercises the probes
```

The script reads no credential and requires none, which is deliberate: what a
smoke test can settle without provisioning a token is what catches a broken
*deployment*, and everything past the authenticator needs a live session.

**It is not wired into any stage, and no deploy workflow exists.** That is the
outstanding step, not a formality — the same failure `scripts/stages.manifest`
was written about, where a check existed and nothing invoked it. Today its only
invoker is a human with a URL. Its self-test is the reason to believe it anyway:
five stubs, each broken in exactly one way, and the probes attribute correctly —
a healthy stub passes all four; a **shell with a perfect root and no API behind
it** goes red on three while the root still passes; an auth server that throws
goes red on exactly one; an ingest route that is open goes red on two; a missing
size gate goes red on one.

The first version of this script did not earn any of that. It shipped with two
defects that only running it exposed: the stub answered `/api/events` twice and
crashed, and the failure path deleted the stub the remaining cases needed — so
four "the broken case is caught" lines printed beside a stub that no longer
existed. A self-test whose cleanup can starve its own later cases is a self-test
that reports green, which is the thing this file argues against.

### The wiring, for whoever holds the account

A workflow on `push` to `main`, after the deploy has finished, whose smoke step
fails the job:

1. Deploy with the Vercel CLI and capture the deployment URL it prints.
2. Run `pnpm db:migrate` against the **deployed** database before probing.
   Without this the ingest route answers 500 — observed locally as
   `relation "feature_state" does not exist`, with the root still serving.
3. `DEPLOY_URL=<that url> bash scripts/check-deploy-smoke.sh`.

The deployment must have `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `BETTER_AUTH_URL` and `DATABASE_URL`. The first three
missing is the 500 in the table above; the last is a migration error. Register a
**separate** GitHub OAuth app for production, as `.env.example` already says,
so local testing cannot invalidate the deployed callback.

`DATABASE_URL` in cloud must be the **pooled** Neon endpoint, not the direct
one: the same `createDatabasePool()` serves cloud and container, and pointing it
at a direct compute endpoint re-creates exactly the §7.1 trap in a new place.
Neon publishes a pooler host alongside the compute host; read the correct
hostname off the account's console rather than reconstructing it.

## Not settled here: criterion 2, each PR gets an isolated preview on its own Neon branch

Two assertions, because either alone is satisfiable by a lie. The bead names
which one matters: *a preview wired to the production database satisfies "each PR
gets a preview" and corrupts shared data on merge.*

**(a) The branch name derives from the PR number**, asserted by reading the
deployment's own environment — the `DATABASE_URL` the preview was built with
names the `pr-<number>` branch's compute. Asserting the workflow's own inputs is
not the assertion; a workflow can be configured correctly and deploy with a
production variable.

**(b) A migration run against that branch leaves production's ledger
byte-identical.**

**Where the ledger is, measured rather than remembered.** `drizzle-kit migrate`
records applied migrations in the `drizzle` schema of whichever database
`DATABASE_URL` named — `drizzle.__drizzle_migrations`, holding one row per
migration (21 when this was written; the count is the number of entries in the
generation journal, so read it there rather than from this sentence). It is
**not** `packages/db/migrations/meta/_journal.json`, which is the *generation*
journal, lives in the repository, and is therefore identical across two runs by
construction. Diffing the journal across a preview migration always produces the
same bytes and always reports success; that is a check that cannot fail, and it
is the most likely thing to reach for.

**The command:**

```bash
PRODUCTION_DATABASE_URL=… PREVIEW_DATABASE_URL=… bash scripts/check-preview-isolation.sh
```

It reads `drizzle.__drizzle_migrations` from production, runs
`drizzle-kit migrate` against the preview, reads production's ledger again, and
requires the two dumps to be **byte identical** — ordered by id, every column
selected, so a row that moved and a hash that changed both count. It also
compares against the migration count in the journal rather than a literal,
because a hardcoded count is correct on the day it is written and wrong after
the next migration, and a check that fails on a healthy tree is a check that
gets switched off.

**Rehearsed locally, on two databases of the one local Postgres**, which is the
same isolation boundary a Neon branch gives — a branch is a separate database in
the project's cluster, not a separate server. Green: 21 migrations applied to the
preview, production's 21-row ledger unchanged.

**The mutation, and the defect it exposed.** Rewriting the preview URL as a
*different string* that reached the *same database* — a hostname alias, a copied
connection string — and the check reported **success**. It reported success
because a fully migrated database has nothing left to apply, and applying nothing
changes nothing. A check that only holds while a migration is pending holds on a
healthy deployment exactly never, and this is the failure the harness warns
about by name. The fix is a precondition that no amount of migrating would have
supplied: read `current_database()` and that database's `pg_database.oid` from
both URLs and require them to differ. Re-run with the same mutation: red, naming
the misconfiguration. The byte-comparison was separately proven load-bearing by
deleting the newest ledger row from a probe database and watching the dumps
diverge.

### The Neon procedure, for whoever holds the account

Per [Neon's CLI reference](https://neon.com/docs/cli/branches), authenticating
with `NEON_API_KEY`:

1. `neon branches create --name pr-<number> --parent main --project-id <id>`
   — the name deriving from the PR number is assertion (a), and `--parent main`
   is what makes the preview a copy of production rather than an empty database.
2. `neon connection-string pr-<number>` to get the **pooled** URI. If the parent
   branch has more than one role or database, `branches create` prints no URI at
   all and this command is the only way to get one.
3. `DATABASE_URL=<that uri> pnpm db:migrate` — the migration whose effect
   assertion (b) checks.
4. `PRODUCTION_DATABASE_URL=… PREVIEW_DATABASE_URL=… bash scripts/check-preview-isolation.sh`.
5. Assert (a) by reading the preview deployment's resolved `DATABASE_URL` and
   matching the branch name, not by reading the workflow.
6. `neon branches delete pr-<number>` on close, and set an expiry
   (`neon branches set-expiration`) so an abandoned preview does not outlive the
   PR.

Flag names above are from Neon's documentation as of this writing and are worth a
`--help` against the account's own CLI version before the first run.

## Deliberately not done

**No deploy was attempted and no credential-shaped anything was added.** There is
no Vercel or Neon account here; a configuration file invented without one
produces something that looks like a deployment and is not, which is the exact
failure this file exists to prevent. The two scripts read connection details
from the environment and write none to disk.

**§7.4 still holds, restated so it is not added later.** No Redis, no Upstash,
no queue. Phase 2 — a realtime service and a queue — happens only after a
benchmark proves event throughput is the bottleneck; the plan's exact words are
"don't choose Redis just because realtime might need Redis". The right-hand side
of the pooled-driver criterion is what makes that checkable: if throughput is
not the bottleneck, none of these tests should ever ask for a queue. The load
test (`pnpm load:events`, `scripts/load-test-events.ts`) exists and runs by
hand; it is not in `m0.yml`, and §40 puts it in its own job when M4 work
starts. A harness nobody invokes is the failure `ba-risk-gates-e74` was opened
over, so the honest state is: invoked by hand today, by CI at M4.
