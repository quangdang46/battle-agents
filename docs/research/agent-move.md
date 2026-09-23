# agent-move — watcher, state machine, and broadcast study

- **Repo:** https://github.com/FoothillSolutions/agent-move
- **Commit studied:** `85d377110721d8dd4e0c68a23fb8c0108e611538` (2026-04-04)
- **Date studied:** 2026-09-24
- **License:** `package.json` declares `"license": "MIT"`. **There is no LICENSE file in
  the repo.** Treat as MIT-per-package-metadata, not MIT-per-file.
- **Relevant beads:** `ba-tool-map-port-89a`, `ba-status-fusion-presence-5zk`,
  `ba-hookprovider-seam-lq2`, `ba-adapters-template-a09`
- **Status: RAN.** Installed, built, typechecked, and executed against this machine's real
  session history. All four watchers (Claude / OpenCode / pi / Codex) started live. The
  wire-protocol claims in §3 are a **recorded capture**, not inference.

---

## 0. Correction to the plan: there is no 30s idle rule

The plan (section 28.2) and the parent bead both describe an "AgentStateManager 30s idle
rule". **That is wrong.** The server-side idle timeout is **45 seconds**:

`packages/server/src/config.ts:7`

```ts
idleTimeoutMs: 45_000,
```

The 30s figure comes from a different, unrelated thing on the client side:

`packages/client/src/agents/agent-sprite.ts:67`

```ts
private static IDLE_TO_SLEEP_MS = 30_000; // 30s standing idle before sleeping
```

That is a **cosmetic animation timer** — how long a sprite stands idle before switching to
a sleeping pose. It plays no part in the server state machine. Other 30s values in the repo
are likewise unrelated: a 30s git-info cache TTL (`watcher/git-info.ts:4`), a 30s
anomaly-detector sweep interval, and a 30s session-recorder flush interval.

**Consequence for the porting beads:** if `ba-status-fusion-presence-5zk` hardcodes 30s
because that is what the reference appears to do, it will be 33% more eager than the
reference. Copy 45s, or pick a value deliberately and say so.

## 1. The three-tier timer cascade

The state machine does not have one timeout; it has a ladder, and each rung is armed by
the one before it (`packages/server/src/state/agent-state-manager.ts`):

| Timer            | Value                               | Arming condition                              | Effect                                                                       |
| ---------------- | ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `idleTimers`     | `config.idleTimeoutMs` = 45s        | reset on every `processMessage` / `heartbeat` | `isIdle = true`, `phase = 'idle'`, zone and tool cleared, emits `agent:idle` |
| `shutdownTimers` | `config.shutdownTimeoutMs` = 30 min | armed _by the idle callback_                  | `isDone = true`, emits `agent:update`                                        |
| `identityTimers` | `IDENTITY_TIMEOUT_MS` = 15s         | when a hidden agent is first seen             | promotes the agent out of hidden state                                       |

`resetIdleTimer` clears **both** the idle and the shutdown timer before re-arming, so
activity always resets the whole ladder. Note the shutdown rung is only ever armed from
_inside_ the idle callback — an agent can never go straight from working to done.

The OpenCode watcher adds **two more of its own**, independent of the ladder:

`packages/server/src/watcher/opencode/opencode-watcher.ts:63,68`

```ts
private static readonly STEP_FINISH_IDLE_MS = 4000;
private static readonly SESSION_END_MS = 180_000;
```

`step-finish` arms both a 4s idle and a 3-minute session-end timer. `step-start` or any
other real activity cancels both. This is the only place in the codebase that distinguishes
"between turns" (4s) from "the user closed the terminal" (3 min).

**PORT:** the ladder, not a single timeout. "Idle" and "gone" are genuinely different
states and collapsing them loses the `isDone` marker that the UI uses to grey out
finished agents.

**AVOID:** the magic numbers inline in config. They are at least named constants, but
none are overridable by environment variable — only the port is. If you port this, make
the windows configurable, because the right values depend on your slowest tool.

