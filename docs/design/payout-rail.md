# Payout rail and dispute path

- **Date decided:** 2026-09-24
- **Bead:** `ba-payout-rail-dispute-1q6`
- **Status:** decided. M2 ships with the rail absent; this document says what has to exist before it is
  not absent.

Section 17.5 of the plan lists "payment/compliance for real-money bounties" as a risk the research
conversation never settled. This note settles it, so that the bounty feature can be built against a
boundary that will not move under it later.

---

## 1. The decision, and the constraint that forces it

**The platform does not hold, route, or process money. Sponsors pay solvers directly, off-platform,
and the platform records what it observed.**

This is forced rather than chosen. Plan section 7.5 records that Vercel Hobby is non-commercial
only, and that Vercel defines commercial usage to include "any method of requesting or processing
payment, plus donations". Bounty payouts are precisely that. So the arrangement where the platform
processes payments is not a startup decision to revisit; it is a hosting-plan decision, and on Hobby it
is unavailable.

That constraint is doing real work, so it is worth being clear about what follows from it:

- ALLOWED on Hobby: recording a bounty, displaying a reward amount, tracking reputation and history,
  observing that money moved.
- FORBIDDEN on Hobby: the platform requesting payment, routing it, escrowing it, or holding it.

Any future feature that puts money inside the platform forces a move to Vercel Pro. That is a real
cost and a real option to keep open — it is not a reason to design the rail as if the constraint did
not exist.

### 1.1 What "records intent" means concretely

The platform writes three facts and never a fourth:

```
bounty_funded      someone committed money to a bounty   (an amount, a sponsor, a time)
payout_pending     the conditions for paying are met    (PR merged, review passed)
payout_recorded    a transfer was observed to have happened  (by whom, when, how much)
```

There is no state in which the platform has money. `payout_recorded` is a claim that something
happened elsewhere, attributed to whoever reported it. If nobody reports it, the bounty stays at
`payout_pending` forever, which is the correct and honest outcome: the platform does not know, and
saying so is better than inventing a transfer.

`packages/features/bounty` exists to make this boundary impossible to cross by accident. Its types
have no field for an API key, a bank account, a card token, or a transfer. The absence is the
guarantee, and there is a test that fails if someone adds one back.

It lives inside the bounty package rather than beside it because the layering rules forbid a
feature from importing another feature, so a shared `payout` package could not be used by the one
thing that needs it. A separate package would have meant a new layer in `architecture-rules.cjs` for
a concept that is part of the bounty lifecycle.

---

## 2. The rail

**Direct, sponsor-to-solver, out of band. No escrow held by the platform.**

The sponsor and the solver already have a relationship that predates this product: they are
participants in a public code repository. The bounty adds a claim and a deadline, not a
counterparty.

### 2.1 Why not escrow

Escrow requires someone to hold the money. Every candidate for that someone is a problem:

| Candidate                            | Problem                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The platform                         | Forbidden on Hobby (section 1), and it turns an open-source tool into a financial intermediary with the licensing that implies.                                                       |
| The repository owner                 | Often not the sponsor. Open funding exists precisely because the issue owner may be uninvolved, and asking a maintainer to hold a stranger's money is a favour they did not agree to. |
| The solver                           | Defeats the purpose.                                                                                                                                                                  |
| A third party (Stripe Connect, etc.) | Solves custody, not the Hobby constraint, and adds a KYC relationship between the platform and every sponsor.                                                                         |

Escrow is the right answer for a marketplace that does not exist yet. It is the wrong answer for a
project that cannot take payments on its current hosting plan.

### 2.2 The flow, and where it can be broken

```
1. sponsor funds the bounty on the rail        (GitHub Sponsors, Open Collective, a direct
                                                transfer, or anything else — the platform is
                                                not told and does not need to be)
2. solver claims, codes, opens a PR
3. maintainer merges
4. platform observes the merge, emits payout_pending
5. sponsor transfers money to the solver       (out of band)
6. sponsor or solver reports the transfer      -> payout_recorded
```

Steps 1 and 5 are outside the product. The platform can be wrong at 4 (a merge it misattributes) or
incomplete at 6 (nobody reports). Both are recoverable; the designs below are for those cases.

