# spacemolt — the session/presence model, read against plan §3

- **Repo (read):** two checkouts, because the protocol lives in one and the
  reconnect/presence policy lives in the other. Neither alone answers the question.
  - `https://github.com/SpaceMolt/client` — `@ e7af1620a67ed62a0320dce7beb2ac8e998fe27c`
    (2026-09-02, "Update legacy commands and release builds (#33)"). The
    **official reference client**; a single 3052-line `src/client.ts`, HTTP-only,
    no WebSocket.
  - `https://github.com/SpaceMolt/spacemolt-lib` — `@ 9aa120d3e4932ff729743b84d50df7fc4d85ad05`
    (2026-09-24, "chore(release): v15.1.0"). The TypeScript library; this is where
    the WebSocket lifecycle, close codes and reconnect policy live.
- **License: MIT, both.** `LICENSE`:1-2 — `Copyright (c) 2026 spacemolt.com`
  (client), `Copyright (c) 2026 SpaceMolt` (lib).
- **Checkouts:** `.tmp/spacemolt-client`, `.tmp/spacemolt-lib`. `.tmp/` is
  gitignored, so every verdict below **quotes the line it rests on** — a bare
  `file:line` pointer would die in a fresh clone and in CI.
- **Date read: 2026-09-26.**

Plan §34 schedules this reading: *"compare session/presence model against §3
before M5."* §3 is frozen by declaration (plan:980, contract 3), so the
question is not whether to change it but whether the comparison finds a reason.

## 1. What is readable here, and what is not

**The game server is not open source.** There is no `gameserver/` in either
checkout. Everything below is therefore a claim about the **client-side model** —
what the reference implementations do, and what the published OpenAPI spec says
the server offers. Where a claim is about what the server *enforces*, this note
says so.

This is the opposite situation from [moltbook.md](./moltbook.md), whose checkout
was documentation only. SpaceMolt is real source with a real protocol, and its
spec snapshot (`spacemolt-lib/openapi.json`, 5.3 MB) is generated from the live
server and kept in lockstep by CI. **A CONFIRMED row here means confirmed from
shipping client code or a server-published schema** — a stronger footing than
Moltbook offered, and the reason the reading could settle anything at all.

Three verdicts are used, as in the Moltbook note:

| Verdict      | Means                                                             |
| ------------ | ----------------------------------------------------------------- |
| `CONFIRMED`  | A named file states it, and the line is quoted below              |
| `UNVERIFIED` | No file in either checkout states it; the negative grep is recorded |
| `REFUTED`    | Checked, and the claim is false — either the plan asserted the false version, or the mechanic does not exist at all |

## 2. Verdict table

| ID  | Claim under test                                                                                            | Verdict        | Source                                                    |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------- |
| S1  | The transport session is a distinct, expiring, throwaway bearer — not the identity                         | **CONFIRMED**  | `client.ts`:113-126, 988-1004, 1040                       |
| S2  | Player identity outlives the transport session and is re-established by credentials after it expires        | **CONFIRMED**  | `client.ts`:1071-1105                                     |
| S3  | The auth-success frame carries no session/resume token and no prior-run state beyond a world snapshot       | **CONFIRMED**  | `LoggedInPayload` in `openapi.json` · `Player` schema     |
| S4  | There is a server-side resume-vs-new **offer** (a HELLO the client answers)                                 | **REFUTED**    | negative grep, §3.1                                       |
| S5  | Presence is per-player with a single connection slot; a second connection **evicts** the first              | **CONFIRMED**  | `errors.ts`:72-83 · `account.ts`:292-300, 1498            |
| S6  | Presence transitions arrive as per-friend `online`/`offline` pushes                                        | **REFUTED**    | negative grep, §3.2                                       |
| S7  | There is a heartbeat / keepalive / liveness ping                                                           | **REFUTED**    | negative grep, §3.3                                       |
| S8  | A battle survives the connection and is reachable afterwards by id                                          | **CONFIRMED**  | `COMMANDS.md`:139-148 · `client.ts`:522-529, 1330-1358    |
| S9  | Reconnect restores battle membership                                                                       | **REFUTED**    | `account.ts`:1478-1492 · §3.4                             |
| S10 | There is a **grace window** after a disconnect, inside which reconnect is offered resume-vs-abandon          | **UNVERIFIED** | negative grep, §3.5                                       |
| S11 | Mutations queue and resolve on a later tick — one action per tick, ~10 s                                    | **CONFIRMED**  | `client.ts`:2786-2787 · `account.ts`:687-691              |
| S12 | One credential drives many accounts (multi-account)                                                        | **CONFIRMED**  | `README.md`:11, 37                                        |
| S13 | A `reconnected` push is a protocol-level resume signal                                                     | **REFUTED**    | `Notification_reconnected` · `account.ts`:1180, §3.6      |
| S14 | The checkout is shipping source, not documentation                                                          | **CONFIRMED**  | `client.ts` 3052 lines · `lib/src/` 27 modules            |
| S15 | License is MIT                                                                                              | **CONFIRMED**  | `LICENSE`:1-2, both checkouts                             |

