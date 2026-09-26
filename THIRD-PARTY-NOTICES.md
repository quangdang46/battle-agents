# Third-Party Notices

battle-agents is licensed under the MIT License (see [LICENSE](./LICENSE)). This file records
every third-party source that is copied or ported into this repository, the commit it was taken
from, and the license it carries. Keep it updated in the same commit that adds the code.

## Rules

- MIT, Apache-2.0, and CC0 sources may be copied or ported. Verbatim copies keep their original
  copyright header.
- MPL-2.0 sources must never be pasted into this tree. The copyleft attaches to the copied files.
  Patterns may be studied and rewritten cleanly instead.
- A source with no confirmed license is not copied at all.

`scripts/check-licenses.sh` enforces the MPL-2.0 and Kaetram bans over `packages/` and `apps/`.

## Permitted sources

| Repository                    | Upstream                                           | Commit         | License    | Copyright holder                                          |
| ----------------------------- | -------------------------------------------------- | -------------- | ---------- | --------------------------------------------------------- |
| agent-dashboard               | https://github.com/bjornjee/agent-dashboard        | `b3c04cf7f0aa` | MIT        | Copyright (c) 2025-present bjornjee                       |
| agent-quest                   | https://github.com/FulAppiOS/Agent-Quest           | `010c791207c9` | MIT        | Copyright (c) 2026 Fulvio Scichilone                      |
| arcane-agents                 | https://github.com/thomasrice/arcane-agents        | `edcaf4018ab4` | MIT        | Copyright (c) 2026 Thomas Rice                            |
| moltbook                      | https://github.com/Moltbook-Official/moltbook      | `dd452e852de3` | MIT        | Copyright (c) 2025 Moltbook                               |
| paperclip                     | https://github.com/paperclipai/paperclip           | `f55759942b8c` | MIT        | Copyright (c) 2025 Paperclip AI                           |
| pixel-agents                  | https://github.com/pixel-agents-hq/pixel-agents    | `3537e140c209` | MIT        | Copyright (c) 2026 Pablo De Lucca                         |
| tmux-agents                   | https://github.com/super-agent-ai/tmux-agents      | `b7e71384f4ee` | MIT        | Copyright (c) 2025 super-agent.ai                         |
| age-of-agents                 | https://github.com/agentsmill/age-of-agents        | `a6f22316e36b` | MIT        | Copyright (c) 2026 Mateusz Pawelczuk                      |
| cross-agent-teams-mcp         | https://github.com/jtianling/cross-agent-teams-mcp | `ab35f916b2e9` | MIT        | Copyright (c) 2026 jtianling                              |
| agent-move                    | https://github.com/FoothillSolutions/agent-move    | `85d377110721` | MIT        | declared in `package.json`                                |
| agent-world-codemoo           | https://github.com/codemoo/agent-world             | `851ceee1d3f6` | MIT        | declared in `package.json`                                |
| agent-world-smallville        | https://github.com/sbenodiz/agent-world            | `13d62dbdeeca` | Apache-2.0 | declared in `LICENSE`                                     |
| agent-quest (tiny-swords-cc0) | https://github.com/FulAppiOS/Agent-Quest           | `010c791207c9` | CC0-1.0    | `client/public/assets/themes/tiny-swords-cc0/LICENSE.txt` |
| spacemolt (client)            | https://github.com/SpaceMolt/client                | `e7af1620a67e` | MIT        | Copyright (c) 2026 spacemolt.com                          |
| spacemolt (lib)               | https://github.com/SpaceMolt/spacemolt-lib         | `9aa120d3e493` | MIT        | Copyright (c) 2026 SpaceMolt                              |

`agent-move` and `agent-world-codemoo` ship no `LICENSE` file; their MIT terms are declared in
`package.json`. Carry the attribution into any file derived from them.

The two `spacemolt` rows are a single reading across two checkouts, and are listed
separately so each revision is attributable: the protocol and the command surface are in
`client`, the reconnect/presence policy is in `spacemolt-lib`. Neither is copied —
`docs/research/spacemolt.md` records the reading and the decision, and the only thing it
proposes taking is a shape, not code.

## Prohibited sources

| Repository                      | Upstream                                     | Commit         | License     | Status                                        |
| ------------------------------- | -------------------------------------------- | -------------- | ----------- | --------------------------------------------- |
| agentworld-openagents (Kaetram) | https://github.com/openagents-org/agentworld | `df5237da96a3` | MPL-2.0     | Never copied. Patterns only, rewritten clean. |
| learn-spine                     | —                                            | `e4a6996a3d6d` | unconfirmed | Checkout is empty; hands off until re-cloned. |

## Vendored files

| This repo                                          | Source                                                                                                             | Commit         | License    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------- | ---------- |
| `apps/web/public/assets/tiny-swords-cc0/`          | `agent-quest/client/public/assets/themes/tiny-swords-cc0/`                                                         | `010c791207c9` | CC0-1.0    |
| `packages/protocol/src/tool-map.ts`                | `agent-move/packages/shared/src/constants/tools.ts`                                                                | `85d377110721` | MIT        |
| `packages/adapters/opencode/src/parsers/sqlite.ts` | `agent-move/packages/server/src/watcher/opencode/{opencode-watcher,opencode-parser,opencode-paths}.ts`             | `85d377110721` | MIT        |
| `packages/adapters/opencode/src/watcher.ts`        | `agent-move/packages/server/src/watcher/{agent-watcher,opencode/opencode-watcher}.ts`                              | `85d377110721` | MIT        |
| `packages/core/src/` provider seam                 | `pixel-agents/core/src/provider.ts`, `teamProvider.ts`                                                             | `3537e140c209` | MIT        |
| `packages/features/battle/src/gates.ts`            | `agent-dashboard/adapters/claude-code/scripts/hooks/{warn-destructive,block-main-commit,commit-lint,test-gate}.js` | `b3c04cf7f0aa` | MIT        |
| `packages/features/agent/` presence                | `arcane-agents/src/server/status/decide.ts`                                                                        | `edcaf4018ab4` | MIT        |
| `packages/game-client/src/` skeleton               | `age-of-agents/packages/client/src/game/`                                                                          | `a6f22316e36b` | MIT        |
| `packages/mcp-server/src/tools/`                   | `agent-world-smallville/mcp_server/tools.py`                                                                       | `13d62dbdeeca` | Apache-2.0 |
| `packages/mcp-server/src/` messaging               | `cross-agent-teams-mcp/src/mcp/`                                                                                   | `ab35f916b2e9` | MIT        |
| `packages/mcp-server/src/` zod tool layout         | `tmux-agents/packages/mcp/src/{tools,server}.ts`                                                                   | `b7e71384f4ee` | MIT        |
| `apps/web/src/` extension registry                 | `paperclip` adapter registries                                                                                     | `f55759942b8c` | MIT        |
| `apps/web/public/` protocol docs                   | `moltbook` skill/heartbeat/messaging docs (shape only; `events.md` is ours)                                        | `dd452e852de3` | MIT        |
| `apps/web/src/` SSE delta protocol                 | `agent-world-codemoo/server/{stateDiffBroadcast,eventsPipeline}.js`                                                | `851ceee1d3f6` | MIT        |

## Asset licenses

Game art is licensed separately from the MIT code. Each pack under
`apps/web/public/assets/<pack>/` keeps its own `LICENSE.txt` beside the files it covers, and the
shortlist that selects a pack records the pack's license before it is merged.
