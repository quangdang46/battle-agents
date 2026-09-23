# agent-world-codemoo — delta broadcast, permission queue, cost tracking

- **Repo:** https://github.com/codemoo/agent-world
- **Commit studied:** `851ceee1d3f67e78b0b9fbe3848dea27c89b798d` (2026-04-24)
- **Date studied:** 2026-09-24
- **License: AMBIGUOUS — see §5. Read this before copying anything.**
- **Status: NOT RUN.** I read `server/stateDiffBroadcast.js`, `server/permissionStore.js`,
  `server/costTracker.js` and their tests. The source is plain CommonJS with no native
  deps, so running it would have been cheap, but I prioritised running the two repos the
  bead names directly. **Everything below is source-derived, not observed.**

---

## 1. `stateDiffBroadcast` — the fix for agent-move's 39 MB problem

This is the important one, and it is a direct answer to the problem documented in
[agent-move.md §3](./agent-move.md): agent-move ships a **39.2 MB** `full_state` frame
because it re-sends the entire object graph on every connect. This repo sends a full
snapshot **once** and an **RFC 7396 JSON Merge Patch** for every subsequent change.

`server/stateDiffBroadcast.js`. The patch producer:

```js
// Produce a merge patch that, applied to `prev`, yields `next`.
// Limitation: arrays are not diffed; if arrays differ we include the whole
// replacement. That's fine for our state shape (most arrays are small).
function producePatch(prev, next) {
  if (!isObject(prev) || !isObject(next)) {
    if (prev === next) return {};
    return next;
  }
  const patch = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = prev[k],
      b = next[k];
    if (a === b) continue;
    if (b === undefined) {
      patch[k] = null;
      continue;
    } // deletion
    if (a === undefined) {
      patch[k] = b;
      continue;
    } // addition
    if (isObject(a) && isObject(b)) {
      const sub = producePatch(a, b);
      if (Object.keys(sub).length > 0) patch[k] = sub; // recurse
    } else if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) patch[k] = b;
    } else {
      patch[k] = b;
    }
  }
  return patch;
}
```

And the merge side:

```js
// RFC 7396 JSON Merge Patch: recursive merge. null values on the patch
// delete the key in the target.
function mergePatch(target, patch) {
  if (!isObject(patch)) return patch;
  if (!isObject(target)) target = {};
  for (const key of Object.keys(patch)) {
    const p = patch[key];
    if (p === null) delete target[key];
    else if (isObject(p)) target[key] = mergePatch(target[key], p);
    else target[key] = p;
  }
  return target;
}
```

Correct RFC 7396, including the subtle part: `undefined` in the _next_ state becomes `null`
in the patch, because `null` is the only wire representation of "delete this key".

**Debounce** — `DEFAULT_DEBOUNCE_MS = 50`. Any `schedule()` within the window coalesces
into one outbound message. Without it, a burst of agent updates fans out into a burst of
patches; with it, you get one patch per 50ms tick.

**First flush is always full** (`if (emitFull || !lastSnapshot)`), because there is nothing
to diff against. So the shape is the _same_ full-then-delta as agent-move — but the
"delta" is a **patch to apply**, not a **replacement to set**. That is the whole
difference, and it is the difference between 39 MB and a few hundred bytes.

**PORT.** If you take one thing from this repo, take this. It is directly applicable to
whatever protocol work follows `ba-game-client-pixijs-riw` and it retires agent-move's
biggest observed defect.

### Two things to fix when porting

**AVOID — the diff snapshot is a full deep clone every tick.** The comment describes a
selective strategy; the code does not implement it:

```js
// Shallow clone first two levels — enough to diff typical world state
// without paying a structured-clone cost each tick. For deeply-mutated
// sub-objects (avatars[id]), we clone deeply so producePatch sees stable
// comparison targets.
function snapshotForDiff(state) {
  return JSON.parse(JSON.stringify(state));
}
```

`JSON.parse(JSON.stringify(state))` is a **complete deep clone, unconditionally**, at
50ms intervals. There is no "first two levels" logic. **The comment and the code
disagree** — worth flagging precisely because the comment is the more appealing design
and someone will port the comment.

Cost is O(entire state) per flush. Fine for a small world; not for an agent list that
carries per-agent history. If you port: keep a `structuredClone` of the last-emitted
state, mutate a separate working object, and diff the two — or accept the cost and
measure before optimising.

