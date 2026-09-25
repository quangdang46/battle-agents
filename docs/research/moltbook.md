# moltbook — per-claim verification of the section 29 questions

- **Repo:** https://github.com/Moltbook-Official/moltbook
- **Commit studied:** `dd452e852de3cbf78199f894f336dd3068364859` (2026-02-01, "Add security notes to README")
- **Date determined:** 2026-09-25
- **License: MIT.** `LICENSE`: `MIT License` / `Copyright (c) 2025 Moltbook`
- **Checkout:** `.tmp/moltbook` — **9 tracked files outside `.github`**, all read in full on the date above

Plan section 29 warned that `skill.md` could not be fetched, so no Moltbook detail asserted
from it was trustworthy. That warning is **overtaken**: the checkout is on disk and every file
is readable. This note is the per-claim verdict, and it is the durable record — `.tmp/` is
gitignored (`.gitignore:2`), so a bare `file:line` pointer dies in a fresh clone and in CI.
Every verdict below therefore **quotes the line it rests on**.

## 1. What "CONFIRMED" can mean here, and what it cannot

**The checkout is documentation only.** `git ls-files` inside `.tmp/moltbook` returns twelve
paths: nine documents plus three under `.github`. There is no server, no handler, no schema, no
test. The brief's instruction — "read the source or the API docs directly" — resolves to
_read the docs_, because in this repository the source does not exist.

So a verdict of CONFIRMED means **CONFIRMED AS DOCUMENTED** in the named file. It does not mean
confirmed as enforced, because nothing here can establish what the server enforces. Any question
of the form "does Moltbook's server actually hold this invariant" is **out of reach from this
checkout**, and a reader who treats a CONFIRMED row as a verified mechanic has misread it.

Three verdicts are used:

| Verdict      | Means                                                                |
| ------------ | -------------------------------------------------------------------- |
| `CONFIRMED`  | A named file states it, and the line is quoted below                 |
| `UNVERIFIED` | No file in the checkout states it; the negative grep is recorded     |
| `REFUTED`    | Checked, and the claim is false. The plan asserted the false version |

A `UNVERIFIED` or `REFUTED` claim is **dropped from the design**, not merely labelled. The
check `scripts/check-moltbook-claims.sh` enforces that: it greps the design surface for the
phrase each dropped claim would appear as, and fails if it finds one outside a line that cites
this note.

## 2. Verdict table

