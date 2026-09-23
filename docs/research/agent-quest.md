# agent-quest — TOOL → activity mapping study

- **Repo:** https://github.com/FulAppiOS/Agent-Quest
- **Commit studied:** `010c791207c9e5670f07d0fbca3a62f3d1eb0fa7` (2026-06-12)
- **Date studied:** 2026-09-24
- **License:** MIT (GitHub SPDX `MIT`; note there is no LICENSE _file_ at the repo root,
  only the `package.json` field)
- **Relevant bead:** `ba-tool-map-port-89a`
- **Status: NOT RUN.** This repo is a browser game with an asset pipeline and a map
  editor; I read `server/src/parsers/session-parser.ts` and its types rather than booting
  the client. **Everything below is source-derived, not observed.** Flagged as such.

---

## 1. The mapping table itself

`server/src/parsers/session-parser.ts:3-12` — the whole thing:

```ts
const TOOL_ACTIVITY_MAP: Record<string, AgentActivity> = {
  Read: 'reading',
  Grep: 'reading',
  Glob: 'reading',
  Edit: 'editing',
  Write: 'editing',
  Bash: 'bash',
  NotebookEdit: 'editing',
  // Dispatching a subagent (Task/code review/etc.) → Watchtower.
  Agent: 'reviewing',
};

export function toolNameToActivity(toolName: string): AgentActivity {
  return TOOL_ACTIVITY_MAP[toolName] ?? 'thinking';
}
```

Eight tools, six activities. Compare agent-move's ~35-entry `TOOL_NAME_MAP` + 7 zones
(see [agent-move.md](./agent-move.md)) — agent-quest is far coarser, and the difference is
informative: the question is how much granularity the visualisation actually needs, not how
much you can enumerate.

Same silent-default issue as agent-move: an unknown tool becomes `thinking` with no signal.
Same verdict — **make unknowns countable.**

## 2. The genuinely clever part: refining `Bash` by command content

`session-parser.ts:14-17`:

```ts
// Match write-oriented git subcommands anywhere in the Bash command (covers
// `git add … && git commit …`, `cd repo && git push`, heredoc'd commits, etc.).
// Read-only subcommands like `git status`/`log`/`diff` intentionally stay as 'bash'.
const GIT_COMMAND_PATTERN = /\bgit\s+(commit|push|merge|rebase|cherry-pick)\b/;
```

The insight: **the tool name is too coarse to carry the meaning.** Every one of those is
`Bash`, but a `git push` is a materially different event from a `git status`. The regex
searches the whole command string, not a prefix, precisely so that compound commands
(`cd repo && git push`) and heredocs still match. And the negative case is deliberate and
documented: read-only git stays as plain `bash`.

**PORT — this is the single best idea in this note for `ba-tool-map-port-89a`.** A flat
`TOOL_NAME → activity` table is the wrong shape for `Bash` (and for any tool that takes a
free-text command). A narrow, anchored, explicitly-enumerated refinement over the command
body gets most of the value at a fraction of the mapping's growth rate.

Two design details worth copying:

- The alternation is a **closed list of write verbs** (`commit|push|merge|rebase|cherry-pick`),
  not "any git". Inverting it (list read verbs) would be more code and less precise.
- The comment states the _negative_ case explicitly, so the next person does not
  "helpfully" add `status|log|diff` and break the intent.

**Caution on porting:** this is regex over a command string, and command strings are
attacker- and accident-controlled. It is a display hint, not a security decision. Keep it
out of any path that grants access.

## 3. `parseUsage` — four buckets, and the reason matters more than the code

`session-parser.ts:30-45`. The comment is the payload:

> Cache READ tokens (`cache_read_input_tokens`, billed at 0.1× input) and cache WRITE
> tokens (`cache_creation_input_tokens`, billed at 1.25×–2× input) are kept SEPARATE:
> writes are 12.5–20× more expensive than reads, so folding them into a single "cached"
> bucket and pricing it at the read rate **massively misprices a session (the old
> behaviour)**.

They fixed a real bug by splitting one field into two. **PORT the separation** — the moment
you compute cost, collapsing read and write into "cached" is a 12.5–20× error on the
largest bucket in most agent sessions.

The return contract is also deliberate:

```ts
if (input === 0 && output === 0 && cacheRead === 0 && cacheWrite === 0) return undefined;
// "so we don't manufacture zero rows"
```

`undefined` ≠ zero. A missing usage block is _unknown_, and emitting a zero row fabricates
a datapoint. Same discipline as agent-move's `parseTokenUsage`, which returns `null` when
`!t?.input && !t?.output`.

Boundary hygiene, `session-parser.ts:23-25`:

```ts
function asNonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
```

`Number.isFinite` rejects `NaN` and `Infinity`; `Math.floor` guards against fractional
counts. Three checks, cheap, and it stops a malformed usage block from poisoning the
running total. **PORT** — this is what `unknown` + narrowing looks like when done right.

## 4. The `isResumeHint` trap — the highest-value finding in this note

`session-parser.ts:76-81`:

```ts
/**
 * True when this event was synthesized from a session-state dump (e.g. `last-prompt`)
 * rather than a timestamped user/assistant message. The state manager must not use it
 * to create agents or advance `lastEvent` — those dumps are re-appended by Claude Code
 * to historical JSONLs on resume and would otherwise resurrect long-dead sessions.
 */
isResumeHint?: boolean;
```

**What actually happens:** when you resume a Claude Code session, the CLI **re-appends
synthetic state-dump entries to the historical JSONL files**. A watcher that tails those
files sees brand-new lines in a transcript whose last real event was days ago. Naively,
that reads as "this session just did something" — so the dashboard shows a ghost agent that
resurrects every time you resume anything, or shows a session stuck "active" forever.

**PORT — port `isResumeHint` and the two rules attached to it.** Specifically:

1. Do **not** create an agent from a resume hint.
2. Do **not** advance `lastEvent` from a resume hint.

Both halves matter. Creating the agent gives you a ghost; advancing `lastEvent` gives you a
session that can never time out.

**This is the clearest example in the whole study of the bead's own thesis.** The rule
"read the sources while the specific porting question is live" exists because this is a
behaviour that is invisible in the source — you can read `last-prompt` handling all day and
not learn that the CLI re-writes history. It is only knowable from having been bitten.

**Flag:** I did not observe this happening live (I did not resume a session against a
running agent-quest). The behaviour is documented in the reference's own comment and is
consistent with how Claude Code's JSONL works, but treat the _mechanism_ as
source-derived until someone reproduces it.

## 5. Other parsed signals

From `ParsedEvent` (`session-parser.ts:56-90`):

- `kind?: 'tool' | 'task'` — discriminates an assistant tool call from a `last-prompt`
  task update. A cleaner discriminator than inferring from payload shape.
- `currentTask?: string` — the user's current prompt, on `task` events only.
- `isTurnEnd?: boolean` — "assistant message has only text blocks", i.e. the agent
  finished and is awaiting the user. This is a **direct idle signal from content**, not a
  timer — the interesting alternative to agent-move's purely timeout-driven idle.
- `hasError?: boolean` — true only when the user-message line carried a `tool_result` with
  `is_error: true`. Precise: it keys off the _result_, not the absence of a success.
- `lastMessage` — retained for display.
- `slug`, `cwd`, `file`, `command` — display context.
- `extractFileFromToolUse` handles the one case where the "file" is actually a command:
  ```ts
  if (toolName === 'Bash') {
    const cmd = input['command'];
    return typeof cmd === 'string' ? cmd : undefined;
  }
  const filePath = input['file_path'];
  return typeof filePath === 'string' ? filePath : undefined;
  ```
  Note it reads `file_path` (snake_case), the same field agent-move's `normalizeToolInput`
  normalises _to_. Both repos converged on snake_case as the internal convention.

**PORT:** `isTurnEnd` and `hasError` as first-class outputs. Both are content-derived
signals that an inference-only design has to guess at, and both feed
`ba-status-fusion-presence-5zk` directly.

## 6. Summary for porting

| #   | Behaviour                                                                                                                                         | Verdict                                              | Feeds                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| 1   | Coarse `TOOL → activity` table, 8 entries                                                                                                         | PORT the shape; prefer fewer buckets                 | `ba-tool-map-port-89a`          |
| 2   | **Refine `Bash` by command content** — narrow anchored regex over the whole command, closed list of _write_ verbs, read verbs explicitly excluded | **PORT — best idea in this note**                    | `ba-tool-map-port-89a`          |
| 3   | Regex over command strings is a display hint, not a security control                                                                              | **CAUTION**                                          | `ba-tool-map-port-89a`          |
| 4   | Four separate token buckets; never fold read+write                                                                                                | **PORT**                                             | cost work                       |
| 5   | `undefined` ≠ zero — do not manufacture zero rows                                                                                                 | **PORT**                                             | cost work                       |
| 6   | `asNonNegInt` — `isFinite` + `Math.floor` + non-negative                                                                                          | **PORT**                                             | cost work                       |
| 7   | **`isResumeHint`**: CLI re-appends state dumps on resume; do not spawn agents or advance `lastEvent` from them                                    | **PORT — highest value; source-derived, unobserved** | `ba-hookprovider-seam-lq2`      |
| 8   | `isTurnEnd` — idle inferred from turn shape, not a timer                                                                                          | **PORT**                                             | `ba-status-fusion-presence-5zk` |
| 9   | `hasError` keyed on `tool_result.is_error`, not absence of success                                                                                | **PORT**                                             | `ba-status-fusion-presence-5zk` |
| 10  | `kind: 'tool' \| 'task'` discriminator                                                                                                            | PORT                                                 | `ba-tool-map-port-89a`          |
| 11  | Silent `'thinking'` default for unknown tools                                                                                                     | **AVOID — same as agent-move**                       | `ba-tool-map-port-89a`          |
| 12  | `Bash` "file" is the command string                                                                                                               | minor, PORT                                          | `ba-tool-map-port-89a`          |
