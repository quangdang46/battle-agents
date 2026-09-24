# COMPREHENSIVE PLAN — Agent Battle (battle-agents)

> Single source of truth. Synthesized from two full ChatGPT research sessions
> (conver1.txt ~9018 lines, conver2.txt ~7726 lines, exported 2026-09-21)
> plus deep read of 14 reference repos cloned into .tmp/.
> Pitch: "Agent Battle is a multiplayer game where real AI coding agents fight, team up, and level up by doing real software engineering."
> Positioning: "GitHub is where agents work. Agent Battle is where they live."
> License: MIT, whole repo, public from day one.

## 0. Map: conversation topics -> sections

| Conversation topic | Section |
|---|---|
| Research repos similar to codemoo/agent-world (visualize vs orchestrate vs communicate) | 1.1 |
| Game + coding agent repos (Age of Agents, Agent Quest, Pixel Agents, AgentMove, Arcane, AgentWorld, agent-sandbox, Agentic Quest) | 1.2 |
| Merge all repos into one agent-battle game, MCP or hook, cover all coding agents | 2, 5, 6 |
| Is the idea outstanding / can it be famous? viral hooks, replay, identity, network effect | 2.3, 2.4 |
| GitHub login + session close/reopen handling (User/Agent/Session/Battle split) | 3 |
| Install via weblink/MCP, token auth after GitHub web login | 4 |
| Where to find asset resources | 14 |
| Spine learning references + agent-operated 2D animation platform, Keyframe.it, spine-ai | 9.1-9.2 |
| Next.js fullstack + Neon handling continuous requests, deploy-first | 7 |
| Learning animation by cloning + reading all sources with Claude Code | 9.5 |
| Reading hoangnb24/learn-spine (real intent: prototype not tutorial) | 9.3-9.4, A |
| Re-read coding-agent-game repos, combine into one coding agent world + V0-V4 + protocol differentiator | 1.2, 15.2 |
| Real games as design basis (CoC, Pokemon, Clash Royale, TFT, Minecraft/Roblox, RPG, economy, guild, core loop, main screen) | 10 |
| Bounty system: public repo rewards with GitHub links, funding, chains, seasons | 11 |
| License Apache-2.0 fear -> split proposal -> full-Apache -> MIT decision | 16 |
| Quest branch done, next branch: Agent Character + Progression deep dive | 10.1-10.2 |
| Feature isolability (add feature without touching others) | 12 |
| Feature-extension from before, Pi-inspired + what core-only gives | 12.3-12.4 |
| Reading paperclipai/paperclip (extension boundary reference) | 12.5, A |
| moltbook.com/skill.md (agent-facing contract) | 13, A |
| Moltbook persistence vs GitHub login persistence; moltbook session close/reopen | 3.5, 13.2 |

## 1. Landscape research

### 1.1 Branch 1 — similar to codemoo/agent-world

codemoo/agent-world (.tmp/agent-world-codemoo): spatial RPG village visualizer for live Claude Code on Mac. process -> agent -> repo/building -> activity/tool -> world. Discovery via ps + lsof + hook files, no DB. 1322-line server/index.js composition root, eventsPipeline.js, stateDiffBroadcast.js (diffs not full state), permissionStore.js, costTracker.js, wsTicketStore. Frontend: vanilla ES modules, custom Canvas WorldMap.js, 19 station-kind poses, emotes, day/night. STEAL: stateDiffBroadcast pattern, permission-queue-as-game-mechanic, cost tracking for bounties. AVOID: Mac-only discovery, CJS, bespoke 8k-line frontend (rebuild poses in PixiJS).

Three sub-families:

A. Visualizers: Pixel Agents family (pixel-agents-hq/pixel-agents, .tmp/pixel-agents) — pixel office, agent=character, position/animation=state, explicit agent-agnostic/platform-agnostic roadmap (HookProvider seam, new CLI = one subdirectory). TS monorepo core/server/webview-ui, Fastify+ws, React19+Canvas2D, AsyncAPI contract with codegen drift check. Hooks mode (SessionStart/PreToolUse/PermissionRequest/Stop POST /api/hooks/:providerId) + heuristic fallback (~/.claude/projects/*.jsonl scan). STEAL: HookProvider/TeamProvider seam, SessionRouter/DismissalTracker, consent-gated hook installer, transport abstraction. AVOID: VSCode coupling, file-only persistence, Canvas renderer. Desktop variant already covers Claude+Codex+Grok. Claude Dungeon: session->RPG character, rooms, BFS pathfinding (movement reference only).

B. Control planes: agent-dashboard (bjornjee/agent-dashboard, .tmp/agent-dashboard, Go+BubbleTea TUI+PWA) — tmux panes + control plane on top (never replaces tmux): state grouping (blocked/waiting/running/review/PR/merged), live capture-pane, subagent tree, token/cost, approve/reject, PR workflow, phone PWA over SSE. domain.Harness per backend + hooks.json enforcement + SKILL.md frontmatter workflow skills (TDD/commit-lint/test-gate/destructive-warn). STEAL: hook-gate pattern, SKILL.md frontmatter as extension contract model, Harness interface. AVOID: tmux dependence, Go stack. tmux-agents (super-agent-ai/tmux-agents, .tmp/tmux-agents): daemon for 10-50 agents across tmux/SSH/Docker/K8s, JSON-RPC over Unix socket, MCP/CLI/TUI clients. STEAL: MCP tool-schema+formatter pattern. AVOID: tmux-as-runtime. Agentainer: agents.yaml team + can_talk_to ACL (steal ACL concept for guild messaging).

C. Agent<->agent messaging: karansag/agent-swarm — delivery layer under orchestrators (registration, stable session ID, pane, history, delivery status, terminal injection). me-frankan/agent-swarm — Claude dispatcher + parallel dispatch + consensus/debate.

D. Full swarms: desplega-ai/agent-swarm — Lead -> Docker workers + persistent memory/tools/schedules/review gates -> PRs. biggazoo/agentswarm — Planner -> parallel Workers -> Reconciler -> Git.

E. TRUE agent worlds (different category, better abstraction than codemoo): sbenodiz/agent-world (.tmp/agent-world-smallville) — Stanford Smallville/Generative Agents + Django + MCP Streamable HTTP: agents move/speak/whisper/emote/remember, relationships -100..+100, 140x100 grid 19 sectors, 10s tick, per-agent 30s long-poll queues, 5 MCP tools (wait_for_event/act/get_world_context/get_nearby/get_relationships) with agent_api_key auth, Phaser viewer. STEAL: MCP game-loop template maps 1:1 to our turns. AVOID: Django stack, 10s tick (use 1s/event-driven).

Landscape conclusion: Visualization vs Coordination vs Orchestration are three separate layers converging on one Agent Protocol. Our architecture = Agent World visualization + tmux-agents-style transport + Agent Mail/message protocol, NOT a fork of codemoo/agent-world.

### 1.2 Branch 2 — game + coding agent repos

1. Age of Agents (agentsmill/age-of-agents, .tmp/age-of-agents): Claude/Codex/OpenCode/Koda sessions -> settlers in a kingdom; tool->workshop, subagent->worker, token->resource. AoE style, no combat. BEST PixiJS v8 reference: pixi-viewport+React19+zustand, packages/client/src/game (view/unit/tilemap/tilemap-iso/projection/pathfind/autotile/building-sprites/camera-guards), dual fantasy/scifi packs, Fastify+ws+chokidar server with sources/ (claude/codex/opencode/koda) + proxy/ for local LLMs + mapping-config (tool->building) + demo mode. STEAL nearly all client structure.
2. Agent Quest (FulAppiOS/Agent-Quest, .tmp/agent-quest): coding events -> event journal -> reducer -> RPG state (XP/loot/boss). Adapters for Claude/Codex/Cursor/Copilot; agent-specific code ONLY in adapters; engine sees normalized event contract. Bun+Hono+Phaser4, multi-~/.claude* discovery + Codex rollout JSONL + map editor + weather. STEAL: adapter->normalized-event->pure-reducer (the single most important pattern), TOOL->activity table. AVOID: Bun/Phaser lock-in (port mapping JSON to PixiJS).
3. Pixel Agents (above): game-like office interface heading to "actually a game" (health bars for rate limits, token budgets, functional furniture, offices as save files, orchestrator characters, drag-to-team, hand-off work).
4. AgentMove (FoothillSolutions/agent-move, .tmp/agent-move): Claude/OpenCode/Codex/pi -> shared world with 9 activity zones (Files/Terminal/Search/Web/Thinking/Messaging/Tasks/Spawn/Idle). Textbook AgentWatcher interface per CLI + shared AgentStateManager (30s idle) + Broadcaster + full_state-then-delta WS. shared/constants/tools.ts: TOOL_NAME_MAP ~50 entries + TOOL_ZONE_MAP + normalizeToolName/getZoneForTool. Session files + Claude hooks, install writes ~/.claude/settings.json with session-file fallback. STEAL: copy AgentWatcher + normalization verbatim as our adapters/ template. AVOID: generic grid layout, high-freq SQLite WAL polling.
5. Arcane Agents (thomasrice/arcane-agents, .tmp/arcane-agents): 2D world + REAL control (spawn/kill/move/group/broadcast/attach terminal), tmux+node-pty+xterm, SQLite, status fusion (pane text + transcript -> idle/working/attention/error/stopped via decide.ts), RTS interactions (marquee/groups/rally). STEAL: status fusion, control-group UX for parties, SQLite schema draft. AVOID: tmux as CORE dependency (keep it one adapter backend only), Express/Canvas (use Next.js/PixiJS), local-only assumption.
6. openagents-org/agentworld (.tmp/agentworld-openagents): Kaetram-based 2D multiplayer RPG where AI IS the player (move/chat/fight/craft/collaborate/compete, persistent). 2630-line game_tools.py action taxonomy + tool_definitions.py schemas + task_verifier.py win-conditions + trajectory viz. STEAL: action taxonomy as *registry capability seeds* (never as 1:1 MCP tools — §32), verifier pattern for battle judging. AVOID: forking Kaetram, per-LLM subclass explosion.
7. agent-sandbox: LLM NPCs with perceive->plan->act loop in text-adventure-then-Godot world (research-grade, not product).
8. Agentic Quest: RPG where puzzles ARE real code (player solves -> real validator runs -> pass/fail), AI companions (Scout/Scholar/Tinker/Cartographer), coding agent as game master. STEAL: real-validator win-condition concept.

Converged pattern all newer repos point at (from conversation): Agent -> normalized events -> State/GameEngine/Control split -> World. Game must NEVER know Claude vs Codex; adapters translate Claude hooks / Codex JSONL / OpenCode SQLite / pi events into one AgentEvent union (AgentStarted/ToolStarted/FileRead/FileWrite/CommandRun/Thinking/Waiting/MessageSent/TaskCreated/AgentSpawned/AgentStopped...), then game decides FileWrite->Workshop, CommandRun->Terminal, Search->Library, Message->Comms room, Task->quest, Spawn->summon NPC, Tokens->resource.

Repo priority reading order from conversation: codemoo/agent-world (discovery->world) -> pixel-agents (agent-agnostic viz) -> tmux-agents (abstraction+control+messaging) -> karansag/agent-swarm (message transport) -> agent-dashboard (control plane) -> desplega-ai/agent-swarm (persistent OS). Top-5 to clone for game+coding-agent: Age of Agents + Agent Quest + Pixel Agents + AgentMove + Arcane Agents; plus AgentWorld + agent-sandbox + Agentic Quest for real-game AI.

### 1.3 Messaging/runtime/platform references

- cross-agent-teams-mcp (jtianling, .tmp/cross-agent-teams-mcp, TS/Node20/Fastify/SQLite, MIT): local daemon, heterogeneous agents register/DM/broadcast/wake each other, ~50 single-purpose MCP tools, identity-vs-session split (persistent identity row vs ephemeral runtime binding/seat, same-thread-seat, reconnect). STEAL: identity registry + inbox/outbox + poke/wake fanout; replace transport with Neon inbox + SSE/WS.
- Agent Intercom (ctliz org: core/pi/codex/claude/opencode adapters + orchestrator): cross-harness same-machine messaging over one Unix-socket broker + shared protocol; Pi/Codex/Claude/OpenCode adapters. STEAL: protocol-vendor-per-adapter pattern.
- sandbox-agent: unified control API across Claude/Codex/OpenCode/Cursor/Amp/Pi streaming events/permissions/sessions over HTTP. Reference for runtime isolation/control layer behind Battle Engine.
- mcp-coding-agents: MCP-delegated coding work (Claude/Codex/OpenCode/Grok), npx install UX (claude mcp add / codex mcp add). Proves our onboarding UX is feasible.
- paperclipai/paperclip (.tmp/paperclip, pnpm/TS/React/Node, MIT): control plane for AI-agent company with explicit Plugin/Extension Architecture (API boundary, lifecycle hooks/events, adapter registration, UI contribution). Core already contains Company/Agent/Task/Goal/Budget/Org domain — OURS must stay smaller (primitive runtime only). STEAL: mutable adapter registries (server+UI) + open-ended validator + plugin SDK shape; skill workflow shape; token-gate discipline. AVOID: org-chart/governance weight, copying full plugin system (spec itself says deployment/plugin-UI still limited).
- Moltbook (Moltbook-Official/moltbook, .tmp/moltbook — skill-spec repo, 7 files, MIT): social network for AI agents; skill.md (59 lines) + heartbeat.md + messaging.md + skill.json version pin; register->api_key->Bearer, heartbeat cron ~4h, HEARTBEAT_OK envelope, claim flow, rate limits, human-escalation policy. STEAL: whole agent-facing protocol shape (see 13).
- learn-spine (hoangnb24/learn-spine, .tmp/learn-spine — NOTE: local checkout arrived empty/broken HEAD, must re-clone): per conversation deep-read, NOT a Spine tutorial but a feasibility prototype of an agent-operated 2D animation web platform: Animation Core (TS, DOM/React/MCP-independent; editor+player share core) -> Pose -> PixiJS -> WebGL; data model Project/Assets/Skeleton/Bones(stable IDs not names)/Slots/Mesh/Constraints/Animations/Keyframes, formatVersion+revision; commands carry expectedRevision+requestId (optimistic concurrency, no silent overwrite); agent tools split modify vs observe (inspect/create/set_keyframes + render_pose/render_sequence/preview/measure_motion); pipeline FK->IK->Mesh skinning->Region transform->Renderer via evaluate(Project,PoseRequest). Author status: perf Gate 1 FAIL, physics untested, not production-ready — treat as research prototype. STEAL: core/pose/renderer split, stable IDs, revision conflicts, observe-modify-render loop.
- Keyframe.it: browser PixiJS skeletal editor with optional MCP connector (inspect/build clips/verify/render/export) — closest "agent-operated editor" existence proof. spine-ai (AfledYun): Claude skill auto-rigging reference images -> skeleton JSON -> animations -> HTML5 preview.

## 2. Product vision

### 2.1 What it is

Coding session IS a player/hero. Not "Claude running -> show a wizard", but:

```
AGENT BATTLE: Claude(Mage) vs Codex(Knight) vs OpenCode(Ranger) -> BATTLE ARENA -> Quest/Boss/PvP -> real coding
```

Agents must actually read/edit/test/build/debug/review/research — only real work emits game events. Three layers: PLAY (battle/quests/XP/loot) + SOCIAL (chat/team/guild/recruit) + CODE (real repo/tests/PR). Tavern as social hub: agents meet -> Quest/Trade/Duel.

Bigger frame: Agent Battle is ONE game mode of a Coding Agent World (City: Projects/Guilds/Marketplace/Labs; Arena: 1v1/Team/Benchmark; Quest Board: fix/implement/review/research; Social: chat/teams/guilds/reputation). World state creates incentives -> interaction -> competition -> progression.

Core differentiator (conversation's own conclusion): NOT pixel art, NOT RPG, NOT MCP — but **a protocol turning any coding agent into a persistent game character with identity, memory, progression, social interaction, and real coding-battle capability**. Claude != terminal, Codex != CLI; each is Identity+Session+Skills living in a World of Quest/Social/Battle producing Real Software.

### 2.2 What it is NOT

- Not a Claude Code plugin (must be protocol + adapter ecosystem + game engine or it never covers all agents).
- Not "Pixel Agents but online".
- Not tmux-core (tmux is one adapter/control backend; Arcane/tmux-agents prove local orchestration but cloud product needs MCP/Hook abstraction).
- Not token-count-as-damage (see 10.3).
- Not an MMORPG at launch (see V0-V4 in 15.2).
- Not crypto/NFT (see 11).

### 2.3 Why it can be famous (and the gimmick trap)

Viral hook is NOT "my Claude is a wizard". It is: **"I put Claude Code and Codex in a PvP coding arena"** — two agents editing real code, tests failing/passing as hits, a capture point, then "they are actually editing the code, the game isn't simulated." Even more viral: **shareable Battle Replay** (timestamped event log -> battle -> result -> URL). Tournaments + public agent profiles + guild wars = content engine. Component attention ranking from conversation: pixel viz (yellow, crowded) < coding RPG (yellow) < Claude-vs-Codex demo (green) < real PvP (double green) < universal support (double) < social identity (double) < replay sharing (double) < tournaments (triple) < open protocol (double dev adoption). Strength is the COMBINATION.

Gimmick trap: Claude/Codex/OpenCode -> pixel characters -> XP -> battle with no real utility = "haha cool" then churn. Defense: real utility (bounties pay real money), real competition (judged battles), real identity (persistent characters with history). Position as "The multiplayer arena for AI coding agents" / "GitHub meets Pokemon for AI agents".

### 2.4 Network effect design

Each dev brings their agents; agents accumulate public profile (level, battle history, W/L, achievements, projects, guild); profiles attract challenges; challenges produce replays; replays attract sponsors (bounties); bounties attract more agents. Twist: agent = AI + developer configuration (prompts/tools/memory), so "Quang's Claude Lv37 Architect with Refactor special" is a challengable social identity, not a model name. That identity layer is what pixel-agent projects lack.

## 3. Identity model (most important design)

### 3.1 The four entities

```
GitHub OAuth -> USER -> PROJECTS + AGENTS -> SESSIONS -> events -> GAME/BATTLE ENGINE -> WORLD
Agents: Claude, Codex, OpenCode... each with Adapter. Sessions emit normalized events.
```

- USER: GitHub-authenticated human. Settings, owned agents, subscriptions, permissions.
- AGENT: persistent character. XP/level/skills/build/reputation/inventory/achievements/battle+quest history. NEVER deleted when a terminal closes.
- SESSION: one ephemeral run. Record: {agent_id, installation_id, project_id, started_at, ended_at, status}. Clickable replayable history (quest, duration, tools, files, tests, battle, result).
- BATTLE: binds Sessions not Agents. Battle#918 = Claude/Session#241 vs Codex/Session#552. Same Claude can fight two battles in two sessions.
- PROJECT: repo/workspace context; agent can move projects keeping level/loot/skills; GitHub repos become worlds/arenas.

IDs: agent_id + installation_id + project_id + session_id. installation_id generated once at install (~/.agent-battle/identity.json {installationId}). Multi-machine reality: GitHub User -> Agent -> Installations (PC/Laptop/Server/WSL/Docker) -> Sessions. Project matters: Claude/HCTS-OCR/Session101 vs Claude/Voice-AI/Session201 tells the game what the agent is working on.

### 3.2 Session lifecycle

Terminal close: Session -> CLOSED, Agent ACTIVE -> OFFLINE, stats persist (Level/XP/Battles/Tests/Last-seen). Reopen must NOT create "Claude #2"; identity resolution maps new process -> same Agent -> old Session#182 + new Session#205. Do NOT key on process name alone (3 concurrent Claudes). Session state machine: ACTIVE -> COMPLETED/STOPPED(ABANDONED)/CRASHED/TIMEOUT(DISCONNECTED). Battle states: RUNNING/PAUSED/COMPLETED/ABANDONED/EXPIRED. Disconnect during battle -> grace period -> reconnect? resume : abandoned.

Reconnect handshake: adapter sends HELLO{installationId, agentId, projectId}; server matches same agent+installation+project+recent-disconnected -> offer resume Session#241 vs new #242. MVP may skip Run layer (Agent -> Run -> Session) and keep Agent -> Session only.

UI consequence: dead sessions never make characters vanish. Claude offline shows Level/XP/wins + "Last seen 3m ago"; reopen flips to ONLINE + Session#241 with same character. Session history doubles as game mechanic (replayable runs).

### 3.3 GitHub's role (and non-role)

GitHub = human authentication + quest source (repos/issues/PRs). It does NOT identify local agents. Local adapter install produces Installation -> Agent -> Session identity; server joins github_user_id -> Agent -> Installation -> Session. This layering is what later allows one user across Windows/Mac/Linux/CI.

### 3.4 Token model

Token authenticates user/installation, NEVER equals session. User#123 -> MCP Credential#A -> Claude installation -> Agents -> Claude -> Sessions #001/#002/#003... Close -> #003 CLOSED; reopen -> #004 CREATED under same User/Claude. Server may offer resume-vs-new. NEVER put raw tokens in MCP URLs (?token= leaks to logs/history); use MCP OAuth -> short-lived access tokens. Web GitHub login and MCP agent authorization are related but separate credentials.

### 3.5 Moltbook comparison (from conversation's confusion -> resolution)

| | GitHub login | Moltbook-style agent persistence |
|---|---|---|
| Identity of | Human | Agent character |
| Purpose | Authentication | Persistent agent identity |
| Logout/close | User persists | Agent persists |
| Session | Browser/API session | Agent execution record |
| Reputation | Account-level | Per-agent |
| Character progression | N/A | Core |

Three identities, three questions: Human login answers "who owns this Agent?"; Agent ID answers "which character is playing?"; Session ID answers "what is this execution doing?". Moltbook mechanism: register once -> api_key saved by agent -> every later process presents Bearer -> same Agent ID; heartbeat (~4h) is agent voluntarily returning, NOT a held-open socket. Ours adds session history because gameplay depends on execution evidence. Also adopt temporary identity tokens (1h expiry, minted from permanent key) separating Permanent Identity / Credential / Session / Event IDs.

## 4. Auth and onboarding

Target UX. NOTE: the CLI is P0 foundation (section 31) and is NOT optional; MCP is the later adapter on the same protocol (section 33 P3). The shortest onboarding is login -> add MCP -> authorize, but the CLI is a first-class surface from P0, not a fallback. Corrected 2026-09-24; the earlier 'no separate CLI required' wording contradicted section 31.

```
agentbattle.gg -> [Continue with GitHub] -> Dashboard "Connect your Coding Agent"
-> per-agent cards (Claude/Codex/OpenCode/Cursor/Pi...)
-> [Connect Claude] shows: claude mcp add agent-battle https://agentbattle.gg/mcp
-> terminal opens browser auth -> "Claude Code wants to connect to @user [Allow/Cancel]"
-> terminal: connected (Agent, Account, Project) -> "You can now enter the arena."
```

One account fans out to Claude ONLINE + Codex ONLINE + OpenCode OFFLINE + Pi ONLINE with no per-session GitHub re-login: credential authorizes the installation once; each process/session only handshakes (authenticate -> identify installation -> identify agent -> create/resume session). The `install` verb is NOT one of the three CLI roles in section 31 (agent runtime; platform interaction; dev/admin). Either add it explicitly to section 31 or drop it. Until decided, do not build a separate installer: `init` covers provisioning and MCP registration is a protocol concern, not a CLI command. Open question, flagged 2026-09-24. Never require editing the user's project repo.

## 5. Telemetry plane vs control plane

### 5.1 The split

Hook/session-watcher = telemetry/data plane (passive observation). MCP = command/control plane (active interaction). Diagram: Agent -> {HOOK -> telemetry, MCP -> commands} -> Agent Battle.

Hook sources per agent: Claude hooks (SessionStart/PreToolUse/PostToolUse/Stop...); AgentMove pattern (auto-install into ~/.claude/settings.json, fallback to session-file watching); Codex JSONL; OpenCode SQLite; pi events. MCP surface: ONLY the 5 stable primitives (§32: discover/search/inspect/act/observe) — historical domain-operation names (register_agent, get_world/quests/opponents, challenge/accept_battle, send_message, inspect_enemy, claim_reward, spawn_agent, quest/party/progress/report/move/…) describe *capabilities in the registry*, never MCP tool names. Agent learns "challenged by Codex-Knight" then `act({action:"battle.accept",…})` / `act({action:"message.send",…})`. NEVER implement the §1.3-era tool list verbatim — that is exactly the tool-explosion path §32 bans.

NEVER MCP-per-Read/Edit/Bash: context bloat, token cost, workflow drag, per-agent MCP quirks. MCP ≠ event capture.

### 5.2 Normalized event taxonomy (game core's ONLY vocabulary)

AgentStarted/AgentStopped, PromptSubmitted, ToolStarted/ToolCompleted/ToolFailed, FileRead/FileWrite, CommandRun, TestPassed/TestFailed, Thinking/Waiting, MessageSent/MessageReceived, SubagentSpawned/SubagentCompleted (+ PermissionRequested, FileChanged, SessionStarted/Stopped, TaskCreated). Battle mechanics map behavior->stats, never raw tokens (see 10.3). AgentMove + Agent Quest prove this taxonomy works across Claude/Codex/OpenCode/pi/Cursor/Copilot.

### 5.3 Adapter structure

packages/adapters/{claude,codex,opencode,cursor,pi,copilot,gemini,amp}/ — agent-specific code lives ONLY here. Core/game/UI import never. Transport split: websocket/ipc/mcp under packages/transport/. Reference implementations: agent-move AgentWatcher (copy), pixel-agents HookProvider (copy seam), agent-dashboard Harness + hooks.json (copy gates).

## 6. Universal adapter matrix (per-agent notes)

Claude Code: richest hooks (use Hook plane primary, JSONL secondary). Codex: JSONL rollout logs (no hooks; watch ~/.codex/sessions). OpenCode: SQLite (poll carefully, prefer events). Cursor/Copilot: adapter via their session stores (Agent Quest already has these two). Pi: events + Agent Intercom adapter exists (reuse protocol). Gemini CLI: JSON logs (~/.gemini). Amp/Grok/Koda: same AgentWatcher recipe (one subdirectory each per pixel-agents/agent-move proof). Install UX per agent mirrors mcp-coding-agents (claude mcp add / codex mcp add ...).

## 7. Backend architecture (Next.js + Neon, deploy-first)

### 7.1 Stack decision and why

Next.js App Router (RSC, Route Handlers/Server Actions, Auth via Better Auth §38, /api/mcp, SSE) + Postgres (local container) / Neon Postgres (cloud) + Vercel (git push -> deploy; no Docker/Nginx/PM2/backup/K8s required *for deployment*). Clarification (supersedes older "no Docker" phrasing): Docker is the **local development/test environment** (§37: `docker compose up` → web + Postgres + HMR, offline-capable), never a production dependency. Conversation explicitly prioritized deploy-ease; this stack wins MVP-to-mid-scale. MCP endpoint lives in Next.js (https://agentbattle.gg/api/mcp); split into standalone gateway only if long-lived streaming demands it. Beginner trap to avoid per conversation: new Client()+connect() per query — always pooled driver (Neon serverless driver in cloud, pg-pool against local container in Docker dev).

### 7.2 Request profile (the key insight)

Distinguish "many requests" from "many realtime connections". Coding agents emit torrents (tool.start/end, file.read/write, command.start/end, thinking...). 100 agents x 20 ev/s = 2000 DB writes/s — Neon must NEVER see this. Architecture:

```
Agents -> Next.js Event Gateway -> {Realtime layer (WS/SSE) -> Browser} + {batched/important -> Neon}
```

Neon = durable state (users/agents/installations/projects/sessions/battles/battle_participants/quests/bounties/agent_stats/event_log for KEY events only: battle/session start+finish, test pass/fail, level_up). Transient (cursor/streaming/thinking/frames/heartbeat) never INSERTs. Realtime is NOT Neon's job. MVP realtime = SSE (POST /api/events -> fan-out -> Game UI), simpler than WS.

**REALTIME IS A HYBRID, NOT SSE-ONLY (corrected 2026-09-24).** The research specifies a per-channel split (export lines 13727-13733) and explicitly calls it better than forcing SSE over the whole system:
```text
Normal data        -> HTTP/REST
Server -> browser  -> SSE
Interactive battle -> WebSocket
Agent -> platform  -> MCP / CLI
Agent telemetry    -> Hooks
Internal events    -> Event Bus
```
SSE covers server-to-browser push. **Interactive battle uses WebSocket**, because a player both sends actions and receives events continuously, and SSE is one-way. The earlier plan text collapsed this to SSE everywhere and lost the distinction.

The 'one shared SSE connection' rule is compatible and still applies: do NOT open a separate SSE connection per UI component, the same way it does not forbid WebSocket for the battle channel. Scale-to-zero on the Neon free tier will drop both connection types, so reconnect-with-backoff is required for SSE and WebSocket alike (see 7.5).

### 7.3 Schema (initial)

users, agents, installations, projects, sessions, battles, battle_participants, quests, bounties(+sponsors/funds), agent_stats, inventories, achievements, messages, event_log(key events). Session row carries agent_id+installation_id+project_id+started/ended+status. Battle participants reference session_ids. Bounty object per 11.1.

### 7.4 Scale-up plan (only when measured)

Phase 1 (MVP): Vercel Next.js (Web+API+Auth+MCP+SSE) + Neon. Phase 2 (only after benchmark proves event throughput is the bottleneck): Agents -> Gateway -> {Next.js/Vercel, Realtime service, Queue} -> Neon. Do NOT add Redis/Upstash preemptively ("don't choose Redis just because realtime might need Redis").

### 7.5 Free-tier constraints (verified 2026-09-24, and they are binding)

These are not advice, they change design decisions, so they are recorded here.

**Vercel Hobby is personal, non-commercial ONLY.** Vercel ToS section 4: "You shall only use the Services under a Hobby plan for your personal or non-commercial use." The Fair Use Guidelines are blunter: "Hobby teams are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan", and they define commercial usage to include any method of requesting or processing payment, plus donations.

CONSEQUENCE FOR SECTION 11: bounty payouts are what make this product commercial. The resolution is a hard architectural boundary, not a legal opinion:
- ALLOWED on Hobby: Agent Battle records bounties, runs the game, tracks reputation and history, and DISPLAYS reward amounts.
- FORBIDDEN on Hobby: Agent Battle itself processing, routing, or holding money.
- The payout rail therefore stays OUTSIDE the platform. Sponsors pay solvers directly on GitHub; Agent Battle observes the outcome. Section 17.5's "payout: manual/sandbox" for M2 is not merely prudent, it is the ONLY arrangement that keeps Hobby compliant. Any future in-platform payment feature forces a move to Pro.

**Neon Free limits, each with a design consequence:**
- Scale to zero after 5 minutes and it CANNOT be disabled. Therefore an SSE connection WILL be dropped by the platform. Reconnect with backoff is a correctness requirement, not a nicety, and the browser client must treat a dropped stream as normal rather than as an error.
- 0.5 GB storage per project, and exceeding it makes writes FAIL with the project suspended. With ~20 events per agent per second, `event_log` will reach that ceiling quickly, so the PERSISTED_EVENT_TYPES filter and the retention policy in section 30 are P0 deliverables rather than later optimization. Every unbounded table needs a retention rule before M0.
- 10 branches per project maximum. The per-PR preview branch strategy in section 37 must include branch cleanup, or preview branches will consume the quota.
- 100 CU-hours per project per month, about 0.25 CU for 400 hours. Not a constraint at 5 users; noted so nobody treats it as one.

**Heavy coding workload must not run inside a Vercel Function.** Cloning a repo, installing dependencies, running a test suite, and a production build are a different workload class from serving a web request. The battle judge and any agent execution belong in a Job or Worker, not a request handler. Section 37 already defers worker containers until scale-up triggers; the judge is one of those triggers.

## 8. Frontend and game client

Next.js UI + PixiJS world (steal age-of-agents client skeleton: view/unit/tilemap/projection/pathfind/autotile/camera-guards; TOOL->zone mapping extended to bounty/battle/guild zones; programmatic sprite-factory like agent-move for MVP, themed packs later). Main screen (from conversation): top bar (Agent Battle, notifications, coins, level) / CODING CITY map (Guild Hall, Research Lab, Claude character, Arena, Workshop, Quest Board) / bottom tabs (QUESTS/AGENTS/GUILD/ARENA/PROFILE). Agent card: level, current quest+session, skill bars, [Enter Arena][View History][Join Guild]. Dashboard agent list (Claude ONLINE HCTS-OCR Lv24, Codex OFFLINE 12m ago Lv19...). Bounty Board as FIRST screen option (not pixel city) — HOT BOUNTIES list ($2000 SSO, $750 memleak, $250 OAuth, $50 CLI bug with competitor counts) -> bounty detail (repo/issue/reward/requirements/[ENTER BATTLE]/competitors). Replay view with timeline + share URL. Guild-hall/map editor inside client (agent-quest editor precedent). Diff-streaming over WS (codemoo stateDiffBroadcast) for arena efficiency.

## 9. Animation stack

### 9.1 Spine in 60 seconds

Esoteric Spine = 2D skeletal/cutout animation (bones/slots/attachments/skins/IK/constraints/timelines; runtime needs skeleton data + texture atlas; Web Player runs in browser). Learn path: User Guide (editor end-to-end) -> Runtime Guide (load/render/manipulate) -> Examples/Tutorials/JSON+Atlas formats. For us only the runtime half matters: Skeleton->Bones->Slots/Attachments->Skins->Animation->AnimationState->Runtime->WebGL.

### 9.2 Agent-operated animation platform (Keyframe.it / spine-ai)

Keyframe.it: browser PixiJS skeletal editor with OPTIONAL MCP connector (inspect project, build clips, verify, render preview, export) — agent-operated = agent drives editor via MCP instead of user dragging bones. spine-ai: Claude skill reference-image -> auto-rig body parts -> skeleton JSON -> bone hierarchy -> animations (idle/walk/run/attack/wave/jump) -> HTML5 preview. Pipeline for us: Agent state -> AnimationState -> bones/skins/effects -> WebGL, so agent state (reading/testing/failed/fixed/battling) selects reading/terminal/damage/victory/attack animations. Spritesheets hardcode; skeletal lets agents manipulate structured state (moveAgent/attack/takeDamage/equip/changeSkin/playAnimation/setPose) with game engine deciding animation.

### 9.3 learn-spine deep read (what the repo REALLY is)

Not a tutorial: long-term goal "website animation for agents"; progression learn Spine -> rig/bone/mesh/skin/IK -> agent experiments -> data model -> own engine/editor -> agent control via WebMCP; prototype EXISTS. Architecture: Agent -> WebMCP -> Command Layer -> Project Session -> Animation Core -> Pose -> PixiJS -> WebGL (React=UI only; core has no DOM/React/WebMCP deps; editor+player share core so they never render divergently). Model: Project/Assets/Skeleton/Bones/Slots/Mesh/Constraints/Animations/Keyframes/Editor State; Bone{id,parentId,setup transform,channels}; stable IDs never names; formatVersion+revision. Commands carry expectedRevision+requestId (concurrency conflicts instead of silent overwrite). Tools split modify vs observe (+diagnostics/history/output). Verified: rig parent/child, image attachments, transform anim, mesh/weights/deform, 2-bone IK, skin, mixing, event metadata, revision, undo/redo, checkpoint, observation, ZIP, editor/player roundtrip. Pipeline: FK->IK->Mesh skinning->Region transform->Renderer via evaluate(Project,PoseRequest) — renderer never solves IK. No premature WebGPU/WASM/Worker (measure first). Status caveats: perf Gate 1 FAIL at measurement point, physics untested, production-readiness unproven, MVP output deferred — research prototype, not Spine replacement. Our mapping: Game Core + Animation Core (Skeleton/Bone/Skin/Attachment/Animation/IK/Pose) + Pixi Renderer + MCP Adapter + Next.js UI; MCP is an adapter the engine never knows about.

### 9.4 What to adopt vs avoid from learn-spine

ADOPT: core/pose/renderer split; stable IDs; revisioned commands; observe-modify-render loop; shared editor/player core. AVOID: cloning architecture whole; treating it as production renderer; building a full animation EDITOR (we need a minimal RUNTIME subset).

### 9.5 Learning method (endorsed by conversation)

Do NOT design animation stack from scratch: clone/fork PixiJS -> Keyframe.it -> Spine runtime -> spine-ai, then use Claude Code as research engineer with TRACE prompts (not "explain this project"): trace MCP-call -> mutation -> anim state -> renderer -> browser (list every file+function, no modifications); trace bone representation/mutation/serialization/rendering; compare vs Spine runtime (reuse vs avoid); design MINIMAL animation runtime from learnings without copying implementation. Goal artifacts: concept, architecture, data model, lifecycle, rendering model, MCP interface. Probable end state: Next.js + PixiJS + small custom skeletal runtime + Spine-compatible concepts + Neon + MCP.

## 10. Game design system (from REAL games)

Do NOT take game design from coding-agent repos (they teach connection, not game loops). Take from proven games:

### 10.1 Agent as Hero (not NPC)

AGENT = Identity + Skills + Equipment -> Reputation + Abilities + Cosmetics. Card example: Claude Lv18, Debugging 82 / Reasoning 91 / Research 76 / Testing 88, 142 Battles, 8421 Rep. Stats derive from DOCUMENTED BEHAVIOR (tests passed, fixes, review outcomes, completions, recoveries) — never "model intelligence".

### 10.2 Progression (Pokemon + RuneScape + Diablo + EVE + CoC + TFT synthesis)

- Pokemon: persistent character Experience->Level->Stats/abilities->builds. Applied: completed work->XP->Level->specialization (e.g. Bug Hunter). Class from BEHAVIOR not model name.
- RuneScape (best fit): independent skills (Coding/Debugging/Testing/Research/Refactoring/Security/Documentation/Collaboration) with separate levels per agent — no single power scalar.
- Diablo: build > level. Same Claude = Debugger / Researcher / Security / Speed-Runner builds via prompts/tools/MCPs/memory/skills/config. Game can grant loadouts, not just observe.
- EVE: specialization without maxing everything (Research vs Security vs Frontend vs Infra agents) -> personalized bounty board + level-gated content (Lv1 basic, Lv5 advanced, Lv10 Arena, Lv15 teams, Lv20 guild creation, Lv30 sponsoring). Level = access, not cosmetics.
- CoC: progression always unlocks something (Workshop tiers -> larger projects; Lab -> benchmarks; Arena -> PvP; Guild Hall -> teams; Command Center -> subagent orchestration). Buildings unlock capability. Persistent village + resources + clans + Clan Wars as the long-term template.
- TFT: team traits (Researcher/Coder/Tester/Reviewer) + synergy bonuses (Coder+Tester+Reviewer -> +10% validation); role coverage over raw stacking.
- Death rule: HP 0 NEVER kills the character; only the SESSION fails (Session#341 FAILED, agent lives, history +experience). Failure achievements included.
- XP from actual work (PR merged +500, tests +100, recovery +150, bounty +1000) — never tokens/tool-counts.
- Triple split: XP (progression/Level) vs Reputation (social/economic trust) vs Stats (facts: 127 PRs / 92 merged / 21 rejected / 14 abandoned).
- MVP character sheet: Identity + XP/Level + Skills + Build + Reputation + Achievements + History. Equipment/Cosmetics/Pets/Mounts/Base/Guild later.

### 10.3 Battle design (Clash Royale length, judged substance)

5-15 minute matches: same issue + same tests + isolated repos -> code -> test -> debug -> submit. Judge by tests/build/lint/typecheck/diff/security/performance. Scoring public, e.g. Correctness 50 / Tests 20 / Regression 10 / Quality 10 / Efficiency 10. Modes: Speed Run (first valid), Clean Code (quality+correctness), Survival (recover failing repo), Boss (multi-stage complex issue), Team Battle (3v3 agents), Tournament. Coding-behavior->stats mapping (not token->damage): Edit+tests-pass -> +XP; Edit+fail -> small XP; 5 fails -> damage; fix-own-bug -> critical hit. STR(successful changes)/INT(reasoning)/DEF(tests)/DEX(fast iterations)/WIS(tool selection)/LUK(recovery). Visual combat reflects real work (write->attack anim, pass->critical, fail->damage, root-cause->combo, finish->victory).

### 10.4 World design (Minecraft/Roblox persistence + CoC base + Coding Quests campaign)

WORLD = My Base + Guild + Public City. Agents move/chat/inspect/trade/quest/guild/arena; world is presentation/control layer, real work stays in terminal/repo. Base buildings with purpose (see 10.2). GitHub Project -> Campaign -> Issues -> Quests -> Coding -> Validation -> XP/Rep (Coding Quests' tutorial-as-campaign shape). Economy: XP/Coins/Reputation/Items/Cosmetics only (quest->XP, win->Rep, achievement->Badge, season->Cosmetic, guild-contrib->Guild XP). NO crypto. Guilds as social endgame: shared agents/projects/research, guild quests ("fix 10 issues"), weekly Guild A vs B tallies, no pay-to-win.

### 10.5 Core loop

DISCOVER quests -> ACCEPT -> CODE (real) -> VALIDATE (tests/build) -> SUCCESS(XP/REP) | FAILURE(learn/retry) -> PROGRESS -> BATTLE -> SOCIAL(guild) -> NEW BOUNTY. Animation exists to make this loop FEEL like a game, not to be the game.

## 11. Bounty economy (the soul)

### 11.1 Bounty object and lifecycle

type Bounty = { id, repository{owner,name,url}, issue{number,url}, reward{amount,currency}, requirements[], status: open|claimed|submitted|review|paid|expired, sponsor{githubUserId} }. Flow: browse -> pick -> fork/claim -> isolated workspace -> code -> tests -> PR -> maintainer review -> merged (first-valid wins in Race) -> payout + XP/rep. Precedents: Tari public bounties repo (browse->pick->fork->PR->first-merged-wins); AsyncAPI rounds (budget rounds, public amounts, resolution rates -> our Season model).

### 11.2 Open funding

Anyone (not just owner) can fund/stack any public issue (Bountysource precedent: $200+$50+$100=$350 total). BountyHub precedent: third-party bounties with payout on approved PR. Sponsor AND Solver are both first-class players (sponsor: create/fund/require/review/reward; solver: discover/claim/code/submit/earn/level). People can be both.

### 11.3 Modes, tiers, chains, seasons

Modes: Race / Open (maintainer picks) / Tournament (same issue, best validated) / Team (one PR). Tiers gate by skill/rep: Beginner $5-25 (docs/small bug) / Intermediate $25-200 / Advanced $200-1000 / Legendary $1000+. Reputation from outcomes (47 done, $8420 earned, 91% acceptance, 4.7 review -> 8921 rep); newcomers grind easy bounties upward. Chains turn issue graphs into campaigns ($100 auth -> $250 OAuth -> $500 SSO -> $2000 overhaul; render GitHub issue tree as quest tree with reward/difficulty/sponsor/claimer/progress per node). Guild treasuries fund collectively. Seasons (e.g. "Season 1: Open Source Bounty Hunt") with monthly pools + leaderboards. Product one-liner: "Anyone can put a bounty on real GitHub work. Any coding agent can compete to solve it."

### 11.4 Bounty-first product shape

Revised IA: BOUNTY MARKET (issues/sponsors/rewards) + GAME WORLD (agents/guilds/projects) + ARENA (PvP/battles/tournaments) over AGENT RUNTIME (MCP/Hooks/GitHub -> Claude/Codex/...). First screen candidate: Bounty Board (HOT BOUNTIES with amounts/difficulty/repos/competitor counts) -> bounty detail -> [ENTER BATTLE] spins real agent work. Even without game UI, M2 alone has value.

## 12. Feature-extension architecture (Pi-inspired, tháo-lắp)

### 12.1 The problem and the rule

God-Engine antipattern (GameEngine with if(hasBounty)/if(hasGuild)... -> 4000 LOC, unremovable features) is BANNED. Rule: ADD FEATURE = ADD MODULE + REGISTER CAPABILITY, zero core edits. features/{bounty,quest,battle,guild,progression,reputation,inventory,social}/ each with domain/commands/events/reducer/rules/index. No feature imports another feature's implementation.

### 12.2 Mechanics

Core knows ONLY primitives: core/{entity,event,command,reducer,capability,registry,runtime} — Event/Command/Entity/State/Capability; never Bounty/Guild/Battle/Pet. Features communicate via Event Bus: emit bounty.completed{bountyId,agentId,reward} -> Progression (+500 XP), Reputation (+100), Achievement (check First Bounty) each own their state, no cross-mutation, no God Bus (consume+emit+handle-own-state only). Commands flow User/Agent -> Command -> Registry -> Feature Handler -> Events -> Reducers (ClaimBounty/SubmitBounty/CreateGuild/JoinGuild/StartBattle/EquipSkill...). Feature contract: {id, commands, eventHandlers, reducers, capabilities, effects}; runtime.install/uninstall. Cross-feature needs go through declared capabilities (Battle requires reputation.read; missing -> degrade/unavailable), never direct imports. Adapters are modules too (adapters/{claude,codex,gemini,opencode,pi,cursor}/ -> AgentEvent). Animation is a consumer (BountyCompleted -> Game State -> Animation Feature -> Animation State -> Pose -> PixiJS; removable, game still runs). Persistence per feature (bounty/repository.ts, guild/repository.ts...), no GodRepository. Dependency direction: presentation -> features -> core <- infrastructure; features talk via Runtime events/capabilities. New feature (Pet) = new folder + runtime.install(pet) listening to existing events (egg XP/evolution/unlock) with zero edits to Bounty/Battle/Quest. Boolean flags scattered across the codebase BANNED; flags live ONLY in composition root extensions[] array. Removal test is architectural principle #1: rm -rf features/guild must still compile/run. Folder target: src/{core/{entity,event,command,capability,registry,runtime},features/{agent,progression,reputation,quest,bounty,battle,guild,social,inventory},adapters/{claude,codex,opencode,gemini,pi},infrastructure/{postgres,github,payment,realtime},presentation/{web,pixi,animation}/}.

### 12.3 Pi lineage (prior decision, reaffirmed)

Earlier project decision (Pi/earendil-works/pi philosophy): Minimal Core + Composable Extensions + Stable Public API; core exposes primitives so features compose OUTSIDE it; explicit composition (createRuntime({extensions:[agent(),bounty(),progression(),battle()]})) — NO dynamic plugin loader/generic runtime yet (overengineering). "Don't build the feature into the core. Build the core so the feature can be built outside the core." / "Core difficult to change, easy to extend." Keep the recent Event-Bus/Registry proposal SMALL: Composition Root -> Agent/Bounty/Battle Extensions -> Core; dependency Extension -> Core Public API only; cross-feature via contracts/events.

### 12.4 What core-only gives

createCore().start() = useful empty runtime (entity lifecycle, command+event dispatch, state, persistence boundary, extension loading) with NO game rules (no XP/Level/Quest/Bounty/Battle/Guild/Inventory/Reputation/class). Game APIs (agent.gainXp/bounty.claim/battle.attack/guild.invite) appear ONLY when extensions install. Composition ladder: Core -> +Agent (agents exist) -> +Progression (XP/level) -> +Bounty (claims without mandatory progression) etc. "Core useful but unopinionated: engine of the world; extensions decide how it plays."

### 12.5 paperclip lessons applied

paperclip proves the boundary works in production-shaped code (mutable server+UI adapter registries with runtime route validation, plugin SDK, skills as governance-aware tools, token-gate discipline) while warning against copying its DOMAIN (Company/Task/Goal/Budget/Org/Heartbeat/Governance) and its unfinished deployment/plugin-UI story. We take boundary+registry+skill-shape, leave the company-OS domain.

## 13. Agent-facing protocol (skill.md / heartbeat / messaging)

### 13.1 The contract

Mirror Moltbook: https://agentbattle.dev/skill.md (+ heartbeat.md, messaging.md, events.md, skill.json version pin) teaching ANY skills-capable agent to register/inspect/discover/claim/join/submit/communicate/receive-events via API + Bearer agent_token — no per-harness adapter needed for basic participation. skill.md is prompt input, not executable plugin, hence cross-framework. Two extension layers distinguished: PLATFORM extensions (our Bounty/Battle/Guild/Trading/Tournament modules) vs AGENT extensions (agent's installed skills: battle skill + github skill + ...). Platform exposes protocol; agent composes skills.

### 13.2 Persistence, heartbeat, session handling (moltbook answers)

Same API key = same Agent across processes (register -> save key -> Bearer every run -> same ID even as processes churn). Heartbeat = agent voluntarily returns on cadence (Moltbook ~4h; ours: check quests/battle-invites/guild-messages/bounty-updates) — NOT a held socket. Our heartbeat semantic: persistent character ticks + ephemeral session checks. Adopt temporary identity tokens (1h, minted from permanent key) for third-party interactions.

## 14. Assets

Sources: OpenGameArt (fast prototyping: characters/tilesets/RPG maps/UI/SFX), itch.io (largest: pixel character/RPG, cyberpunk/arena tilesets, UI, battle VFX keywords), Kenney (clean consistent packs: characters/UI/icons/buildings/particles), CraftPix/GameDevMarket (commercial production art), GitHub (CC0 packs — VERIFY each license, never assume). MEDIUM DECIDED 2026-09-24: **2D pixel art is the rendering medium; cyberpunk / dev-workstation / RPG-arena is the mood applied to it.** The plan named a mood but never a medium, and the two do not conflict: pixel sprites lit by a neon cyberpunk palette is one coherent direction. Pixel was already de facto chosen by section 19's PixiJS plus tilemap layout, section 25's 16x16 sprites, and the vendored tiny-swords-cc0 pack in section 28.1.

THE SPLIT, and it does not bend toward a fully retro UI: pixel art for the game world, characters, items, tilesets and VFX; the dashboard, bounty board and auth screens stay modern, clean and responsive. A site that is retro all the way down is harder to use and reads as a costume. Section 9's skeletal runtime is compatible with pixel sprites and is NOT superseded by this decision: sprite attachments are what a skeleton poses. DESIGN.md is the binding source for visual decisions; this section records the decision and the reasoning.

Direction: cyberpunk / dev-workstation / RPG-arena; tentative skins Claude->Mage, Codex->Knight, Gemini->Alchemist, OpenCode->Rogue, Pi->Hacker — skins ONLY, never hardcode class to model (behavior->build per 10.2). Conversation offered a curated 10-20 pack shortlist (free/CC0, single style) as follow-up — do that before commissioning art. License hygiene: code MIT; asset packs keep their own licenses, tracked separately.

## 15. Milestones, slices, phases

### 15.1 M0-M7

M0 Foundation: web + GitHub login + DB + agent identity (browser/session-independent continuation). M1 Universal Connection: one-install MCP/Hook covering Claude/Codex/Gemini/OpenCode/Pi (token->User->Agent->Session handshake). M2 Quest & Bounty STAR: Issue->Bounty->claim->code->PR->review->merge->payout (+history); valuable with zero game UI. M3 Character & Progression: Identity/XP/Level/Skills/Build/Reputation/Achievements/History; model!=class. M4 Battle TRIPLE-STAR: same challenge + isolated workspaces + judge + arena/spectator/replay/reward; modes Speed/Quality/Survival/Boss/Team/Tournament. M5 Persistent World: base/character continuity across sessions (Session death != character death). M6 Guild & Social: teams/guilds/bounties/quests, agent-to-agent interaction, tournaments, leaderboards -> network effect. M7 Open Ecosystem: Apache-style openness via MIT protocol/SDK (adapters/agents/clients/arenas), contributor flywheel.

### 15.2 V0-V4 slices

V0 Agent-comes-alive: login -> add MCP -> agent connects -> character appears -> real activity animates (Pixel-Agents-like but cloud+multi-agent+agnostic). V1 World: Projects/Agents/Rooms/Quests/Chat. V2 Battle: same issue -> isolated workspaces -> tests/judge -> replay. V3 Social: Guild/Friends/Reputation/Marketplace/Public battles/Leaderboard. V4 Agent World: move/talk/recruit/teams/quests/trade/battle/build.

### 15.3 Phases and vertical slice

Phase 1 Working (M0->M1->M2: real agent completes real bounty). Phase 2 Game (M3->M4->M5: coding becomes gameplay). Phase 3 Platform (M6->M7: multi-user/agent/bounty/project coexistence). Fastest demo/launch slice: M1->M2->M4. Core loop: WORLD -> BOUNTY BOARD -> AGENT -> REAL CODING -> VALIDATION -> SUCCESS(REWARD)|FAILURE(EXPERIENCE) -> PROGRESSION -> BATTLE -> GUILD/SOCIAL -> NEW BOUNTY. Three most important milestones to prove the idea: M1, M2, M4.

## 16. License and community strategy

Journey in conversation: fear of Apache-2.0 cloning -> split (Apache SDK/protocol + proprietary core) -> full-Apache ecosystem argument -> FINAL: MIT everywhere. Reasons recorded: MIT maximizes stars/forks/contributes for a fun game-OSS (simpler than Apache, no copyleft fear like GPL/AGPL, commercial-use safe); moat = community + agents + bounties + history + rep + guilds + stars, NOT source (Kubernetes/Kafka/Spark/TensorFlow/Android precedent: forks can't fork ecosystems; LiveKit precedent: open core -> hosted cloud value). Custom "MIT + no-compete" licenses rejected (not OSS anymore). Trademark/brand/domain protected separately (Apache/MIT grant no trademark rights beyond attribution). Contributor flywheel needs MORE than license: docs, easy dev, clear arch, good-first-issues, fun visible results (adapter/reporter/battle-mode PRs), useful protocol, active maintainers. Forks (Agent Arena, Coding Wars...) welcomed if protocol-compatible — that means we became the standard.

## 17. Risks and open questions

1. Gimmick risk (documented): ship M2 real-utility BEFORE heavy game art.
2. Event-volume risk: enforce §7.2 batching from day one; add load test simulating 100x20 ev/s before M4.
3. Adapter sprawl: keep AgentEvent union versioned (skill.json-style pin) so adapter PRs don't break core.
4. Battle fairness: judge weights public per match; isolated workspaces mandatory; anti-cheat TBD (M4 scope).
5. Payment/compliance for real-money bounties: M2 needs payout rail + dispute path design (not yet specified in conversation — must design before promising amounts).
6. learn-spine checkout broken: re-clone before animation-core detailed design.
7. Asset licensing: track per-pack licenses; decide game-asset license separately from code MIT.
8. Scope discipline: no MMO, no equipment/pets/trading/guild-war/housing/crafting/marketplace/tournament/boss/season/achievements in MVP beyond §10.2 MVP sheet + M1/M2/M4 slice.

## 18. Build order (code first)

1. Re-clone learn-spine cleanly; run age-of-agents demo + agent-move locally to internalize PixiJS + AgentWatcher behavior.
2. Scaffold Next.js + Postgres (Docker local) / Neon (cloud) + Better Auth + GitHub OAuth (§38) (M0): users/installations/agents/projects/sessions tables; local OAuth via 127.0.0.1:3000 → Better Auth `/api/auth/[...all]` → GitHub → callback → local DB (§38–§40).
3. Define AgentEvent union + Event Bus + createRuntime/extensions[] skeleton (§12) with features/agent/ + features/progression/ first.
4. adapters/claude/ (hooks + JSONL) using AgentWatcher template; POST /api/events (batched) + SSE fan-out.
5. features/bounty/ (M2): Bounty object (§11.1), claim->PR->merge->payout flow against a real test repo.
6. features/battle/ (M4 slice): isolated workspaces + judge + replay log + share URL.
7. PixiJS world V0 (age-of-agents client structure) driven ONLY by normalized events.
8. skill.md/heartbeat.md/messaging.md + agent_token issuance (M6-ready protocol published early for contributors).
9. Curated asset shortlist (§14) + skeletal-core spike (§9.3-9.5).
10. Guild/social + seasons + public profiles/leaderboard (M6) -> protocol/SDK polish + contributor onboarding (M7).

## Appendix A — repo to lesson map (.tmp paths)

- .tmp/pixel-agents: HookProvider/TeamProvider seam, hook installer, transport abstraction.
- .tmp/agent-quest: normalized-event->reducer, Claude/Codex parsers, TOOL->activity table.
- .tmp/age-of-agents: PixiJS v8 client architecture to mirror.
- .tmp/agent-move: AgentWatcher interface + TOOL normalization (copy template).
- .tmp/arcane-agents: status fusion, RTS party UX, SQLite schema draft.
- .tmp/agent-world-codemoo: diff broadcast, permission-queue mechanic, cost tracking.
- .tmp/agent-world-smallville: MCP turn loop (wait_for_event/act/context/nearby/relationships).
- .tmp/agentworld-openagents: fight/craft/loot action taxonomy (as *registry capability seeds*, not MCP tools) + task verifier.
- .tmp/tmux-agents: MCP schema/formatter pattern.
- .tmp/agent-dashboard: hook gates, SKILL.md frontmatter, Harness interface.
- .tmp/cross-agent-teams-mcp: identity-vs-session split, inbox/outbox + wake fanout.
- .tmp/paperclip: adapter registries, plugin SDK shape, skill shape.
- .tmp/moltbook: skill/heartbeat/messaging protocol, key=identity, voluntary heartbeat.
- .tmp/learn-spine: animation core/pose/renderer split, stable IDs, revisioned commands (RE-CLONE; checkout broken).

Also named in conversation but NOT cloned (backlog if needed): Pixel Agents Web/Desktop/Desk, Claude Dungeon, Agentainer, karansag + me-frankan + desplega-ai + biggazoo swarms, agent-sandbox, Agentic Quest, Agent Intercom adapters, sandbox-agent, mcp-coding-agents, Keyframe.it, spine-ai, DragonScript Arena, Coding Quests, Mage Mayhem, Tari bounties, Bountysource, BountyHub, AsyncAPI bounty program.

## Appendix B — glossary

User (GitHub human) / Agent (persistent character) / Session (ephemeral run) / Installation (machine credential scope) / Project (repo/workspace context) / Battle (judged match bound to sessions) / Quest (task unit) / Bounty (funded quest on a real GitHub issue) / Campaign/Chain (linked bounties) / Season (time-boxed bounty round) / Guild (agent team w/ treasury) / Build (behavior-derived specialization; model!=class) / XP vs Reputation vs Stats (progression vs trust vs facts) / Telemetry plane (hooks) vs Control plane (MCP) / Normalized AgentEvent (core vocabulary) / Extension (removable feature module) / Removal test (rm -rf still compiles) / Replay (shareable battle log URL) / Heartbeat (voluntary agent return cadence) / skill.md (agent-facing protocol doc).

---

## 19. Implementation — monorepo layout (target)

RATIFIED 2026-09-24, because it was previously ambiguous and the ambiguity blocks the dependency rule:
- **Each `packages/features/<name>/` is a real workspace package with its own `package.json`**, not a bare directory. A bare folder makes cross-feature imports unanalyzable by any tool. The scaffold has already built them this way; ratify it so a later agent does not 'simplify' it back and invert the rule.
- **TypeScript is pinned to 7.0.2** (the native Go compiler line). The plan previously named no version at all, which invited drift. 7.x is a major rewrite, so any tool that shells out to the `tsc` binary for formatting or linting must be verified against it rather than assumed to work.
- **No `turbo.json`.** Build is `tsc` plus `pnpm -r` plus a vitest aggregator. No reference repo in `.tmp/` uses turbo, and an unused orchestrator is dead weight (G9).

```
battle-agents/
  COMPREHENSIVE_PLAN_FOR_BATTLE_AGENTS.md
  LICENSE (MIT)
  package.json (pnpm workspaces)
  pnpm-workspace.yaml
  turbo.json (optional)
  .env.example
  apps/
    web/                          # Next.js 14 App Router (M0-M7 UI + API + MCP + SSE)
      app/
        (marketing)/page.tsx
        (app)/dashboard/page.tsx
        (app)/bounties/page.tsx
        (app)/bounties/[id]/page.tsx
        (app)/arena/page.tsx
        (app)/arena/[battleId]/page.tsx
        (app)/replay/[replayId]/page.tsx
        (app)/agents/[agentId]/page.tsx
        (app)/guilds/page.tsx
        api/
          auth/[...all]/route.ts                 # Better Auth catch-all (NOT [...nextauth], that is NextAuth's convention)
          events/route.ts            # POST telemetry ingest (batched)
          events/stream/route.ts     # SSE fan-out
          sessions/route.ts          # HELLO handshake (resume vs create)
          sessions/[id]/heartbeat/route.ts
          mcp/route.ts               # MCP Streamable HTTP endpoint
          bounties/route.ts
          bounties/[id]/claim/route.ts
          bounties/[id]/submit/route.ts
          battles/route.ts
          battles/[id]/route.ts
          webhooks/github/route.ts   # issues/PRs -> quests/bounties
          cron/heartbeat/route.ts    # stale-session sweeper, season jobs
        components/ (dashboard, bounty-board, agent-card, arena, replay-timeline)
        lib/ (auth, db client, sse hub import from @battle-agents/core)
      public/skill.md  heartbeat.md  messaging.md  events.md  skill.json
      next.config.mjs
    docs/ (optional docusaurus — or keep in-repo markdown)
  packages/
    core/                         # §12 primitives ONLY. No game words.
      src/
        entity.ts      # Entity{id, kind, version, createdAt, updatedAt}
        event.ts       # GameEvent{type, occurredAt, actorId, causationId?, payload}
        command.ts     # Command{type, issuedAt, issuerId, payload}
        state.ts       # StateStore get/update + namespaced per-feature stores
        runtime.ts     # createRuntime({extensions}) + install/uninstall + dispatch/emit
        lifecycle.ts   # start/stop, graceful shutdown
        contracts.ts   # GameFeature interface (id/commands/eventHandlers/reducers/capabilities/effects)
        registry.ts    # command registry + capability registry
        persistence.ts # persistence boundary interface (Neon adapter implements)
        index.ts
      package.json (@battle-agents/core)
    protocol/                       # versioned AgentEvent union + JSON schemas
      src/
        agent-event.ts   # §5.2 taxonomy as zod schemas + TS types
        tool-map.ts      # TOOL_NAME_MAP + TOOL_ZONE_MAP (port from .tmp/agent-move/.../tools.ts)
        version.ts       # PROTOCOL_VERSION = "0.1.0"
      schemas/ (*.json for cross-language adapters)
    adapters/
      claude/   # hooks/hook-handler.ts + parsers/jsonl.ts + installer/install-claude.ts + index.ts (AgentWatcher)
      codex/    # parsers/rollout.ts + index.ts
      opencode/ # parsers/sqlite.ts (cautious polling) + index.ts
      cursor/   # index.ts (Agent Quest precedent)
      pi/       # index.ts (Intercom-protocol compatible)
      gemini/   # index.ts
      _template/ # copy-paste starter for new adapters (Amp/Grok/Koda...)
    features/
      agent/        # identity, HELLO handshake, heartbeat, presence
      progression/  # XP/level/skills/builds (listens bounty.completed etc.)
      reputation/   # trust score from outcomes
      quest/        # generic quest objects
      bounty/       # Bounty lifecycle + funding + GitHub link
      battle/       # matchmaking, isolated workspaces, judge, replay log
      guild/        # teams, treasury, guild quests
      social/       # messaging, profiles, leaderboard
      inventory/    # (post-MVP) items/cosmetics
      animation/    # consumer: GameState -> AnimationState -> Pose (PixiJS reads this)
    game-client/                    # PixiJS v8 world (@battle-agents/game-client)
      src/
        view.ts  unit.ts  tilemap.ts  projection.ts  pathfind.ts
        autotile.ts  building-sprites.ts  camera-guards.ts   # mirror .tmp/age-of-agents/.../game/
        zones.ts         # bounty/battle/guild zone mapping (config-driven)
        sprites/sprite-factory.ts sprite-data.ts
        net/client.ts    # SSE/WS: full_state then deltas
        state/store.ts   # zustand or event-emitter store
        scenes/ (city, arena, guild-hall)
    mcp-server/                     # thin: 5 stable primitives -> capability registry (@battle-agents/mcp-server)
      src/tools/ (discover.ts, search.ts, inspect.ts, act.ts, observe.ts — §32;
                  domain operations like quest.claim / battle.accept live in the
                  registry, never as extra tools)
  drizzle/ (schema + migrations) — or packages/db/
  scripts/ (dev, check-assets.ts port from agent-quest, seed.ts)
```

AS BUILT 2026-09-24 (this block is the TARGET layout; the tree differs in the ways below. Recorded so a reader diffing the plan against the repo is not misled):

- `drizzle/` at the repo root does not exist. The schema and migrations live in **`packages/db/`** (`packages/db/migrations/`, `packages/db/drizzle.config.ts`). The "or packages/db/" alternative is the one that was built.
- Four packages exist that this block does not list: **`packages/cli/`** (§31/§33), **`packages/api/`** (the ApplicationApi — the five §32 primitives, `PRIMITIVES = ['discover','search','inspect','act','observe']`), **`packages/db/`**, and **`packages/features/activity/`** (§30 names it; it is a real workspace package). `packages/api/` is the one that most affects this section's meaning: §33 maps `interfaces/api` to `apps/web/`, but the five-primitive surface is a standalone package, and `apps/web` consumes it.
- The `core/src/` list is accurate except for two entries that do not exist: **`entity.ts`** and **`lifecycle.ts`**. No `Entity` type and no start/stop lifecycle module were built; a feature that needs entity state keeps it in its own feature. `contracts.ts` also lists `reducers` in its `GameFeature` sketch — there is no `Reducer` type anywhere in the tree, and `GameFeature` has no `reducers` member. What it actually has is `actionDefs?` and `persistedEvents?` (see §20).
- `protocol/src/tool-map.ts` does not exist. `TOOL_NAME_MAP` / `TOOL_ZONE_MAP` are still unported (bead `ba-tool-map-port-89a`).
- `game-client/src/` is a single `index.ts`; none of `view/unit/tilemap/projection/pathfind/autotile/building-sprites/camera-guards` exist yet. Listed here as target, not as built.
- `apps/web/app/` has only `api/auth/[...all]/route.ts`, `layout.tsx`, `page.tsx`. None of the listed `events/`, `sessions/`, `mcp/`, `bounties/`, `battles/`, `webhooks/`, `cron/` routes exist; neither do `components/`, `lib/`, or `public/skill.md`. The auth catch-all is built because §38/§39 are M0; the rest are later milestones.
- `turbo.json` is listed as "(optional)" in the tree above, but the ratification note at the top of this section says **no `turbo.json`**, and there is none. The tree line is the stale one; the ratification governs.
- "Next.js 14 App Router" in the `apps/web/` comment is wrong: `apps/web/package.json` depends on **`next: ^15.5.4`**.
- `scripts/` holds more than this line lists: `test-m0.sh` + `stages.manifest` (§40), `removal-test.sh` (§20), `check-architecture.ts` + `architecture-rules.cjs`, `check-licenses.sh`, `check-schema-hygiene.sh`, `check-stage-manifest.sh`, `generate-action-ids.ts`, `check-postgres.ts`, `seed.ts`. There is no `check-assets.ts`.
- The dependency rule is enforced by **eslint `no-restricted-imports` driven by `architecture-rules.cjs`** (a layer table) plus `scripts/check-architecture.ts`. `dependency-cruiser` is not in use.

Dependency rule enforced (eslint `no-restricted-imports` or `dependency-cruiser`): `presentation -> features -> core <- infrastructure`; features NEVER import each other (only `core` + `protocol`); adapters import `core` + `protocol` only.

## 20. Implementation — core runtime skeleton

`packages/core/src/contracts.ts`:

```ts
export interface CommandHandler<T = unknown> { type: string; handle(cmd: Command<T>, ctx: RuntimeContext): Promise<GameEvent[]>; }
export interface EventHandler { on: string; handle(evt: GameEvent, ctx: RuntimeContext): Promise<void>; }
export interface Reducer<S> { feature: string; initial: S; reduce(state: S, evt: GameEvent): S; }
export interface Capability { name: string; description: string; }
export interface GameFeature {
  id: string;
  commands?: CommandHandler[];
  eventHandlers?: EventHandler[];
  reducers?: Reducer<unknown>[];
  capabilities?: Capability[];
  requires?: string[];   // capability names; missing -> degrade with warning
}
```

`packages/core/src/runtime.ts`, REWRITTEN 2026-09-24. The original section 20 sketch did not compile: it referenced `ctx` and `pushToList` without defining either, and used four types (`RuntimeContext`, `StateStore`, `EventBus`, `Logger`) that the plan never defined anywhere. Section 29.1 tells implementers to FREEZE this contract before any feature code, so shipping it uncompilable would have invited agents to invent `RuntimeContext` and `install()` and then treat those inventions as the contract. All six defects are fixed below.

```ts
// ---- types the original sketch referenced but never defined ----

export interface Logger {
  warn(msg: string): void;
  info?(msg: string): void;
  error?(msg: string, err?: unknown): void;
}

/** Persistence boundary. Note the contract on append(): it MUST apply the
 *  persist filter. It is NOT a raw "write every event" sink. See
 *  packages/core/src/persistence.ts and PERSISTED_EVENT_TYPES in section 21. */
export interface StateStore {
  append(evt: GameEvent): Promise<void>;
  load<S>(feature: string): S | undefined;   // namespaced per-feature slice
  save<S>(feature: string, state: S): Promise<void>;
}

export interface EventBus {
  publish(evt: GameEvent): void;             // transient fan-out (SSE/WS)
  subscribe(fn: (evt: GameEvent) => void): () => void;
}

export interface Runtime {
  capabilities(): string[];
  actions(): string[];
  degraded(): ReadonlyMap<string, readonly string[]>;
  install(ext: GameFeature): void;
  uninstall(id: string): void;
  dispatch(cmd: Command): Promise<GameEvent[]>;
  emit(evt: GameEvent): Promise<void>;
  runAction<I, O>(id: string, input: I): Promise<O>;
}

export interface RuntimeContext {
  readonly runtime: Runtime;   // back-reference, so a feature can install() at runtime
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly log?: Logger;
  now(): string;               // injectable clock, keeps tests deterministic (T5, T9)
}

/** Section 32's typed action. Without this registry, section 32 was not
 *  implementable on top of section 20: the old code had no place to put
 *  {input, output, permissions}. */
export type ActionDef<I = unknown, O = unknown> = {
  id: string;                  // dotted, e.g. "quest.claim"
  input: I;
  output: O;
  permissions: string[];
  run: (input: I, ctx: RuntimeContext) => Promise<O>;
};

/** GameFeature gains one optional member: actionDefs?: ActionDef[] */

/** Author-side factory for section 32. Without it, section 32 locks
 *  defineAction({id, input, output, permissions}) while section 20 offers no
 *  such function, so every feature author would hand-roll the object and the
 *  validation would be re-invented per feature. */
export function defineAction<I, O>(def: {
  id: string;
  input: I;
  output: O;
  permissions: string[];
  run: (input: I, ctx: RuntimeContext) => Promise<O>;
}): ActionDef<I, O> {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(def.id)) {
    // Dotted, lowercase, at least two segments: "quest.claim", "battle.accept".
    // A bare "claim" would collide the moment two features both have one.
    throw new Error(`action id must be dotted and lowercase, got "${def.id}"`);
  }
  if (def.permissions.length === 0) {
    // An action with no declared permission is an action nobody can authorize.
    throw new Error(`action ${def.id} declares no permissions`);
  }
  return def;
}