| ID  | Claim under test                                                                                            | Verdict        | Source                                                  |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| C1  | Registration returns an API key, presented as `Authorization: Bearer` on every request                      | **CONFIRMED**  | `skill.md`:7,9 · `heartbeat.md`:35 · `messaging.md`:285 |
| C2  | One API key identifies one agent **across processes** — same ID as processes churn                          | **UNVERIFIED** | negative grep, §3.1                                     |
| C3  | A ~4h heartbeat cadence is **suggested** to the agent as a client-side cron                                 | **CONFIRMED**  | `skill.md`:23,43,47                                     |
| C4  | A ~4h cadence is a **platform** requirement or a documented runtime constraint                              | **UNVERIFIED** | negative grep, §3.2                                     |
| C5  | `HEARTBEAT_OK` is the quiet-path response envelope                                                          | **CONFIRMED**  | `heartbeat.md`:206-221                                  |
| C6  | Rate limits: 1 post / 30 min, 1 comment / 20 s, 50 comments / day                                           | **CONFIRMED**  | `skill.md`:13                                           |
| C7  | Those rate limits are stated in `SECURITY.md`                                                               | **REFUTED**    | `SECURITY.md`:1-25 read in full, §3.6                   |
| C8  | The claim flow — how the verification URL is obtained and delivered to the human — is documented            | **UNVERIFIED** | negative grep, §3.3                                     |
| C9  | A human-escalation policy exists, but it lives in `heartbeat.md` / `messaging.md`, **not** in `SECURITY.md` | **CONFIRMED**  | `heartbeat.md`:168-182 · `messaging.md`:232-244         |
| C10 | `skill.json` declares `"version": "1.7.0"` and `"license": "MIT"`                                           | **CONFIRMED**  | `skill.json`:3,6                                        |
| C11 | That version pin is **load-bearing for a client** — a compatibility mechanism                               | **UNVERIFIED** | negative grep, §3.4                                     |
| C12 | The checkout holds server source                                                                            | **REFUTED**    | `git ls-files`, §3.5                                    |
| C13 | The checkout holds 7 files (the plan's Appendix A count)                                                    | **REFUTED**    | §3.5                                                    |
| C14 | `skill.md` is 59 lines                                                                                      | **CONFIRMED**  | `skill.md`:1-59 (`wc -l` = 59)                          |
| C15 | A consumer-facing "validate before executing / pin commits" note exists                                     | **CONFIRMED**  | `SECURITY.md`:19-25 · `examples/integration.md`:29-35   |

## 3. Evidence

### 3.1 C2 — one key, one agent, across processes: UNVERIFIED

This is the load-bearing one. The plan's §13.2 built the whole identity architecture on it
("Same API key = same Agent across processes … same ID even as processes churn"). It appears
nowhere in the checkout:

```
$ grep -rIniE "same api key|same agent|persist|across process|register once|same id|processes churn" \
    --include='*.md' --include='*.json' .tmp/moltbook
(no matches)
```

What the files actually support is C1 and nothing further. The registration sentence is the
whole of it — `skill.md`:7:

> **Registration**: New agents must register at `https://www.moltbook.com/api/v1/agents/register`
> and receive an API key. Your human then claims the account via a verification URL.

and `skill.md`:9:

> Only use `https://www.moltbook.com` (with www prefix) to avoid header stripping.

and the uniform credential, `messaging.md`:285:

> All endpoints require: `Authorization: Bearer YOUR_API_KEY`

A register-once → present-Bearer → same-ID loop is a **reasonable inference** from those three
lines. It is an inference. Nothing states persistence, key reuse across restarts, or identity
stability, and a doc-only checkout could not establish it even if it did.

### 3.2 C3 / C4 — the ~4h cadence: a suggested cron, not a mechanism

The number exists, in exactly one file, addressed to the agent's own scheduler. `skill.md`:23:

> Agents should integrate Moltbook into their heartbeat routine—periodic check-ins every 4+
> hours—to maintain engagement

`skill.md`:43 and `:47` make it concrete setup, not a fact about the platform:

> **2. Add heartbeat to periodic tasks (every 4 hours):**
> `0 */4 * * * curl -s https://raw.githubusercontent.com/Moltbook-Official/moltbook/main/heartbeat.md || …`

`heartbeat.md` — the file the brief predicted would be "the only file that could substantiate a
number" — **never states an interval**. Its `:196-202` "Rough rhythm" says "Every few hours",
and `:194` undercuts the whole framing:

> **Heartbeat is just a backup** to make sure you don't forget to check in. Think of it like a
> gentle reminder, not a rule.

So: a 4h client cron is CONFIRMED as an instruction Moltbook gives. A 4h platform cadence is
UNVERIFIED, and the one file that discusses heartbeat at length explicitly declines to make it a
rule.

### 3.3 C8 — the claim flow: UNVERIFIED as a flow

The two states are documented. `heartbeat.md`:32-40 gives a status endpoint and branches on it:

```
$ curl https://www.moltbook.com/api/v1/agents/status -H "Authorization: Bearer YOUR_API_KEY"
If `"status": "pending_claim"` → Remind your human! Send them the claim link again.
If `"status": "claimed"` → You're good! Continue below.
```

`skill.md`:7 says the human "claims the account via a verification URL". Neither file says where
that URL comes from, how the agent first obtains it, or what the human does with it. The
instruction at `heartbeat.md`:38 — "Send them the claim link again" — presupposes an agent
already holding the link without saying how it got one. The flow is a stub, not a mechanism.

### 3.4 C10 / C11 — the skill.json pin: descriptive

The fields are there — `skill.json`:3 `"version": "1.7.0"`, `skill.json`:6 `"license": "MIT"`.

What makes it _descriptive_ is that nothing on the consuming side depends on the number. The
whole check is a client-side string compare, `heartbeat.md`:10 and `skill.md`:54:

```
$ curl -s https://www.moltbook.com/skill.json | grep '"version"'
```

followed by "Compare with your saved version" (`heartbeat.md`:13, `skill.md`:57). There is no
negotiation, no server-side compatibility check, no rejection path. Every fetch URL tracks the
moving `main` branch rather than a version tag — `skill.json`:25-27, `skill.md`:33-40:

> "SKILL.md": "https://raw.githubusercontent.com/Moltbook-Official/moltbook/main/skill.md",

The only pinning instruction anywhere is opt-in and consumer-side, aimed at the deployer, not
the client — `SECURITY.md`:24:

> - Use pinned commits for production deployments

and `examples/integration.md`:31:

> For production, pin to a specific commit (GitHub only)

**Consequence for `ba-skill-md-protocol-72x`:** our own `skill.json` pin is not inherited from
Moltbook's shape, because Moltbook's shape has no mechanism behind it. It has to be **built**,
and the only thing that makes it real is our own handshake test failing on mismatch. Treating
`"version": "1.7.0"` as a compatibility mechanism is copying a decoration.

### 3.5 C12 / C13 — the file count, and the absence of source

```
$ cd .tmp/moltbook && git ls-files
.github/FUNDING.yml
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
LICENSE
README.md
SECURITY.md
assets/logo.png
examples/integration.md
heartbeat.md
messaging.md
skill.json
skill.md
```

Twelve tracked paths, **nine outside `.github`**. The plan's Appendix A said seven; it is nine.
And there is no server source among them, which is the finding that caps §1.

### 3.6 C6 / C7 — rate limits: one line, in the wrong file

The only statement of any limit in the whole checkout is `skill.md`:13:

> The platform enforces quality limits: "1 post per 30 minutes" and "1 comment per 20 seconds"
> with a daily cap of 50 comments.

`SECURITY.md` does not mention rate limits, claims, or escalation at all — it is 25 lines of
vulnerability reporting (`security@moltbook.com`, 48-hour response, `main` the only supported
version) plus the consumer note in C15. The brief's own framing, "if the policy is not written
down there, that is the finding", applies literally to both C7 and C9.

### 3.7 C9 — human escalation: real, and in the other file

The policy exists, twice, and is not where the brief expected. `heartbeat.md`:168-182:

> **Do tell them:** Someone asked a question only they can answer / You're mentioned in
> something controversial / An account issue or error occurred / **New DM request** → They need
> to approve before you can chat / **A DM conversation needs human input** → The other molty
> flagged `needs_human_input: true`
>
> **Don't bother them:** Routine upvotes/downvotes / Normal friendly replies you can handle /
> General browsing updates / **Routine DM conversations** → You can handle normal chats
> autonomously once approved

`messaging.md`:232-244 repeats it as "When to Escalate to Your Human", and `messaging.md`:193-207
defines the wire mechanism — a `"needs_human_input": true` field on the send payload. A
consent-gated, flag-mediated escalation design is a genuinely useful reference for our own
messaging, and it is worth porting as a _shape_.

### 3.8 C15 — the most transferable thing in the repository

Nothing in the plan cites this, and for a project that ships Markdown into agent context it is
the most useful content here. `SECURITY.md`:19-25:

> These skill files are designed to be consumed by AI agents. When integrating:
>
> - Validate content before execution
> - Use pinned commits for production deployments
> - Review changes before updating to new versions

`examples/integration.md`:29-35` gives the concrete form of the middle line. This is a
distributor telling consumers how to consume untrusted agent-facing files, and it is the one
claim in the repository that argues **against** the unverified-claim-to-design pipeline that
produced our phantom constraints.

## 4. What survives, and what does not

**Survives on its own evidence, independent of Moltbook:** the three-identity distinction.
Human GitHub Account → Agent Identity (credentials, progression, reputation, history) → Sessions
(ephemeral). Three identities answering three questions: _who owns this Agent?_ / _which
character is playing?_ / _what is this execution doing?_ None of that rests on a Moltbook fact,
and a refuted Moltbook fact does not touch it. It survives because plan §29.1 locks it as a
**contract** (an `agents` row; `sessions.agent_id → agents.id`; GitHub User ID ≠ Agent ID,
permanently), and contracts in this repo are decisions, not observations.

**Survives as a principle, with the citation dropped:** the agent-facing protocol _shape_ —
skill.md as prompt input rather than an executable plugin, a heartbeat document rather than a
held socket, a version handshake. The shape is real; the specific numbers are not.

**Does not survive:** C2 (one key, one agent, across processes), C4 (a 4h platform cadence),
C8 (a documented claim flow), and C11 (a load-bearing version pin). Plan §3.5, §13.2, §26 and
Appendix A have been corrected: the Human → Agent → Session principle is kept and attributed to
§29.1, and every Moltbook mechanic claim now either cites the file it came from or is marked
unverified in the design text itself.

**The lesson, recorded because it is the point.** "Same key, same character" was never written
down anywhere; it was inferred from three sentences and then became load-bearing for a whole
identity architecture. That is how a design acquires a phantom constraint — not from a bad
fact, but from a plausible one that was never checked. C4 is the same failure in miniature: a
cron line in a setup section was read as a platform guarantee. The same caution applies to the
Pi and Paperclip references and to the MCP-spec quotes in §12-13: **keep the principle, drop
the citation certainty.**

## 5. learn-spine, and why it is not re-litigated here

The parent bead asks this note to point at the learn-spine determination so the two cannot
drift. It does not re-open it. [`learn-spine-license.md`](./learn-spine-license.md), dated
2026-09-24, records: **license NONE**, confirmed five independent ways, **copy nothing, not one
line**. The `.tmp/learn-spine` checkout is present and readable — reading it is _how_ the
unlicensed status is known. It may be read for architectural ideas, which is what an unlicensed
repository permits, and must not be copied from. The plan's §28.2 caveat is a separate, already
out-of-scope edit.

Moltbook is the opposite case and worth stating side by side: MIT with a `LICENSE` file naming
`Copyright (c) 2025 Moltbook`, recorded in `THIRD-PARTY-NOTICES.md`. Reading and adapting Moltbook
is permitted; what was wrong was not the licence, it was the certainty.

## 6. Staleness

Written 2026-09-25 against `dd452e8`, while `ba-skill-md-protocol-72x` (blocked on this bead),
`ba-risk-gates-e74` and `ba-animation-core-spike-hf7` were still open, and before
`apps/web/public/` protocol docs existed. Re-check against the SHA before relying on any row:
Moltbook tracks a moving `main`, so §3.2's cron line and §3.4's fetch URLs can change without
the repo changing shape. The verdicts about **what the checkout is** (C12-C15) decay slowest;
the verdicts about **what the docs say** (C1-C11) decay fastest.

`scripts/check-moltbook-claims.sh` re-verifies every quoted line against a local
`.tmp/moltbook` when one is present, and says so on stdout when it cannot.

## 7. Summary

| Question                                          | Answer                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Can the section 29 claims be checked from source? | **Partly** — the checkout is docs only; there is no source to read                   |
| Is the api_key → Bearer flow real?                | **Yes**, as documented — `skill.md`:7,9 · `messaging.md`:285                         |
| Is one key = one agent across processes real?     | **Unverified.** Zero occurrences. It was an inference, and the design inherited it   |
| Is the ~4h cadence real?                          | **As a suggested client cron, yes** (`skill.md`:47). **As a platform mechanism, no** |
| Are the rate limits real?                         | **As documented, yes** — one line, `skill.md`:13, and not in `SECURITY.md`           |
| Is there a human-escalation policy?               | **Yes** — `heartbeat.md`:168-182, `messaging.md`:232-244. Not in `SECURITY.md`       |
| Is the claim flow documented?                     | **No.** The states are; the mechanism is not                                         |
| Is the `skill.json` version pin load-bearing?     | **No.** A client-side string compare against a moving `main`                         |
| Does the three-identity architecture survive?     | **Yes, untouched** — it is a §29.1 contract, not an observation                      |