**AVOID — arrays are never diffed.** Any array change sends the whole array. The comment
concedes this ("fine for our state shape (most arrays are small)"). It is a real trap if
you ever put a growing list in the state — an agent's activity history, a task queue.
A single append to a 5000-entry array re-sends 5000 entries every 50ms.

## 2. `permissionStore` — a queue that fails open

`server/permissionStore.js`. This is a PreToolUse hook that POSTs to the server, which
**holds the hook's reply Promise open** until a human resolves it in the browser.

```js
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_PENDING = 50;
```

Three-valued decision, and this is the part that matters:

```js
// `ask` means the hook should exit without overriding, letting Claude
// show its normal CLI prompt.
```

**On timeout, the decision is `'ask'` — not `'deny'`:**

```js
const timer = setTimeout(() => {
  if (pending.has(requestId)) {
    pending.delete(requestId);
    events.emit('permission-resolved', { requestId, sessionId, decision: 'ask', reason: 'timeout' });
    resolveFn({ decision: 'ask', reason: 'timeout' });
  }
```

**And the same on overflow:**

```js
if (pending.size >= MAX_PENDING) {
  return Promise.resolve({ decision: 'ask', reason: 'too many pending' });
}
```

**PORT — this is the correct default for any monitoring/approval layer.** A dashboard that
denies on timeout will silently block the user's own agents whenever the UI is closed, a
laptop sleeps, or the network blips. A dashboard that deadlocks on timeout will hang the
agent forever. Falling back to `'ask'` degrades to exactly the behaviour you would have got
without the tool installed — which is the correct outcome for an _optional_ enhancement.

**PORT** the overflow behaviour too: a full queue degrading open is right, and returning a
resolved promise (rather than rejecting) keeps the caller simple.

### The authentication split, stated explicitly

The header comment is worth reading in full, because the reasoning is sound:

> - The hook script is a trusted local process — it can only run if the user installed our
>   plugin via `npm run install-hooks`. So we don't authenticate the hook's POST; **we DO
>   bind requestId back to an allocated entry so the browser can route its decision.**
> - The browser DOES authenticate (bearer token + ws ticket), same as the rest of the app.

The key asymmetry: the **unauthenticated** hook cannot inject a decision for a
not-yet-allocated request, because `requestId` is minted server-side
(`pr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`) and the entry
is created atomically. The **authenticated** browser can only address an id that already
exists. That is the correct division: trust the local process, authenticate the network
surface, and make the untrusted side unable to name a target that does not exist.

**PORT.** If your approval flow lets a client propose an id, an unauthenticated caller can
race a legitimate decision.

### Endpoint shape

- `POST /api/hooks/permission-request` — from the hook
- `POST /api/permissions/:requestId/decide` — from the browser, rate-limited
  (`guardAndRateLimitHttp('sessions')`)
- `GET /api/permissions/pending` — observability, also rate-limited

Events on an `EventEmitter` feed the WS broadcast layer. The HTTP path and the WS path are
separately guarded, which is correct — they are different trust levels.

## 3. `costTracker` — incremental accounting

`server/costTracker.js`. The header describes the design precisely:

> 1. Lazy init: when asked for a session's totals the first time, we scan the full
>    transcript JSONL from byte 0 to the current end and remember where we left off.
> 2. On every subsequent update (call after snapshotter detects an mtime change), we seek
>    to the remembered offset and parse only the new records — **O(new bytes), not
>    O(file size)**.
> 3. Accumulate per-record: `type === 'assistant'` messages carry `message.usage`;
>    multiply by per-model rates from `PRICING`.

**PORT the offset-tracking idea.** A transcript that is 200 MB does not cost 200 MB to
re-account on every update, and the "remember where I stopped" trick is a dozen lines.
Combined with a cheap change trigger (mtime), total accounting work is proportional to
activity, not to history.

**Rebuild-on-demand** is the other half: state is in-memory only, and a restart rebuilds
lazily on first query, "cheap because the snapshotter only asks when a session is alive
and it only happens once per session per process." **PORT** — no migration, no
persistence format to keep in sync, and the cost is bounded by the live set.

**Rate table with a fragment fallback** — exact model ids, then substring, then default:

```js
function rateFor(model) {
  if (!model || typeof model !== 'string') return FALLBACK_RATE;
  const exact = PRICING[model];
  if (exact) return exact;
  const m = model.toLowerCase();
  if (m.includes('opus')) return PRICING['claude-opus-4-7'];
  if (m.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  if (m.includes('haiku')) return PRICING['claude-haiku-4-5'];
  return FALLBACK_RATE;
}
```

