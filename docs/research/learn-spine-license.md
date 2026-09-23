# learn-spine — license determination

- **Repo:** https://github.com/hoangnb24/learn-spine
- **Commit studied:** `e4a6996a3d6d5d36e31c8efaec1c5f0b669c11f4` (2026-09-12)
- **Date determined:** 2026-09-24
- **License: NONE. No license grant of any kind.**

This note exists to answer the one question the parent bead was blocked on, and to record
the evidence so nobody re-derives it.

---

## 1. Determination

**learn-spine has no license.** Determined four independent ways, all on 2026-09-24:

**1. No license file in the working tree.**

```
$ find .tmp/learn-spine -maxdepth 2 -iname "*licen*" -o -maxdepth 2 -iname "*copying*"
(no results)

$ git ls-files | grep -iE "licen|copying|notice"
(none tracked)
```

**2. No license field in `package.json`.**

```json
{ "name": "learn-spine", "private": true, "type": "module", "scripts": {...} }
```

No `"license"` key at all. (Contrast: the other five references all declare one.)

**3. GitHub's own API reports no license.**

```
$ gh api repos/hoangnb24/learn-spine --jq '{license, private, fork, archived}'
{"archived":false,"private":false,"fork":false,
 "description":"Spine learning references and an agent-operated 2D animation web platform",
 "license":null}
```

**4. The dedicated license endpoint 404s**, which is what GitHub returns when a repository
has no recognised license file:

```
$ gh api repos/hoangnb24/learn-spine/license
{"message":"Not Found","documentation_url":"...","status":"404"}
```

**5. A recursive scan of the remote tree finds no license path.** (Same result as the local
tracked-file scan in (1).)

### What "no license" means

Under default copyright, an author who publishes code **without** granting a license
**retains all rights**. Absence of a license is not permission — it is the absence of
permission. GitHub's own documentation is explicit that a repository with no license is
"not open source" and grants no redistribution rights.

**Therefore: do not copy anything from learn-spine.** Not code, not prose, not configuration,
not assets. Reading it for ideas is fine — ideas are not copyrightable, and clean-room
reimplementation from a behavioural description is a different act from copying text.

I copied nothing. This note describes what the repository _is_, not what it contains.

## 2. Corroborating caution: the underlying tool is commercial

Even setting the missing license aside, there is a second and independent reason for
caution. learn-spine is study notes on **Spine**, a commercial 2D animation editor by
Esoteric Software. Its own README states:

> Quy trình lưu/xuất project vẫn bị giới hạn bởi bản Trial.
> _(the save/export workflow is still limited to the Trial version)_

Its dependencies are `@esotericsoftware/spine-canvas` and `@napi-rs/canvas` — the Spine
runtime, which carries its own Esoteric Software license terms entirely separate from this
repository's.

So the situation is: unlicensed notes _about_ a commercial, trial-limited tool. Neither the
notes nor the tool's runtime are free to copy. This is not a repository you can draw on even
if the license question were resolved.

## 3. A caveat on the checkout itself

The local clone is **shallow**:

```
$ git rev-parse --is-shallow-repository
true
$ git rev-list --count HEAD
1
```

One commit, no history. This does not affect the license determination — a license that was
never added cannot be recovered from a deeper clone, and the GitHub API check (§1.3–1.4)
queries the remote, not the local copy, so the answer is about the repository as published.

It does mean any claim about this repo's history, authorship, or prior versions is
**unverifiable from this checkout**. I did not make such claims.

## 4. Status of the parent's stale caveat

The parent bead says the "empty/broken HEAD" caveat in plan sections 79 / 28.2 / 17.6 is
**outdated** — the repo is cloned and valid. **Confirmed: the caveat is outdated.** The
working tree is populated and readable (README, PLAN.md, PROGRESS.md, WORKFLOW.md, 24 KB +
57 KB + 18 KB of documentation, plus `docs/`, `lessons/`, `exercises/`, `examples/`,
`prototypes/`, `platform/`, `scripts/`). HEAD is a real commit
(`e4a6996`, "docs: reconcile accepted composition workflow and deferred backlog (#83)",
2026-09-12).

What remains open is **only** the license, and it is now closed: there isn't one.

## 5. Consequence for `ba-animation-core-spike-hf7`

The animation-core spike bead should not treat learn-spine as a source of runtime
behaviour. The reference implementation it offers is (a) unlicensed and (b) a
commercial trial-limited product.

For a skeletal animation runtime, the realistic options are the permissively-licensed
runtimes the ecosystem actually uses (Spine has a separate runtime under its own
Esoteric Software terms; alternatives differ by version and edition — **their licenses must
be checked individually at the time of adoption, not assumed**). I have not evaluated those
here; that is a separate piece of work and belongs to the spike, not to this bead.

## 6. Summary

| Question                                    | Answer                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Is the checkout valid?                      | **Yes** — the "empty/broken HEAD" caveat is outdated                                        |
| What is the license?                        | **NONE** — no LICENSE file, no `package.json` field, GitHub reports `null`, `/license` 404s |
| May we copy from it?                        | **No — nothing at all.** Default copyright applies; all rights reserved                     |
| Is there an independent reason for caution? | **Yes** — the underlying tool (Spine) is commercial and trial-limited                       |
| Is the checkout shallow?                    | Yes, depth 1 — fine for the license question, useless for history                           |
| Did we copy anything?                       | **No**                                                                                      |