## 3. Evidence

### 3.1 S4 — there is no resume-vs-new offer: REFUTED

This is the claim the whole bead turns on, so it is checked first and against the
real vocabulary rather than against a paraphrase:

```
$ grep -rIniE "'hello'|\"hello\"|type: *.hello|hello_\{|HELLO\{|resume[_ -]?vs" \
    spacemolt-client/src spacemolt-lib/src --exclude='*test*'
(no matches)
```

**The first version of this grep was wrong and is recorded because of it.** It
searched for the bare word `hello` and got three hits — all in
`version.test.ts`, all of them the literal chat text
`'hello', 'world', 'how', 'are', 'you'` passed through `parseArgs`. A grep whose
hits are a test fixture asserting string concatenation is not evidence of a
protocol frame, but it is also not nothing: the honest response is to record the
hit, not to delete it from the transcript.

The word `resume` is the same story and is worth stating so the next reader does
not conclude this note is careless. It occurs **8 times** outside tests and
**every one is a prize-servicing verb** — `client.ts`:203 and the four generated
files all carry `service_action: "stop" | "resume" | "redirect" | "refuel" |
"repair"`, "Stop, resume, redirect, refuel, or repair a claimed intact prize".
Not one concerns a session. Likewise `offer` appears 87 times, every one of them
a trade. So: **no resume-*vs*-new, and no `offer`/`resume` pair in any sense a
reader would mistake for the handshake.**

What exists instead is a **client-side fork the server never sees**. The client
holds a session file; if it is absent or expiring it mints a new one
(`client.ts`:1006-1013):

```ts
function isSessionExpired(session: Session): boolean {
  return Date.now() > new Date(session.expires_at).getTime() - 60000;
}

async function getSession(): Promise<Session> {
  const session = await loadSession();
  return !session || isSessionExpired(session) ? createSession() : session;
}
```

`POST /api/v{1,2}/session` mints `{id, created_at, expires_at}` and it rides on
every request as `X-Session-Id` (`client.ts`:1040). Nothing in it names a
player. The identity fork is the **command**: `login` (existing player) versus
`register` (new player), and the client decides which to call.

**This is the one place SpaceMolt is weaker than §3, and it is why the decision
is KEEP rather than ADOPT.** Plan §3.2 has the *server* offer:

> Reconnect handshake: adapter sends HELLO{installationId, agentId, projectId};
> server matches same agent+installation+project+recent-disconnected → offer
> resume Session#241 vs new #242.

The offer is a contract the server honours, and the client cannot quietly decide
to be a new agent. SpaceMolt's client decides unilaterally from a local file and
the server learns the answer only after the fact, by whether `login` or
`register` was called. That is the exact failure §3.2 is written to prevent
("Reopen must NOT create 'Claude #2'") — reached by a different road.

### 3.2 S6 — presence is a location delta feed, not a friend-status push: REFUTED

The client has handlers for `friend_online` / `friend_offline`
(`client.ts`:1394-1400):

```ts
  friend_online: (d, t) => {
    console.log(`${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.username || 'A friend'} is now online`);
  },
```

Neither name appears among the **59 notification schemas the current spec
publishes**:

```
$ python3 -c "...schemas starting with Notification_..."
notification count: 59
friend*: []
```

The client (last pushed 2026-09-02) handles notification types the server's spec
(snapshotted 2026-09-24) no longer publishes. What the spec *does* publish is
`Notification_observation_update`, and presence arrives through it as a
location-scoped delta keyed by `player_id` — `nearby_changed` / `nearby_departed`,
alongside pirates, NPCs, wildlife and prizes (`observation.ts`:9-16,
`account.ts`:891).

So SpaceMolt's presence model is: **who is at this place**, not **who is
connected**. A friend three systems away going offline produces no event at all.
Presence is a function of location, and it is scoped to a subscription the client
opens.

### 3.3 S7 — there is no heartbeat: REFUTED

```
$ grep -rIniE 'heartbeat|keepalive|keep-alive|\bping\b|\bpong\b' \
    spacemolt-client/src spacemolt-lib/src --exclude='*test*'
(no matches — 0 lines)
```

