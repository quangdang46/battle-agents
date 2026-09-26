# Game asset shortlist

Plan §14 and §28.1 item 1. The code in this repository is MIT; **each asset pack keeps its own
licence, stored beside the pack.** Mixing a copyleft art pack into an MIT repository contaminates
it, so the two are tracked separately and never inferred from one another.

Paths are `apps/web/public/assets/<pack>/`, per §19.

## The shortlist

| Pack            | Source                                                    | Licence | Style                                | Role                                       |
| --------------- | --------------------------------------------------------- | ------- | ------------------------------------ | ------------------------------------------ |
| tiny-swords-cc0 | agent-quest `client/public/assets/themes/tiny-swords-cc0` | CC0-1.0 | 16×16 fantasy pixel, limited palette | V0 characters, terrain, buildings, effects |

## What this table is and is not

**It is a table because the per-pack licence is the deliverable and prose is where per-pack
licences go missing.** A sentence saying "we use CC0 packs" survives a pack being relicensed
upstream; a row with a licence cell does not.

**The style column is a DECLARATION, not a finding.** Plan §14 makes style consistency the actual
selection criterion — a perfect set of individually excellent packs in five visual styles reads as
an amateur project instantly — and **no script in this repository can judge whether five packs look
like one game.** Writing a "style lint" would be worse than none, because it would claim to check
something it cannot and would be trusted. What is enforced is that the style is DECLARED per row, so
the claim is explicit and reviewable by a human instead of implied by a selection nobody can
second-guess a year later.

**The count is a target, not a floor to pad.** One pack is here because it is the V0 unblocker
(§28.1 item 1) and it is already CC0-verified in the reference checkout, not because it fills a
quota. If the count check below fails because a careful selection found fewer, **fix the selection,
do not add packs to make a number go green** — and record which packs were rejected for style, which
is the evidence that the judgment was made rather than skipped.

## Skins, and the one thing they must never become

§14 gives tentative skins: Claude → Mage, Codex → Knight, Gemini → Alchemist, OpenCode → Rogue,
Pi → Hacker. **Skins ONLY. Never hardcode class to model.** Class is derived from BEHAVIOUR by
`features/progression` (§10.2), the skin is cosmetic, and it must be swappable — an agent may also
carry its own loadout. A skin that encodes a class contradicts the character model, not just the art.

## Checks

Both are real commands, and both are run on every merge rather than at selection time, because
licences change and packs get relicensed.

- `pnpm license-check` — every directory under `apps/web/public/assets/` ships a `LICENSE.txt`,
  **and** the licence recorded in the table above matches the text actually shipped in that
  directory. The second half is the one that catches the real failure: a pack relicensed upstream
  between selection and merge still carries a stale recorded licence, a LICENSE.txt check passes
  because a file exists, and the table quietly asserts something untrue. **A file merely EXISTING
  is not verification.**
- The row count and the empty-licence-cell rules, in `scripts/check-assets.sh`.

What these cannot prove: that the selected packs look like one game. That is a human review of the
style column, and it is the plan's stated criterion.
