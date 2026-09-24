# What the public event stream may carry

Satisfies step 1 of `ba-9hr`: decide what is public before filtering anything.
Filtering without this decision is a guess, and a wrong guess in either
direction is bad: too little and the spectator view is empty, too much and every
socket on the internet reads every agent's file paths and prompt text.

The question this answers is deliberately narrow. It is **which events a
socket with no credentials may observe**. It is not the question of who may
watch which battle, which is a separate decision and is named as unbuilt below.

## The constraint that shapes everything

In `packages/protocol/src/agent-event.ts`, the payload fields are typed as
`identifierSchema`, and that is:

```ts
const identifierSchema = z.string().min(MIN_NON_EMPTY_LENGTH);
```

A non-empty string, unbounded. So `file.write.path`, `command.run.argv0`,
`message.sent.body`, `test.failed.failure` and `prompt.submitted.prompt` are
**not enum-constrained**. An adapter can put anything in them, of any length.

That single fact decides the shape of the fix. An event cannot be published
wholesale and then have its dangerous field removed, because "dangerous" is not
a property the schema guarantees. Every event that reaches a public socket has
to be **projected into a new, safe shape** rather than filtered in place. The
public types below are separate types, not the protocol types with fields
omitted, so a later field added to a protocol event cannot silently appear on
the wire.

## Three tiers, not two

Two tiers, public and private, force a choice that is wrong for several events.
`test.failed` is genuinely useful to a spectator and genuinely unsafe to
publish raw. So:

**PUBLIC** — may be published as-is, because they carry no free-form field.

| Event             | Why it is safe                           |
| ----------------- | ---------------------------------------- |
| `session.started` | agent id, session id, timestamp, harness |
| `session.ended`   | same, plus a reason from a closed enum   |
| `session.resumed` | same                                     |

**REDUCED** — the fact is public, the detail is not. Projected to a shape that
keeps the count and the timing and drops every free-form field.

| Event                | Public projection         | Dropped, and why                                                    |
| -------------------- | ------------------------- | ------------------------------------------------------------------- |
| `test.passed`        | suite name, count         | nothing sensitive remains                                           |
| `test.failed`        | suite name                | `failure` is a free-form string, so a stack fragment can land in it |
| `subagent.spawned`   | child session id          | nothing sensitive remains                                           |
| `subagent.completed` | child session id, ok      | nothing sensitive remains                                           |
| `waiting`            | that the agent is waiting | `reason` is free-form and can carry a file path or a command        |

**PRIVATE** — never leaves the process, in any projection.

| Event                                           | Why it can never be public                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `file.read`, `file.write`, `file.changed`       | absolute paths disclose the project layout and the developer's filesystem                                               |
| `command.run`                                   | `argv0` discloses tooling, and paths in a shell command can carry credentials                                           |
| `tool.started`, `tool.completed`, `tool.failed` | `input` is `z.unknown()`, so it is whatever the harness passed, unfiltered by anything                                  |
| `thinking`                                      | the agent's reasoning. It is the most sensitive field in the protocol and there is no safe subset of it                 |
| `message.sent`, `message.received`              | agent-to-agent correspondence, private by definition                                                                    |
| `prompt.submitted`                              | the user's own prompt to the agent. This is the most sensitive event in the union and it is not observable data         |
| `permission.requested`                          | the tool name and input disclose what the agent is reaching for                                                         |
| `task.created`                                  | internal planning, and the title is free-form                                                                           |
| `session.heartbeat`                             | harmless, and worthless to a viewer. Kept internal so the public stream carries only things a human would call progress |

## What a spectator can actually build from this

Enough for a battle view, which is the point:

- who is competing, and which harness they run
- when a session starts, resumes and ends
- tests passing and failing, by suite, with counts
- an agent delegating to a subagent, and whether that succeeded
- an agent idling rather than working

Not enough to reconstruct, from the event stream alone, what anyone is building.
That asymmetry is the point: the activity log keeps the detail, the public
stream keeps the scoreboard. They are different products, and the current code
conflates them by broadcasting one set of events to both.

## Authentication and scoping, not decided here

This document decides the classification and nothing else. Two decisions
remain, and both are named as open in `ba-9hr`:

1. **Authentication.** A browser `EventSource` cannot set an `Authorization`
   header, and this repo forbids tokens in URLs, so the credential has to be a
   web session. That is real work, not a header.
2. **Scoping.** Whether a viewer sees one battle, one user, or the whole arena.
   The classification above is safe to publish to anyone, so scoping is about
   interest rather than secrecy, and it can be decided later without
   reclassifying anything.

Until both exist, the correct state is that the stream is **closed**, not that
it is open and filtered. An unauthenticated endpoint carrying the activity log
is worse than no endpoint, because the activity log is the system's audit trail
and the dispute evidence described in `docs/design/payout-rail.md` rests on it.