The fragment fallback means a brand-new model id still prices correctly by family. **PORT**
— exact-match-only pricing silently bills new models at the default rate.

`Object.freeze` on `PRICING`. `costOfUsage` returns 0 for missing usage rather than
throwing. Four separate buckets, consistent with agent-quest's finding.

**AVOID — the pricing is explicitly approximate**, and the source says so:

> Cache write = `cache_creation_input_tokens` (includes both 5m and 1h ephemeral writes —
> **we don't distinguish tiers here for UX simplicity; error is ~2× on the cache_write
> column only**).

So the `$` figure can be off by ~2× on one of four columns. **Do not present it as
billing-accurate, and do not use it for anything with financial consequences.** For a
"which agent burned the most tokens" display it is more than good enough.

## 4. Test coverage

Unlike most of these repos, codemoo ships tests for the two algorithms most worth copying:
`test/stateDiffBroadcast.test.js` and `test/costTracker.test.js`. Worth reading if you
port — they are the executable spec for the merge-patch semantics.

## 5. License — read this before copying

Three signals, and they do not agree:

| Source                     | Says                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `package.json` line 13     | `"license": "MIT"`                                                                                 |
| README §License (line 469) | "Agent World's own code is MIT (see `LICENSE`). Third-party assets retain their original licenses" |
| The actual file            | **Does not exist.** No `LICENSE` at the repo root.                                                 |
| GitHub API SPDX            | `null`                                                                                             |

**The README points at a `LICENSE` file that is not in the repository.** That is an
unresolved inconsistency, not a formality. A `package.json` `license` field is a
_claim_ by the author; with no LICENSE text present and no GitHub-detected license, I
cannot verify the grant covers what the README describes.

**Practical guidance:**

- **Code:** the author's intent is clearly MIT and is stated twice. Proceed on that basis,
  and keep the MIT attribution if you copy.
- **Assets: do not copy.** The README is explicit and separate: "The PixyMoon pack is **not
  included** in this repo (per their license ...)". Third-party packs retain their own
  terms and those terms are outside the repo's MIT grant.
- **If this becomes load-bearing,** the cheap resolution is to open an issue asking the
  author to add the LICENSE file. That is a five-minute fix on their side and removes all
  doubt.

## 6. Summary for porting

| #   | Behaviour                                                               | Verdict                                      | Feeds                      |
| --- | ----------------------------------------------------------------------- | -------------------------------------------- | -------------------------- |
| 1   | **RFC 7396 merge-patch delta** after one full snapshot                  | **PORT — retires agent-move's 39 MB defect** | protocol work              |
| 2   | 50ms debounce coalescing before diff+broadcast                          | **PORT**                                     | protocol work              |
| 3   | `undefined` in next state ⇒ `null` in patch ⇒ delete on apply           | PORT (comes free with RFC 7396)              | protocol work              |
| 4   | **Timeout ⇒ `'ask'`, never `'deny'`**                                   | **PORT — correct fail-open default**         | `ba-hookprovider-seam-lq2` |
| 5   | Queue overflow ⇒ resolved `'ask'`, not rejection                        | **PORT**                                     | `ba-hookprovider-seam-lq2` |
| 6   | Hook unauthenticated but id server-minted; browser authenticated        | **PORT**                                     | `ba-hookprovider-seam-lq2` |
| 7   | Separate rate limiting on hook vs decision endpoints                    | PORT                                         | `ba-hookprovider-seam-lq2` |
| 8   | Cost tracking O(new bytes) via remembered JSONL offset                  | **PORT**                                     | cost work                  |
| 9   | Lazy rebuild on restart, no persisted format                            | PORT                                         | cost work                  |
| 10  | Exact → family-fragment → default rate fallback                         | **PORT**                                     | cost work                  |
| 11  | `snapshotForDiff` comment describes selective cloning; code deep-clones | **AVOID — comment and code disagree**        | protocol work              |
| 12  | Arrays never diffed; any change re-sends whole array                    | **AVOID for growing lists**                  | protocol work              |
| 13  | Pricing ~2× off on cache_write tier; not billing-grade                  | **CAUTION**                                  | cost work                  |
| 14  | **No LICENSE file despite MIT claim; assets separately licensed**       | **CAUTION — code ok, assets no**             | —                          |
