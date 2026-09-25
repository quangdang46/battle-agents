# DESIGN.md — the binding visual design authority

This file is the source of truth for visual decisions. `COMPREHENSIVE_PLAN_FOR_BATTLE_AGENTS.md`
§14 states: _"DESIGN.md is the binding source for visual decisions; this section records the
decision and the reasoning."_ The plan section is the record; **this file is the artifact that
downstream work is checked against.** When they appear to disagree, §14 is the record of what was
decided and this file is the working surface — fix this file, and say so in a commit.

Every decision below carries the plan section it comes from. That is not decoration. A design
document that invents a visual language the plan never sanctioned is worse than no document,
because it acquires authority by being written down. Where the plan is silent, this file says so
rather than filling the gap.

Consumers: `ba-web-ui-surface-t3w` (dashboard shell, bounty board, agent cards) and
`ba-game-client-pixijs-riw` (the PixiJS world). A surface either of them builds and this document
does not mention is a surface built without design direction.

---

## 1. Medium and mood — binding, decided 2026-09-24

**2D pixel art is the rendering medium. Cyberpunk / dev-workstation / RPG-arena is the mood
applied to it.** (§14)

The plan named a mood but never a medium; the two do not conflict, and pixel was already de facto
chosen by three things decided elsewhere:

- §19 — the PixiJS + tilemap layout in the target monorepo layout.
- §25 — 16×16 sprites in the game client build plan.
- §28.1 — the vendored `tiny-swords-cc0` asset pack.

These were decided 2026-09-24. They are settled. A later contributor does not reopen them here;
if the medium genuinely has to change, that is a plan amendment, not a DESIGN.md edit.

**Harness skins are skins, never classes.** (§14) Tentative: Claude→Mage, Codex→Knight,
Gemini→Alchemist, OpenCode→Rogue, Pi→Hacker. The plan's constraint is explicit and load-bearing:
_skins ONLY, never hardcode class to model._ This is the visual half of §10.2's rule that build is
derived from **behaviour, not model name** — the same Claude is a Debugger in one project and a
Researcher in another. A sprite that encodes a class breaks the character model, not just the art.

## 2. The split — pixel world, modern chrome

This does not bend toward a fully retro UI. (§14)

| Pixel art      | Modern, clean, responsive |
| -------------- | ------------------------- |
| The game world | Dashboard                 |
| Characters     | Bounty board              |
| Items          | Auth screens              |
| Tilesets       |                           |
| VFX            |                           |

The reason is worth keeping verbatim, because it is the sentence a future contributor will
otherwise relitigate: _a site that is retro all the way down is harder to use and reads as a
costume._ (§14)

§9's skeletal animation runtime is **not** superseded by this decision — sprite attachments are
what a skeleton poses, so the two are compatible by construction. (§14)

## 3. First screen — BOUNTY BOARD (M2)

**Settled 2026-09-25. The Bounty Board is the first screen. The Coding City arrives at M5 as a
second view reached from the board, not as the landing.**

The plan gives two answers and hedges both: §8 describes the Coding City main screen and then
proposes _"Bounty Board as FIRST screen option (not pixel city)"_; §11.4 proposes it again as
_"First screen candidate"_. An undecided first screen is a visual decision, which is what this
document exists to settle.

**Why.** The reasoning is not aesthetic preference; three things in the plan point the same way:

- **§17.1 risk 1, the gimmick trap.** A pixel world with no real utility produces a "haha cool"
  reaction and then churn. The plan's stated defense is to _ship M2 real utility before heavy game
  art._ A pixel-city landing page inverts that defense exactly.
- **§17.8 risk 8, scope discipline.** The city is the M5 shape. Landing on it first is scope
  arriving ahead of the slice.
- **§11.4, in its own words:** _"Even without game UI, M2 alone has value."_ That sentence only
  earns its place if the first screen is the one M2 builds.

The tracker already encodes this as an ordering edge, not a convention: `ba-game-client-pixijs-riw`
and `ba-asset-shortlist-x2a` both depend on `ba-feature-bounty-xhk`. Do not remove those edges as
over-constraining — completing-in-order is trivially satisfiable by writing the art first and
declaring it unfinished, so the gate has to be an edge.

**The milestone this implies: M2.** The Coding City is a §27 M5 deliverable
(§27: _"M5: PixiJS city + base buildings unlocking capabilities"_).

## 4. Surfaces and anatomy

All from §8 unless noted.

**Top bar** — Agent Battle · notifications · coins · level.