Unanchored, `ping` matches inside `shipping`, `stopping`, `mapping` and
`jumping`, which is how the first pass of this grep returned four confident
false positives. Word boundaries are what make a negative grep mean anything.

Not one. And the library's own developer guide records the absence as a
deliberate, unresolved gap (`CLAUDE.md`:255):

> Liveness watchdog deferred — a web-standard `WebSocket` can't observe the
> server's protocol-level pings, so an opt-in heartbeat query is the planned
> approach; today we rely on the socket `close` event.

Liveness is **edge-triggered by socket close**. A half-open connection — one the
peer never closed — is not detected at all.

Contract 3 (plan:980) reads *"HELLO resume-vs-new + grace window + **heartbeat**"*.
The live experiment has none of the three, and runs an MMO with thousands of
agents without them. **This does not make our heartbeat wrong, and it is worth
being precise about why, because the first draft of this note had it backwards.**

Our heartbeat is real and tested, not aspirational:
`packages/features/agent/src/session.ts`:42-43 declares
`DEFAULT_HEARTBEAT_TIMEOUT_MS = 5 * MS_PER_MINUTE` and
`DEFAULT_RESUME_GRACE_MS = 15 * MS_PER_MINUTE`, both consumed by the handshake
and the sweeper.

So the asymmetry is a **capability** one, not a necessity one. SpaceMolt infers
liveness from a close event, so a link that never closes is invisible to it; we
time out on a stale `lastHeartbeatAt`, so a half-open link is detected. The cost
is a heartbeat route and a sweeper. What the reading establishes is that **a
persistent agent world does not require one** — so ours buys half-open detection
specifically, and not "being alive at all". If that detection is ever dropped,
this is the note that says the reference implementation does not miss it.

### 3.4 S9 — reconnect restores subscriptions, never battle membership: REFUTED

`reconnectOnce` (`account.ts`:1478-1492) is the whole of the recovery path:

> Reconnect this account's underlying connection in place: a fresh socket,
> re-authenticated, subscriptions restored — while preserving this instance's
> identity (cache, correlator, every wired listener).

Subscriptions and cache. Not battles, not the run in progress. The recovery
mechanism for "which battle was I in" is a **zero-argument query**
(`COMMANDS.md`:146):

```
- `status()` · *query* → `GetBattleStatusResponse` — View current battle status
```

The server holds the answer; the client asks again after it is back. And the
`Player` schema — 38 properties, `last_active_at`, `last_login_at`,
`last_command_at` among them — carries **no battle field**, and `LoggedInPayload`
(`player`, `ship`, `system`, `poi`, `modules`, `pending_trades`, `recent_chat`,
`unread_chat`) carries none either. A reconnecting player is never *told* which
battle they were in; they have to ask.

### 3.5 S10 — there is no grace window: UNVERIFIED

Not refuted, absent. The terminal-close set is exactly three things
(`account.ts`:292-300):

```ts
function isTerminalClose(err: ConnectionClosedError): boolean {
  return err.code === CLOSE_CODE.SESSION_REPLACED || err.code === CLOSE_CODE.AUTH_TIMEOUT;
}
```

plus a deliberate `close()` (`account.ts`:1174-1177). Everything else reconnects
with exponential backoff, forever, up to `maxRetries` — a transport decision
with no game-state deadline attached. There is no "you had N seconds" anywhere,
because **a battle never expires for being disconnected**: it is a server-side
object with an id (`S8`), so there is nothing to decide.

§3.2's *"Disconnect during battle → grace period → reconnect? resume :
abandoned"* therefore has **no SpaceMolt counterpart to be compared against**.

**The clause is not unbuilt, though — it is un-*corroborated*, and the difference
matters.** `ba-contract-session-rpo` closed on 2026-09-24 with
`DEFAULT_RESUME_GRACE_MS = 15 * MS_PER_MINUTE` implemented and single-sourced so
the handshake and the sweeper cannot disagree
(`packages/features/agent/src/session.ts`:43, `hello.ts`:121, 147, 260-267).
The same file records the bug that constant once had — a units error that made
the window **fifteen hours**, so the handshake resumed anything less than half a
day old, *"the difference between 'they reopened their terminal' and 'they are
somebody else's session'"* (`session.ts`:36-41).

So the grace window rests on our own tests and on a bug we already paid for.
**SpaceMolt contributes nothing to it** — no window, no duration, no counter-
example. Whether fifteen minutes is the right number for a battle is a product
decision this reading was never able to inform, and §4 says so rather than
letting "we read SpaceMolt" imply the clause was covered.

