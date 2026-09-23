# arcane-agents — status fusion decider study

- **Repo:** https://github.com/thomasrice/arcane-agents
- **Commit studied:** `edcaf4018ab4681bd130b185d4cac6300dcbed98` (2026-09-05)
- **Date studied:** 2026-09-24
- **License:** MIT (GitHub SPDX `MIT`)
- **Relevant bead:** `ba-status-fusion-presence-5zk`
- **Status: NOT RUN.** I read `src/server/status/decide.ts` (the 1,061-line file named in
  the plan) and its surrounding types. **Everything below is source-derived, not
  observed.** The decider is pure and has a 1,287-line integration test, so its contract
  is well specified by reading alone.

---

## 1. The target file

`src/server/status/decide.ts` is **exactly 1,061 lines** at this SHA, confirming the plan's
figure. It is one exported decision function over a collected signal bundle:

```ts
export function decide(worker: Worker, signals: WorkerSignals, nowMs: number): WorkerStatusDecision;
export function evaluateWorkerStatus(input: EvaluateWorkerStatusInput): WorkerStatusDecision;
```

Pure: `(worker, signals, now) → decision`. No I/O, no clock read, no globals. **`nowMs` is
injected**, which is what makes the whole thing deterministically testable — the time
windows below can be exercised without sleeping. **PORT that injection point; it costs
nothing and buys you a fast, deterministic test suite.**

## 2. The decision shape — the single best idea here

```ts
export interface WorkerStatusDecision {
  status: Worker['status'];
  activityText: Worker['activityText'];
  activityTool: Worker['activityTool'];
  activityPath: Worker['activityPath'];
  confidence: number;
  reasons: StatusReason[]; // <-- why
  facts: StatusDecisionFacts; // <-- from what
}
```

`reasons` and `facts` **together** are the transferable idea, and they solve different
problems:

- **`facts`** is the complete derived input — every boolean and duration the decision
  depended on (`commandQuietForMs`, `outputQuietForMs`, `transcript`,
  `runtimePromptSignal`, `hasParsedStrongSignal`, `hasParsedError`, …). It is recorded
  whether or not the outcome was interesting, so you can always answer "why is this agent
  idle" by reading the last decision, with no re-execution and no log archaeology.
- **`reasons`** is the ordered, human-readable justification —
  `{ code: 'transcript-attention', message: 'Transcript reports attention.' }`. The `code`
  is a stable string, so it can be counted and alerted on; `message` is for humans.

**PORT both.** A status indicator that cannot explain itself forces every "why is it
showing that?" question into a debugging session. Pairing the outcome with the inputs and
the rule that fired turns that into reading a field.

`confidence: number` is also there — appropriate when fusing several weak signals, but note
it is only useful if something consumes it. An unconsumed confidence score is decoration.

## 3. Explicit precedence, by short-circuit

The function is an ordered cascade, not a scoring function. Attention wins first, and each
branch returns immediately. Reading the line numbers at `edcaf40`:

| Order | Source                    | Behaviour                                                                        |
| ----- | ------------------------- | -------------------------------------------------------------------------------- |
| 1     | `decide.ts:224-250`       | `transcript.status === "attention"` ⇒ `attention`, reason `transcript-attention` |
| 2     | `decide.ts:263, 276, 290` | further attention paths (approval pending, needs-input, runtime prompt)          |
| 3     | `decide.ts:300-306`       | genuine approval ⇒ `attention` — **with an explicit exclusion, see §4**          |
| 4     | `decide.ts:319`           | another attention path                                                           |
| 5     | `decide.ts:329`           | `transcript.status === "error"` ⇒ error path                                     |
| 6     | later                     | idle / working determination using the timing windows                            |

**AVOID a weighted-score fusion.** Priority-ordered short-circuits are auditable: you can
read the order and know exactly which rule wins. A weighted sum makes the same decision but
you cannot answer "what decided this" without re-running it and perturbing inputs.