## 2. The pending-tool guard (a liveness hazard)

`resetIdleTimer`, `agent-state-manager.ts:529-535`:

```ts
const timer = setTimeout(() => {
  const agent = this.agents.get(agentId);
  if (agent && !this.hiddenAgents.has(agentId)) {
    // If a tool is pending (waiting for result), don't go idle — reschedule
    if (this.pendingTool.has(agentId)) {
      this.resetIdleTimer(agentId);
      return;
    }
    ...
  }
}, config.idleTimeoutMs);
```

When a tool call is outstanding, hitting the idle deadline **reschedules the timer
instead of idling the agent**. Because `resetIdleTimer` re-arms a full 45s, an agent stuck
waiting on a tool result will reschedule forever.

**This is deliberate** — a 60-second build or test must not make the agent look idle. But
it means **the idle state is not guaranteed to be reachable**. A watcher that records a
`tool_use` and never records the matching completion will pin the agent "working"
indefinitely.

The codebase covers this with a _separate_ mechanism rather than a bound on the reschedule:
`AnomalyDetector` sweeps every 30s and raises an alert for stuck agents. So the answer to
"stuck tool" is an **alert**, not an idle transition.

**PORT:** the guard, and port the stuck-detection too — they are two halves of one design.
If you port the guard without the detector you have a hang, not a feature.

## 3. full_state-then-delta, and why it is 39 MB

### The design

`packages/server/src/ws/broadcaster.ts:94-112`. On connect the broadcaster sends exactly
**one atomic message** containing everything, and never sends another snapshot:

```ts
// Send full state snapshot on connect (single atomic message to prevent race conditions)
const fullState: ServerMessage = {
  type: 'full_state',
  agents: this.stateManager.getAll(),
  timeline: this.stateManager.getTimeline(),
  toolchain: this.stateManager.getToolChainSnapshot(),
  taskgraph: this.stateManager.getTaskGraphSnapshot(),
  timestamp: Date.now(),
};
ws.send(JSON.stringify(fullState));
```

Afterwards, only deltas: `agent:spawn`, `agent:update`, `agent:idle`, `agent:shutdown`,
`anomaly:alert`, `toolchain:snapshot`, `taskgraph:snapshot`, `task:completed`,
`permission:request` / `permission:resolved`.

The "atomic" framing is the point — because the whole snapshot is one frame, a client can
never interleave a delta into the middle of a snapshot and end up with a half-applied state.

### Observed on the wire

I ran the server against this machine's real session history and connected a WebSocket
client. Recorded **2026-09-24**, agent-move at `85d3771`:

```
MSG#1 type=full_state  bytes=39249152  agents=17  timeline=5000  toolchain=true  taskgraph=true
  first agent: {"id":"6457fd30-...","phase":"running","zone":"terminal",
                "isIdle":false,"agentType":"claude","projectName":"battle-agents"}
MSG#2 type=agent:update  bytes=1632
MSG#3 type=agent:update  bytes=1721
MSG#4 type=agent:update  bytes=1188
MSG#5 type=agent:update  bytes=1280
MSG#6 type=anomaly:alert  bytes=331
MSG#7 type=agent:update  bytes=1882
... 9 messages total in 12s
```

**The very first frame is 39,249,152 bytes — about 37.4 MiB — for 17 agents.**
Subsequent deltas are 1.2–1.9 KB. The ratio is roughly 25,000:1.

The cause is `MAX_TIMELINE_EVENTS = 5000` (`agent-state-manager.ts:26`). The timeline is
capped by **count, not by age**. A long-lived process fills all 5000 slots regardless of
how old the entries are, and each entry carries a full agent object, so it compounds:
5000 events × 17 agents' worth of per-event agent snapshots.

**AVOID — this is the single most important thing in this note.** The snapshot is
unbounded in time, and every client pays the full cost on every connect. Three concrete
fixes, in increasing order of effort:

1. Cap the timeline by **age** as well as count (the codebase already does this per-agent
   for activity history: `MAX_HISTORY_AGE_MS = 30 * 60 * 1000`, but _not_ for the global
   timeline).
2. Send the timeline separately, after the agent state, so the client can paint first.
3. Send a merge patch instead of a full object — see
   [agent-world-codemoo.md](./agent-world-codemoo.md), which does exactly this.

**PORT:** the single-atomic-frame idea. It is correct and the client code depends on it.

## 4. The client half of the protocol

`packages/client/src/connection/state-store.ts:162-172`:

```ts
case 'full_state': {
  this.agents.clear();
  for (const agent of msg.agents) this.agents.set(agent.id, agent);
  // Reset timeline from the snapshot to prevent stale/duplicate entries
  this._timeline = msg.timeline ?? [];
  this.emit('state:reset', this.agents);
  if (msg.timeline)    this.emit('timeline:snapshot', msg.timeline);
  if (msg.toolchain)   this.emit('toolchain:snapshot', msg.toolchain);
  if (msg.taskgraph)   this.emit('taskgraph:snapshot', msg.taskgraph);
  break;
}
```

Two behaviours worth copying:

1. **`agent:spawn` is deduplicated into an update** (same file, ~line 178):

   ```ts
   case 'agent:spawn': {
     // Deduplicate: if agent already exists, treat as update instead
     if (this.agents.has(msg.agent.id)) { this.agents.set(...); /* update */ break; }
   ```

   The server may legitimately re-emit a spawn for an agent the client already knows
   about (replay, reconnect, session merge). The client is idempotent by ID. **The client
   contract is "you may receive spawn for an id you already have, and it means update."**
   Any client you write must honour that or you get duplicate entities.

2. The snapshot **replaces** the timeline rather than appending to it, with an explicit
   comment about preventing stale/duplicate entries. Same reasoning.

`ws-handler.ts` also exposes pull-style requests over the same socket — `request:history`,
`request:toolchain`, `request:taskgraph` — so a client can re-fetch a slice on demand
instead of having it pushed forever. That is the right escape hatch for the 39 MB problem:
the expensive parts (history, timeline) are pull, not push.

## 5. Per-CLI watcher parsers

The seam is deliberately tiny — `packages/server/src/watcher/agent-watcher.ts` is a
13-line interface:

```ts
export interface AgentWatcher {
  start(): Promise<void>;
  stop(): void;
}
```

The file's own header comment states the contract for adding a CLI: normalise tool names
via `normalizeToolName()` and input fields via `normalizeToolInput()` before emitting
`ParsedActivity`, then register in `index.ts`. **Everything downstream is agent-agnostic.**

Four implementations exist at `85d3771` — `claude/`, `codex/`, `pi/`, `opencode/` — each
with a `<cli>-paths.ts` (where the data lives), `<cli>-parser.ts` (stateless, string →
`ParsedActivity`), and `<cli>-watcher.ts` (the I/O and dedup).

**PORT:** the three-file split. The parser being stateless and separately testable is what
makes adding a fifth CLI cheap. `ba-adapters-template-a09` should reproduce this shape.

### The shared normalised contract

`ParsedActivity` (`watcher/types.ts`) is the whole vocabulary — only three kinds:

```ts
type: 'tool_use' | 'text' | 'token_usage';
```

plus optional `toolName`, `toolInput`, `text`, four token counters, `model`, `sessionId`,
`agentName`, `messageSender`. Anything a CLI reports that does not fit is dropped by its
parser. There is no escape hatch for "agent-specific extra data" — by design.

`createFallbackSession()` exists so that a watcher which cannot locate session metadata
still emits a valid `SessionInfo` rather than throwing.

## 6. TOOL_NAME_MAP / TOOL_ZONE_MAP — the tool-map-port payload

`packages/shared/src/constants/tools.ts`. Three layers:

**(a) `TOOL_NAME_MAP` — agent-specific name → canonical PascalCase.**

```ts
const TOOL_NAME_MAP: Record<string, string> = {
  read: 'Read', write: 'Write', edit: 'Edit', patch: 'Patch', glob: 'Glob',
  bash: 'Bash', grep: 'Grep', websearch: 'WebSearch', webfetch: 'WebFetch',
  todoread: 'TodoRead', todowrite: 'TodoWrite',
  // pi-specific
  'edit-diff': 'Patch', find: 'Glob', ls: 'Bash', truncate: 'Write',
  // Codex CLI
  shell_command: 'Bash',  exec_command: 'Bash',   read_file: 'Read',
  apply_patch: 'Patch',   list_dir: 'Bash',        grep_files: 'Grep',
  web_search: 'WebSearch', js_repl: 'Bash',       view_image: 'Read',
  image_generation: 'Write', spawn_agent: 'Agent', request_user_input: 'AskUserQuestion',
  ...
};
export function normalizeToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name;   // <-- identity fallback
}
```

Note the Codex entries collapse a lot: `spawn_agent`, `send_input`, `wait`, `close_agent`,
`resume_agent`, `spawn_agents_on_csv`, `report_agent_job_result` **all map to `Agent`**.
Codex's subagent protocol is seven distinct verbs; the visualisation only cares that an
agent was involved.

**(b) `TOOL_ZONE_MAP` — canonical name → activity zone**, seven zones: `files`,
`terminal`, `search`, `web`, `thinking`, `messaging`, `tasks`, `spawn`.

```ts
export function getZoneForTool(toolName: string): ZoneId {
  if (toolName.startsWith('mcp__')) return 'web'; // prefix catch-all
  return TOOL_ZONE_MAP[toolName] ?? 'thinking'; // silent default
}
```

The `mcp__` prefix rule is the interesting part: rather than enumerating every MCP tool
server, **any** namespaced tool is treated as web/external. Adding an MCP server therefore
requires zero map edits.

**(c) `normalizeToolInput` — field-name normalisation**, with an early-out:

```ts
export function normalizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  if (!('filePath' in input) && !('oldString' in input) &&
      !('newString' in input) && !('replaceAll' in input)) {
    return input;   // nothing to do — returns the SAME object, not a copy
  }
  const out = { ...input };
  if ('filePath'  in out) { out.file_path   = out.filePath;   delete out.filePath;  }
  ...
  return out;
}
```

**AVOID — the identity fallbacks are silent.** `normalizeToolName` returns an unknown name
unchanged, and `getZoneForTool` returns `'thinking'`. A typo, or a new tool a CLI ships
next month, lands in `thinking` with **no warning, no counter, no log**. In a dashboard
whose whole purpose is showing what agents are doing, a silent wrong zone is worse than a
visible failure. If you port this, add a catch-all that _reports_ unknown names — the
prefix rule for `mcp__` is a good model for "known-unknown, handled deliberately" versus
"unknown-unknown, swallowed".

**AVOID — `normalizeToolInput` is a fixed, shallow key rename.** It handles exactly four
camelCase field names. Any fifth field from a sixth CLI is passed through un-renamed, and
whatever consumes it downstream sees a mix of conventions. The early-out also returns the
caller's original object rather than a copy, so a caller that later mutates the "normalised"
input mutates the watcher's cache too.

## 7. The OpenCode WAL-polling CAUTION — confirmed in code and at runtime

This is the caution the bead asks about. It is a real, load-bearing decision, and the
reason is stated in the source.

### Why polling, not fs.watch

`opencode-watcher.ts:110-121`:

```ts
// Poll the WAL file — fs.watch is unreliable for SQLite WAL on Windows
// (the kernel doesn't emit change events on WAL appends). Polling at 500ms
// gives near-real-time detection without hammering the disk.
const walPath = dbPath + '-wal';
this.watcher = chokidar.watch(walPath, {
  persistent: true,
  ignoreInitial: true,
  usePolling: true,
  interval: 500,
  disableGlobbing: true,
});
this.watcher.on('change', () => this.poll());
this.watcher.on('add', () => this.poll());
```

