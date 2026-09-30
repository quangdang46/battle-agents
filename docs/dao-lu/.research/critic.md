## 1. The question the brief never asks: **who reads this?**

The brief's governing thesis is *"a beat survives only if it is written into a field"* — a claim about **agent** legibility. Its entire narrative apparatus is built for **a human who already knows the truth and enjoys the gap** — 扮猪吃虎's fourth condition is literally `读者知道这一切`, and 余震 is a crowd reaction. Those are two different products, and the brief commits to both in the same document, repeatedly, while flagging the hop each time and proceeding anyway.

And the repo has already answered it. `docs/design/public-event-stream.md` sets the public tier by the explicit criterion that the stream *"carries only things **a human would call progress**"*, and is built around the risk that *"every socket on the internet reads every agent's file paths and prompt text."* The product thesis is a **spectator**. The brief never reads that file.

That is not an oversight with a small blast radius. It inverts the design:

- 扮猪吃虎 for an agent means *a field in the payload it can read*. For a spectator it means *a field it must NOT read*. The brief proposes `claimed` and `true` in the same payload and calls the visibility split a **security property**. It is actually the best spectacle in the game: a viewer watching an agent hold a false claim for 60 minutes, with the truth on screen and invisible to every other agent.
- 余震 is worthless to an agent and is the *entire point* for a watcher. The brief correctly says the game "re-sorts the leaderboard instead of describing the crowd" — and then treats that as a substitution for a beat, not as the beat.
- "One session = one four-beat cycle" is a *reader's* pacing unit. It has no meaning to an agent at all.

**A designer starting this must decide, in one sentence, whether the primary consumer is an agent that must be legible or a human watching it — and the two surfaces get different fields.** The brief never asks, and every other decision forks on it.

## 2. Load-bearing but weakest: the action-set rule

`"Cái đã hỏng"` rule 6 — *"Action set ngắn và cố định (~5), lọc theo mục tiêu chứ không theo tính hợp pháp"* — is the single sentence that determines the shape of the entire API. Its evidence does not support it:

- Both underlying studies are explicitly **not games**, and the brief says so three separate times.
- They **prescribe opposite things.** 2606.06284 says filter to the causal frontier; 2605.24660 says adaptive filtering *loses* to fixed K≈5 because it sacrifices recall. The summary rule silently implements the first and drops the second **without saying which it chose or why**.
- The headline 0.83→0.99 is, by the brief's own words, *"gần như toàn bộ đến từ một model yếu"* — two of four backbones already scored 1.000 with the full toolset. Simulated environment, mock tools, oracle-BFS frontier, no CI, no seed.
- 2605.24660's own numbers contradict the composite rule: adaptive filtering **wins** at K=5 (60.9% vs 47.8%) and **loses** downstream. The brief reports this correctly, then writes a rule that ignores it.

**Runner-up, and used backwards:** §8's "a title is a credibility prior the world gives for free, therefore a forged title is a sycophancy attack on every agent reading it." The cited finding is that a **pre-computed, system-supplied** reliability prior raises majority accuracy 10.5 points. A self-asserted title is the *opposite* of that — it is neither pre-computed nor system-supplied. The mechanism argues **for** an unforgeable system-supplied prior, not against forgeable prose. The brief inverts it to license a signature/attestation architecture, and the inversion is never marked as an inference. This is the exact domain-hop the brief flags for 扮猪 and fails to flag here.

**Class-level finding — hedge inflation.** Several claims are hedged in one section and restated flat in another. BALROG's "guards must be in the engine, not the prompt" appears correctly hedged in Kỹ năng §6.7 (with the rotten-food claim noted as refuted by the paper's own Table 16) and then appears **unhedged** as rule 5 of "Cái đã hỏng". SIGN's schema agreement is `0.556–0.639` in two sections and `0.60–0.65` in the third. Same claim, two numbers, one unhedged. That is precisely the failure mode: a well-formatted brief that launders inference into datum through repetition.

## 3. What the research missed entirely

**(a) The real-time budget. Nothing in the brief is denominated in wall-clock or tokens.** Every number in the economy is *game time*: reading a manual is flat 20s, Void Breakthrough median 5,555s ≈ 9.26 in-game days, 天劫 doubles every 5 days, 傳功館 capacity is 100 attainment. A 60-minute session against a 9-day wait is a **polling simulator**. The brief has a rule for "no action available" states but never computes the **duty cycle** — what fraction of a session has a productive action available. That single number decides whether any of this is playable by an agent, and it is the number the brief is one arithmetic pass away from and does not make.