### 3.6 S13 — `reconnected` is a game push, not a protocol resume: REFUTED

The push exists and the client renders it (`client.ts`:1260-1264). Its schema is
`{message, ticks_remaining, was_pilotless}` — game state, no session or
connection semantics. The only genuine reconnect signal is client-side:
`onReconnected` fires *"after a successful reconnect + re-auth"*
(`account.ts`:1180), and it is the library telling its own caller, not the
server telling the client.

## 4. The decision: **KEEP**

> **Does SpaceMolt's session/presence model change our locked §3
> User/Agent/Session/Battle split and the resume-vs-new handshake?**

**KEEP.** The split stands, and the handshake stands — and the handshake stands
*because* of what the reading found, not in spite of it.

**The §3 clauses this comparison actually cleared:**

1. **§3.1 "AGENT: persistent character … NEVER deleted when a terminal closes"
   and "SESSION: one ephemeral run."** Cleared by `S1`/`S2`. SpaceMolt runs the
   exact failure this split exists to prevent, at MMO scale, and keeps identity
   and transport session apart: `.spacemolt-session.json` + `X-Session-Id` is
   minted, expires, and is thrown away (`client.ts`:988-1004), while the player
   it authenticated is re-established afterwards by the same credentials
   (`client.ts`:1071-1105). A live experiment independently arrived at
   "expired session → new session, same player" — our §3.2 rule in a different
   vocabulary. This is the strongest positive evidence available for the split.

2. **§3.1 "BATTLE: binds Sessions not Agents."** Cleared by `S8`, in the most
   emphatic form the reading could produce. A SpaceMolt battle is a server-side
   object with its own id, a tick-by-tick log queryable by that id, and
   membership as a join record — it outlives every session that touched it and is
   reachable after all of them are gone. A battle that outlives its sessions is
   the strongest possible support for binding battles to *runs* rather than to
   *characters*, which is exactly what §3.1 says.

3. **§3.2 "Reopen must NOT create 'Claude #2'."** Cleared, and — the reason this
   is KEEP and not ADOPT — **SpaceMolt does not clear it by its own design.**
   Its resume decision is client-side and silent (`S4`, §3.1). Our §3.2 makes the
   *server* offer the fork. Adopting SpaceMolt's model here would trade a
   server-held contract for a local file, which is a regression dressed as
   evidence.

**What the comparison did NOT clear, stated so it cannot be read as covered:**

- **The grace window (`S10`, §3.5).** No counterpart exists, so §3.2's
  *"grace period → reconnect? resume : abandoned"* is **carried, not cleared**.
  It rests on `ba-contract-session-rpo`'s own tests and on the 15-hour bug that
  bead found and fixed — not on this reading.
- **The heartbeat interval and the grace duration.** No number in either
  checkout bears on either. **No figure is imported from here.** Plan:974
  already marks this class of number UNVERIFIED hypothesis; nothing found lifts
  that, and 5 min / 15 min remain ours.
- **Whether SpaceMolt would benefit from the same model.** This is a reading of
  one implementation, not an evaluation. Nothing here is evidence that our split
  is *better*, only that it is not falsified by the one live experiment closest
  to it.

**A correction to the reconnaissance this bead was handed.** The recon asserted
that *"there is no contract-session bead — the resume handshake is frozen only
by declaration in the plan, never by a closed bead."* **That is false.**
`ba-contract-session-rpo` (P0, CONTRACT 3) **closed 2026-09-24**, before the
recon was written. It is implemented, it has 24 unit and 25 integration tests
against live Postgres, and it holds a session state machine whose transition
matrix is exhaustive. This matters to the decision rather than being a footnote:
KEEP on a contract that nothing had actually locked would have been a decision
about nothing. KEEP here is a decision about a contract that is **already
shipped, tested, and depended on by six open beads** — the newest of which,
`ba-118`, is still deciding *how* to expose the handshake over HTTP and lists
four candidate designs, none of which is a resume-vs-new fork that SpaceMolt's
client-side model would simplify.

That is also why this is KEEP and not DEFER: the thing the plan asked to be
settled **before M5** is settled, on evidence, with the one clause it could not
test named as untested.

**One question this reading opens, which is deliberately NOT this bead's
decision:** `S5`/§3.4 — SpaceMolt's `session_replaced` (4001) means **one
connection slot per player**; a second login evicts the first and reconnecting
would "just fight it" (`errors.ts`:72-74, `account.ts`:1498). Our §3 says nothing
about what happens when the same agent connects twice. That is a **presence**
rule, not a **split** rule — adopting it would not move the User/Agent/Session/
Battle boundary, which is why it does not change this decision. It is recorded
here as an open question for whoever owns presence, and it is the single most
transferable mechanic found.

