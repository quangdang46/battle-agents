# Docket: cloud deploy (ba-neon-cloud-deploy-zn4)

Split on 2026-09-26 into what can be settled without a cloud account and what
cannot. This file records the second half so the bead's progress is legible
without re-reading four criteria, and so whoever holds Vercel and Neon
credentials can finish it without re-deriving the reasoning.

## Settled here, offline

**Local development never requires Neon.** This was already true and is now
guarded rather than merely asserted. The default is container Postgres
(§37), and `packages/db/src/client.ts` reads `DATABASE_URL` with no cloud
fallback anywhere in the path. `scripts/check-pooled-driver.sh` fails on a
connection constructed anywhere outside the two-file allowlist, and it carries a
self-test that plants a connection in a file the scan reads and fails if the
scan does not find it.

**The pooled driver is used, and the pool is a singleton.** This held already
and now has a test rather than a comment. `apps/web/src/shared-runtime.ts` builds
the pool once on first use and memoises it, deliberately not at module scope
because a module-scope pool is opened while `next build` walks the tree.
`tests/integration/shared-runtime-fold.test.ts` asserts `sharedRuntime().database`
is the same object on every call — which is pool identity seen from the outside,
since a fresh `Pool` yields a fresh drizzle handle.

The grep alone would have been enough to satisfy the criterion and not enough to
mean it. §7.1's stated failure is a hoisted client that looks right in review and
exhausts connections in production at 2000 writes/s, which a grep cannot see.
That is why the identity assertion exists.

The allowlist has one surprising entry: `scripts/check-postgres.ts` builds a
`new Client`. It is a one-shot preflight that connects, runs
`select current_database()`, and exits — it exists because `docker compose up
--wait` once reported success while the published port belonged to another
project's container. There is no request path and nothing to reuse. The first
version of the guard allowlisted neither file and fired on it, which is the
useful reminder that a guard red on a correct tree gets switched off.

## Not settled here, and why

**Criterion 1 — a merge to main produces a working deployment.** Requires a Vercel
project and a deploy hook. The substance is an automated smoke test against the
deployed URL that FAILS THE BUILD when it fails, asserting three things: the root
serves, the Better Auth mount answers at `/api/auth/*`, and the event ingest
route answers a batched request with the documented status. A Next.js shell with
no API behind it renders fine, so "reachable host" is not evidence and a green
pipeline that deploys a broken build must not pass.

**Criterion 2 — each PR gets an isolated preview with its own Neon branch.** Needs
a Vercel account and a Neon account. Two assertions, because either alone is
satisfiable by a lie: the preview's Neon branch name derives from the PR number,
AND running migrations against it leaves the production branch's migration
ledger byte-identical. The second is the one that matters and the one easiest to
claim without checking — a preview wired to the production database satisfies
"each PR gets a preview" and corrupts shared data on merge.

## Not in this bead, restated so it is not added later

Phase 2 — a realtime service, and a queue — happens only after a benchmark proves
event throughput is the bottleneck. §7.4's exact words are "don't choose Redis
just because realtime might need Redis". The right-hand side of the pooled-driver
criterion is what makes that checkable: if throughput is not the bottleneck, none
of these tests should ever ask for a queue.

The pre-M4 load test (`pnpm load:events`, `scripts/load-test-events.ts`) is
similarly not wired into `m0.yml`, and should not be: §40 puts it in its own job
when M4 work starts. It exists and runs today; a harness nobody invokes is the
failure `ba-risk-gates-e74` was opened over, and the honest state is that it is
invoked by hand and will be invoked by CI at M4.