**The step-6 problem is the real one.** A bounty stuck at `payout_pending` is a support burden
with no self-service answer, and it is the most likely thing to actually happen. The design choice
is to make it visible rather than to guess: the bounty shows as `paid out of band` and the sponsor
gets a one-click "I paid" in the email, rather than the platform inferring a transfer it never saw.

---

## 3. Refunds, and the case that is actually hard

A bounty can end three ways that owe someone money back:

1. **Cancelled before any solver worked** — refund every sponsor in full, pro rata to contribution.
2. **Cancelled after a solver started** — the contested case. Section 3.2.
3. **Maintainer rejects a valid PR** — the sponsor's money is unspent, so refund in full; the
   dispute is about whether the PR was valid, not about the money.

### 3.1 Proportional refund, always

Sponsors fund a total. A refund returns each sponsor their share of that total, computed from the
funding rows rather than from a scalar on the bounty.

`bounties.amount_cents` does not exist as a denormalised total, and the integration suite asserts it
does not. The total is `sum(bounty_funds.amount_cents)`. This is why a refund is arithmetic on
rows: $200 + $50 + $100 refunds $200 + $50 + $100, and if a sponsor's share is stored anywhere it is
in the funding row, next to the sponsor who put it there.

Rounding: refund in integer cents, largest-remainder allocation, and the residue goes to the
earliest contributor. A sponsor who is short by one cent on a $0.35 refund is a support ticket, and the
sum of refunds must equal the sum of funds exactly or `bounty_funds` stops reconciling.

### 3.2 Cancelled after work started

This is the case the plan calls hardest, and it has no clean answer, so it gets a decision rather
than a principle.

**Decision: the platform does not adjudicate it. The repository owner decides, and the platform
records the outcome.**

Reasoning: the repository owner is the party whose judgement of "valid work" the bounty was priced
against. A dispute about whether a PR is valid is a maintainer dispute, and a game leaderboard has no
standing to overturn it. A sponsor who disagrees has the same recourse they would have had without
this product: the repository's issue tracker and its governance.

What the platform does supply is the evidence, and this is where section 30 earns its place.

---

## 4. Disputes

### 4.1 Who adjudicates

| Dispute                                                 | Adjudicator                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Was this PR valid?                                      | The repository owner, in the repository.                                                                               |
| Was the work delivered as specified?                    | The repository owner, in the repository.                                                                               |
| Was the money transferred when the sponsor said it was? | Nobody. The platform records the sponsor's report. It has no way to observe a transfer and will not pretend otherwise. |
| Who gets a refund on a cancelled-after-work bounty?     | The repository owner decides who was owed; the platform executes the refund arithmetic it is given.                    |

The platform is a witness, not a court. It holds an ordered, attributed record of what its features
emitted, and it is explicit when a fact is outside what it could observe.

### 4.2 Evidence, and the requirement on the activity log

A dispute is settled by replaying what happened. The evidence is the activity log, so:

> **If the log cannot settle a dispute, the design is incomplete.**

Concretely, settling "the PR was valid and the money is owed" requires the log to show, in order:
the bounty claim, the PR opened, the PR merged, the maintainer's identity, the review outcome, and
that no earlier valid PR won the race. The 365-day retention window is real
(`features/activity`), but the three payout event types are NOT persisted: `PAYOUT_EVENTS`
is declared in `payout.ts` and registered in no event union, and nothing emits them. A
`PayoutIntentStore` is declared too and has no implementation. The bounty feature has to
arrive before any of this exists at runtime, and until it does the guarantee below is
unbuilt rather than met.

Two gaps, stated rather than glossed:

- **Race mode needs a merge decision in the log.** "First-valid-wins" requires recording which of
  several merged-or-open PRs won and why. Until that is emitted, a Race bounty is not adjudicable.
- **365 days is a policy choice with a consequence.** A dispute raised after the window cannot be
  settled from our side. The rail is direct, so the sponsor's bank statement and the repository's
  merge log survive longer than ours; the log is the fast path, not the only path. If bounties
  routinely escalate past a year, the window is wrong and should grow.

### 4.3 Time limits

