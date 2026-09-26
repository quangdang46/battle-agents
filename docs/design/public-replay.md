# What a shared battle replay may show

Satisfies the decision `ba-battle-replay-yjb` names as undecided: the M4 criterion
is "share the replay link with a logged-out user and they see the full timeline",
and the plan does not say what a logged-out viewer is then allowed to look at.

The short version: **a logged-out viewer sees which harnesses competed, when each
step happened, and how the rubric scored — and nothing about who the agents are or
what they were working on.**

Read
[`docs/design/public-event-stream.md`](public-event-stream.md) first. That
document settled the same class of question for the live stream, and the shape of
the answer here follows from the same fact rather than from a fresh argument.

## The fact that decides the shape

In `packages/protocol/src/agent-event.ts` every payload field is typed
`identifierSchema`, and that is `z.string().min(1)`. An adapter can put anything
in `test.failed.failure` or `test.passed.suite`, of any length.

So a replay cannot be produced by taking the log rows and deleting the dangerous
fields: "dangerous" is not a property the type guarantees, and a filter that
guessed would guess wrong the first time a new event type appeared. Every beat in
`packages/features/activity/src/replay.ts` is **built**, field by field, from a
closed list. An event with nothing publishable in it produces no beat rather than
an empty one, and an event type nobody has thought about is absent from the
projector's map — which means dropped, not forwarded.

The existing classification is reused where it applies and not widened. The
harness comes from `harnessSchema` and the session-end reason from
`sessionEndReasonSchema`, both imported from `@battle-agents/protocol` rather than
written out, so widening this surface is a reviewed change to the protocol and not
an accident here. Where the emitting feature owns a closed union that the
protocol does not (a join refusal, a lifecycle reason, a win reason), the
projection carries its own list and drops an unrecognised value rather than
showing it.

## The allow-list

| Event                          | Published as                                     | Withheld, and why                                                                                                   |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `battle.created`               | `battle.opened` + `mode`                         | the bounty id: it points at a sponsor's record, which has its own access decision                                   |
| `battle.joined`                | `fighter.joined`                                 | —                                                                                                                   |
| `battle.join_refused`          | `fighter.join_refused` + `why`                   | — (`why` is a closed union; an unknown value is dropped)                                                            |
| `battle.paused` / `resumed`    | `fighter.paused` / `resumed`                     | —                                                                                                                   |
| `battle.finished`              | `battle.finished` + `outcome`, `reason`          | the per-winner echo of the same event, which is the same instant seen twice                                         |
| `battle.expired` / `abandoned` | `battle.expired` / `battle.abandoned` + `reason` | —                                                                                                                   |
| `session.started`              | `session.started` + `harness`                    | `agentId`, `installationId`, `projectId` — internal handles                                                         |
| `session.ended`                | `session.ended` + `reason`                       | — (`reason` is a closed enum)                                                                                       |
| `session.resumed`              | `session.resumed`                                | —                                                                                                                   |
| `test.passed`                  | `test.passed` + `suite?`, `count?`               | `suite` is pattern-guarded, see below                                                                               |
| `test.failed`                  | `test.failed` + `suite?`                         | `failure`, which is the field a stack fragment lands in                                                             |
| everything else                | nothing                                          | includes `file.*`, `command.run`, `tool.*`, `thinking`, `prompt.submitted`, `message.*`, and every `bounty.*` event |

## What is never public, and why

**The session id and the agent id.** Not because they are secret — they are
handles to our own rows — but because a replay link is permanent and public while
those handles are the join key between this page and every authenticated surface
that takes one. A viewer holding a session id from a shared link could pivot to
anything keyed by it. So fighters are labelled `Fighter A`, `Fighter B` in join
order, derived from the log.

**The repository, the issue number, the file paths, the commands.** A bounty is
work on somebody's repository, often private, and sometimes a security report.
Publishing a repo name is publishing a place to look; publishing a path is
publishing a layout.

**The prompt and the reasoning.** Not a subset; there is no safe subset.

**The harness is the one field that is published, and the asymmetry is
deliberate.** It names a tool rather than a person, it is drawn from a closed enum
the protocol already defines, and "claude versus codex" is the entire reason a
stranger clicks the link. It is the scoreboard; the rest of the table above is
the detail behind it.

## The one place this is stricter than the live stream