**PORT:** keep the cascade, and **write the order down** somewhere the client can see. A
priority order that exists only in control flow is documentation you have to keep in sync
by hand.

## 4. The explicitly rejected signal — a negative example worth keeping

`decide.ts:300-303`, and this is the part I would quote in a design doc:

```ts
// Only a genuine approval routes to attention. The codex `prompt` signal also
// [fires in that case] ... the idle path and a finished codex reads idle,
// not attention.
```

**A signal that _seems_ obviously correct and is wrong, deliberately not used.** Codex
emits a `prompt` signal, and wiring it to `attention` looks right — but a _finished_ codex
session also leaves a prompt on screen, and routing that to attention makes every
completed agent light up as "needs you". So the signal is there, is detected, and is
excluded from the attention branch.

**PORT the practice, not just the rule.** When you build a status decider you _will_
discover signals that seem meaningful and are not. This repo's response is a comment
explaining why the obvious wiring is wrong — which stops the next person from
"fixing" it. A decider that silently omits a signal leaves an obvious-looking hole.

**This is the strongest argument for the `reasons[]` / `facts{}` design**: because
`facts` records the full derived signal set, a reviewer can see that `prompt` was
detected and deliberately not used, rather than wondering if the detection is broken.

## 5. Timing windows — all named, all injectable

```ts
const parsedStrongEvidenceWindowMs = 8_000;
const recentErrorSignalWindowMs = 15_000;
const commandWarmupWindowMs = 2_250;
const stickyWorkingWindowMs = 3_500;
const cachedActivityWindowMs = 12_000;
```

Plus a per-runtime override:

```ts
export function statusFreshnessWindowMs(
  runtime: RuntimeAdapter,
  runtimeFreshnessWindowMs: number | undefined,
): number;
```

**PORT — this is the one piece of the plan's clean-code rules the reference already
satisfies and should be copied verbatim.** Every window is a named constant with a unit
in its name, and freshness is per-runtime because different CLIs have different
heartbeat cadences. `commandWarmupWindowMs` is the interesting one: a shell takes a moment
to produce output, so a 2.25s warmup prevents "command started" from being read as
"command hung".

**AVOID hardcoding these inline.** They are the values most likely to need tuning per
deployment, and inline literals are unreviewable and unconfigurable.

## 6. Two more signal-hygiene helpers

```ts
export function shouldSuppressShellHistorySignals(...)   // decide.ts:991
export function recentNormalizedLines(output: string, limit: number): number[]  // decide.ts:978
```

`shouldSuppressShellHistorySignals` exists because a terminal replaying scrollback would
otherwise read as live activity — the same class of false-positive as agent-quest's
`isResumeHint` and as the rejected Codex `prompt` signal above. Three independent references
in this study hit the same failure mode: **a historical signal is indistinguishable from a
live one unless you explicitly suppress it.**

**PORT.** Generalisable rule for `ba-status-fusion-presence-5zk`: for every signal, ask
"what does this look like when it is stale?" and suppress that case explicitly.
`recentNormalizedLines(output, limit)` bounds transcript scanning for the same reason —
unbounded line scans are how a status checker becomes the slow part of the system.

## 7. Fatal-error detection by anchored signature

```ts
const fatalRuntimeErrorMatchers: RegExp[] = [
  /^traceback\b/i,
  /^unhandled(?:\s+\w+)?\s+exception\b/i,
  /^panic\b/i,
  /^fatal\b/i,
  /\b(out of memory|oom)\b/i,
  /\bsig(?:segv|kill|term)\b/i,
];
```

A closed, anchored list of known-fatal signatures rather than fuzzy "does this look like an
error" heuristics. Note the care in the patterns: `^` anchors for line-start signatures
(so a log line _mentioning_ "fatal" does not trigger), and `^unhandled(?:\s+\w+)?\s+exception`
matches both `unhandled exception` and `unhandled promise rejection`-style variants.