Three details that are easy to get wrong:

1. **It watches the `-wal` sidecar, not the database file.** The main `.db` file may not
   change at all while the WAL is being appended to. Watching the wrong file is the
   obvious mistake and produces a watcher that silently never fires.
2. **Both `change` and `add` are bound to `poll()`.** `add` fires on first creation of
   the WAL (e.g. right after a checkpoint deletes and recreates it), and binding only
   `change` would miss activity following a checkpoint.
3. **The DB is opened `readonly: true, fileMustExist: true`** — WAL mode permits concurrent
   readers, so this never blocks the writer (OpenCode itself).

**PORT:** the whole shape — readonly handle, watch the sidecar, poll, tolerate both events.

**AVOID:** assuming a filesystem-watch adapter works for SQLite. It works on macOS/Linux
and fails on Windows, which is a platform-specific failure that will not show up in
development.

### The two-watermark dedup — subtle and important

`opencode-watcher.ts:44-49`:

```ts
/** Timestamp watermark for incremental polling (ms) */
private lastMessageTs = 0;
/** Tracks time_created (not time_updated) so each part is processed exactly once */
private lastPartCreatedTs = 0;
```

Messages are polled `WHERE time_updated > ?`; parts are polled `WHERE time_created > ?`.
**Different columns, deliberately.** A part that is _updated_ in place would be re-scanned
under a `time_updated` watermark and re-emitted; `time_created` is immutable, so each
part is seen exactly once. This is the kind of detail that is invisible until you get
duplicated tool calls in the UI and spend an afternoon on it.

On top of the watermarks there are two explicit dedup sets:

- `seenCallIds: Set<string>` — one emission **per tool invocation**, keyed on the OpenCode
  `callID`. This is the correct key: a tool's status moves `pending → running → completed`,
  and the parser emits on the _last_ status observed, so the invocation is emitted once
  regardless of how many status updates crossed the poll boundary.
- `seenIds: Set<string>` — one emission per row `id`, for text / reasoning / token rows.

The parser documents the consequence explicitly (`opencode-parser.ts:52-56`):

```ts
// Emit on any non-pending status — with 500ms polling we may only see
// the final 'completed' state if the tool finished before the next poll.
if (tool.state.status === 'pending') return null;
```

**So: this watcher is at-most-once-per-invocation and explicitly _not_ a progress
observer.** A tool that takes 5 seconds is usually seen only as `completed`. **AVOID**
building any UI that expects a "running this tool" state to be observable — it is not, by
design, and no amount of polling will make it so without a different design.

### Hardcoded paths = silent feature disable

`opencode-paths.ts:9-25` checks exactly three locations:
`~/.local/share/opencode/opencode.db`, `%LOCALAPPDATA%/opencode/opencode.db`,
`~/.opencode/opencode.db`. If none exist, `start()` logs
`"[opencode] No database found — OpenCode not installed or not yet used"` and **returns
without throwing**. The adapter is simply off.

**Observed on this machine** — the OpenCode DB was found and the watcher ran live:

```
[opencode] Database found at /Users/tranquangdang21/.local/share/opencode/opencode.db
[opencode] Watching for new activity
```

This silent-disable pattern is applied to all four watchers. Good for UX, but it means
"the dashboard is empty" and "no watcher matched" look identical from the outside. Give
each adapter an explicit reported state.

## 8. Operational finding: does not build on Node 26

**This cost real time and is worth recording.** At `85d3771`:

- `engines.node` says `">=18"`, and the package builds and typechecks clean on **Node
  22.23.3** (verified: `npm install` → 201 packages, `npm run build` → 794 modules
  transformed, `npm run typecheck` → `tsc -b` clean, zero errors).
