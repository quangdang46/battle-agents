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
| [spacemolt.md](./spacemolt.md)                     | `e7af162`, `9aa120d` | **§3 KEEP** (9 CONFIRMED / 5 REFUTED / 1 UNVERIFIED across 15 claims). Real source, so this is the first reading with CONFIRMED that means confirmed-as-shipped. Session is a bearer, not an identity; **there is no resume-vs-new offer at all** — the client forks `login` vs `register` on its own — which is the reason to KEEP our server-side handshake rather than adopt theirs. |

Two checkouts, two SHAs, because the protocol is in one and the reconnect policy
in the other. `e7af162` is [SpaceMolt/client](https://github.com/SpaceMolt/client)
(the official reference client, HTTP-only) and `9aa120d` is
[SpaceMolt/spacemolt-lib](https://github.com/SpaceMolt/spacemolt-lib) (the
WebSocket lifecycle, close codes and reconnect). Reading only the client would
have missed the single most transferable mechanic found: `session_replaced`
(4001) — one connection slot per player, a second login evicts the first.

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
`ba-risk-gates-e74` and `ba-animation-core-spike-hf7` were still open.
[spacemolt.md](./spacemolt.md) was added 2026-09-26 against `e7af162` / `9aa120d`,
while `ba-118` (no network surface can create a session), `ba-e2i` (M5) and
`ba-feature-battle-fbt` (M4) were open and `ba-contract-session-rpo` — the bead
that froze the handshake this reading tested — had closed the day before. Re-check
a note
against its SHA before relying on it; if the SHA no longer matches, the note is describing
different code.

**One note carries two SHAs and they do not decay together.** The SpaceMolt
library regenerates `openapi.json` from its live server, so its protocol facts
are the durable ones *and can change while its own SHA stays green* — a re-read
that only checks the SHA is not enough for that row.

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
| spacemolt client    | MIT (`LICENSE`, `Copyright (c) 2026 spacemolt.com`)         | Yes                                                        |
| spacemolt-lib       | MIT (`LICENSE`, `Copyright (c) 2026 SpaceMolt`)             | Yes                                                        |