| Step                           | Window                          | Why                                                                                           |
| ------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Solver may claim after funding | 7 days, or bounty expires       | A bounty nobody can start is a listing that lies about being available.                       |
| Sponsor may report a transfer  | 30 days after `payout_pending`  | After that the record drifts from reality and the aggregate trust score built on it is wrong. |
| Dispute may be opened          | 30 days after `payout_recorded` | Matches the report window. Longer and the maintainer decision has hardened.                   |
| Unclaimed refund               | 90 days after bounty cancelled  | Long enough for a solver to notice, short enough that a sponsor is not waiting a year.        |

Windows are enforced by the bounty feature, not by this document. They are not implemented
yet: there is no `rules.ts` in `packages/features/bounty/`, and the only file there is
`index.ts`, `payout.ts` and its test. When the feature lands these become a value in
`rules.ts` so changing one is a visible edit rather than a hunt.

---

## 5. Compliance posture

Stated as position, not as legal advice, and with the scale at which it stops being one.

**KYC/AML: the platform has no relationship to verify.** Sponsors and solvers transact with each
other. Nobody's identity is checked by this product, because no money passes through it. This is the
single largest compliance consequence of the section-1 decision, and it is why escrow was rejected
rather than merely deferred: escrow would import a KYC obligation the platform cannot meet on Hobby.

**Tax/reporting: the platform reports nothing, because it has nothing to report.** No income passes
through. What it does hold is a record of amounts sponsors _stated_ they were paying, which is not a
financial record and must never be described as one. A sponsor's tax position is their own; the
platform's position is that it is a leaderboard.

**Money as integer cents, never a float.** Enforced by a check constraint on `bounty_funds` and
asserted by the integration suite. A float cents column loses a cent somewhere, and the sum of refunds
then stops equalling the sum of funds, which is the property every refund path depends on.

**Minimum bounty size: $5.** Below that, the transaction cost and the support cost of a disputed
$2 outweigh the reward, and the trust score it produces is noise — a solved $2 bounty counts the same
as a solved $2000 one in an aggregate, which is exactly why the floor exists.

### 5.1 When this needs a real lawyer

Not a feeling. Three thresholds, any one of which is enough:

1. **Any money is ever held or routed by the platform.** This changes the regulatory category
   entirely and is the threshold that matters. It also requires moving off Vercel Hobby.
2. **Gross bounties funded exceed ~$25,000 in a calendar year, or more than ~50 distinct paying
   sponsors.** Past this, "a side project that does not take money" stops being a description
   anybody, including a regulator, is obliged to accept.
3. **A bounty escalates to a legal proceeding**, even once. A company that has never taken money can
   be a party to a contract dispute over money it merely recorded. One such dispute, anywhere,
   makes the "we are not in this business" position a position rather than a fact.

Until one of those is true, this document is the whole compliance story, and saying so plainly is
more useful than a checklist that implies more assurance than exists.

---

## 6. M2: what ships

The rail does not exist at M2 and the product must not imply otherwise.

- Every paid-adjacent bounty renders a **sandbox banner**: the reward amount is displayed, and
  alongside it a marker that the reward is a target, not a payment.
- `bounty.completed` moves a bounty to `payout_pending` and nothing further happens automatically.
- A `payout_recorded` event is emitted only when a human reports a transfer.
- The bounty feature is required to say `payout: manual/sandbox` for every paid-adjacent
  status, in its README and in its API responses. Neither exists yet: there is no bounty
  README and no bounty API surface. `needsSandboxBanner` exists and is tested, and is
  called by nothing, because there is no banner to call it.

**A user must never believe they have been paid when they have not.** The banner is a hard
requirement, not polish: the failure mode of getting this wrong is a solver who closed a PR, saw a
status that read `paid`, and was never paid. That is the bug this whole design exists to make
impossible.

The stub in `packages/features/bounty` makes the boundary mechanical rather than a matter of
discipline: its types cannot express a transfer, so the worst a future contributor can do is record
an intent that was never a payment.

---

## 7. What this deliberately does not settle

- **The rail itself.** GitHub Sponsors, Open Collective and a direct transfer are all compatible and
  the platform is indifferent between them. Picking one is a sponsor-experience decision, and it does
  not change anything in this document.
- **Whether sponsors stack on bounties the solver has already claimed.** The refund arithmetic is
  the same either way, so it is not a prerequisite for building.
- **Season prize pools.** Guild treasuries and seasonal pools change who the payer is, which changes
  section 4.1. That is a P2 question and the design here is correct for the single-maintainer case.