**PORT the anchoring discipline** — unanchored matches in terminal output are a reliable
source of false error states. `\b` boundaries, `^` anchors, and a closed list.

## 8. Runtime adapter seam

`decide.ts` imports from `./runtimes/adapter` (`RuntimeAdapter`, `RuntimeAdapterId`,
`RuntimeSignals`) and has per-runtime modules (`runtimes/codex.ts`, `runtimes/omp.ts`,
`runtimes/openCode.ts`). The decider is written against the **resolved adapter**, with a
`preferOpenCodeSpecificActivityText` helper where one runtime needs a special case.

That is the same shape agent-move uses (adapter normalises, decider stays
agent-agnostic) but applied one level up: agent-move normalises _tools_, arcane-agents
normalises _status signals_. The principle is the same and is worth stating once in our
own architecture: **adapters translate; the decision layer never branches on which CLI
produced the input.**

**AVOID:** the `preferOpenCodeSpecificActivityText` escape hatch is the seam leaking. It
exists because the normalisation was incomplete for one runtime. If porting, prefer fixing
the adapter over adding a runtime check to the decider.

## 9. Why 1,061 lines is at least defensible here

`decide.test.ts` plus `statusDecision.integration.test.ts` (**1,287 lines**) plus
`statusMonitor.test.ts` (627) plus `customStatusRules.test.ts` and
`claudeTranscriptTracker.test.ts` (613). The decider is one of the most heavily tested
files in the repo.

That is what earns it the right to be long: a pure function with a complete input bundle
and a large precedence cascade is genuinely hard to split without obscuring the ordering,
and it is fully pinned by tests.

**Still AVOID for us.** 1,061 lines in one function breaches the one-thing-per-function
rule regardless of test coverage, and "well tested" is a property of the _current_ code —
the next change will not be as careful. **PORT the contract, not the file:**

1. `StatusDecision` with `reasons[]` and `facts{}`
2. Priority-ordered short-circuits, documented
3. Named, injectable timing windows
4. Pure `(input, now) → decision`, clock injected
5. Explicit suppression of stale-lookalike signals
6. Anchored fatal-error signature list
7. Per-runtime freshness overrides behind one adapter

That is a few hundred lines and captures everything that made the original good.

## 10. Summary for porting

| #   | Behaviour                                                                      | Verdict                                     | Feeds                           |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------- |
| 1   | **Decision returns `reasons[]` + `facts{}` alongside status**                  | **PORT — the core idea**                    | `ba-status-fusion-presence-5zk` |
| 2   | Pure `(worker, signals, nowMs) → decision`, clock injected                     | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 3   | Priority-ordered short-circuit cascade, not a weighted score                   | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 4   | **A detected-but-rejected signal, with a comment saying why** (Codex `prompt`) | **PORT the practice**                       | `ba-status-fusion-presence-5zk` |
| 5   | All windows named with units; per-runtime freshness override                   | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 6   | `commandWarmupWindowMs` — a starting command is not a hung one                 | PORT                                        | `ba-status-fusion-presence-5zk` |
| 7   | `shouldSuppressShellHistorySignals` — stale-lookalike suppression              | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 8   | `recentNormalizedLines(output, limit)` — bounded transcript scan               | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 9   | Anchored `^`/ `\b` fatal-error signature list, closed set                      | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 10  | Adapters normalise signals; decider never branches on CLI                      | **PORT**                                    | `ba-status-fusion-presence-5zk` |
| 11  | `confidence` field                                                             | PORT only if something consumes it          | —                               |
| 12  | 1,061-line single function                                                     | **AVOID — port the contract, not the file** | `ba-status-fusion-presence-5zk` |
| 13  | `preferOpenCodeSpecificActivityText` runtime check inside the decider          | **AVOID — seam leaking; fix the adapter**   | `ba-status-fusion-presence-5zk` |
| 14  | `reasons[].code` counted for alerting                                          | PORT                                        | `ba-status-fusion-presence-5zk` |