## 5. Licenses, and what may be copied

MIT in both checkouts, with `LICENSE` files naming the copyright holders. Unlike
[learn-spine-license.md](./learn-spine-license.md) there is nothing to avoid.
The most worth taking is **not code**: it is the close-code taxonomy
(`errors.ts`:72-83) — three named close codes with the reason each is or is not
retryable, documented in one place and honoured by one function
(`isTerminalClose`). Our transport has the same problem — what is a drop we can
recover from versus one we must not fight — and it answers it in a single
enumerated constant instead of an ad-hoc branch.

`spacemolt-lib/CLAUDE.md` also documents a failure worth stealing as a
*process*: its spec-sync CI "ran red ~1,160 times over five weeks before anyone
noticed" because a broken sync looked identical to a transient failure. Our
`scripts/check-codegen-fresh.sh` is the same class of gate.

## 6. Staleness

Written 2026-09-26 against `e7af162` (client) and `9aa120d` (lib).

**What postdates this reading**, from `br list` on that date — 36 beads, 10
closed, 26 open. The parts of the plan most relevant to what was read were
already built, which is why §4 could be a decision rather than a question:

- **Already closed, so this reading tests shipped code:** `ba-contract-session-rpo`
  (CONTRACT 3, 2026-09-24 — the handshake, the 15-minute grace window, the
  heartbeat), `ba-moltbook-verification-0zc` (2026-09-25, the note this one is
  written to sit beside).
- **Open, and directly downstream of this note:** `ba-118` (P1 — no network
  surface can create a session; four candidate designs for exposing the
  handshake), `ba-e2i` (P2 — features/world, M5, the milestone the plan
  scheduled this reading *before*), `ba-feature-battle-fbt` (M4),
  `ba-battle-workspace-judge-jc9`, `ba-core-loop-integration-uk7`.
- **Open, and untouched by this reading:** `ba-feature-social-lss` (deferring
  the principal question `ba-118` is coupled to), `ba-vsd`, and the M1/M2
  milestone work `ba-p3j`, `ba-m1-two-harness-integration-3us`.
- **Not read at all:** the secondary watch targets, below.

Two decay rates, and the gap between them is the number to remember:

- **The client is the fast half.** `e7af162` is 24 days behind the lib and its
  handler table has already drifted out of the published spec (`S6`). A
  `friend_online` handler in it is evidence about September, not about now.
- **The lib tracks the server, so its protocol facts are the durable ones** —
  and can therefore change *underneath a stable SHA*. `openapi.json` is
  regenerated from the live deployment, and CI commits the result. The close
  codes in `errors.ts` are frozen in hand-written source (decaying slowly); the
  notification schemas in `openapi.json` are server truth at the moment of the
  snapshot and will not change the file's own SHA when the server moves. **A
  green SHA does not mean a current protocol** — the same failure the Moltbook
  note records, arriving by the opposite route.

**Secondary watch targets: NOT covered.** Agent Intercom (plan:74) and
sandbox-agent (plan:75) were **not cloned and not read** in this pass, per the
bead's instruction not to pull a project in reflexively. No row exists for either
in [README.md](./README.md), and no claim about either is confirmed anywhere in
this note. Their comparison is **outstanding**, and the plan's lines describing
them have been reduced to pointers rather than left asserting mechanics nobody
checked.

## 7. Summary

| Question                                                    | Answer                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Can a §3 mechanic be checked from real source?              | **Yes** — both checkouts are shipping client code plus a server-published spec |
| Is the transport session the identity?                      | **No** — a distinct expiring bearer; identity is re-established by credentials |
| Is there a server-side resume-vs-new **offer**?             | **No.** The client forks `login` vs `register` on its own                     |
| Is presence per-connection or per-location?                 | **Per-location** — a delta feed of who is at this POI/system, keyed by player |
| How many connections may one player hold?                   | **One.** A second login evicts the first (`session_replaced` 4001)             |
| Is there a heartbeat?                                       | **No.** Liveness is inferred from socket `close`; a half-open link is invisible |
| Does a battle outlive its sessions?                         | **Yes** — a server-side object with an id, queryable after the fact            |
| Is there a grace window?                                    | **No counterpart.** §3.2's grace window is therefore **untested**, not cleared |
| **Does §3 change?**                                          | **KEEP.** The split is cleared, and the handshake is kept *because* SpaceMolt's is client-side |