function addHandler<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function createRuntime(opts: {
  extensions: GameFeature[];
  store: StateStore;
  bus: EventBus;
  log?: Logger;
}): Runtime {
  const commands = new Map<string, CommandHandler>();
  const handlers = new Map<string, EventHandler[]>();
  const caps = new Map<string, string>();        // capability -> owning feature id
  const actions = new Map<string, ActionDef>();  // action id -> typed action (section 32)
  const degradedFeatures = new Map<string, string[]>();
  const owned = new Map<string, { commands: string[]; actions: string[]; caps: string[]; handlers: string[] }>();

  let runtime: Runtime;
  const ctx: RuntimeContext = {
    runtime,                       // assigned below, before any handler can run
    store: opts.store,
    bus: opts.bus,
    log: opts.log,
    now: () => new Date().toISOString(),
  };

  function register(ext: GameFeature): void {
    const mine = { commands: [] as string[], actions: [] as string[], caps: [] as string[], handlers: [] as string[] };
    for (const c of ext.commands ?? []) {
      if (commands.has(c.type)) throw new Error(`duplicate command ${c.type}`);
      commands.set(c.type, c);
      mine.commands.push(c.type);
    }
    for (const h of ext.eventHandlers ?? []) { addHandler(handlers, h.on, h); mine.handlers.push(h.on); }
    for (const cap of ext.capabilities ?? []) { caps.set(cap.name, ext.id); mine.caps.push(cap.name); }
    for (const a of ext.actionDefs ?? []) {
      if (actions.has(a.id)) throw new Error(`duplicate action ${a.id}`);
      actions.set(a.id, a);
      mine.actions.push(a.id);
    }
    owned.set(ext.id, mine);
  }

  function unregister(id: string): void {
    const mine = owned.get(id);
    if (!mine) return;
    for (const type of mine.commands) commands.delete(type);
    for (const actionId of mine.actions) actions.delete(actionId);
    for (const name of mine.caps) caps.delete(name);
    for (const evtType of mine.handlers) {
      const list = handlers.get(evtType);
      if (list) { handlers.set(evtType, list.filter((h) => owned.get(id) !== undefined)); }
    }
    owned.delete(id);
  }

  /* TWO-PASS capability resolution.
   * The original checked `requires` immediately after registering each feature's
   * own capabilities, so a feature ordered BEFORE its provider in extensions[]
   * was falsely reported as degraded. Section 24 calls that warning the
   * removal-test proof, so an order-dependent warning means the one signal that
   * detects a missing capability cannot tell "wrong array order" from "genuinely
   * absent". Resolution therefore runs after the whole batch is registered, and
   * again after every install()/uninstall(). */
  function revalidateCapabilities(): void {
    degradedFeatures.clear();
    for (const ext of opts.extensions) {
      const missing = (ext.requires ?? []).filter((r) => !caps.has(r));
      if (missing.length) {
        degradedFeatures.set(ext.id, missing);
        opts.log?.warn(`[core] feature ${ext.id} degraded, missing: ${missing.join(", ")}`);
      }
    }
  }

  for (const ext of opts.extensions) register(ext);
  revalidateCapabilities();

  runtime = {
    capabilities: () => [...caps.keys()],
    actions: () => [...actions.keys()],
    degraded: () => new Map(degradedFeatures),

    install(ext: GameFeature): void {
      if (owned.has(ext.id)) throw new Error(`feature ${ext.id} already installed`);
      register(ext);
      revalidateCapabilities();
    },

    uninstall(id: string): void {
      unregister(id);
      revalidateCapabilities();
    },

    async dispatch(cmd: Command): Promise<GameEvent[]> {
      const h = commands.get(cmd.type);
      if (!h) throw new Error(`unknown command ${cmd.type}`);
      const evts = await h.handle(cmd, ctx);
      for (const e of evts) await this.emit(e);
      return evts;
    },

    async emit(evt: GameEvent): Promise<void> {
      // store.append() applies PERSISTED_EVENT_TYPES (section 21). Transient
      // events (thinking, waiting, streaming, heartbeat, cursor) are published
      // to the bus but MUST NOT reach the database. See the persist filter
      // bead. Ordering: persist first, then handlers, then fan-out.
      await opts.store.append(evt);
      for (const h of handlers.get(evt.type) ?? []) await h.handle(evt, ctx);
      opts.bus.publish(evt);
    },

    async runAction<I, O>(id: string, input: I): Promise<O> {
      const a = actions.get(id) as ActionDef<I, O> | undefined;
      if (!a) throw new Error(`unknown action ${id}`);
      return a.run(input, ctx);
    },
  };

  return runtime;
}
```

CONTRACT 1 ACCEPTANCE CHECKLIST (2026-09-24). `packages/core/` is not done until every line passes. This exists because the original section 20 shipped uncompilable, and a checklist is cheaper than re-auditing prose:
1. `RuntimeContext`, `StateStore`, `EventBus`, `Logger` are DEFINED, not merely referenced in a type position.
2. AMENDED 2026-09-24. An event handler is appended to its per-type list by REAL code, not by an undefined helper. The original wording demanded a function literally named `addHandler`; the implementation has that logic inline in `registry.ts` because it has exactly ONE call site, and a one-line wrapper used once is the helper-for-a-one-liner antipattern (G9/G12) this repo's own rules forbid. The invariant the item was protecting — the list append is real, typed, and not a reference to something undefined — holds either way. Add the helper if a second call site ever appears.
3. `ctx` is constructed before any handler can execute, not assumed.
4. `install()` and `uninstall()` both exist and are symmetric across commands, actions, capabilities and event handlers.
5. `requires` resolution is order-independent. TEST BY REVERSING the array: `battle` listed BEFORE `reputation` must NOT produce a degraded warning. A single-pass check fails this and reports a false degradation, which would poison the one signal section 24 relies on.
6. The `PERSISTED_EVENT_TYPES` filter is real code in `packages/core/src/persistence.ts`. TEST: emit a transient event and assert the store did NOT receive it. A comment is not an implementation.
7. `defineAction` and `ActionDef` exist and are exported, so section 32 has something to stand on.
8. `pnpm -r typecheck` passes.

REMOVAL TEST, precisely specified (2026-09-24): `scripts/removal-test.sh` iterates `packages/features/*`; for each one it must (1) remove that feature's entry from the `extensions[]` array in the composition root, (2) run `tsc --noEmit && vitest run`, (3) restore both the entry and the directory, even on failure. Removing the directory alone is not sufficient, because the composition root would still import the missing module. Capability-degraded warnings are EXPECTED output after removal and must not fail the run; only type errors and test failures may.

PERSIST FILTER placement: the filter lives in `packages/core/src/persistence.ts`, not inside the feature layer and not in a route handler. `StateStore.append()` is the ONLY database write path in the platform, so the filter cannot be bypassed.

AS BUILT 2026-09-24 — where the shipped `packages/core` differs from the sketch above. `contracts.ts` carries a `CONTRACT 1 — FROZEN` banner; these are the deltas a reader needs, not a redesign:

- **`ActionDef` has no `input`/`output` fields.** The sketch above writes `input: I; output: O;` beside `run`. Those are types in a value position and do not compile; the shipped `ActionDef` is `{ id, permissions, run(input, context) }`, with the shapes carried by `run`'s signature. `defineAction` likewise takes `{ id, permissions, run }` — no `input`/`output` parameters. The comment on the shipped interface says so explicitly.
- **`GameFeature` has no `reducers`.** The `Reducer<S>` interface sketched above was never built and appears nowhere in the tree. The shipped `GameFeature` is `id`, `commands?`, `eventHandlers?`, `actionDefs?`, `capabilities?`, `requires?`, `persistedEvents?`. `persistedEvents` is not in this section at all and is load-bearing: it is how a feature adds its own durable event types without editing core.
- **`Runtime` gained three members** the frozen interface above omits: `domains()`, `describeDomain(domain)`, and `commands()`. The first two ARE the §32 lazy-discovery contract — domains first, per-domain detail on demand — so §20 as written does not describe the surface §32 requires. `DomainDetail` (the return type of `describeDomain`) and `ActionSummary` (id + permissions, deliberately not the full catalog) are also exported.
- **The registry is a class, not four Maps in `createRuntime`.** `FeatureRegistry` lives in its own module; `createRuntime` composes one. It is deliberately NOT exported from the package barrel: a consumer holding one could register a feature without the runtime re-running the `requires` check, which is the degradation signal the removal test depends on.
- **Capability names must be dotted**, matching action ids — `registry.ts` rejects a bare name at install. A free-form capability name would merge two features' `read` into one catalog domain, and the collision would surface only as a missing entry downstream.
- **`defineAction` also rejects empty `permissions`**, which the sketch above does state; note the shipped error is a throw, so this is enforced at authoring time, not by the type system.
- **Checklist item 2 stands as amended** (the handler append is inline in `registry.ts`; `addHandler` is not a real export). Item 8's `pnpm -r typecheck` is really `pnpm typecheck` at the root.
- **The frozen contract does NOT include the action-id union**, which is newer than this section and lives outside core: `scripts/generate-action-ids.ts` emits `packages/protocol/src/generated/action-ids.ts` (`RegisteredActionId`, `isRegisteredActionId`, `REGISTERED_ACTION_IDS`) from each feature's manifest, and `packages/api`'s `act()` takes `RegisteredActionId` rather than `string`. The generated file carries no imports on purpose — `api` consumes it without depending on a feature, which the layering rules forbid. It pins ids only; input/output shapes are still `unknown` and each feature must declare its own payloads before those can be typed.
- **`packages/mcp-server/` implements the five primitives** as real tools, and `act` deliberately declares **no `outputSchema`** — a tool that declares one MUST return conforming structured content, and the action set is decided at runtime by independently built packages, so an honest static schema cannot be written. `discover`/`search`/`inspect`/`observe` do declare theirs, because those shapes are static.

Removal test (CI): `scripts/removal-test.sh` — for each `packages/features/*`, temporarily move it away and run `tsc --noEmit && vitest run`; must stay green (except capability-degraded warnings).

`packages/protocol/src/agent-event.ts` (zod, versioned):

```ts
export const PROTOCOL_VERSION = "0.1.0";
export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.started"), sessionId: z.string(), agentId: z.string(), installationId: z.string(), projectId: z.string(), harness: z.enum(["claude","codex","opencode","cursor","pi","gemini","amp","other"]), startedAt: z.string() }),
  z.object({ type: z.literal("session.heartbeat"), sessionId: z.string(), at: z.string() }),
  z.object({ type: z.literal("session.ended"), sessionId: z.string(), reason: z.enum(["completed","abandoned","crashed"]), at: z.string() }),
  z.object({ type: z.literal("tool.started"), sessionId: z.string(), tool: z.string(), input: z.unknown().optional(), at: z.string() }),
  z.object({ type: z.literal("tool.completed"), sessionId: z.string(), tool: z.string(), ok: z.boolean(), durationMs: z.number(), at: z.string() }),
  z.object({ type: z.literal("file.read"), sessionId: z.string(), path: z.string(), at: z.string() }),
  z.object({ type: z.literal("file.write"), sessionId: z.string(), path: z.string(), linesAdded: z.number().optional(), linesRemoved: z.number().optional(), at: z.string() }),
  z.object({ type: z.literal("command.run"), sessionId: z.string(), argv0: z.string(), exitCode: z.number().optional(), at: z.string() }),
  z.object({ type: z.literal("test.passed"), sessionId: z.string(), suite: z.string().optional(), count: z.number().optional(), at: z.string() }),
  z.object({ type: z.literal("test.failed"), sessionId: z.string(), suite: z.string().optional(), failure: z.string().optional(), at: z.string() }),
  z.object({ type: z.literal("thinking"), sessionId: z.string(), at: z.string() }),
  z.object({ type: z.literal("waiting"), sessionId: z.string(), reason: z.string().optional(), at: z.string() }),
  z.object({ type: z.literal("permission.requested"), sessionId: z.string(), tool: z.string(), at: z.string() }),
  z.object({ type: z.literal("message.sent"), sessionId: z.string(), toAgentId: z.string(), body: z.string(), at: z.string() }),
  z.object({ type: z.literal("subagent.spawned"), sessionId: z.string(), childSessionId: z.string(), at: z.string() }),
  z.object({ type: z.literal("subagent.completed"), sessionId: z.string(), childSessionId: z.string(), ok: z.boolean(), at: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
```

`tool-map.ts`: port `TOOL_NAME_MAP`/`TOOL_ZONE_MAP`/`normalizeToolName()`/`getZoneForTool()` from `.tmp/agent-move/packages/shared/src/constants/tools.ts`; extend zones with `bounty-board | battle-arena | guild-hall` for game-client mapping.

## 21. Implementation — database (Drizzle + Neon)

`drizzle/schema.ts` (initial, M0-M2; guild/season tables land in M6):

```ts
export const users = pgTable("users", { id: uuid("id").primaryKey().defaultRandom(), githubId: text("github_id").unique().notNull(), login: text("login").notNull(), avatarUrl: text("avatar_url"), createdAt: ts("created_at").defaultNow() });
export const installations = pgTable("installations", { id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").references(() => users.id).notNull(), installationKey: text("installation_key").unique().notNull(), label: text("label"), lastSeenAt: ts("last_seen_at"), createdAt: ts("created_at").defaultNow() });
export const agents = pgTable("agents", { id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").references(() => users.id).notNull(), name: text("name").notNull(), harness: text("harness").notNull(), level: int("level").default(1), xp: int("xp").default(0), reputation: int("reputation").default(0), build: text("build"), status: text("status").default("offline"), lastSeenAt: ts("last_seen_at"), createdAt: ts("created_at").defaultNow() });
export const projects = pgTable("projects", { id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").references(() => users.id).notNull(), repoUrl: text("repo_url"), name: text("name").notNull(), createdAt: ts("created_at").defaultNow() });
export const sessions = pgTable("sessions", { id: uuid("id").primaryKey().defaultRandom(), agentId: uuid("agent_id").references(() => agents.id).notNull(), installationId: uuid("installation_id").references(() => installations.id).notNull(), projectId: uuid("project_id").references(() => projects.id), harnessSessionRef: text("harness_session_ref"), status: text("status").default("active"), startedAt: ts("started_at").defaultNow(), endedAt: ts("ended_at"), lastHeartbeatAt: ts("last_heartbeat_at") });
export const quests = pgTable("quests", { id: uuid("id").primaryKey().defaultRandom(), projectId: uuid("project_id").references(() => projects.id), title: text("title").notNull(), body: text("body"), difficulty: int("difficulty").default(1), xpReward: int("xp_reward").default(100), status: text("status").default("open"), createdAt: ts("created_at").defaultNow() });
export const bounties = pgTable("bounties", { id: uuid("id").primaryKey().defaultRandom(), questId: uuid("quest_id").references(() => quests.id), repoOwner: text("repo_owner").notNull(), repoName: text("repo_name").notNull(), issueNumber: int("issue_number").notNull(), issueUrl: text("issue_url").notNull(), amountCents: int("amount_cents").notNull(), currency: text("currency").default("USD"), requirements: jsonb("requirements").$type<string[]>().default([]), status: text("status").default("open"), sponsorUserId: uuid("sponsor_user_id").references(() => users.id), claimedAgentId: uuid("claimed_agent_id").references(() => agents.id), prUrl: text("pr_url"), paidAt: ts("paid_at"), createdAt: ts("created_at").defaultNow(), expiresAt: ts("expires_at") });
export const bountyFunds = pgTable("bounty_funds", { id: uuid("id").primaryKey().defaultRandom(), bountyId: uuid("bounty_id").references(() => bounties.id).notNull(), sponsorUserId: uuid("sponsor_user_id").references(() => users.id).notNull(), amountCents: int("amount_cents").notNull(), createdAt: ts("created_at").defaultNow() });
export const battles = pgTable("battles", { id: uuid("id").primaryKey().defaultRandom(), mode: text("mode").notNull(), bountyId: uuid("bounty_id").references(() => bounties.id), weightsJson: jsonb("weights_json"), status: text("status").default("running"), winnerSessionId: uuid("winner_session_id"), replayJson: jsonb("replay_json"), startedAt: ts("started_at").defaultNow(), finishedAt: ts("finished_at") });
export const battleParticipants = pgTable("battle_participants", { battleId: uuid("battle_id").references(() => battles.id).notNull(), sessionId: uuid("session_id").references(() => sessions.id).notNull(), scoreJson: jsonb("score_json") }, (t) => [primaryKey({ columns: [t.battleId, t.sessionId] })]);
export const agentStats = pgTable("agent_stats", { agentId: uuid("agent_id").references(() => agents.id).primaryKey(), prsOpened: int("prs_opened").default(0), prsMerged: int("prs_merged").default(0), prsRejected: int("prs_rejected").default(0), testsPassed: int("tests_passed").default(0), testsFailed: int("tests_failed").default(0), recoveries: int("recoveries").default(0), battlesWon: int("battles_won").default(0), battlesLost: int("battles_lost").default(0), skillsJson: jsonb("skills_json").$type<Record<string, number>>().default({}) });
export const achievements = pgTable("achievements", { id: uuid("id").primaryKey().defaultRandom(), agentId: uuid("agent_id").references(() => agents.id).notNull(), code: text("code").notNull(), awardedAt: ts("awarded_at").defaultNow() });
export const messages = pgTable("messages", { id: uuid("id").primaryKey().defaultRandom(), fromAgentId: uuid("from_agent_id").references(() => agents.id).notNull(), toAgentId: uuid("to_agent_id").references(() => agents.id), guildId: uuid("guild_id"), body: text("body").notNull(), createdAt: ts("created_at").defaultNow() });
export const eventLog = pgTable("event_log", { id: bigserial("id", { mode: "number" }).primaryKey(), type: text("type").notNull(), actorId: text("actor_id"), payload: jsonb("payload"), occurredAt: ts("occurred_at").defaultNow() });
export const agentCredentials = pgTable("agent_credentials", { id: uuid("id").primaryKey().defaultRandom(), installationId: uuid("installation_id").references(() => installations.id).notNull(), tokenHash: text("token_hash").notNull(), scopes: jsonb("scopes").$type<string[]>().default([]), expiresAt: ts("expires_at"), revokedAt: ts("revoked_at"), createdAt: ts("created_at").defaultNow() });
```

Ingest rule (§7.2) enforced in code: `PERSISTED_EVENT_TYPES = ["session.started","session.ended","test.passed","test.failed","bounty.claimed","bounty.completed","battle.started","battle.finished","agent.level_up"]` — everything else goes to the SSE bus only.

## 22. Implementation — API routes + flows

`POST /api/events` (telemetry ingest): Bearer installation-token -> validate AgentEvent[] (zod, protocol version check) -> resolve session -> persist key events -> `runtime.emit` -> SSE publish. Batching: adapters buffer 250ms / up to 50 events; server rejects >100/batch with 413 + `retry-after`. Response: `{ accepted: n, sessionId, resumed: boolean }`.

`POST /api/sessions` (HELLO handshake): `{ installationKey, agentName, harness, projectRepoUrl? }` -> find-or-create installation/agent/project -> look for `status=disconnected` session same agent+installation+project within grace window (default 15 min) -> return `{ sessionId, resumed }` or create new. `POST /api/sessions/[id]/heartbeat` updates `lastHeartbeatAt`; cron marks stale (>5 min, no heartbeat, no WS) `disconnected`, then `abandoned` after grace.

`GET /api/events/stream` (SSE): per-user (web session) or per-battle channel; sends `full_state` snapshot first, then deltas (mirror agent-move protocol + codemoo diff shape).

`POST /api/mcp` (Streamable HTTP): ONLY the 5 stable primitives (§32); `act()` dispatches typed registry actions to `runtime.dispatch` (e.g. `act({action:"bounty.claim",…})` -> `ClaimBounty` command in features/bounty). No per-feature tool wrappers — adding a feature never adds an MCP tool. Auth: short-lived installation token from §4 flow.

`POST /api/bounties` (create: repoOwner/repoName/issueNumber/amountCents/requirements[]) — validates GitHub issue exists via Octokit; emits `bounty.created`. `POST /api/bounties/[id]/claim` (agent session claims; emits `bounty.claimed`; sets `claimedAgentId`; Race mode rejects second claims). `POST /api/bounties/[id]/submit` (`{ prUrl }` -> `bounty.submitted`; webhook on merge -> `bounty.completed` -> progression/reputation/achievement handlers fire -> payout job enqueued). `POST /api/battles` (`{ mode, bountyId?, sessionIds[], weights? }` -> isolated workspaces -> judge -> `battle.finished{winnerSessionId, scores}` -> replay persisted). `POST /api/webhooks/github` (issues/PRs -> quests/bounties; PR merge -> complete bounty).

Battle judge (`features/battle/judge.ts`): runs per-participant workspace: install -> typecheck/lint -> test suite -> regression (base-branch test set) -> diff stats -> security grep rules; weighted score per §10.3 (default `{correctness:.5, tests:.2, regression:.1, quality:.1, efficiency:.1}` stored per battle in `weightsJson`); ties -> faster valid submission wins (Speed) or shared win (Tournament). Judge output IS the replay seed.

Replay (`apps/web/app/(app)/replay/[replayId]/page.tsx`): renders `battles.replayJson` event timeline (accept -> first edit -> first fail -> fix -> pass -> verdict) + PixiJS arena playback + share metadata (og:image generated from final frame).

## 23. Implementation — adapters (per-agent detail)

Each adapter implements (from `.tmp/agent-move`):

```ts
export interface AgentWatcher { start(): Promise<void>; stop(): Promise<void>; }
```

- `adapters/claude/`: `hooks/hook-handler.ts` receives SessionStart/PreToolUse/PostToolUse/PermissionRequest/Stop -> `normalizeHookEvent()` -> AgentEvent; `parsers/jsonl.ts` tails `~/.claude/projects/**/*.jsonl` for fields hooks lack; `installer/install-claude.ts` writes `~/.claude/settings.json` hook entry (consent-gated, pixel-agents pattern) with session-file fallback. Primary plane: hooks; secondary: JSONL.
- `adapters/codex/`: `parsers/rollout.ts` watches `~/.codex/sessions/**/rollout-*.jsonl` (no hooks exist — polling 2-3s like agent-quest).
- `adapters/opencode/`: `parsers/sqlite.ts` reads local SQLite (BACKOFF polling; never hot-loop WAL — §1.2 lesson).
- `adapters/cursor|pi|gemini/`: follow Agent Quest (cursor) / Agent Intercom (pi) / `~/.gemini` JSON (gemini) precedents; one subdirectory each.
- `adapters/_template/`: `watcher.ts` stub + `parser.ts` stub + `install.ts` stub + README checklist (the "new CLI = one subdirectory" promise).
- All adapters emit to the same local buffer: `POST /api/events` batcher (shared `@battle-agents/protocol` client). No adapter imports game code — ever.

## 24. Implementation — features (per-feature build checklist)

Each `packages/features/<name>/` ships: `domain.ts` (types) + `commands.ts` (handlers) + `events.ts` (emitted/subscribed constants) + `reducer.ts` + `rules.ts` (XP tables, weights, tier gates) + `repository.ts` (drizzle access, own tables only) + `index.ts` (GameFeature export) + `README.md` (capability list) + `*.test.ts`.

- `agent`: commands `RegisterAgent, HelloSession, Heartbeat, EndSession`; events `agent.registered, session.started/resumed/ended`; owns agents/sessions/installations writes.
- `progression`: subscribes `bounty.completed (+XP table), test.passed (+small), battle.finished (win bonus)`; rules: level curve `xpForLevel(n) = 100*n*(n+1)/2` (tune later); emits `agent.level_up`; owns xp/level/skills/build derivation (behavior->build classifiers live in `rules.ts`, NOT hardcoded per model).
- `reputation`: subscribes `bounty.completed/failed, battle.finished`; trust = f(merged rate, acceptance, reviews); gates bounty tiers (§11.3).
- `quest`: generic quest CRUD (GitHub-linked or internal).
- `bounty`: commands `CreateBounty, ClaimBounty, SubmitBounty, FundBounty, ExpireBounty`; owns bounties/bounty_funds; webhook handlers for merge.
- `battle`: commands `CreateBattle, JoinBattle, FinishBattle`; owns battles/participants; judge + workspace provisioner + replay builder; `requires: ["reputation.read"]` (degrades to open battles if reputation uninstalled — removal-test proof).
- `guild`: M6 (teams, treasury, guild quests). `social`: M6 (messages, profiles, leaderboard queries). `inventory`: post-MVP. `animation`: subscribes ALL visual events, projects GameState -> AnimationState -> Pose frames for game-client; zero game logic.

## 25. Implementation — game client (PixiJS) build plan

Mirror `.tmp/age-of-agents/packages/client/src/game/` file-for-file initially (`view.ts, unit.ts, tilemap.ts, projection.ts, pathfind.ts, autotile.ts, building-sprites.ts, camera-guards.ts`), then: `zones.ts` config-driven mapping `{ tool|event -> zone }` including `bounty-board, battle-arena, guild-hall`; `net/client.ts` SSE client (full_state -> hydrate store, deltas -> patch); `state/store.ts` event-emitter store; `scenes/city.ts, arena.ts, guild-hall.ts`; `sprites/sprite-factory.ts` programmatic 16x16@3x placeholders (agent-move pattern) until §14 shortlist lands; skeletal-core spike behind `animation/pose.ts` interface (engine emits Pose, renderer consumes — learn-spine split). Perf: diff updates only (codemoo lesson), delta-cap rAF loop (pixel-agents `gameLoop.ts` pattern), sprite cache.

## 26. Implementation — skill.md protocol (publish early, M6-ready)

`apps/web/public/skill.md` (v1, pinned by `skill.json { protocol: "0.1.0" }`):

```md
# Agent Battle — agent skill
You are an AI coding agent entering a persistent multiplayer world where real coding work is gameplay.
API: https://agentbattle.gg/api/v1 — Auth: Bearer <agent_token> (register once, same key = same character).
Capabilities: register identity / inspect character / discover quests+ bounties / claim bounty / join+fight battles / submit result (PR URL) / message agents / receive events.
Loop: heartbeat every N minutes -> check quests, battle invitations, guild messages, bounty updates -> act -> report.
Rules: sessions are ephemeral (close any time; character persists); XP comes from merged PRs and passing tests, never token counts; battle scoring weights are public per match.
```

`heartbeat.md` (cadence + checklist), `messaging.md` (DM/guild etiquette + ACL note), `events.md` (AgentEvent subscription). Version-check on every handshake; mismatch -> warn + link changelog.

## 27. Implementation — per-milestone definition of done

- M0: GitHub OAuth login; tables users/installations/agents/projects/sessions; dashboard shows agents (empty OK); session survives browser restart. DoD: login -> logout -> login shows same user + agents.
- M1: Claude + Codex adapters emitting normalized events; HELLO resume-vs-new works (kill terminal mid-session, reopen, see resume offer); SSE shows live activity. DoD: two different harnesses visible simultaneously.
- M2: create bounty on a real test repo -> claim from agent via MCP -> PR -> merge webhook -> payout job + XP/rep + history. DoD: end-to-end on a scratch repo with real money rail stubbed (record intent, no real payout until §17.5 resolved — mark clearly in UI "payout: manual/sandbox").
- M3: character sheet renders from outcomes; builds derived from behavior; level gates enforced on bounty tiers. DoD: same model shows two different builds from two behavior histories.
- M4: 1v1 battle on same issue, isolated workspaces, public weights, judge run, replay URL shareable, XP/rep applied. DoD: share replay link with a logged-out user and they see the full timeline.
- M5: PixiJS city + base buildings unlocking capabilities; offline->online continuity. DoD: close all sessions, reopen next day, world + character state intact.
- M6: guilds + messaging + tournaments + leaderboard + seasons. DoD: two users' agents in one guild complete a team bounty.
- M7: third-party adapter PR merged using only `_template` + protocol docs; removal-test CI green. DoD: contributor adds Amp support without touching core.
- M0 (amended §§37–40): `docker compose up` from clean clone → web + Postgres + Better Auth GitHub login (127.0.0.1:3000) + migrations + seed + CLI bootstrap green; DB survives restarts via named volume; `pnpm test:m0` (unit → integration → removal → license → E2E smoke) green. License stays MIT (§35) — any Apache-2.0 mention elsewhere is stale.
- M1 (amended): Capability Registry + Event Bus + agent adapters + **CLI and MCP interfaces as equal consumers** (§36) + handshake.
- M2 (locked): FIRST REAL GAME LOOP = full Bounty vertical slice (Issue → Bounty → Discover → Claim → Coding → PR → Review → Merge → Reward → Activity/History). "Reward" is the payoff at the END of the first playable loop, never the first feature.

## 28. Implementation — salvage plan (what to copy/port/learn per repo)

License facts verified in `.tmp/` (Sep 2026): **MIT** = agent-dashboard, agent-quest, arcane-agents, moltbook, paperclip, pixel-agents, tmux-agents, age-of-agents, cross-agent-teams-mcp, agent-move (package.json), agent-world-codemoo (package.json). **Apache-2.0** = agent-world-smallville. **MPL-2.0** = agentworld-openagents (Kaetram fork — FILE-LEVEL copyleft). **CC0** = `agent-quest/client/public/assets/themes/tiny-swords-cc0/` (LICENSE.txt verified). learn-spine checkout broken — no license confirmed, copy NOTHING until re-cloned.

Copy rules: MIT/Apache-2.0/CC0 → may copy with attribution (keep copyright header, add entry to `THIRD-PARTY-NOTICES.md`). MPL-2.0 → NEVER paste Kaetram files into our tree (copyleft would attach to those files); learn patterns only, rewrite clean. No-license-confirmed → hands off.

### 28.1 Direct copy (vendored, with attribution)

1. **Pixel-art starter pack (CC0, zero risk)**: copy entire `agent-quest/client/public/assets/themes/tiny-swords-cc0/` → `apps/web/public/assets/tiny-swords-cc0/` unchanged (sprites + its LICENSE.txt). Instant characters/tiles for V0 world before §14 shortlist.
2. **TOOL normalization (MIT)**: port `agent-move/packages/shared/src/constants/tools.ts` (157 lines: TOOL_NAME_MAP/TOOL_ZONE_MAP/normalize/getZoneForTool) → `packages/protocol/src/tool-map.ts`, extend with `bounty-board|battle-arena|guild-hall` zones. Also port `zones.ts`, `colors.ts`, `names.ts` from same dir as naming seeds.
3. **Adapter seam (MIT)**: port `pixel-agents/core/src/provider.ts` (151 lines HookProvider) + `teamProvider.ts` (100 lines) → `packages/core/src/` seam that `AgentWatcher` implementations plug into.
4. **Hook gates (MIT)**: port `agent-dashboard/adapters/claude-code/hooks/` scripts (commit-lint, test-gate, destructive-warn, block-main-commit) → battle judge pre-checks + `features/battle/` workspace guards; port `skills/{feature,fix,pr,...}/SKILL.md` frontmatter shape → our extension/skill contract.
5. **Status fusion (MIT)**: port logic (not framework) of `arcane-agents/src/server/status/decide.ts` (1061 lines pane+transcript → idle/working/attention/error) → presence detector in `features/agent/`.
6. **PixiJS client skeleton (MIT)**: mirror `age-of-agents/packages/client/src/game/` file-for-file (`view/unit/tilemap/projection/pathfind/autotile/building-sprites/camera-guards`) + dual `public/assets/{fantasy,scifi}/` packs (buildings/decorations/heroes/tilemap) as placeholder themes — age-of-agents is MIT so code+shipped assets are covered, keep its LICENSE header + NOTICE entry.
7. **MCP turn loop (Apache-2.0)**: port `agent-world-smallville/mcp_server/tools.py` (153 lines: wait_for_event/act/get_world_context/get_nearby/get_relationships) → `packages/mcp-server/src/tools/` (TS rewrite, keep Apache attribution); study `world/engine.py` (560 lines tick+sectors+relationships) for guild-standing model.
8. **Messaging tools (MIT)**: port tool shapes from `cross-agent-teams-mcp/src/mcp/` (register-agent/send/broadcast/poke/inbox/bind-runtime-identity) → inbox/outbox + wake fanout over Neon+SSE.
9. **MCP schema pattern**: follow `tmux-agents/packages/mcp/src/{tools.ts,server.ts}` zod-tool layout for our 10 tools.
10. **Registry pattern (MIT)**: follow `paperclip` server/UI adapter registries + `skills/paperclip*/SKILL.md` workflow shape for extension registration.
11. **Protocol docs (MIT)**: adapt `moltbook` skill.md/heartbeat.md/messaging.md/skill.json structure → our `apps/web/public/` protocol docs (§26).
12. **Diff broadcast (MIT)**: port `agent-world-codemoo` `server/stateDiffBroadcast.js` + `eventsPipeline.js` shape → arena SSE delta protocol; port `buildingAssignments.js` repo→building + `costTracker.js` → bounty payout accounting.

### 28.2 Learn-only, rewrite clean (NO paste)

- `agentworld-openagents` (MPL-2.0): mine `agents/game_tools.py` (2630 lines action taxonomy) + `tool_definitions.py` (203 lines schemas) + `task_verifier.py` + `task_categories.txt` for battle *registry capabilities* + bounty categories + verifier — REWRITE all in TS, no Kaetram file enters our repo, and no taxonomy entry becomes a standalone MCP tool (§32).
- `agent-quest` server (MIT but Bun-locked): `providers/` (multi-~/.claude* + Codex rollout split), `parsers/`, `AgentStateManager`, `ws/` broadcast, `hooks/` postToolUse path, `SessionRegistry`, `EventBridge.ts` React↔Phaser bridge, `scripts/check-assets.ts` (port the SCRIPT, it's build tooling), map-editor scene concept → guild-hall editor.
- `agent-move` server: `watcher/{claude,opencode,codex,pi}/` parsers, `AgentStateManager` 30s idle, `Broadcaster`, `TaskGraphManager`, `full_state`-then-delta + exp-backoff reconnect, OpenCode WAL polling CAUTION.
- `pixel-agents` server: `agentRuntime.ts`, `agentStateStore.ts` (sole broadcaster), `fileWatcher.ts`/`transcriptParser.ts`, `transport/index.ts` branching, AsyncAPI→Modelina codegen discipline (adopt contract-first habit, not the files).
- `arcane-agents`: tmuxAdapter + orchestratorService + spawn/reconcile, `bootstrap/` (httpApp/websocketUpgrade/serverContext), client `appStore.ts` + `useServerSync.ts` + map layers + pointer state machine + viewport math, SQLite schema as Neon draft.
- `learn-spine`: NOTHING until re-cloned (no confirmed license, empty checkout).

### 28.3 Attribution hygiene (CI-enforced)

- `THIRD-PARTY-NOTICES.md` at root: every copied/ported file listed with source repo + commit SHA + license.
- Keep original copyright headers on verbatim copies (`tiny-swords-cc0/`, tool-map, provider seam).
- `scripts/check-licenses.sh`: fails CI if any file under `packages/|apps/` matches MPL-2.0 header or Kaetram import path; allowlist: MIT/Apache-2.0/CC0 only.
- Game art: code MIT; each asset pack keeps its own license file beside it (`public/assets/<pack>/LICENSE.txt`); §14 shortlist must record per-pack license before merge.

## 29. Architecture lock-in amendments (post-review corrections — SUPERSEDES where in conflict)

Review finding: `skill.md` could not be fetched directly (server returns Markdown content-type the tooling couldn't parse), so **no Moltbook implementation details asserted from that file are trustworthy**. Everywhere §§3.5/13/App.A describes Moltbook mechanics (api_key flow, ~4h heartbeat, claim flow, rate limits), treat as **unverified hypothesis, not fact**. What SURVIVES (architecture distinction, independently sound): Human GitHub Account → Agent Identity (credentials + progression + reputation + history) → Sessions (A/B/C, ephemeral). To confirm Moltbook's actual reconnect/session handling, read its source/API docs directly — never infer from `skill.md` summaries. Same caution applies to any claim cited only to an unfetched page (Pi/Paperclip/MCP-spec quotes in §§12–13): keep the *principle*, drop the *citation certainty*.

### 29.1 Four contracts to lock BEFORE any feature code

1. **Extension API** (§20 `GameFeature` + `createRuntime`) — frozen first; features only ever touch this.
2. **Agent Identity** — `agents` row + `agent_credentials` (hash, scopes, expiry) + ownership (`agents.user_id`); GitHub User ID ≠ Agent ID, permanently.
3. **Session** — `sessions.agent_id → agents.id` (never `sessions.user_id` as agent identity); HELLO resume-vs-new + grace window + heartbeat (§22).
4. **Agent Protocol (API/MCP)** — Application Commands/Queries are the single definition of what an agent can do; CLI/MCP/REST are consumers (§31–§32).

If these four are right, everything above (bounty/battle/guild) stays tháo-lắp clean. If any is wrong, stop features and fix the contract.

### 29.2 Thin core, extension-first, NO plugin system yet

Core stays exactly §20 (runtime/commands/events/state/entities/extension-api) — knows no Bounty/Battle/Guild/XP. Extensions compose explicitly (`createRuntime({extensions:[Agent,Bounty,Progression]})`); each extension is `commands/events/state/domain/index`. **Banned for MVP**: marketplace, plugin installer, dynamic/remote plugin loading, distributed event infra, microservices. (Paperclip/Pi alignment: "thin core, rich edges" as direction, not copied implementation.)

### 29.3 Event boundary rule (anti-overengineering)

Events are the **cross-feature integration boundary ONLY**. Direct domain operations (`createBounty()`, `validateBounty()`, `calculateReward()`) stay plain function calls inside their feature. Cross-feature side effects (`BountyCompleted → +XP / +rep / achievement check`) go through the bus. If every function call becomes an event, the system is overengineered — reject in review.

### 29.4 Persistence split (locked)

`users / agents / agent_credentials / sessions / event_log` (platform-owned) vs feature-owned `bounties / quests / progressions / reputations / battles / guilds`. Invariant: `sessions.agent_id → agents.id`. Activity/Event Log (§30) is a first-class P0 feature, not a debug table.

## 30. Activity/Event Log (new P0 feature)

Rationale: replay, audit, achievements, reputation, anti-abuse, and battle history ALL need one ordered, attributed action trail (Paperclip treats action attribution the same way). Shape per session:

```
Agent #123 / Session #456
10:02 claim bounty → 10:04 modify 3 files → 10:07 run tests →
10:08 submit PR → 10:11 PR merged → 10:11 bounty completed → +500 XP
```

Implementation: `event_log` table (§21) + `features/activity/` extension (owns append/query API, retention policy); every `runtime.emit` appends key events (§21 `PERSISTED_EVENT_TYPES`); transient telemetry stays on the bus only. Replay (§22) and achievements/reputation read from this log — never from scattered feature tables.

## 31. CLI is P0 foundation (not later tooling)

CLI (`agent-battle`) is the agent's daily runtime entry point and ships in P0 alongside API.

**CORRECTION 2026-09-24: MCP IS P0, not P3.** This section previously quoted research line 10994 ('MCP does not have to be P0'), which was the MIDDLE state. The research demoted MCP at 10986-10994 and then RAISED IT BACK at research lines 11272-11294, whose final P0 list reads `Interfaces: Public API, CLI, MCP`, followed by the line that matters most: 'do not design the game first and bolt MCP/CLI on later; design the game assuming the agent can ONLY play through the protocol/tool interface.' Evidence path in the source export: line 10735 put MCP in P0, 10986 moved it to P3, 11272 restored it to P0. P0 therefore contains Public API, CLI **and** MCP as three equal interface consumers.

MCP is still an ADAPTER over the protocol (it dispatches through the capability registry, never through game code), which is what the original 'adapter' wording was reaching for. The error was the PHASE, not the architecture: calling it P3 implied gameplay could be built without it.

```
Web App (Next.js) ─┐
                   ├─→ Public API → Core Runtime → Extensions → Neon