`public-event-stream.md` publishes `test.failed.suite` as-is, on the argument that
it carries no sensitive field. That argument is weaker here for one reason: a
suite name is derived from a command line, so
`pnpm test packages/db/src/verify.test.ts` is a perfectly ordinary value for it,
and it is a repository path. The live stream is ephemeral and reaches a spectator
already on the site; a replay is a permanent artefact that gets cached, re-shared
and indexed. So `suite` is published only when it matches
`/^[A-Za-z0-9._-]{1,64}$/` — no slash, no space, no backslash, bounded.

This is a narrowing this projection adds, not a correction of that document. The
two surfaces have different lifetimes, and the difference between them is exactly
the kind of thing a shared decision has to be re-opened about.

## Determinism

The replay is a pure function of the persisted event stream plus the judge's
output. Concretely, the construction:

- reads no clock — the offset of each beat is measured from the first beat's own
  `occurredAt`;
- mints no identifier — every string in the output came from the log or from a
  closed vocabulary;
- sorts rows by the log's `sequence`, criteria by name, rubric keys by name and
  fighters by join order, because jsonb does not preserve key order and a
  projection that trusted it would render the same battle differently on the next
  request.

Two people opening the same link see the same bytes. That is the whole point of
sharing it.

## Assembled from the log, not from the tables

One read of `battles` happens and it is a locator: it answers whether a battle
exists behind this link and what its internal id is. Everything a viewer sees
comes from `event_log`, including the roster — `battle.created` and
`battle.joined` both carry `participants`, and reading
`battle_participants` instead would be a second account of the same events, free
to disagree with the log and with no way for a reader to tell.

`tests/integration/battle-replay.test.ts` pins this adversarially rather than
structurally: the battles row is rewritten to say a different mode and a
different rubric, and the replay does not move.

## The URL

`/replay/<replay_id>`, where `replay_id` is a dedicated column on `battles` with a
`gen_random_uuid()` default and a unique index — a second identifier, not the
primary key. Three reasons, in the order they matter:

1. **It is not the internal id.** A replay link is permanent and public;
   `battles.id` is an internal handle. Sharing one value makes every leak of the
   internal id also a leak of a public address, and makes the day `battle.read`
   grows an access rule the shared link the way around it.
2. **It is random, not derived.** A derived id is either guessable (it is the
   primary key) or dependent on a secret, and rotating that secret breaks every
   link already on the internet. A replay link is the one artefact here that
   cannot be allowed to expire by accident.
3. **It is indexed and unique.** A shared viral link has to be cheap, and one
   handle resolving to two battles is the state in which a handle is not a
   handle.

`db:verify.ts` checks that the column exists, that its default is still random,
and that no two battles share one — the third being the only one a column list
can answer.

## The far end of the window

`features/activity` keeps a trail for 365 days because a replay is a link. When a
battle's rows age out, the page renders a stated `expired` state, at 200, naming
the retention window. Not a 500, and not an empty timeline that reads as "nothing
happened".

`expired` claims only what the log can support: no events for this battle are
present. Whether they were pruned or never written is not answerable from the log
alone, and a page that asserted otherwise would be making a claim it cannot
vouch for.

An id that matches no battle at all is a 404, not an `expired` replay. A page
that explained itself as an expired replay for an id that never existed would be
inventing a history for a battle it cannot see.

## Not built, and named

Plan section 22 also puts **PixiJS arena playback** and an **og:image generated
from the final frame** on this page. The arena belongs to
`ba-game-client-pixijs-riw` and the PixiJS world does not exist yet, so the frame
does not exist either. What is at `/replay/<id>/og` is a **scoreboard card** —
fighters, harnesses, result — rendered with `ImageResponse`. When the arena lands
that route is where the frame replaces the card and nothing else about the page
has to change.

**Diff-streaming over the websocket** is also named by the plan, and none of it is
built here. Rendering a diff stream belongs to this bead; _emitting_ one belongs
to `ba-event-ingest-and-sse-gu9`, and that server side does not exist. This page
reads the log and renders a timeline. There is no invented substitute.

## Where the boundary is enforced

| Claim                            | Enforced by                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| the allow-list itself            | `packages/features/activity/src/replay.test.ts`, against a log seeded with a secret in every field                     |
| no credential on the public path | `apps/web/src/replay-view.test.ts`, which reads the read model and both routes and fails on one reaching for a session |
| the timeline is the log's        | `tests/integration/battle-replay.test.ts`, by contradicting the row                                                    |
| the handle is random and unique  | `db:verify.ts`, and an integration test reading `information_schema`                                                   |
