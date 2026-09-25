# GitHub webhook ingress: what this layer emits, and what it refuses to decide

Status: decided, 2026-09-26. Bead `ba-github-infrastructure-56v`.

## The shape

`packages/infrastructure/github` is an integration behind a boundary. It has no
workspace dependencies at all, which is how the boundary is enforced rather than
merely described: the delivery store is a port declared in the package and
implemented in `packages/db`, the event is handed to a `publish` callback the
composition site supplies, and there is nothing to import from a feature.

The order of operations in `src/webhook.ts` is the deliverable:

1. verify `X-Hub-Signature-256` over the **raw bytes**
2. only then `JSON.parse`
3. record the delivery in `github_delivery_claims`
4. publish what the delivery asserted

A rejected delivery writes nothing. A claim written for an unsigned request is
an attacker spending a real merge's one chance to be seen, so the tests assert
on the collaborator and not on the status code.

## The event name, and the double-pay it avoids

The integration emits `github.pull_request.merged`. Not `pr.merged`, and not
`bounty.completed`.

`bounty.completed` is a game fact, and this layer knows nothing about bounties;
emitting it puts the game vocabulary at the integration edge.

`pr.merged` is the sharper one. It is already an entry in
`packages/features/progression/src/rules.ts` `OUTCOME_TYPES` with a handler
registered for it, and it pays **500 XP**. `bounty.completed` pays **1000 XP**
and also has a handler. So the moment the bounty feature lands and translates
this same merge into `bounty.completed`, one merged pull request pays 1500 XP
and writes two behaviour-history rows.

**This coupling is live today and is not resolved by this bead.** The three
options, for whoever lands `ba-feature-bounty-xhk`:

- remove `pr.merged` from `OUTCOME_TYPES` and pay merges only through
  `bounty.completed` — one merge, one award, but a non-bounty merge pays nothing;
- keep `pr.merged` and have the bounty feature emit _only_ `bounty.completed`
  for submissions — double-pays again unless something suppresses one;
- keep both and make the bounty feature the only emitter of either, with this
  layer's event being telemetry that pays nothing.

The third is what the current code does by accident, and it is a decision
nobody made. `tests/unit/github-boundary.test.ts` asserts the _negative_ — that
`github.pull_request.merged` is not in `OUTCOME_TYPES` — so the integration edge
stays out of the argument instead of picking a side in it.

## Identity

`PULL_REQUEST_MERGED` is named after the integration that observed it rather
than after a game concept, and the payload has no agent field. The GitHub
account that opened the pull request is carried as `githubLogin`, and the event's
`actorId` is the constant `'github'` — not the login, which would make a human's
account the causal actor in the activity trail.

Both existing consumers read `payload.agentId` and skip an event without one, so
`github.pull_request.merged` pays nothing to progression and moves nothing in
reputation today. That is the invariant working, not a bug. **The bounty layer is
the only thing that can legitimately supply the agent**, by correlating the
bounty claim record with the pull request — correlating from the GitHub login
would be the conflation the identity contract forbids.

## Idempotency, and what it does not cover

GitHub delivers at least once, out of order. Two unique indexes on
`github_delivery_claims` do the work:

- `delivery_id` — `X-GitHub-Delivery`, one per delivery.
- `(fact, repository, subject, subject_number)` — the semantic key. A retry
  arrives under a **new** delivery id, so only this index catches it, and it is
  the property a delivery-id cache cannot give you: a cache is lost exactly when
  a restart empties it, and the next retry double-records the merge.

The claim is a single `INSERT ... ON CONFLICT DO NOTHING`, never a
read-then-write. Two deliveries arriving together both read "not claimed" under
the read-then-write shape and both write.

What this does **not** cover: a crash between publishing and marking the claim
published leaves a claim that stays `in-flight` forever, and the merge is never
republished. The failure modes are deliberately asymmetric, because the
alternative is worse:

- **publish throws** → the claim is released, the response is 5xx, and GitHub's
  retry finds a free claim. A transient failure costs a delay, not a merge.
- **marking published throws** → the claim is **not** released, and the response
  is 5xx. The event is already on the bus; releasing would hand the retry
  permission to publish it a second time, which is the double completion this
  package exists to prevent.

The residual is one stuck row, and it is the safe direction: not lost, not
repeated. This is also why a consumer that mints game state must make its own
state transition idempotent — **a bounty completion has to be a compare-and-set
on the bounty's status, not a reaction to receiving an event.** That is
`ba-feature-bounty-xhk`'s to build, and it is the real answer to the headline
criterion rather than anything on this side of the boundary.

## Reordering

Each handler's effect is a function of the delivery's own content, not of what
arrived before it. A `pull_request` / `closed` / `merged: true` delivery is a
merge whether or not an `opened` was ever seen, so a close that overtakes its
open still publishes. `src/webhook.test.ts` asserts both orderings produce
byte-identical events.

The other direction — a merge arriving before the submission that makes the
bounty completable — is the bounty's problem, and `findPublishedFact` exists so
a reconcile pass can find the merge that was already recorded.

## The dependency that was not taken

The brief says "validates GitHub issue exists via Octokit". This ships `fetch`
instead, deliberately:

- the bead needs **one** GET against `api.github.com`;
- Octokit grows `pnpm-lock.yaml` by its full transitive tree;
- `scripts/check-licenses.sh` scans only first-party files under `packages/` and
  `apps/`, so an npm dependency passes the licence stage trivially while
  contributing nothing to it — the stage would say less about the tree, not
  more;
- `fetch` is injectable, so the test never opens a socket either way.

If the call count grows past a handful, the trade flips. That is a decision to
revisit, not a decision to avoid.

## Failure responses

| Situation                         | Status | Claim written | GitHub retries  |
| --------------------------------- | ------ | ------------- | --------------- |
| no secret configured              | 401    | no            | yes             |
| unsigned / mismatched / malformed | 401    | no            | yes             |
| body is not JSON                  | 400    | no            | no              |
| no `X-GitHub-Delivery`            | 400    | no            | no              |
| authentic, nothing to act on      | 200    | yes, no fact  | no              |
| already claimed or published      | 200    | unchanged     | no              |
| publish threw                     | 500    | released      | yes             |
| marking published threw           | 500    | left claimed  | yes, and no-ops |

## What this bead deliberately did not do

- **No bounty lifecycle, so the headline criterion is not met from here.** "A
  real PR merged on a real repo completes the corresponding bounty exactly
  once" needs a bounty to complete. `packages/features/bounty` holds `index.ts`
  and `payout.ts` and no feature; `ba-feature-bounty-xhk` owns it and is blocked
  by this bead.
- **No `pr_number` column on `bounties`, and no unique index on
  `(repo_owner, repo_name, issue_number)`.** Both are prerequisites for resolving
  a merge to a bounty by index rather than by parsing `pr_url`, and both belong
  to the schema change the bounty wave makes. Adding them from here would be two
  agents in one migration.
- **No edits to `apps/web/src/composition.ts`.** The webhook is wired from
  `apps/web/src/webhook-routes.ts` against the existing shared runtime, which is
  enough and does not contend with the bounty wave.
- **No GitHub SDK, and no change to `progression/src/rules.ts`.** The double-pay
  is reported above for whoever owns that decision, rather than resolved here by
  deleting an award somebody else priced.
