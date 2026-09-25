# Reference repository study notes

**Date of study: 2026-09-24.** Every claim below was checked against the commit SHA
recorded in each file, on that date. Behaviour claims marked _observed_ were produced by
actually running the reference, not by reading its source.

## What this is

Seven per-repo notes on what the reference implementations actually _do_, written so the
porting beads can cite an observed behaviour instead of re-deriving the same reading.
The plan's Appendix A already maps repo to lesson; these fill in the behavioural detail
a static map cannot carry.

| Note                                               | Commit SHA | Headline finding                                                                                                                                             |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [agent-move.md](./agent-move.md)                   | `85d3771`  | The "30s idle rule" is **wrong** — it is 45s, and the 30s number is a client-side cosmetic sleep timer. Its `full_state` snapshot was **39.2 MB**.           |
| [age-of-agents.md](./age-of-agents.md)             | `a6f2231`  | 25-line `Projection` interface is the whole pixel-math story. The autotile lookup is an **unverified identity stub**.                                        |
| [agent-quest.md](./agent-quest.md)                 | `010c791`  | The `isResumeHint` trap: Claude Code re-appends state dumps to dead JSONLs, which resurrects sessions unless filtered.                                       |
| [agent-world-codemoo.md](./agent-world-codemoo.md) | `851cee1`  | RFC 7396 merge-patch delta (the fix for agent-move's 39 MB). Permissions time out **open**, never to deny.                                                   |
| [arcane-agents.md](./arcane-agents.md)             | `edcaf40`  | 1061-line decider returns `reasons[]` **and** `facts{}` — every status is explainable. One signal is explicitly rejected as a false-attention trap.          |
| [learn-spine-license.md](./learn-spine-license.md) | `e4a6996`  | **License: NONE.** Confirmed five ways. Copy nothing.                                                                                                        |
| [moltbook.md](./moltbook.md)                       | `dd452e8`  | The checkout is **documentation only**, so CONFIRMED means confirmed-as-documented. The load-bearing "same key = same agent" claim has **zero** occurrences. |

## How to read these

- **Cite the SHA, not the repo name.** All six non-learn-spine references are moving
  targets; a behaviour observed at `85d3771` may be gone three months later.
- **The "AVOID" lists matter as much as the "PORT" lists.** Several of these repos carry
  traps that only surface when you run them.
- **Check the "Status" line at the top of each note before trusting a claim.** Three notes
  are marked **NOT RUN** (agent-quest, agent-world-codemoo, arcane-agents) — those are
  source-derived, not observed. Only agent-move and age-of-agents were actually executed,
  and claims from them are marked _observed_ inline. I did not infer anything I could not
  check.

## Staleness

The value of this study decays fast — it was written while the porting beads
(`ba-tool-map-port-89a`, `ba-game-client-pixijs-riw`, `ba-hookprovider-seam-lq2`,
`ba-status-fusion-presence-5zk`, `ba-animation-core-spike-hf7`,
`ba-adapters-template-a09`) were still unstarted. [moltbook.md](./moltbook.md) was added
2026-09-25, after `ba-skill-md-protocol-72x` became unblocked and while
`ba-risk-gates-e74` and `ba-animation-core-spike-hf7` were still open. Re-check a note
against its SHA before relying on it; if the SHA no longer matches, the note is describing
different code.

## Licenses, at a glance

| Repo                | License                                                      | Copy from it?                          |
| ------------------- | ------------------------------------------------------------ | -------------------------------------- |
| age-of-agents       | MIT (LICENSE file, `Copyright (c) 2026 Mateusz Pawelczuk`)   | Yes                                    |
| agent-move          | MIT asserted in `package.json` only; **no LICENSE file**     | Yes, with the caveat noted in its note |
| agent-quest         | MIT                                                          | Yes                                    |
| arcane-agents       | MIT                                                          | Yes                                    |
| agent-world-codemoo | MIT asserted in `package.json` + README; **no LICENSE file** | Code yes, **assets no**                |
| learn-spine         | **NONE**                                                     | **No — nothing at all**                |
| moltbook            | MIT (`LICENSE`, `Copyright (c) 2025 Moltbook`)               | Yes, with the caveat noted in its note |