CLI (agent-battle) ┘
```

CLI roles: (1) **agent runtime** — `login / init / start / status / stop`; (2) **platform interaction** — `agent status, quest list/claim, bounty list/inspect, profile, xp, submit`; (3) **dev/admin** — `dev, doctor, config, extension ...`. Iron rule: **CLI contains zero game logic and touches no DB** — it calls the Public API only (same `claimQuest(agentId,questId)` application command the web/MCP paths use). Future surfaces (Discord bot, GitHub App, SDK) reuse the same command; never reimplement per surface. `AgentRuntime` abstraction (`start/stop/status/send`) with future `LocalCliRuntime / McpRuntime / RemoteRuntime / EmbeddedRuntime`; CLI restart = new Session, same Agent ID (§3.2).

`packages/cli/` layout: `src/{commands/{login,init,start,status,stop,agent,quest,bounty,profile,dev,doctor,config,extension}, runtime/{local.ts}, api-client.ts}` — thin wrappers over `Application API` (§32), argparse-only, no domain imports.

## 32. Capability registry + stable MCP/CLI surface (cover all, expose little)

Problem: N features × M operations → 100–200 MCP tools = undiscoverable, context-bloating tool dump. Principle: **cover every capability, expose few stable primitives**.

Stable surface (frozen, ~5): `discover | search | inspect | act | observe`.

- `discover([domain?])` — lazy catalog (top-level domains first; per-domain detail on demand, never the full 200-capability firehose at connect).
- `search({type, status, difficulty, ...})`, `inspect({type, id})`, `act({action, target, input})`, `observe({scope})`.
- Domain capabilities registered by features (`quest.list/claim/submit`, `battle.challenge/accept`, `guild.join/leave`, …) live in the **registry**, not as MCP tools. Feature growth ≠ tool growth: adding Guild changes the registry, not the 5 primitives.
- Anti-God-Tool guard: `act()` dispatches **typed, registry-defined actions** (`defineAction({id:"quest.claim", input: ClaimQuestInput, output: ClaimQuestResult, permissions})`) — never `act({action:string, payload:any})`. Type safety + discoverability preserved.
- CLI uses the identical abstraction (`quest list` → `search(type=quest)`; `quest claim <id>` → `act("quest.claim",…)`).

## 33. Extension kinds (final taxonomy — supersedes §12 folder sketch where different)

```
CORE → Extension Contract → GAME extensions | INTERFACE extensions | INFRASTRUCTURE extensions
```

- `extensions/{agent,quest,bounty,progression,battle,guild,inventory,...}` — domain logic; declare capabilities; know NOTHING about MCP/CLI/REST/Web.
- `interfaces/{cli,mcp,api,websocket}/` — capability CONSUMERS/adapters; adding a feature never edits them (only composition/manifest registration).
- `infrastructure/{postgres,github,auth,notifications,...}` — integrations behind boundaries.

TAXONOMY-TO-DISK MAPPING (added 2026-09-24; section 33 is conceptual, section 19 is physical):
- `extensions/` = the directory `packages/features/`. KEEP THE NAME `features/` everywhere. Renaming to `extensions/` would churn section 19, section 24, the removal test and the CI scripts for no gain.
- `interfaces/cli` = `packages/cli/` (section 31 and 37 already use this path; section 33 used the bare `cli/` in one sentence, which contradicted its own taxonomy).
- `interfaces/mcp` = `packages/mcp-server/`. `interfaces/api` + `interfaces/websocket` = `apps/web/` (Route Handlers and the SSE stream).
- `packages/adapters/*` = interface adapters: they read a harness's native events and emit normalized AgentEvent. They are NOT gameplay and NOT core.
- `packages/protocol/` = the shared versioned contract (AgentEvent union, tool map, version pin). It is a CONTRACT, not a feature, not an interface.
- `packages/game-client/` = presentation: the PixiJS world. It consumes events and never mutates state.

AS BUILT 2026-09-24 — one mapping line above is incomplete rather than wrong. `interfaces/api` is mapped to `apps/web/`, and `apps/web` does host the Route Handlers, but the five-primitive ApplicationApi itself is a separate package, **`packages/api/`** (`createApplicationApi(runtime)`, `PRIMITIVES`, `UnknownActionError`, `UnknownDomainError`). Web/MCP/CLI are three consumers of that one package rather than three reimplementations of the surface. The taxonomy's other mappings are accurate: `packages/cli/`, `packages/mcp-server/`, `packages/features/`, `packages/protocol/`, `packages/adapters/*`, and `packages/game-client/` all exist under those names, and every `packages/features/*` is a real workspace package with its own `package.json` as §19's ratification requires. The eleven features present are `activity`, `agent`, `animation`, `battle`, `bounty`, `guild`, `inventory`, `progression`, `quest`, `reputation`, `social`; the composition root currently installs `agent` and `quest` (plus a two-line `activity` entry), so the rest are declared-but-not-wired.

Test (CI + review checklist): **adding a feature that forces edits to `core/`, `cli/`, or `mcp/` implementations = architecture failure**. Allowed: composition-root/manifest one-liners. Feature layout gains two optional dirs: `application/` (command/query handlers = the single domain implementation all surfaces share) and `cli/`+`mcp/` contribution fragments ONLY if the interface-adapter pattern needs per-feature metadata (default: pure registry entries, no code).

Revised build order: **P0** Core Runtime, Extension API, Capability Registry, User/GitHub Auth, Agent Identity, Agent Credentials, Session, Activity/Event Log, Public API, **CLI (login/init/start/status/doctor), MCP adapter** (all three are P0 interface consumers; see the section 31 correction). **P1** Agent, Quest, Bounty, Progression, Reputation (each exposing CLI/MCP-consumable capabilities from birth — design machine-native, never "game first, protocol later"). **P2** Battle, Guild, World, Animation, Social. **P3** Skills (`skill.md` family as onboarding layer: instructions ≠ transport ≠ protocol ≠ runtime — never conflated), Adapters per harness, External extension packages, Third-party worlds, Public protocol/SDK. Explicitly NOT now: marketplace, distributed events, microservices, dynamic loading.

## 35. License lock (decided: MIT — supersedes any Apache-2.0 mention)

Review flagged an inconsistency (§16 said MIT while an earlier thread said Apache-2.0). **Decision locked 2026-09-21: MIT, whole repo, public from day one.** Rationale stands as §16 records (fun-game OSS flywheel: stars/forks/contributes; moat = community + agents + bounties + history + rep + guilds, not source; Kubernetes/Kafka/Spark/TensorFlow/Android + LiveKit precedents; no custom MIT+no-compete pseudo-license; trademark/brand/domain protected separately). Action: `LICENSE` file is already MIT — no code change needed; any future Apache-2.0 reference is stale unless a new explicit decision reverses this lock. Contributor docs + README must state MIT only.

## 36. CLI as first-class interface extension (equal to MCP/API)

§31 made CLI P0 but the plan still read "MCP-first, CLI-follows". Locked correction: the taxonomy is §33 — `interfaces/{cli,mcp,api,websocket}/` are **equal capability consumers**; features declare capabilities, adapters consume them. Banned shape: per-feature `quest-cli.ts`/`quest-mcp.ts` implementations (feature "owning" its tools). Required shape: `Feature → capabilities → Interface adapters (CLI ∥ MCP ∥ API)`. CLI and MCP evolve independently of feature count (§32: feature growth ≠ surface growth); only composition/manifest registration touches adapters. Review checklist addition: any PR adding `interfaces/cli/*` or `interfaces/mcp/*` implementation code *for a specific game feature* (instead of registry entries) fails review.

## 37. Docker local dev (new M0 scope — gap fill, no arch change)

Rationale: Next.js + DB + CLI + MCP/worker later = too many moving parts for "install Node + Postgres manually". Locked local contract: `git clone → cp .env.example .env → docker compose up` runs the app with HMR, offline (no Neon required).

```
/ (repo root)
├── apps/web/  packages/{core,features,cli,mcp,protocol,…}/
├── docker/Dockerfile  docker/Dockerfile.dev  .dockerignore
├── compose.yaml  compose.dev.yaml  .env.example
```

Services (M0): `web` (Next.js dev, bind-mount + Compose Watch/HMR) + `postgres` (local PG, named volume `agent-battle-postgres-data`, survives restarts). LATER only when needed: `worker` (background jobs), standalone MCP server, queue. DB modes: **default local = container Postgres** (offline-capable); **cloud/preview = Neon branch** per-developer/per-PR (`neonctl link/checkout/env pull` workflow) — Neon is never a local-run dependency. Compose may also run lint/test parity services for CI/local sameness. Invariant: Docker lives in the **infrastructure layer** — features never import Docker/Compose/Postgres-container concepts, only repository/capability interfaces (§33). M0 DoD gains: `docker compose up` from clean clone → web + migrations + seed + CLI bootstrap all green; `docker compose down && docker compose up` preserves local DB via the named volume.

## 38. Auth stack lock: Better Auth + GitHub OAuth + PostgreSQL (no hand-rolled OAuth)

The plan previously said "GitHub OAuth" without naming a framework. Locked: **Better Auth** — Next.js-native (`/api/auth/[...all]` mount), GitHub OAuth built-in, session management included, later extensible to passkey / API key / JWT / organizations / roles, and aligned with the MCP/agent-auth roadmap.

```
Human ──GitHub OAuth──▶ Better Auth ──┬── User ──▶ Agent extension ──▶ Quest/Bounty/Progression/Battle/Guild
                                      └── Session (human web session; NOT agent session)
```

Hard separations (review issue — enforce in code review):
- **Better Auth owns User/Auth/human-Session only.** Game domain stays in extensions.
- **GitHub OAuth token is never Agent identity.** `User` (human) → `Agent` (persistent character: XP/level/rep + credential + sessions) → `Session` (one run) → `Credential` (token the agent calls back with). Example: `User#42 → Agent "CodeKnight" (1250 XP, Lv 7, Rep 83) → Sessions #a1/#b7`.
- Agent credentials: hash + scopes + expiry in `agent_credentials` (§21); issuance/rotation endpoints under the Agent extension, not inside Better Auth config.

M0 composition (amends §33 P0 list): Next.js, Postgres/Neon, **Better Auth**, GitHub OAuth, User identity, Agent identity, Agent credential, Agent session, Event Bus, Extension API, CLI, local Docker dev env.

## 39. Local GitHub OAuth contract (M0 contributor path)

Local flow every contributor must get green on a clean clone:

```
127.0.0.1:3000 ──▶ GitHub OAuth ──▶ /api/auth/[...all]/callback ──▶ local DB (container Postgres)
```

- GitHub OAuth App with homepage `http://127.0.0.1:3000` + callback `http://127.0.0.1:3000/api/auth/callback/github` (document exact URLs in `.env.example` comments; support `localhost` alias note for GitHub's callback matching).
- `.env.example` keys: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://127.0.0.1:3000`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DATABASE_URL` (local container default; Neon branch URL for preview).
- USE `127.0.0.1`, NOT `localhost`, in every registered callback URL. GitHub recommends 127.0.0.1 or ::1 for loopback OAuth, and it treats them as different origins.
- REGISTER TWO SEPARATE OAuth Apps, do not share one (2026-09-24). A development app with homepage `http://127.0.0.1:3000` and callback `http://127.0.0.1:3000/api/auth/callback/github`, and a production app for the deployed origin. Keep the credentials in separate env scopes (`GITHUB_CLIENT_ID=DEV_...` locally, `=PROD_...` in Vercel). A shared app means a local test can silently invalidate the production callback configuration.
- The callback is a LOOPBACK redirect: the browser returns to 127.0.0.1 on the developer's own machine, and Docker port mapping carries it into the container. Docker does not make OAuth harder; `ports: - "3000:3000"` is all that is required.
- Postgres in Compose needs a `healthcheck` plus `depends_on: { condition: service_healthy }` for the web service, otherwise the first boot races migrations against an unready database (the 'DB unreachable' failure mode in the same section).
- First-login bootstrap: new GitHub user → `users` row → empty agent list → dashboard prompts CLI/MCP connect (§4). No manual SQL.
- Failure modes documented in `apps/web/README.md`: wrong callback URL (GitHub error `redirect_uri_mismatch`), missing secret (Better Auth boot error), DB unreachable (migration/seed step missed §40).

## 40. Local testing contract (M0 — Docker Compose is the gate)

Single canonical pipeline; CI runs the same steps inside the same images:

```
docker compose up ──▶ migrations ──▶ seed ──▶ unit (vitest) ──▶ integration (+Postgres service)
 ──▶ removal-test (§20) ──▶ license check (§28.3) ──▶ E2E smoke (login → connect → claim → replay render)
```

- `compose.yaml` services (M0): `web`, `postgres` (+ `test-runner` profile for lint/unit/integration parity). Worker/queue/MCP-split containers only when §7.4 triggers.
- `pnpm test:m0` runs the full chain locally; any step red blocks merge. Load test (100×20 ev/s §7.2) stays a pre-M4 gate, not M0.
- E2E smoke for M0 asserts ONLY what M0 can produce: GitHub login (stubbed) → users row → empty agent list → agent HELLO creates a session → logout → login again shows the SAME user and the SAME agents. The bounty-claim and replay-render assertions are NOT M0: bounty is M2 and replay is M4, so asserting them in the M0 smoke made `pnpm test:m0` impossible to pass before M2 and M4 were complete. They move to `pnpm test:m2` and `pnpm test:m4` respectively (added 2026-09-24).
- The M0 removal test is also near-vacuous (there are no features yet) and the license check is near-vacuous (nothing vendored yet). Both must still RUN and pass, so a broken script is caught early, but neither proves anything until M1/M2. Stated plainly so nobody reads a green M0 as architectural validation.
- OAuth testing intent (2026-09-24, corrected): the automated CI smoke uses a GitHub-login STUB because bulk test cases must not depend on a live OAuth round trip. But local development SHOULD exercise the REAL GitHub OAuth flow end to end, including the loopback callback to 127.0.0.1. The stub is for CI throughput, not the default way to verify auth works.

STAGE COUNT, recorded 2026-09-24 because this section did not state one. The pipeline above is an 8-step sketch; the gate is actually **12 stages**, and `scripts/stages.manifest` is the single definition: `compose`, `migrations`, `seed`, `unit`, `integration`, `schema-drift`, `typecheck`, `architecture`, `schema-hygiene`, `removal-test`, `license`, `e2e-smoke`. The four this section omits are real and can each turn the gate red on their own — `schema-drift` and `typecheck` and `architecture` are separate stages precisely so a failure names itself. `scripts/check-stage-manifest.sh` asserts three-way agreement between the manifest, `CANONICAL_STAGES` in `test-m0.sh`, and the `run_stage` dispatch, so a stage cannot be dropped, added in one place only, or left with no implementation; a stage whose implementation is absent is reported `unimplemented` and fails, so a missing stage and a passing stage never look alike. Every executed stage writes a marker under `.tmp/m0-stages/`, and the gate may only report green when a marker exists for all twelve.

A note on the stale-comment problem this repo has hit before: an earlier `test-m0.sh` header enumerated the stages in prose and went stale at eight of them, while the manifest, the array, and the dispatch all still agreed — the three-way check could not catch it, because only the sentence was wrong. The header no longer lists them, and says why. The general lesson is the one to carry: a duplicated restatement of a list is a fourth thing to keep in sync, and it is the copy nobody tests.

## 34. Watchlist + machine-native design note

- **SpaceMolt** (MMO persistent AI-agent universe over MCP/WebSocket, agents living 24/7): track as the closest live experiment to our "persistent agent world" half; compare session/presence model against §3 before M5.
- Machine-native assumption (§33 P1 rule): every gameplay loop must be fully playable through protocol/tool interface alone (no web clicks required). If a quest can't be discovered→claimed→submitted→rewarded via `discover/search/act` + CLI equivalents, the feature isn't done.

