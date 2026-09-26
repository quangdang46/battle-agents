# Bounty modes, and what else §11.3 asked for

Bead: `ba-bounty-modes-tiers-seasons-62l`. Plan sections: §11.3, §10.3, §17.8, §18.10.

§11.3 asks for four things in one paragraph: competition **modes**, skill **tiers**,
linked bounty **chains**, and **seasons**. This records what was decided for each,
what was built, and — the part worth keeping — what was deliberately not built and
where it belongs instead. Two of the four turned out to be already done, and one
turned out to be on the wrong side of a scope rule.

## 1. The two mode vocabularies, and which one moved

### The collision

§11.3 names four bounty modes: **Race / Open / Tournament / Team**.
§10.3 names six battle modes, and two of them are the same words:

| list         | values                                                   | declared in                                              |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| bounty modes | race, open, tournament, team                             | was free text in `bounties.mode`                         |
| battle modes | speed, quality, survival, boss, **team**, **tournament** | `BATTLE_MODES`, `packages/features/battle/src/domain.ts` |

Two lists answering different questions is defensible. A bounty's mode is the rule
that _decides one bounty_; a battle's mode is the _shape of a match_. The problem is
not that both exist — it is that `team` and `tournament` appear in both, and both
columns are `text`. A caller that resolved a mode through the wrong feature got a
plausible answer rather than an error: `battleCapacity('tournament')` returns 2,
`isKnownBattleMode('open')` returns false, and neither says anything went wrong.

### The decision: rename the bounty side, to rule-names

The bead offered three options — leave both and document, share one vocabulary in
`@battle-agents/protocol`, or rename one side. **Renaming the bounty side was
chosen**, and the reasons are worth recording because the cheap option is not the
right one.

**Why not the battle side.** A rename costs the side whose values are not yet
load-bearing. Battle modes are shipped: M4 is complete, the judge reads them, and a
replay published at `/replay/[replayId]` is a public artefact a battle's mode travels
in. Bounty modes were a `text` column with one writer and a seed row that never set
it. Renaming the battle list would rewrite published history to fix a hazard the
free-text list fixes for free.

**Why not a shared vocabulary in protocol.** It is the right _destination_ and the
wrong first move. A union in protocol is vocabulary for two features rather than for
the wire, and the honest test of whether two lists should be one is "do these answer
the same question". They do not. Sharing them would also paper over the real
difference: a mode that says `claimants: 'many'` is not a naming problem, it is a
store that holds one claimant.

**Why rule-names and not tidier §11.3 names.** The four new names each state the
rule that decides the bounty:

| plan §11.3 | stored value       | resolves                                                      |
| ---------- | ------------------ | ------------------------------------------------------------- |
| Race       | `first-valid`      | the first valid pull request merged against the issue         |
| Open       | `maintainer-picks` | which submitted pull request the maintainer chooses to merge  |
| Tournament | `best-validated`   | which validated solution scores best against the requirements |
| Team       | `single-pr`        | a role-composed team delivering one pull request between them |

The naming is what keeps the collision from coming back. "Race" and "Tournament" are
free-floating nouns that belong to any question; a value phrased as a _rule_ cannot be
a match shape. The disjointness is a fact about today and a convention about
tomorrow, so it is **checked** rather than assumed:
`tests/unit/bounty-mode-vocabulary.test.ts` reads both packages' real sources and
fails if the intersection is ever non-empty.

**The rename was carried on live rows.** The four §11.3 words are _not_ accepted as
input aliases, because accepting them would keep the collision alive while appearing
to have fixed it — `tournament` would be accepted here and mean a match format
somewhere else. So `bounties.mode` needed a real backfill, which is migration
`0018_bounty_mode_vocabulary`: four `UPDATE`s, then a `bounties_mode_known` CHECK.
Proven against a scratch database, with the four statements extracted from the
migration file rather than retyped: the four legacy names were rewritten and the
resulting table still satisfies the CHECK.

## 2. What a mode decides _today_, and what it does not

This is the part the brief gets wrong, so it is worth being exact.

The brief's success criteria say "RACE mode rejects a second claim while OPEN mode
permits multiple". **That is not what the shipped code does, and building it is a
larger change than the brief implies.** `packages/features/bounty/src/feature.ts` made
every claim exclusive on purpose, with a stated reason: _"A claim is exclusive whatever
mode the bounty carries, because two solvers on one bounty is the same work paid
twice."_ That reason is about **payment**, not competition format, and it is not
overturned by a mode.