**Bounty Board — the first screen.** (§8, §11.4)
HOT BOUNTIES list, each row carrying **amount · difficulty · repo · competitor count**
(the plan's own examples: `$2000 SSO, $750 memleak, $250 OAuth, $50 CLI bug`) → **bounty detail**
carrying **repo · issue · reward · requirements · `[ENTER BATTLE]` · competitors**.

**Bounty detail → `[ENTER BATTLE]`** "spins real agent work" (§11.4). The link from the board is
the board's; the replay view it lands on belongs to `ba-battle-replay-yjb`.

**Agent card.** (§8, anatomy per §3.2 and §10.1) Level · current quest and session · skill bars ·
`[Enter Arena]` `[View History]` `[Join Guild]`.

**Dashboard agent list.** (§8) Shows **online and offline** agents with Level/XP and a
last-seen value (`Codex OFFLINE 12m ago Lv19`). A dead session must never make a character vanish.

**Agent card data rule.** (§10.1) The plan's example card is _Claude Lv18, Debugging 82 /
Reasoning 91 / Research 76 / Testing 88, 142 Battles, 8421 Rep._ — and the rule beside it is the
one that binds: **stats derive from documented behaviour (tests passed, fixes, review outcomes,
completions, recoveries), never "model intelligence."** A card that displays a number the game
cannot derive from recorded outcomes is displaying a decoration.

**Bottom tabs.** §8 lists `QUESTS / AGENTS / GUILD / ARENA / PROFILE`. The set is a function of
milestone, because §10.2 defers guild ("Base/Guild later") and §27 places guilds at M6:

- **M2:** QUESTS · AGENTS · ARENA · PROFILE
- **M6:** adds GUILD

**Coding City landmarks** (§8) — Guild Hall · Research Lab · character · Arena · Workshop ·
Quest Board. **M5, and a second view, not the landing** (§3 above).

**Replay view** — timeline + share URL (§8). Owned by `ba-battle-replay-yjb`; §27 M4 requires it
be shareable with a logged-out user who sees the full timeline.

**Guild hall with a map editor inside the client** (§8, agent-quest editor precedent) — **M6**,
owned by `ba-feature-guild-5g6`. Recorded here so it is not dropped; it is not a dashboard concern.

**Arena diff-streaming over WebSocket** (§8, codemoo `stateDiffBroadcast` pattern, §28.1 item 12) —
the replay bead renders it, the ingest bead emits it. Consumers take the stream and do not build
it.

**Product shape** (§11.4) — BOUNTY MARKET (issues/sponsors/rewards) + GAME WORLD
(agents/guilds/projects) + ARENA (PvP/battles/tournaments) over AGENT RUNTIME
(MCP/hooks/GitHub → Claude/Codex/…).

**The three client scenes.** `ba-game-client-pixijs-riw` builds exactly three
(`scenes/city.ts`, `scenes/arena.ts`, `scenes/guild-hall.ts`, §25) over a
config-driven tool→zone mapping whose zone set is `bounty-board`, `battle-arena`,
`guild-hall` (§25, extended past the reference's zones in §8). Each scene is one
of the surfaces above: the city is §3's second view, the arena is the PvP surface,
the guild hall is M6. There is no fourth scene, and a zone added to that config
must land in a place this document already describes — otherwise it is a screen
built without design direction, which is what §4 exists to prevent.

## 5. Asset direction

Sources and the vetting rule are §14: OpenGameArt (fast prototyping), itch.io (largest selection),
Kenney (clean consistent packs), CraftPix/GameDevMarket (commercial production art), GitHub CC0 packs
— **verify each licence, never assume.**

Before commissioning art, take the curated 10–20 pack shortlist (free/CC0, single style). That
selection and the per-pack licence tracking belong to `ba-asset-shortlist-x2a`; this document does
not pre-empt it.

**Licence hygiene is two licences, not one.** Code is MIT (§35). Asset packs keep their own
licences, tracked separately, and each pack ships its own `LICENSE.txt` (§14). A pack's licence is
never inferred from the repository's.

## 6. Non-goals

§17.8 risk 8: **no MMO**, and in the MVP no equipment, pets, trading, guild-war, housing,
crafting, marketplace, tournament, boss, season, or achievements beyond the §10.2 MVP character
sheet and the M1/M2/M4 slice.

The §10.2 MVP character sheet ends at: **Identity · XP/Level · Skills · Build · Reputation ·
Achievements · History.** Equipment, cosmetics, pets, mounts, base and guild come later.

**The web is a view, not the game.** (§34) Every loop must be playable through the protocol alone.
The UI must never become the only path to an action, or the machine-native rule is broken. A
surface that cannot be reproduced through the Application API is the bug, not the feature.

## 7. What this document deliberately does not specify

It does not set a colour palette, type scale, spacing scale, icon set, or motion language. The
plan decided none of those, and §14 settles the medium and mood without them. Inventing them here
would give them a binding authority the plan never granted, which is the specific failure mode
§1 exists to prevent.

Those are the consuming beads' decisions, made against the medium, the mood and the split above —
and when one of them lands a real choice, it comes back here. The surface anatomy, the first
screen, the split, the medium and the mood are what this file holds.