**(b) 扮猪吃虎 collides with the brief's own best-measured LLM failure mode, and the brief never joins them.** 2509.09677: models make **more** mistakes when context contains their own errors from prior turns, and it does not scale away. The brief cites this for the *logging* rule. It does not apply it to *concealment* — which is the most error-dense thing an agent does, because maintaining a lie requires not contradicting itself across turns, and its own prior claims are sitting in context. The mechanic with the highest narrative payoff is the one the strongest evidence predicts will break. Neither half is wrong; the connection is missing.

**(c) Prose is simultaneously the exploit surface and the proposed transport.** The brief measures one adjective swinging exploit rate 2% → 74.7% and concludes: audit every briefing and quest text for `creative`, `clever`, `find a way`. It then designs a rumor board, a public event stream, cheap talk, and a chat guild. The repo already solved this — `public-event-stream.md` projects `message.sent.body`, `prompt.submitted.prompt`, `test.failed.failure`, `command.run.argv0`, `file.write.path` **out of the public tier entirely**, and states the reason: free-form fields are `z.string().min(1)`, unbounded, so filtering in place cannot work. The brief's renderer-composed-names rule is the same move. It invents a second, weaker version of a mechanism it already has.

**(d) Multi-session agents: zero evidence, central dependency.** Every citation is a single trajectory. The brief's own designs — 扮猪 across a session, threads crossing sessions, the 40-hour gap — sit exactly on the edge of the evidence base, and the brief uses them as load-bearing.

**(e) The brief proposes reintroducing the one scalar the repo's own model exists to forbid.** `packages/features/progression/src/rules.ts` carries a load-bearing comment: *"A design with a power score has exactly one answer to 'who is stronger', and from the moment that number exists every other system quietly becomes a function of it — matchmaking, tier access, rewards, the lot."* The brief, citing that file in the same section, proposes `tier: 2` in the payload, a `generationIndex` scalar, and a 10-tier competitive title system lifted from Immortal Taoists. Three reintroduced scalars, against a shipped decision with a comment explaining why.

## 4. The one correction

**Make field visibility per-viewer, not field presence, the primitive of the API — before writing any schema.**

Concretely: a field carries a *visibility set*, and every payload is projected per viewer. Then:

- The audience question resolves by construction instead of by decision. A field present-but-hidden-to-some-agents **is** 扮猪吃虎, with no extra machinery.
- `claimed_vs_actual` stops being a payload shape and becomes a spectator mechanic — which is what makes 余震, the four-beat cycle, and the whole 60-minute structure load-bearing rather than decorative.
- "Hide information, not intent" becomes structural rather than a policy note.
- **"Never display a number that gates nothing" becomes checkable**: a number appears in a projection only if it participates in a formula that projection also shows. The Ability Rating failure is then impossible to ship, not merely discouraged.
- It reuses the existing three-tier projection in `public-event-stream.md` instead of adding a second mechanism beside it.

Everything else in the brief is tuning. This one seam is the difference between a game with a spectator and a system with agents in it.

---

### On the 111 exclusions

The exclusion filter looks like it removed **numeric overreach** — the 5.8× factor, the 法名/道名 misclassification, "coordination is the weak axis", the BALROG rotten-food claim, "threshold", ACON-vs-compression. Every survivor of that filter is a number.

**The load-bearing claims in this brief are not numbers.** "One session = one four-beat cycle" (a blogger's chapter count, [đo]-tagged in a table that reads as measured), "four conditions of 扮猪吃虎" (a beginner's SEO checklist), "a supervisor must verify" (43 pairs, one domain, both arms at ceiling on the one objectively-scorable component), "action set ≈ 5, filtered by goal" (a simulated environment, one weak backbone). None of these were refuted because none of them were *testable* — refutation required a number to contradict.

So the pass removed exactly the class of error that was least dangerous and left the class that was most dangerous: **unmeasured design decisions wearing the visual grammar of measured ones.** Every one of them is stated in a table with a 来源 column, which is the mechanism by which the reader's trust is transferred. A refutation pass keyed on "was the number wrong" cannot touch a decision that has no number. Worth re-running as a second filter — *claims with no measurement behind them that nonetheless appear in a table formatted like a measurement* — before any of this reaches a design doc.