More concretely, `bounties.claimed_agent_id` is **one nullable uuid**. `BountyRepository.claim`
is one compare-and-set on it. Multi-claim is therefore not a mode check, it is a
schema change: a claim table with many rows per bounty, plus a completion path that
picks one of them. That is another feature's schema, on a contested migration number,
against a money invariant the owning feature asserts in a comment.

So `canHonourMode` is **derived** from one property of each mode — `claimants: 'one' |
'many'` — and exactly one mode is honourable today:

- `first-valid` → claimable. The shipped merge path already _is_ "first valid PR wins".
- `maintainer-picks`, `best-validated`, `single-pr` → **recognised, stored, carried on
  the bounty and in the `bounty.created` event, and refused at `bounty.claim`** with
  `bounty-mode-not-playable`.

The refusal is the whole point. A sponsor who wrote `maintainer-picks` and got
first-come-first-served would have two agents do the same work, one of them for
nothing. A dead bounty wastes nobody's effort; a mislabelled live one does. The
alternative — resolving all four as `first-valid` — is precisely the
plausible-wrong-answer failure the rename exists to remove, one layer down.

**An unrecognised mode keeps the older exclusive reading.** That is not an oversight;
it is what the handoff from `ba-feature-bounty-xhk` asked to be _preserved_ rather than
replaced. An unrecognised value carries no promise to keep, so the safe claim policy is
the exclusive one. Refusal is narrowed to modes this build can _name_.

`bounty.create` holds a supplied mode to the taxonomy and defaults an absent one to
`first-valid` — the one mode the build can keep, so an unlabelled bounty is one it can
actually resolve. The mode is stored from creation rather than defaulted on first use,
because a mode added later means every live row needs a backfill and the backfill
silently picks a claim policy for bounties whose sponsor chose none.

## 3. Tiers — already done, verified here, not rebuilt

§11.3's tiers (Beginner $5–25 / Intermediate $25–200 / Advanced $200–1000 /
Legendary $1000+) are **already implemented** in `packages/features/reputation`:
`BOUNTY_TIERS`, `tierForReward`, `tierForTrust`, `mayAcceptBounty`, and the
`reputation.gate` and `reputation.tiers` actions.

The bands match the plan exactly, in cents: `500–2500`, `2501–20000`, `20001–100000`,
`100001+`. `packages/features/reputation/src/rules.test.ts` pins each boundary
(2500→beginner, 2501→intermediate, 20000→intermediate, 20001→advanced, 100000→advanced,
100001→legendary).

The brief's own instruction — that a tier-boundary test must **derive** eligibility
through the reputation projection rather than hardcode `reputation = N` — is already
satisfied: those assertions go through `mayAcceptBounty` and `tierForReward`, the
functions the system itself uses. **Nothing was changed here.** A tier is derived from
the outcome projection and is not a stored or self-declared label, which is also why no
`tier` column was added to `bounties`; adding one would be the decoration the brief
warns against.

## 4. Chains — the model belongs here, the GitHub half does not

§11.3: _"Chains turn issue graphs into campaigns ($100 auth → $250 OAuth → $500 SSO →
$2000 overhaul; render GitHub issue tree as quest tree)."_ It calls this the strongest
game hook in the section, and it is the part with the most infrastructure underneath.

**What belongs to this bead** is the part that is a fact about bounties: a prerequisite
relation between them, and the rule that a bounty is not claimable until the bounty it
requires is `completed`. That rule belongs **at the claim**, not in the UI — the brief
is right about that, and the architecture agrees: a UI-only gate is bypassed by anyone
using the protocol or the CLI.

**What does not belong here** is reading a repository's issue graph. That is a GitHub
call, and it is `infrastructure/`, not a feature — `architecture-rules.cjs` forbids a
feature importing an outer layer, and `tests/unit/github-boundary.test.ts` fails the
build if a feature reaches for a socket. A chain should be _authored_ by a caller and
_discovered_ by the integration layer, exactly as a bounty's issue URL is authored by a
caller and _verified_ by the merge delivery.

**Why the chain is not in this change.** Not scope avoidance — sequencing. It needs
(a) a `requires_bounty_id` column and self-reference, (b) an added guard inside
`DrizzleBountyRepository.claim`'s WHERE clause, and (c) edits to four files another
agent had open at the time (`feature.ts`, `repository.ts`, `index.ts`,
`repositories/bounties.ts`). (b) is the one that decided it: that method is the
exactly-once, money-critical compare-and-set the whole payout path depends on, and
editing it while another agent was mid-refactor is the cross-package clobbering
incident this repository has already paid for once. The bounty package's own suite was
also red from that agent's in-flight work, so a chain's tests could not have been shown
to be green independently of it.