- On **Node 26.3.0** it does not build. `better-sqlite3@12.6.2` fails to compile:

  ```
  .../node-gyp/26.3.0/include/node/v8-external.h:31:3: note: 'New' has been
      explicitly marked deprecated here
  gyp ERR! stack Error: `make` failed with exit code: 2
  ```

  V8 deprecation warnings became hard errors in Node 26. The native compile dies, and
  because the failure aborts `npm install`, **no devDependencies get installed either** —
  so `tsc` then fails with a cascade of ~15 misleading errors (`Cannot find name 'path'`,
  `Cannot find module 'fastify'`, `Cannot find name 'Buffer'`) that have nothing to do with
  the real cause.

**The cascade is the trap.** I spent one build chasing `@types/node` before noticing the
`gyp` errors further up. If you hit those TypeScript errors, **scroll up to the install
output, not the compile output.**

**PORT (as a caution):** the `engines` field is not a reliable statement of what works.
agent-move's native dep pins the real ceiling far below its declared floor.

**Also recorded:** `npm audit` reports 14 vulnerabilities (1 low, 11 high, 2 critical) in
the dependency tree at this SHA. Not investigated — flagged only. Do not adopt this
dependency set without your own audit.

## 9. Summary for porting

| #   | Behaviour                                                                          | Verdict                                      | Feeds                           |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------- |
| 1   | 13-line `AgentWatcher {start, stop}` seam, parser stateless and separate           | **PORT**                                     | `ba-adapters-template-a09`      |
| 2   | 3-file adapter split (`paths` / `parser` / `watcher`)                              | **PORT**                                     | `ba-adapters-template-a09`      |
| 3   | Normalise at the adapter boundary, `thinking` fallback downstream                  | **PORT the shape**, harden the fallback      | `ba-tool-map-port-89a`          |
| 4   | `mcp__` prefix → `web` catch-all, no per-server entries                            | **PORT**                                     | `ba-tool-map-port-89a`          |
| 5   | Idle **45s**, not 30s; idle → 30min-done ladder                                    | **PORT the ladder; correct the number**      | `ba-status-fusion-presence-5zk` |
| 6   | Pending-tool reschedules rather than idling                                        | **PORT, and port `AnomalyDetector` with it** | `ba-status-fusion-presence-5zk` |
| 7   | Atomic single-frame `full_state` on connect                                        | **PORT**                                     | protocol work                   |
| 8   | Unbounded 39 MB snapshot; timeline capped by count not age                         | **AVOID — fix by age-cap or merge-patch**    | protocol work                   |
| 9   | `agent:spawn` doubles as update; client must be idempotent                         | **PORT the contract**                        | protocol work                   |
| 10  | Pull `request:history` / `request:toolchain` over the same socket                  | **PORT** — the escape hatch for #8           | protocol work                   |
| 11  | SQLite: readonly handle, watch the `-wal` sidecar, 500ms poll, bind `add`+`change` | **PORT**                                     | `ba-hookprovider-seam-lq2`      |
| 12  | `time_created` for parts, `time_updated` for messages, `callID` per tool           | **PORT — non-obvious, high value**           | `ba-hookprovider-seam-lq2`      |
| 13  | At-most-once-per-invocation; not a progress observer                               | **AVOID designing UI on top of this**        | protocol work                   |
| 14  | Silent identity fallbacks in `normalizeToolName` / `getZoneForTool`                | **AVOID — make unknowns loud**               | `ba-tool-map-port-89a`          |
| 15  | `normalizeToolInput` hardcodes 4 keys and aliases the caller's object              | **AVOID**                                    | `ba-tool-map-port-89a`          |
| 16  | Missing-data ⇒ adapter silently disabled                                           | **AVOID — report per-adapter state**         | `ba-adapters-template-a09`      |
| 17  | Does not build on Node 26; misleading error cascade                                | **AVOID**                                    | —                               |
