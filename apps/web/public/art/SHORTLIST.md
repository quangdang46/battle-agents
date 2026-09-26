# Game asset shortlist

The plan's §14 deliverable: a curated set in a **single consistent style**, free or
CC0, with the license recorded **per pack** before merge. Art licenses are tracked
separately from the repository's MIT code license — that separation is the point,
and assuming everything in the repo is MIT because the code is is the failure this
file exists to prevent.

## The shortlist

| # | Pack | Source | License | Style |
|---|------|--------|---------|-------|
| 1 | tiny-swords-cc0 | agent-quest `client/public/assets/themes/tiny-swords-cc0` | CC0-1.0 | 16×16 pixel, fantasy, pre-rendered light/dark |
| 2 | kenney-tiny-dungeon | https://kenney.nl/assets/tiny-dungeon | CC0-1.0 | 16×16 pixel, dungeon tiles, flat colour |
| 3 | kenney-tiny-town | https://kenney.nl/assets/tiny-town | CC0-1.0 | 16×16 pixel, town tiles, flat colour |
| 4 | kenney-tiny-ski | https://kenney.nl/assets/tiny-ski | CC0-1.0 | 16×16 pixel, tileset, flat colour |
| 5 | kenney-pixel-platformer | https://kenney.nl/assets/pixel-platformer | CC0-1.0 | 16×18 pixel, platformer tiles |
| 6 | kenney-pixel-shmup | https://kenney.nl/assets/pixel-shmup | CC0-1.0 | 16×16 pixel, shooter sprites |
| 7 | kenney-rpg-urban-pack | https://kenney.nl/assets/rpg-urban-pack | CC0-1.0 | 16×16 pixel, RPG urban/props |
| 8 | kenney-game-icons | https://kenney.nl/assets/game-icons | CC0-1.0 | flat vector icons, 256×256 |
| 9 | kenney-ui-pack | https://kenney.nl/assets/ui-pack | CC0-1.0 | flat vector UI, 9-slice panels |
| 10 | kenney-particle-pack | https://kenney.nl/assets/particle-pack | CC0-1.0 | flat vector particles, 128×128 |

Ten rows, in the 10–20 band the plan asks for. Every row carries a source and a
license, and `tests/unit/asset-shortlist.test.ts` fails if a cell is empty, the
count leaves the band, or a recorded license stops matching the file shipped
beside the pack.

## On "a single consistent style" — what is true and what is not

The plan makes style consistency **the selection criterion**, and says a perfect
set of individually excellent packs in five visual styles is worse than a smaller
set that reads as one game. So this is stated plainly rather than implied:

**Rows 1–7 are one family.** They are 16×16/16×18 pixel art with flat colour and
no anti-aliasing, and seven of the ten come from Kenney's own "Tiny"/pixel line,
which is internally consistent by construction.

**Rows 8–10 are a second family, and the game client should not mix them with
the first.** They are Kenney's flat **vector** UI, icon and particle packs, not
pixel art. They are included because a game needs panels, buttons, icons and
particles, and no CC0 pixel set in this selection supplies them at usable
quality — but they do not belong in the same sprite atlas as a 16×16 swordsman,
and rendering them at 16px will look wrong.

This is a known, declared compromise rather than an accident. The honest fix is a
pixel UI pack, which is the first thing to look for if this set is revisited; the
wrong fix is pretending the two families already agree.

**What is NOT claimed:** that any script here can judge whether these look like
one game. No such check exists and none should — the failure is a bad selection,
not a missing lint, and a script cannot see it. This section is the reviewable
artifact that judgement produces.

## Rejected, and why — the count landed where it did

Kenney's `input-prompts` was downloaded and **rejected**: 3,056 font glyph
PNGs at 20 MB. It is a font, not art, and vendoring it tripled the size of the
asset tree for no visual content. Two further slugs (`tiny-forest`,
`tiny-town-castle`) do not exist on the source and returned no download.

## Packs deliberately NOT taken

- **CraftPix / GameDevMarket** — commercial, not CC0. Mixing a proprietary art pack
  into an MIT repository is the contamination §17.7 warns about.
- **OpenGameArt and itch.io CC0 submissions** — not excluded on principle, but
  their license is per-submission and must be read per pack. None was taken here
  because none could be verified as quickly and as unambiguously as Kenney's,
  whose license travels *inside* the archive — which is what makes the recorded
  license a fact about the shipped bytes rather than a claim about a web page.