The design is settled and cheap to land once the tree is quiet:

- `bounties.requires_bounty_id` — one nullable self-reference, default `NULL`.
- Guard in `claim`'s existing WHERE clause, alongside `status = 'open'`:
  `AND (requires_bounty_id IS NULL OR EXISTS (SELECT 1 FROM bounties p WHERE p.id = requires_bounty_id AND p.status = 'completed'))`.
  In the same statement, so the check and the write cannot disagree.
- On `undefined`, the feature already re-reads to separate "lost the race" from "no such
  row"; that same read distinguishes an unmet prerequisite and names it.
- The `satisfied` bit is **monotonic** — `completed` is terminal in `ALLOWED_TRANSITIONS`
  — so even a read-then-claim could only ever wrongly _refuse_, never wrongly allow.
- **Cycles are impossible by construction, not by a check.** The edge is set at
  `bounty.create` and there is no update path, so a bounty's own id does not exist yet
  when its prerequisite is chosen. A cycle would need an edit, and there is no edit.
  Worth stating as a property of the shape rather than discovering it later.

## 5. Seasons — resolved against §17.8, and deliberately not built

The bead asks for seasons ("Season 1: Open Source Bounty Hunt", monthly pools,
leaderboards) and its own scope note says "build the data model … but do not build
season UI here". The plan points two ways:

- **§11.3** names seasons as a product feature.
- **§17.8 risk 8** bars _"marketplace/tournament/boss/season/achievements in MVP beyond
  §10.2 MVP sheet + M1/M2/M4 slice"_.
- **§18.10** schedules _"Guild/social + seasons + public profiles/leaderboard (M6)"_.

**The reading: seasons are M6, and §17.8 plus §18.10 outrank §11.3's mention of them.**
A season is not "named in a paragraph about the bounty economy"; it is on the same
barred list as tournament, boss and marketplace, and it is scheduled two milestones
after the M1/M2/M4 slice this build is in. `tests/unit/mvp-scope.test.ts` records the
same conclusion from the other direction — that the axis for the scope rule is the
_installed feature set_, not the vocabulary, precisely because six of those words are
legitimate later work.

**So: no seasons table.** The bead's "build the data model" is the part declined, and
the reason is the one this repository keeps re-learning: **a table with no writer and
no reader is decoration.** A season needs a time box, a membership of bounties, a money
pool and a leaderboard. Three of those four do not exist here — there is no cosmetics
or inventory feature installed, so the plan's own mapping (_season → Cosmetic_) has
nothing on the other end, and a season pool is a pool of **real dollars** with no
consumer. That is the money/progression conflation the brief names as its fourth naive
failure, one step removed: a real-money amount introduced now, with nothing that
legitimately consumes it, is exactly the shape that later grows a tokenised path.

What was done instead is the part that does not rot: the **naming** collision seasons
would have inherited is resolved above, and this reading is written down. Adding
`seasons` to `DECLARED_MVP_FEATURES` in `tests/unit/mvp-scope.test.ts` is a one-line,
reviewed decision someone makes when M6 is actually being built.

## 6. Guild treasuries — not this bead

§11.3's "guilds fund collectively" belongs to `packages/features/guild`, which is
currently an 11-byte stub and is not mine. Worth one note for whoever takes it: a
treasury is _funding_, so it writes `bounty_funds` rows through `bounty.fund` and it is
subject to every rule in `docs/design/payout-rail.md`. A treasury that instead summed
per-guild balances into one funding row would re-create the drifting-scalar bug that
rail §3.1 exists to prevent.

## Summary

| §11.3 asks for    | state                                                                                                                     | where                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| competition modes | **built** — 4 modes, renamed to rule-names, validated at create, honoured/refused at claim, CHECK-constrained, backfilled | `features/bounty/src/modes.ts`, migration `0018` |
| skill tiers       | **already done**, verified, not rebuilt                                                                                   | `features/reputation/src/rules.ts`               |
| chains            | **not built** — design settled; needs the claim WHERE clause while `bounty` is quiet                                      | next bead; GitHub half is `infrastructure/`      |
| seasons           | **declined** — §17.8 and §18.10 put them at M6; a table now would be decoration                                           | M6                                               |
| guild treasuries  | **not this bead** — belongs to the `guild` feature, writes `bounty_funds`                                                 | `features/guild`                                 |
