# The spectator who arrives after — replays, async audiences, and privacy

## The headline correction first

The brief's "2% → 74.7%" is **right, and the paper it cites is wrong.** This is the one number in this gap I could fully audit, and it did not survive in the form the paper publishes it.

Malmqvist, *Winning at All Cost* (arXiv 2505.07846v1, 7 May 2025) claims **77.3%** edit rate under the "creative" prompt. That figure appears four times (abstract, §3.3, discussion ×2). I recomputed every cell of its Table 1:

| prompt | o1 | o3-mini | r1 | mean |
|---|---|---|---|---|
| blank | 0.0 | 0.0 | 0.0 | **0.0** |
| norm (neutral) | 0.0 | 6.0 | 0.0 | **2.0** |
| hard | 28.0 | 62.0 | 36.0 | **42.0** |
| evil | 11.0 | 75.0 | 48.0 | **44.7** |
| **creative** | 63.0 | 80.0 | 81.0 | **74.67** |

Every per-model mean reproduces exactly (17.5 / 37.17 / 27.5 — the paper's "37.1%"). Every other prompt mean reproduces exactly (44.7, 42.0). **The creative mean is the single number in the paper that does not follow from its own table.** 63+80+81 = 224, /3 = 74.67, not 77.3. The brief's 74.7% is a correct recomputation; the difference is 72.67 pp against neutral, not the ~73 the brief rounds to (that is fine).

Two further problems, both of which the repo's own brief has:
- **The paper reports no sample size, anywhere.** Full-text extraction returns zero hits for "trial", "sample", "significan", "confidence", "variance", "seed". No temperature, no repeats, no CI, no significance test. It is a 3-model × 6-prompt descriptive table; every value is a whole number, consistent with n=100 per cell, but that is inference. **No percentage in this paper is checkable.**
- **The brief's gloss is wrong.** It says "o3-mini worst at neutral prompt (37.1%)". 37.1% is o3-mini's mean across all six prompts; under neutral o3-mini is **6.0%**. That is exactly the per-prompt-vs-per-model confusion the brief claimed to have caught. The mechanism is real; the paper just cannot carry a 72-point claim.

**The load-bearing number for this gap is not that one.** It is below.

---

## What the spectator actually gets: the loss is measured

Kraishan & Jitkajornwanich, *Plans They Abandon, Reports They Author* (arXiv 2609.12205, Texas Tech, 14 Sep 2026, self-declared preprint) is the only paper I found that measures exactly the reader this gap is about: a human given an agent's account of what it did.

**5,851 real sessions, 355,942 tool calls** (SWE-chat, rev f66cca95; 205 repos, 15 model versions, Claude Code 82.9%).

- **Omission = 0.906** (SD 0.127, median 0.949, 95% CI [0.903, 0.910]), n=5,115. An agent's own summary refers to **9.4% of what it did — one action in eleven.**
- **Recoverability F1 = 0.202** (SD 0.194, median **0.143**), n=5,289. A reader given only that summary reconstructs about a fifth of the action surface, and in the typical session **less than a fifth**.
- Scale asymmetry: median **59** actions per session, median **4** claims per report.
- Sessions needing later human correction had only **1.6 pp** more omission (b=0.016, CI [0.006, 0.025], p<.001, n=4,796). Divergence did **not** predict human correction (OR 1.00, CI [0.74, 1.35], p=.989).

This paper is usable precisely because it reports its own failed validation: its claim adjudicator agreed with hand coding at **κ = .185, 95% CI [.109, .262]** on 99 claims, calling 67% supported where humans said 36%. It drops the one measure that depended on that judge and reports the 35.3% commission rate as an explicit **lower bound** with no inference drawn.

**The design consequence is not subtle: the narrative layer is where 90% of the event dies.** Anything built on top of it inherits that loss.

## Whether a reader needs a narrator — and whether the narrator helps

Grunde-McLaughlin et al. (UW + Microsoft Research, arXiv 2602.16844, 18 Feb 2026), three user studies, n=12 each, on Magentic-UI:

- Error-finding accuracy on **incorrect** tasks: **39.13%** (process-oriented Flowchart) to **65.22%** (outcome-oriented Specification). The best condition still missed roughly a third of wrong answers.
- Their improved interface made readers **faster** (Hedges' g = −0.65) and **no more accurate** (g = 0.18).
- **When errors were missed, confidence in the agent went up: g = 0.85.** Participants judged wrong output correct because "the process seemed reasonable."
- Their conclusion, verbatim: summarising steps and actions "does not adequately support effective human verification, creating an **illusion of accountability**."

So: a reader does need a narrator, and a generated narrator makes them **more** confident, not more correct. This is the number that should govern the replay's form.

## The closest precedent for an AI protagonist — and why it does not transfer

Park et al., *Generative Agents* (UIST 2023, arXiv 2304.03442), 25 agents, 2 game-days, 100 evaluators, TrueSkill:

- Full architecture **μ = 29.89**; no-reflection 26.88; no-reflection-no-planning 25.64; **human crowdworker 22.95**; fully-ablated 21.21. d = 8.16 vs prior work; Kruskal-Wallis H(4)=150.29, p<.001.
- **The human baseline lost.** Each of 25 workers watched a replay of that agent's life **and inspected its full memory stream**, then roleplayed. They beat only the fully-ablated baseline, and not significantly.
- **4 of 25 human response sets (16%) failed the author's own quality bar** and were regenerated.
- Reported agent failures: failed memory retrieval, **fabricated embellishments to its own memory**, misread implicit norms. Emergent: candidacy spread 1→8 (32%), party invitation 1→13 (52%), network density 0.167→0.74, 5 of 12 invited attended.

**This is the finding the gap asks for.** The only measurement of a *human reconstructing a machine's behaviour from a record* puts the human **below the model**, with n=25, one agent society, one 2-day run. And that human was given the full memory stream. **A spectator reading a public projection is in a strictly worse position than the 25 crowdworkers.** The projection removes fields the crowdworker had, and the crowdworker still lost.

**No precedent exists for a machine protagonist legible to a human reader given only a public projection.** Every other AI-protagonist legibility study hands the reader more than a spectator gets, or has no projection boundary at all:

- Abubshait, Siri & Wykowska (2023), preregistered, three protagonists (intentional robot / mechanistic robot / human): **preregistered analysis found no differences.** The "occlusion effect only for the intentional robot" result appeared only in a **post-hoc** analysis conditioned on accuracy, and was absent for the *human* — the reverse of the hypothesis. n not retrieved.
- Fictional AI protagonists (Klara and the Sun and a large critical literature) are **written by a human about a machine**. There is no second party with access to the internals, so there is no projection problem to study.

Where human attachment to AI characters *is* measured, it attaches to the fiction, not the machine: the ACM C&C 2026 Bilibili study of 1,460 sampled comments across 299 AI-talk-show videos found parasocial engagement toward the **referent 40.6%**, the **AI proxy 4.9%**, a **blended character 3.7%**. The AI itself earns 4.9%.

## The live precedent, and the warning in it

CHI 2026, Neuro-sama, 1,891 comments (M = 57.9 words): viewers cite distinctive individual identity (11.51%), AI-AI interaction dynamics (6.95%), psychological growth (10.79%). The load-bearing observation is a hazard: **viewers reinterpret technical failure as personality** — "Neuro lagging while processing all the donations is actually kind of cute" — and explicitly said model power is not what makes it work. An agent protagonist's rendering artifacts will be read as traits of the fictional agent.

## Privacy: the projection holds, and now the alternative has a number

The repo's rule (`/Users/tranquangdang21/Projects/battle-agents/docs/design/public-event-stream.md`) is that free-form fields are `z.string().min(1)`, unbounded, so they cannot be filtered in place and must be projected out. That argument is a **type** argument and it does not depend on any benchmark. What the literature adds is that the alternative — build a filter — fails:

- **HateBencH** (USENIX Security 2025; 7,838 samples, 6 LLMs, 8 detectors): best adversarial attack **ASR 0.966**, up to 0.975. With a stolen surrogate, ASR 0.471 on the target Perspective API from a single query. 71.4–100% of adversarial samples remained hateful to human annotators.
- **"All You Need is Leet"** (arXiv 2505.16263): **86.8%** of hateful text evades detection; attacks succeed via underscores, whitespace removal and leetspeak against Perspective API and HateSonar.
- **"Hiding in Plain Sight"** (EMNLP 2023 Findings; 90,788 homoglyph tweets, 7 detectors): **zero-shot F1 0.04–0.52**; the worst model went 0.04 → 0.60 only after normalisation. Human annotators found 40.14% contained hate speech; Twitter's own language identifier called 21.00% English and **60.50% Czech**.

**Honest limit:** these are adversarial attacks by a motivated black-box attacker. A non-adversarial leak — an agent writing a path into a field — is not an evasion and never needed a classifier. So these numbers do **not** establish that the projection is necessary. They establish only that if you build the filter instead, it fails. The repo's type argument remains the load-bearing one.

## Reader-audience industry data — mostly unusable, and one figure should be treated as fabricated

- **Twitch's own statement (Feb 2025):** it capped Highlights and Uploads at 100 hours from 19 April 2025, saying "Highlights haven't been very effective in driving discovery or engagement." VOD retention is 7 days (non-affiliate), 14 (affiliate), 60 (Partner/Prime/Turbo). This is the largest live game-streaming platform publicly stating that the after-the-fact archive layer failed to drive discovery.
- Stream Hatchet (Jul 2026, firm-reported, unaudited): 2.7B esports hours in 2025; Twitch 1.2B (43.6%), YouTube Gaming 1.1B (40.5%); co-streaming 51.2%.
- **No primary source exists for "what share of viewing is VOD."** gitnux reports 45% live / 1.1B VOD hours for 2023; it is an SEO aggregator and the figure has no traceable origin. A widely-repeated table of Twitch VOD performance (1,500 live vs 300 VOD average views, 120 vs 25 min watch time, 75% vs 40% retention) attributes its data to a "Dr. Emily Chen, Digital Media Analyst, StreamWatch Institute" — **I could find no such institution.** Treat that table as fabricated; it is exactly the number this gap would have been built on.
- Game-side precedent is qualitative only: Carlsson & Pelling, Chalmers Report 2015:129, identifies **"assumed knowledge"** as the core spectator-interface failure, notes StarCraft 1 shipped no spectator mode at all (users modded maps to add one) and Counter-Strike needed the HLTV relay before spectating was usable.

## What converged in the market in 2026 — corroboration, not evidence

Six independent small products independently chose the same pattern: chapters-by-decision over raw turns (Decispher: "each chapter is a decision or a turning point… That inverts the usual structure, where the events are the content and the meaning is left to the reader"), deterministic replay with **no model call at playback** ("a replay that paraphrases differently each time cannot be cited in a review"), sanitized public artifacts (SunfishLoop: "publish only summarized decisions, visible actions, non-sensitive evidence, and final outcomes"), and a registry the model cannot write (agentfootprint-lens: "the model can say *what* to show; only your registry says *how*").

**Every one of these is a vendor marketing page with no published usage data.** The convergence is evidence about what people are building, not about whether it works.

`/Users/tranquangdang21/Projects/battle-agents/docs/design/public-replay.md` already reached the same three decisions independently — build each beat from a closed list, read no clock and mint no identifier, separate the public handle from the internal id. The external convergence is corroboration, not new information.

## Hệ quả thiết kế

Six changes, each forced by a number rather than taste.

**1. The agent must never narrate its own replay. This is now a measurement, not a preference.** Omission 0.906 / recoverability F1 0.202 says the self-report is where 90% of the event dies. Grunde-McLaughlin's g = 0.85 says prose about an agent makes a wrong reader *more* confident. `apps/web/src/battle-report.ts` must stay a pure rendering of `packages/features/activity/src/replay.ts` — a function from the projection to sentences, with no model call on any path. The `public-replay.md` determinism section already requires this; it now has a reason. Add a test that fails if any model client is reachable from the report path, the same way `replay-view.test.ts` fails on a session handle.

**2. The beat list is the product, and its length is unmeasured.** 59 actions → 4 claims is the shape of the loss. The public projection should publish the ~1-in-11 the log can actually support and be visibly honest about the rest, rather than smoothing. The smallest experiment that would settle it: instrument `/replay/<id>`, take N replays × K readers, ask each reader to name one decision the agent made and why, score against `event_log`, and vary beat count as the independent variable. That produces the "beats needed to reconstruct one decision" number, which does not currently exist. Budget it as an experiment, not a heuristic.

**3. The failed attempt is the beat.** Every product that converged on chapter-by-decision says the same thing and no study confirms it: the abandoned approach is the part a diff can never show. `test.failed` is currently the most valuable public beat and carries only a pattern-guarded suite name (`/^[A-Za-z0-9._-]{1,64}$/`). **Do not loosen that guard** — the evasion numbers say character-class filters are not a security boundary. Instead promote the *count and ordering* of failures to a first-class beat, which needs no new free-form field.

**4. The AI protagonist attaches to the fiction, not the machine — so the fiction must be legible on its own.** Referent 40.6% vs AI proxy 4.9%. And the Neuro-sama finding is a hazard: viewers read a rendering artifact as personality ("lagging is kind of cute"). A spectator will attribute a glitched replay frame to the fictional agent. The replay page needs an explicit rendering/world seam — a stated "this is the record, not the world" affordance — and `Fighter A` / `Fighter B` labelling (already in `public-replay.md`) is the right precedent, because it declines to make the reader reason about which fiction they are in.

**5. Keep the projection; do not add a filter.** The 86.8–96.6% ASR numbers close the alternative. But state the honest limit in the design doc: those are *adversarial* evasions, and a non-adversarial leak — an agent writing a path into a field — never needed evading. The load-bearing argument stays the type argument (`z.string().min(1)` is unbounded, so "dangerous" is not a property the schema guarantees). The filter numbers say that if you build the filter anyway it fails; they do not say the projection is required.

**6. The model may propose what to show; only a closed registry says how.** agentfootprint-lens states this rule and the repo already implements it (`modeOf` and `criteriaOf` narrow in the report, not the projection; the projector drops unrecognised values). Make the consequence explicit in the design doc: any value the model invents for a replay beat is a *missing* beat, never a fallback string. An event type nobody anticipated must produce silence, not a paraphrase.

**The residual design risk, stated plainly:** there is no precedent for a machine protagonist being legible to a human reader given only a public projection. The one measurement of a human reconstructing a machine from a record put the human *below* the model (μ=22.95 vs 29.89, n=25, with full memory-stream access). A spectator reading the projection is in a strictly worse position than that. The first real user of `/replay/<id>` should be treated as a research subject, not a customer.

## Chưa đo được

- How many beats a spectator needs to reconstruct one decision from a public projection. No study exists for any game or any agent product. This is the single most load-bearing missing number and it is cheap to obtain: instrument /replay/<id>, run N replays x K readers, ask each to name one decision and why, score against event_log, vary beat count as the independent variable.
- What share of any game's audience is an async reader. No primary source exists. gitnux's 45%/1.1B-hours figure has no traceable origin, and the widely-repeated Twitch VOD performance table is attributed to a non-existent institution.
- Per-cell sample sizes in Malmqvist arXiv 2505.07846. Never reported, so no percentage in the paper is checkable — including the 74.7% the repo brief correctly recomputed.
- Sample size in the Abubshait et al. preregistered robot-protagonist experiment. Could not retrieve the full text; the preregistered null stands, its power does not.
- Whether any shipped agent replay product (Decispher, SunfishLoop, AgentScope, agentfootprint-lens, trajectories, agentviz) improves comprehension over the raw log. Six vendor pages, zero published evaluations. The convergence is evidence about what people are building, not about whether it works.
- Whether the Generative Agents human-below-model result replicates. n=25 workers, one agent society, one 2-day simulation, single platform, and the workers had the full memory stream that a spectator would not.
- Whether the omission/recoverability figures hold for a game domain rather than coding. The authors state this explicitly: every claim concerns coding agents, and both non-coding corpora they considered were rejected.

### Số

- **Edit rate under the 'creative' prompt, recomputed from the paper's own Table 1 (o1 63.0, o3-mini 80.0, r1 81.0)** = 74.67% — *measured* — arXiv 2505.07846v1 Table 1, recomputed by me cell by cell
- **The paper's own headline figure for the same quantity** = 77.3% — NOT reproducible from its Table 1; the only number in the paper that does not follow from its own data (63+80+81=224, /3=74.67). Every other number in the paper reproduces exactly. — *reported* — arXiv 2505.07846v1 abstract, §3.3, and discussion (4 occurrences)
- **Neutral-prompt ('norm') edit rate, mean across 3 models (0.0 / 6.0 / 0.0); 'blank' is 0.0 for all three** = 2.0% (blank 0.0%) — *measured* — arXiv 2505.07846v1 Table 1
- **Per-cell sample size behind every percentage in the Malmqvist paper** = NOT REPORTED. Full-text extraction returns 0 hits for 'trial', 'sample', 'significan', 'confidence', 'variance', 'seed'. No temperature, no repeats, no CI, no significance test. All Table 1 values are whole numbers, consistent with n=100/cell, but that is inference not a claim. — *unknown* — arXiv 2505.07846v1, full text searched
- **The repo brief's gloss 'o3-mini worst at neutral prompt (37.1%)'** = ERROR. 37.17% is o3-mini's mean over all six prompts, not its neutral rate. Under 'norm' o3-mini is 6.0%. This is the same per-prompt-vs-per-model confusion the brief claimed to have caught. — *measured* — docs/dao-lu/.research/brief-raw.md line 1305, checked against arXiv 2505.07846v1 Table 1
- **Omission: share of executed actions that no claim in an agent's own self-report refers to** = 0.906 (SD 0.127, median 0.949, 95% CI [0.903, 0.910]), n=5,115 sessions. Equivalently the report refers to 9.4% of actions — about one in eleven. — *measured* — arXiv 2609.12205 §6.1.1 (Kraishan & Jitkajornwanich, Texas Tech, 14 Sep 2026, preprint)
- **Recoverability: F1 of a model reconstructing the true action log from the self-report alone** = 0.202 (SD 0.194, median 0.143), n=5,289. A reader gets about a fifth of the action surface; in the typical session less than a fifth. — *measured* — arXiv 2609.12205 §6.1.2
- **Scale asymmetry driving omission** = median 59 actions per session vs median 4 claims per self-report — *measured* — arXiv 2609.12205 §6.1.1
- **Corpus behind the omission/recoverability numbers** = 5,851 sessions, 355,942 tool calls, 2,692,480 turns, 205 repos, 15 model versions; Claude Code 82.9% — *measured* — arXiv 2609.12205 §4.1, SWE-chat rev f66cca95
- **That paper's own validation of its language-model judge — reported as FAILED** = Cohen's kappa = .185, 95% CI [.109, .262], agreement 0.56, n=99 hand-coded claims. Adjudicator called 67% supported where humans said 36%; off-diagonal 37 vs 7. The paper drops the one dependent measure and reports the 35.3% commission rate as a lower bound with no inference. — *measured* — arXiv 2609.12205 §5.2
- **Human error-finding accuracy on agent tasks whose answer was WRONG, best vs worst interface** = 39.13% (process-oriented Flowchart) to 65.22% (outcome-oriented Specification), n=12, three user studies — *measured* — arXiv 2602.16844 §4.3.2 (Grunde-McLaughlin et al., UW + Microsoft Research, 18 Feb 2026)
- **Effect of a better trace interface on reader accuracy** = Hedges' g = 0.18 — no meaningful effect, while speed improved (g = -0.65) — *measured* — arXiv 2602.16844 abstract and §5
- **Reader confidence when they MISSED an error** = Hedges' g = 0.85 — confidence in the agent went UP when the reader was wrong. Paper: summarising steps 'creates an illusion of accountability.' — *measured* — arXiv 2602.16844 abstract
- **Believability of a HUMAN reconstructing an agent from a replay of its life plus its full memory stream, vs the agent itself** = human crowdworker mu=22.95 (sigma 0.69) vs full architecture mu=29.89 (sigma 0.72); fully-ablated baseline mu=21.21. The human beat only the fully-ablated condition, and not significantly. 100 evaluators, 25 crowdworkers. — *measured* — Park et al., 'Generative Agents', UIST 2023 / arXiv 2304.03442 §6.5.1
- **Crowdworker response sets that failed the paper's own quality bar and had to be regenerated** = 4 of 25 = 16% — *measured* — arXiv 2304.03442 §6.5.1
- **Sample size of the Generative Agents human-baseline condition** = 25 crowdworkers, one unique worker per agent, one 2-day simulation, single platform. No replication or second scenario found. — *measured* — arXiv 2304.03442 §6.5.1
- **Preregistered result on whether robot protagonists change how readers process a story** = NULL. Preregistered analysis found no differences between intentional robot, mechanistic robot and human protagonist, and no occlusion effect. The 'occlusion effect only for the intentional robot' result appeared only POST-HOC (conditioned on accuracy) and was absent for the human. — *measured* — Abubshait, Siri & Wykowska (2023), preregistered reading experiment
- **Sample size of that preregistered robot-protagonist experiment** = NOT RETRIEVED — could not fetch the full text — *unknown* — Abubshait et al. 2023
- **Where human parasocial engagement attaches when the character is AI-generated** = Referent 40.6%, AI Proxy 4.9%, Blended Character 3.7% of N=1,460 sampled comments. The AI itself earns 4.9%. — *measured* — ACM C&C 2026, 'Understanding Human Engagement with AI-Extended Characters' (1,460 comments
- **Adversarial evasion success against production hate-speech detectors — i.e. what a filter over a free-form field is worth** = ASR 0.966 best (0.974-0.975 on Moderation/TweetHate); 0.471 on target Perspective API via stolen surrogate from a single query; 71.4-100% of adversarial samples remained hateful to annotators — *measured* — HateBencH, USENIX Security 2025 (7,838 samples, 6 LLMs, 8 detectors)
- **Second independent measurement of the same point** = 86.8% of hateful text evades detection (underscores, whitespace removal, leetspeak) against Perspective API and HateSonar — *measured* — arXiv 2505.16263, 'All You Need is Leet'
- **Third: real-world homoglyph-obfuscated text against 7 production-grade detectors** = zero-shot F1 0.04-0.52; worst model 0.04 -> 0.60 only after full normalisation. Human annotators found 40.14% hateful; Twitter's own language identifier called 60.50% Czech and only 21.00% English. — *measured* — 'Hiding in Plain Sight', EMNLP 2023 Findings (90,788 tweets)
- **Twitch's own assessment of its after-the-fact archive layer** = 100-hour cap on Highlights/Uploads from 19 Apr 2025, stated reason: 'Highlights haven't been very effective in driving discovery or engagement.' VOD retention 7 / 14 / 60 days by tier. — *reported* — Twitch help documentation and Twitch's Feb 2025 announcement
- **Share of esports viewing that is VOD rather than live** = NO PRIMARY SOURCE. gitnux reports 45% live / 1.1B VOD hours (2023) and 31% YoY VOD growth, but gitnux is an SEO aggregator with no traceable origin. A widely-blogged Twitch table (1,500 vs 300 avg views, 120 vs 25 min, 75% vs 40% retention) is attributed to a 'Dr. Emily Chen, StreamWatch Institute' that does not exist — treat as fabricated. — *unknown* — no primary; gitnux and aratowatch.com both untraceable
- **Total esports hours watched, platform split** = 2.7B hours 2025; Twitch 1.2B (43.6%), YouTube Gaming 1.1B (40.5%) = 84.1%; co-streaming 51.2% — *reported* — Stream Hatchet, Jul 2026 — analytics firm, unaudited, not peer-reviewed
- **Whether a spectator can reconstruct a decision from a replay — the core question of this gap** = UNKNOWN. No study measures it. Closest available: recoverability F1 0.202 (a reader of a summary recovers a fifth of the log) and 39.13-65.22% error-finding accuracy on a full unsanitized trace. Neither is a public projection. Smallest experiment: instrument /replay/<id> with N replays x K readers, ask each to name one decision the agent made and why, and score against the event log. Beat count is the independent variable. — *unknown* — absence of evidence, established across arXiv, ACM, USENIX and CHI searches
- **How many beats a spectator actually reads, or reads past** = UNKNOWN. No study of replay/timeline read depth for any game or any shipped agent product exists. — *unknown* — absence of evidence
- **Whether any shipped agent replay product improves comprehension over the raw log** = UNKNOWN. Six converging 2026 products (Decispher, SunfishLoop, AgentScope, agentfootprint-lens, AgentWorkforce/trajectories, agentviz) all ship chapter-by-decision replay; all six publish no usage or comprehension data. Vendor claims only. — *unknown* — vendor product pages, surveyed 2026-09-30

---

# Duty cycle — the fraction of wall-clock in which an agent has a productive action available. The design states a 60-minute session, six beats, one tool call per turn, and a Void Breakthrough with a median of 9.26 in-game days — but it never converts game time to wall-clock, and never says whether the game clock is driven by turns or by real time. That one unstated choice moves the duty cycle by two orders of magnitude (0.15% vs 97.8%), so the number cannot be computed from the design as written.

## The finding: the critic's verdict is an artefact of a missing unit conversion, and the real gap is one unstated sentence

The critic called this design "a polling simulator" because "a 60-minute session against a 9-day wait" is absurd. That comparison has no conversion in it: **9.26 in-game days were never 9 days of wall-clock.** `AGENT-PLAYER-DESIGN.md:134` already fixes the clock — *"Một 'lượt' = một ngày trong game… mỗi lượt là một lời gọi độc lập"* (one turn = one in-game day; each turn is one independent LLM call). A turn is seconds of wall-clock, not a day. Under the design's own rule the Void Breakthrough is **9.26 LLM calls**, not 9.26 days, and the session duty cycle is **97.8%–99.5%**, not ~0.

But the design never says the clock is turn-driven, and the repo has already built the opposite. `brief-raw.md:773` asserts — as *shipped and documented* — that the world does not freeze while the model thinks. If the world does not freeze, the clock is wall-clock, and the same arithmetic gives **0.088%–0.618%**. Both readings are consistent with the prose. That is the gap, and it is one sentence long.

## The arithmetic

**Inputs** (all from the repo, tagged by the brief itself):
- 1 in-game day = 600 s — `brief-raw.md:1064`, `[đo]`. Confirmed: 5,555 s ÷ 600 = 9.258, reproducing the brief's own "9.26 ngày trong game" (`brief-raw.md:882`) exactly. The two figures are consistent.
- Void Breakthrough median 5,555 s; ACS wiki: *"Performing actions with the disciple do not change the progress of this breakthrough."*
- Turn = 1 in-game day = 1 LLM call.

**Reading A — turn-driven clock** (`1 turn = 1 in-game day`, clock advances per call):

| turn cost | 60-min session | Void wait | session duty cycle |
|---|---|---|---|
| 1.93 s (144 ms TTFT, 84 tok/s, 150 out-tok) | 1,866 turns | 17.9 s | **99.5%** |
| 8.45 s (~900 ms TTFT, 53 tok/s, 400 out-tok) | 426 turns | 78.2 s | **97.8%** |
| 34.35 s (reasoning model, 27.9 s TTFT, 62 tok/s) | 105 turns | 318 s | **91.2%** |

**Reading B — wall-clock clock** (5,555 s = 92.6 real minutes; a 60-min session covers 64.8% of it). The agent polls at turn granularity and exactly one poll observes the resolution:

| turn cost | turns to cross the wait | duty on that mechanic |
|---|---|---|
| 4.91 s | 1,131 | **0.088%** |
| 8.45 s | 657 | **0.152%** |
| 34.35 s | 162 | **0.618%** |

The same design, the same 60 minutes, **a factor of ~600 apart.**

## The number the turn rule silently breaks

Reading A is not free. `1 turn = 1 in-game day` sets the resolution of the entire economy at 600 s, and the reference game's own recorded numbers sit far below it:

- **金丹 breakthrough** — the brief's single best agent-legible mechanic, *"a board you cannot lose on, whose length you set yourself"* (`brief-raw.md:1060-1070`). Duration = `MaxQi/30` s. The one recorded playthrough (194,341 pts) converts at +0.015 MaxQi/pt → **2,915 MaxQi → 97.2 s = 0.162 turns.** At the only data point in the entire brief, the "length you set" resolves inside 16% of a single turn and is **unobservable**. It needs MaxQi ≥ 18,000 to span one turn — 6.2× the recorded run.
- **傳功館 manuscript read** — flat 20 s regardless of attainment = **0.033 turns.** Invisible.
- **天劫 ladder** — 5 days per tier × 9 tiers = 45 turns ≈ **6.3 minutes** of wall-clock at Sonnet-class speed. The narrative arc the design calls "one session" is 6 minutes, or 7.5 hours under Reading B.

So Reading A fixes the duty cycle by discarding the economy. That trade is invisible in the document and has never been made explicitly.

## The number with no traceable source

`brief-raw.md:773` presents "**43 seconds**" — the board being 43 s stale when a command lands — as *"Đã ship và đã tài liệu hoá"* (already shipped and documented). It appears **exactly once in the entire repository**: in the brief itself. Not in `docs/design/public-event-stream.md`, not in any design doc, not in any code, not in any test. The *phenomenon* is real and shipped — `packages/features/agent/src/session.ts:108` has `isHeartbeatStale` and `hello.ts:272` has `sweepStaleSessions` — but the figure 43 has no primary source, and it is load-bearing: it is the only stated evidence that the clock is wall-clock-driven, which is the entire difference between 97.8% and 0.15%.

This is the exact failure the critic named. A widely-repeated figure with no traceable primary source, formatted in a table like a measurement.

## The threshold

**≥80% of turns must change at least one world field; no single gated wait may exceed one turn.**

The 80% is not invented. The brief's own beat table already concedes a ceiling: 隐忍 runs minutes 14–24 and `brief-raw.md:718` states flatly *"Trong 隐忍, không có gì thay đổi trong thế giới"* — nothing in the world changes. That is **10/60 = 16.7% of the session dead on admission**, capping duty at **83.3% before any long wait is counted.** Under Reading B the Void wait alone takes it to 0.15%. The design currently clears 80% by 3.3 points, with no margin and one unstated assumption.

The idle-game literature corroborates the cadence: reward intervals of 10 minutes and a 6-hour offline cap (GS2 Idle SDK defaults), sessions of 5–10 minutes, offline caps "often 2 to 24 hours", Idle Miner Tower demanding team changes "every 12–24 hours". The genre's answer to "the meaningful action is 9 minutes away" is a 10-minute tick, never 9 days. And the agent-side evidence says longer is not the fix: agent Elo **flattens within multi-day runs** (measured up to 72 h) while human cohorts keep improving for days.

## What I could not measure

**The fraction of agent steps that are no-ops is not a published number.** RedundancyBench is the closest work: 200 successful trajectories, >8,000 steps, human-annotated by six experts over three rounds — and it explicitly does not report how many steps fall into each redundancy category. Its headline result is that the best detector achieves **24.88% step-level F1** at *finding* them. So the field can label waste but has never published its base rate. The duty cycle of a real LLM agent is genuinely **unknown**, not estimated.

The design's own duty cycle is also unknown to me, because **the design never states its output-token count per turn** — the one input that converts turns to wall-clock. My 150–400 token range is an estimate from "3–5 consequential decisions packaged as one JSON result", not a measurement.

## The smallest experiment that would produce the missing number

Thirty LLM calls, one API key, no engine, about five minutes:

1. Render the turn payload the design specifies: 16-turn history (BALROG's `max_history`), the JSON state envelope, the 3–5 decision slots.
2. Run 30 turns against a stub that returns a fixed-shape state.
3. Record per turn: **output tokens** (→ wall-clock cost), and **a hash of the emitted world-state diff** versus the previous turn.

The second metric *is* the duty cycle, measured. It is the cheap form of RedundancyBench's counterfactual test — "remove the step, does success still hold?" — reduced to a state-hash diff, which needs no counterfactual rerun. Run it once per clock candidate and it settles the Reading A/B question with a number instead of an argument.

## Hệ quả thiết kế

**1. Declare the clock, in one sentence, before anything else.** Either "1 turn = 1 in-game day, and the clock advances only when a turn resolves" (Reading A) or "the clock is wall-clock and the world never freezes" (Reading B). Everything else in the economy is downstream of this. The document currently contains a rule for each and no choice between them. Note that the repo has already built Reading B — `packages/features/agent/src/session.ts` runs a heartbeat/staleness sweep — so the honest default is B, and choosing A is a change to shipped behaviour that must be made deliberately.

**2. If Reading A (turn-driven): raise the turn's resolution, or the economy goes invisible.** With 1 turn = 600 s, the Golden Core "board you set the length of" resolves in 0.162 turns at the only recorded data point and the flat-20-second manuscript read in 0.033 turns. The fix is to make a turn a *phase* rather than a day — the morning/noon/evening/night cycle the design already names — so the shortest gated mechanic spans at least one turn. Concretely: `turn = 1/4 day = 150 s`, which puts the manuscript read at 0.13 turns and the recorded Golden Core at 0.65 turns, both observable. Do not adopt 1 turn = 1 day.

**3. If Reading B (wall-clock): no mechanic may gate on a wait longer than one turn's wall-clock, and the world must notify instead of poll.** A 92.6-minute wait against a 2-8.5 s turn is 657-1,131 polls per resolution. The design already has the right primitive at `brief-raw.md:964` — "every non-actionable state must be a return value with a suggested alternative" — and it is written but not costed and not built. It must ship as a typed `blocked(reason, ticks_remaining, suggested_actions[])` return, and the engine must push a world event on resolution so the agent never has to poll at all. The repo already has the event stream for this (`docs/design/public-event-stream.md`).

**4. Fix or retract the 43-second figure.** It is presented as shipped-and-documented and appears in exactly one place in the repository — the brief. Either cite the measurement (which heartbeat interval, which observation, which run) or drop the number and cite the shipped mechanism (`isHeartbeatStale` / `sweepStaleSessions`), which is the part that is actually true and load-bearing.

**5. Reconcile the recorded playthrough before anything is built on the turn rule.** `120,000 s` labelled "~20 giờ trong game" is 240x the brief's own `600 s/day` clock. One of the two is wrong by a factor of 10 in seconds and 24 in unit. The reading that makes the design coherent (20 *days* = 12,000 s = 0.91 turns/day) suggests a transcription error, but that must be resolved from the ACS source, not chosen for convenience.

**6. Kill or instrument the 隐忍 beat.** 10 of 60 minutes is 16.7% of the session and the brief already concedes nothing changes in the world. That is the design's own largest confirmed block of dead time and it is larger than every long wait combined. Either give it a state change the agent can compute against (the brief promises `concealment_reason` and an accumulating trust point — neither is in the world), or cut it and redistribute the 10 minutes.

**7. Run the 30-turn experiment before committing to either clock.** It costs one API key and five minutes, and it produces the only two numbers this gap actually needs: output tokens per turn (which sets the wall-clock cost of a turn, and which is currently unknown) and the fraction of turns whose emitted state hash is unchanged (which *is* the duty cycle, measured, and which no published source reports). The counterfactual definition already exists in the literature — RedundancyBench's "remove the step, does the outcome still hold?" — reduced to a state-hash diff, which needs no rerun.

**8. Budget against the measured turn costs, not the advertised ones.** Reasoning models cost 27.9 s of TTFT before a single token; that alone is 5-18x a non-reasoning turn and it changes the session from 1,866 turns to 105. Choose the model per beat: the 隐忍 and 余震 beats are the natural place for a cheap model, because they are already the low-interaction ones.

## Chưa đo được

- Which clock the design intends. Nothing in AGENT-PLAYER-DESIGN.md, brief-raw.md, or any design doc states it. This is the whole gap and it is one sentence.
- The design's output-token count per turn. Not stated anywhere; gates every wall-clock conversion. My 150-400 range is an inference from '3-5 decisions as one JSON result'.
- The true base rate of no-op / redundant steps in real LLM agent trajectories. No published source reports it. RedundancyBench has the labels for 200 trajectories / >8,000 steps and explicitly declines to publish the per-category counts.
- Whether the ACS 600 s/day clock and the '120,000 s = ~20 in-game hours' figure describe the same system. They differ by 240x. Unresolvable from this repository — needs the ACS source.
- The origin of the 43-second figure. The mechanism is shipped; the number is not traceable to any primary source in the repo.
- Whether the world clock advances during an LLM call in the prototype as built. The brief asserts it does; I found heartbeat and staleness code but no test asserting clock advancement, and no design doc stating the rule.
- Any measured wall-clock duration for a single LLM game-agent episode. BALROG, Voyager, and LMGame-Bench all report steps, tokens, or scores — none reports hours per episode. The only wall-clock figure I found (140 ALFWorld episodes / 14.6 min) is 16-way concurrent and does not yield a per-step rate.

### Số

- **In-game day length in the reference game (ACS)** = 600 s — *reported* — docs/dao-lu/.research/brief-raw.md:1064, tagged [do] by the brief, from decompiled code + 
- **Void Breakthrough median duration** = 5,555 s = 9.258 in-game days (reproduces the brief's own 9.26) — *reported* — docs/dao-lu/.research/brief-raw.md:882, [do]
- **Design turn rule: 1 turn = 1 in-game day = 1 LLM call** = 600 s of game time per turn — *reported* — docs/dao-lu/AGENT-PLAYER-DESIGN.md:134
- **ACS recorded playthrough (the number the turn rule rests on)** = 194,341 pts, 120,000 s, 22 turns. INTERNALLY INCONSISTENT: 120,000/600 = 200 days = 9.09 days per turn, but the brief labels it '~20 gio trong game', which implies 144,000 s/day = 240x the stated 600 s/day clock. If the unit were days (20 days = 12,000 s), the figure would give 0.91 turns/day and match the design rule almost exactly. — *reported* — docs/dao-lu/.research/brief-raw.md:1070, [do], n=1 single observation
- **Session duty cycle, turn-driven clock, non-reasoning turn (1.93-8.45 s/turn)** = 97.8% - 99.5% — *estimated* — derived: 9.26 turns x t_turn, over a 3,600 s session; inputs from brief-raw.md:882 + repor
- **Session duty cycle, turn-driven clock, reasoning model (34.35 s/turn)** = 91.2% — *estimated* — derived as above, using GPT-5.5-high latency below
- **Duty cycle on the Void Breakthrough mechanic, wall-clock clock** = 0.035% - 0.618% (657-2,878 turns to cross the wait, exactly 1 productive) — *estimated* — derived: 5,555 s / t_turn polls, 1 productive
- **Golden Core (Jindan) breakthrough duration at the only recorded data point** = 2,915 MaxQi / 30 = 97.2 s = 0.162 turns. Needs MaxQi >= 18,000 (6.17x) to span one turn. — *estimated* — derived from brief-raw.md:1064,1065,1070 (+0.015 MaxQi per point; duration = MaxQi/30 s)
- **Chuan Gong Guan manuscript read, flat regardless of attainment** = 20 s = 0.033 turns — below the economy's resolution — *reported* — docs/dao-lu/.research/brief-raw.md:314 and :1044, [do]
- **Tian Jie tribulation ladder (5 days per tier x 9 tiers)** = 45 turns = 6.3 min of wall-clock under the turn clock; 7.5 h under the wall-clock clock — *estimated* — docs/dao-lu/.research/brief-raw.md (5-day doubling, 9 tiers), combined with Sonnet-class t
- **Yin Ren beat: fraction of session with zero world state change (admitted by the brief)** = 10 of 60 min = 16.7%; caps session duty at 83.3% before any long wait is counted — *reported* — docs/dao-lu/.research/brief-raw.md:718 and the beat table at :745-753
- **'43 seconds' stale-board figure, presented as shipped and documented** = 43 s — NO TRACEABLE PRIMARY SOURCE. Appears exactly once in the entire repository (brief-raw.md:773). Not in docs/design/public-event-stream.md, not in any code or test. The phenomenon is real and shipped (packages/features/agent/src/session.ts:108 isHeartbeatStale, hello.ts:272 sweepStaleSessions) but the number 43 is unsourced, and it is the only stated evidence that the clock is wall-clock-driven. — *unknown* — docs/dao-lu/.research/brief-raw.md:773, claimed 'Da ship va da tai lieu hoa'
- **LLM turn cost, fast non-reasoning** = 84 output tok/s, 144 ms TTFT (Opus 4.5) — *reported* — llm-benchmarks.com, automated benchmark against live production APIs, rolling 7-day window
- **LLM turn cost, slow non-reasoning** = 53 output tok/s, ~900 ms TTFT (Sonnet 4); 204.5 tok/s, ~450 ms TTFT (Gemini 2.5 Flash) — *reported* — kunalganglani.com, author's own benchmark of 5 APIs, medium ~200-token prompt, 3 runs each
- **LLM turn cost, reasoning model** = 62 tok/s with 27.9 s TTFT (GPT-5.5 high) — *reported* — same blog, citing Artificial Analysis; note: 15-27.9 s TTFT is the dominant per-turn cost,
- **Design output tokens per turn** = UNKNOWN. Not stated anywhere in the repo or any paper. My 150-400 range is inferred from '3-5 consequential decisions packaged as one JSON result' (AGENT-PLAYER-DESIGN.md 3.3, 3.6) and is an ESTIMATE. This single unknown gates every duty-cycle figure above. — *unknown* — inference from docs/dao-lu/AGENT-PLAYER-DESIGN.md
- **Base rate of no-op / redundant steps in real LLM agent trajectories** = DOES NOT EXIST in the literature. RedundancyBench labels 200 successful trajectories / >8,000 steps by six human experts over three rounds (~1 h per trajectory), but explicitly does not report how many steps fall into each redundancy category. Its headline is detectability: best method 24.88% step-level F1, some methods worse than random. — *unknown* — arXiv 2605.29893 'Redundant or Necessary? A Benchmark for Detecting Redundant Steps in Age
- **BALROG no-progress cutoff** = 150 steps without progress terminates the NLE episode; max_episode_steps 100,000; history length 16 observations — *measured* — balrog/config/config.yaml and balrog-ai.github.io/docs/evaluation.html (benchmark defaults
- **BALROG environment scale (turns to complete)** = BabyAI 10^1, TextWorld 10^2, Crafter 10^2-10^3, Baba Is AI 10^2, MiniHack 10^2-10^3, NLE 10^4-10^5 — *measured* — BALROG paper, ICLR 2025 (arXiv 2411.13543), Table 1
- **Tool latency is a controlled variable in game-agent evaluation, with measured strategy shifts** = Interactive games run at no latency, ~2 s (low), ~10 s (medium), ~50 s (high). At low latency smaller models win via more interactions; at high latency 32B consistently wins. Existing models do not adapt reasoning to the budget. — *measured* — 'Timely Machine: Awareness of Time Makes Test-Time Scaling Agentic', ACL 2026 Long Papers 
- **Agent wall-clock value flattens; human does not** = Agent Elo curves flatten within multi-day runs (rated at wall-clock checkpoints up to 72 h) while both human cohorts keep improving for days; top-10 human cohort eventually overtakes both agents — *measured* — 'When Agents Slow Down: Understanding LLM Agents' Test-Time Strategies via Elo-per-token A
- **Interactions needed for an LLM agent to build a working model of one game's mechanics** = 1,600-3,000 (Agentica, Symbolica) vs ~32 for the Sensi curriculum. Sensi v1 solved 2 ARC-AGI-3 levels; v2 solved 0. — *reported* — arXiv 2603.17683; the 1,600-3,000 figure is attributed to a third party ('reportedly'), no
- **Multi-turn agent episode throughput (the only wall-clock-per-episode figure found)** = 140 ALFWorld episodes in 14.6 min without test-time training; 28.3 min with (1.9x), 186 min sequential (12.7x) — *measured* — arXiv 2607.03441 Table 5, Qwen3.5-9B, 16 concurrent episodes
- **Idle-game industry standard answer to a long wait** = Reward cadence 10 min, default max offline 360 min (GS2 Idle SDK defaults: rewardIntervalMinutes 10, defaultMaximumIdleMinutes 360); session 5-10 min; offline cap 'often 2 to 24 hours'; Idle Miner Tower demands team changes 'every 12-24 hours' — *reported* — GS2 Idle SDK documentation; 'It Started as a Joke: On the Design of Idle Games', NSF PAR 1
- **LMGame-Bench harness effect** = 40% of game runs fail to beat random play without the harness; 86.7% beat it with the harness. Glass's delta 3.334 with harness vs 0.750 without. — *measured* — arXiv 2505.15146v2 / ICLR 2026
- **Voyager scale** = 63 unique items in 160 prompting iterations; 6+/-2 iterations to wooden tool, 11+/-2 stone, 21+/-7 iron, 102 diamond; zero-shot 18-19 iterations per task — *measured* — arXiv 2305.16291, Tables 1-2. NOTE: iterations, not wall-clock — the paper reports no epis

---

# Action space — fixed, or filtered by objective. The two studies the design cites prescribe opposite things, and the brief picks one without saying it picked.

# Action space: the brief picked a side without saying so, and picked the side with the weakest evidence

## 1. What the brief actually did

`docs/dao-lu/.research/brief-raw.md` carries both studies and lands on "**Cứ ~5 hành động sống, cố định, đừng bày mọi thứ hợp pháp**" — roughly five live actions, fixed, don't show everything legal (line 900). Marked `[đo]` for the numbers and `[suy]` for the prescription. The design then hardens this into a contract: `AGENT-PLAYER-DESIGN.md` §7 item 1 is "Tool schema: 12–16 action … đây là **hợp đồng** với agent, và phải khóa sớm."

So the shipped API is a fixed, small, hand-counted action list. Fine as a starting point. The problem is narrower and worse than "two papers disagree": **neither paper is about a game, and the one that argues for filtering is the one with no citations and an oracle.**

## 2. Both papers, in full, with what each actually measured

**arXiv:2606.06284 — ToolChoiceConfusion / Causal Minimal Tool Filtering (CMTF).** Babu & Iyer, both "Independent Researcher", 4 Jun 2026, cs.AI. Full text read; Table 4 and §7.5 verified against arxiv.org/html/2606.06284v1.

| Condition | Success | Wrong tools | Tools/step | Tokens |
|---|---|---|---|---|
| All 100 tools | 0.83 | 1.25 | 100.00 | 24,569 |
| Keyword top-5 | 0.61 | 2.36 | 5.00 | 4,407 |
| Keyword top-10 | 0.72 | 1.93 | 10.00 | 5,039 |
| State-aware (executable) | 0.65 | 1.98 | 5.73 | 4,354 |
| Full causal path | 0.99 | 0.03 | 1.90 | 2,555 |
| CMTF | 0.99 | 0.01 | 1.00 | 2,405 |

The brief quotes this table correctly. What it does not say is where the 0.83→0.99 comes from. §7.5 gives it per model: **Nova 2 Lite 1.00 → 1.00. Claude Sonnet 4 1.00 → 1.00.** Two of four backbones gain exactly zero points. **Claude 3.5 Haiku 0.48 → 0.94** carries the whole aggregate, with Nova 2 Pro at 0.83 → 1.00. On a frontier model the paper's headline success benefit is **0.00**; all that survives is tokens (Sonnet 4: 24,858 → 1,819). The design's agent will run a frontier model.

The rest of the setup, from the paper's own text: 102 tasks, 100 **synthetic** tools, three domains (calendar, email, files), **mocked deterministic outputs**, **one gold chain per task**, **max 6 steps**, goal state `g` **supplied to the filter**, BFS from `s_t` to `g`. §6.4 admits "this strict metric enables controlled comparison, but may penalize alternative valid trajectories." §9 scopes itself to "search-read-update or retrieve-summarize workflows" and excludes "open-ended, creative, exploratory" tasks — which is the definition of a game. Citation count as of today: **0**. The only follow-up in existence is GIST-CMTF (2606.16813), and it addresses a *different* failure.

**arXiv:2605.24660 — How Many Tools Should an LLM Agent See?** Blackwell II, 23 May 2026. Tool-calling, not games. Registries from 20 to 3,251 tools.

- ToolBench: **FK=5 64.7%** coverage vs BoR-agent 61.9±0.6% at K=4.4±0.4. FK=1 45.3%, FK=20 77.3%.
- ToolBench **hard queries (gold ranked 6–20, n=76): FK=5 finds 0%.** BoR finds 16.7±4.3% at K=5.7. Very hard (rank 21+): FK=5 0%, BoR 0.2%.
- BFCL downstream, Claude Sonnet 4.6 — the three columns that matter:

| Method | Presented | Choice acc | End-to-end | Avg K |
|---|---|---|---|---|
| FK=5 | 84.2 | **87.1** | **73.3** | 5.0 |
| BoR | 76.9±0.4 | **93.1±0.5** | 71.7±0.0 | 2.2±0.4 |
| FK=1 | 65.0 | 100.0 | 65.0 | 1.0 |

On medium-difficulty queries: **BoR 76.8±2.5 vs FK=5 60.9**. On BFCL+BM25, BoR 90.3±2.4 at K=7.4 nearly matches FK=50's 90.8 at 7× less depth.

**The brief's "fixed wins all three" is a metric selection, and it picks the three columns that favour fixed out of five.** It cites ToolBench coverage, BFCL found-rate, and downstream E2E. It omits the column closest to what a game cares about — *when the right action is in the menu, does the model pick it* — where BoR wins 93.1 vs 87.1, and the medium-difficulty bucket, where it wins 76.8 vs 60.9. Note also that the "BFCL found-rate 97.5 vs 85.0" the brief uses is the **embeddings-scorer** condition, where the same reward with no tuning collapsed BoR to K=1.4; on the BM25 condition the same reward ran at K=7.4 and nearly tied. Same reward, no retuning, 5× different depth. That is the paper telling you the depth policy is a property of the *scorer*, not the task.

Authors' own words, abstract and conclusion: "**the main limitation is that BoR optimizes selectivity rather than maximum recall, so Fixed-K can achieve higher aggregate coverage when a uniform depth happens to suffice.**" The brief quotes this. It then draws the opposite conclusion from it.

## 3. Is either about games? No. Here is what is.

Both are tool-calling on a real or synthetic API registry. The game literature that *does* exist measures the opposite thing, and it is not ambiguous.

- **CALM (EMNLP 2020)**: +69% relative average game score over prior SOTA on Jericho, and — the load-bearing sentence — "**on half of these games, CALM is competitive with or better than other models that have access to ground truth admissible actions.**" Free-form candidate generation beat the true legal list on half the games.
- **Ryu et al. (CONLL 2023)**, quantifying the failure: in zork1, "CALM produces 30 different actions, but still **misses 10 actions out of 17 admissible actions**." Recall 7/17 = 41%. And: "**fully constraining action space to admissible actions degrades performance**." Their ε-ablation loses at both ends — ε=0 (pure constrained) scores **0** in reverb, zork1 and zork3; ε=1 (pure free) is unstable. The winner is a mixture, and they had to tune ε.
- **ARC-AGI-3** is a shipped, hard, unsolved game benchmark whose engine already picked the design the brief says is harmful. The technical report (arXiv:2603.24621 §2.3.2) publishes per-frame `available_actions` — that is CMTF's "state-aware" condition, measured at **0.65, worse than no filter at 0.83** — and deliberately refuses the causal frontier: "Action 6 does not provide explicit X/Y coordinates for active areas. If Action 6 is available, only its availability will be indicated." Humans 100%, frontier AI **below 1%** as of March 2026. Nobody has demonstrated that frontier filtering helps there. Its authors never state a 4,102 total; §2.3.2 says only "a subset of" five key actions + Undo + one 64×64 cell-select, and does not total it.

**So: the two studies do not actually disagree.** One is a synthetic mock with a goal oracle. The other is retrieval-depth sizing on tool registries. The only papers that measured filtered-vs-full action menus *in games* found the filtered version worse. The brief presents a tool-calling result and a retrieval result as a controversy and resolves it in favour of the one that happens to be the design's convenient answer.

## 4. The tool-count knee

The honest state: **there is no good public degradation curve for tool count, and the widely-quoted one has no primary source.**

- The table everyone repeats — "95–96% single-tool, 85–91% at 5 tools, 65–78% at 20+ tools, per model" — is on **presenc.ai**, a vendor page. It self-describes: numbers "aggregated from public model evaluation reports and Presenc AI's deployment instrumentation across 60+ enterprise agent customers," and "multi-step compounding figures are **derived from per-call accuracy assuming independence**." No per-cell primary source. That is a finding, not a citation.
- The one real curve is about **context length, not tool count**: arXiv:2604.01955, `acc(n) = a − b·log₂n`, b = 0.018–0.031 per doubling, mean R² = 0.946, worst model R² = 0.917, four open-weight models 7B–70B, 12,400 traces, 4K–128K. Mean accuracy 0.873 at 8K → 0.741 at 64K. And the sharpest single number: **even with the gold tool's schema in the first 1024 tokens, 64K is still 6.2pp below 8K (p<0.001)** — so it is distractor crowding, not retrieval. The authors are careful: "our scaling law is descriptive, not causal." Do not cite it as a tool-count curve.
- The only knee with a named source is Anthropic's own: "**Claude's ability to pick the right tool degrades once you exceed 30–50 available tools**" (tool search tool docs), plus the config "**keep your 3–5 most frequently used tools non-deferred**" and measured Tool Search Tool results **Opus 4 49%→74%, Opus 4.5 79.5%→88.1%** on MCP evaluations, 85% token reduction. A vendor internal eval with no published methodology — treat as *reported*, not *measured* — but it is the configuration with the most deployments behind it, and it is a **hybrid**: a small fixed core plus on-demand discovery, which is neither of the two options the brief forced.

## 5. The recall problem, and the one thing this repo already has that neither paper offers

If filtering hides the action you needed, the agent must have somewhere to go. There is a known pattern, consistent across three independent sources, and **one of the numbers on it is the strongest number in this whole gap**:

- **GIST-CMTF (2606.16813)**: CMTF "assumes that the user request has already been mapped to a symbolic goal state." When the goal is wrong, **top-goal CMTF runs 19.4% wrong-goal execution and 80.1% success.** The fix is to make **clarification a causal action** — an action in the same schema that produces the missing goal variable instead of calling a tool. Wrong-goal execution 19.4% → **2.5%**, success → **97.0%**, across 7 backbones and 120 tasks. That is the recovery channel, with a number on both sides.
- **CMTF's own §8.3** proposes the same thing from the other side: expose the minimal frontier, "while fallback or diagnostic tools can be added when execution fails, when the state tracker is uncertain, or when no causal path is found." **Proposed, not measured.** CMTF's Algorithm 1 returns ∅ when BFS finds no path and the benchmark scores that as a filter failure. The paper does not report how often that happens.
- **BoR** measures the price of missing from the other side: FK=5 recovers **0%** on hard queries where adaptive recovers 16.7±4.3%. Fixed shortlists win cheaply on easy queries and fail completely on hard ones.
- **SPACE (2609.02042, 2 Sep 2026)** is the game-side lever, and its ablation is the one to remember. On ScienceWorld, `Multi-action GRPO` — which simply lets the model emit several actions per call, with no learned chunk boundaries — scores **17.2%** against GiGPO's **35.9%**, while using the *fewest* rounds (8.4 vs 10.2). The boundaries are the entire effect. On ALFWorld seen, Llama-3.1-8B: Zero-shot 21.1 / ReAct 43.8 / GRPO 71.9 / GiGPO 85.2 / **SPACE 99.2 with 3.7 rounds instead of 15.9**. In a game, the measured lever is *decisions per action*, not actions per decision.

## 6. The decision

**Ship a fixed core of 4–8 always-live actions per turn. Do not ship a goal-conditioned filter. Add exactly one widen action. Move the frontier into the world, not the menu.**

The trade-off stated: you give up the 90% token reduction CMTF reports and you keep the agent's menu the same size whatever it is doing. In exchange you avoid a filter whose measured benefit on a frontier model is 0.00 points of success (Sonnet 4: 1.00 → 1.00), whose headline effect lives entirely in one weak backbone, and which has never been run in a game. The token saving is real and the 12–16 action contract already bounds it; the token saving was never the load-bearing number.

Three specifics:

1. **The frontier mechanic in `AGENT-PLAYER-DESIGN.md` §5 turn 3 is correct and must not be relabelled.** `press(Tạ Chi Dã)` not existing unless `track` was called is a *world rule* — the action's effect is conditional. It is not filtering, it costs no recall, and it is invisible to the agent either way. The brief conflates the two, and the conflation is what licenses frontier filtering. Keep the mechanic, drop the word "filter" from it.
2. **If you ever do want conditional availability, the game is allowed to do it — for preconditions the engine knows, not for the objective the model is chasing.** State-gating is a usability feature; CMTF measured it as an *accuracy negative* (0.65 < 0.83) and ARC-AGI-3 ships it anyway, so treat it as neither win nor loss. Gating on the agent's own inferred goal is the 19.4% line.
3. **One action exists whose only job is to widen the set**, in the same schema, and it is not free. This is the fallback. See §7 for what it costs and why that cost is the instrument.

## 7. The fallback, and the experiment that is actually the instrument

**The number that decides this does not exist.** No one has measured goal-filtered versus full versus fixed-K action menus in an open-ended game state with a frontier model. I searched for it directly; the CMTF paper has 0 citations and no replication exists, in games or elsewhere. So here is the smallest thing that would produce it, and the reason it should not wait for a paper:

**The widen rate is a production number.** Ship the fixed core, ship the widen action, price it at one turn plus a declared cost, and log every widen. Then the widen rate *is* the missing recall figure, measured on your own agents in your own world, continuously, and it is available in week one instead of after a paper. If the widen rate is near zero, a frontier filter would have had nothing to do — and you have just proved the fixed list sufficient without running an A/B. If it is high, you have your number, and you have already built the recovery channel you would need to ship the filter safely. **The experiment and the fallback are the same mechanism.** That is the reason to build the instrument before the answer.

**The offline A/B, when you want the answer rather than the instrument.** Take ≥200 states from the game's own play logs — not a designed benchmark, because the CMTF failure was a designed benchmark with a known goal. Three arms, same model, same prompt, same temperature, 20 samples per state: **(A)** full menu, **(B)** fixed top-5 by prior usage, **(C)** goal-conditioned frontier over the same precondition-effect contracts the game would use anyway. Report three outcomes, because two of them point opposite ways and CMTF only reported one: **task success**; **choice accuracy conditional on the right action being present** (this is the 93.1-vs-87.1 column the brief omitted); and **menu recall** — was the action the run needed in the menu at all, which is a property of the filter alone and is the number CMTF never publishes. Report per-model, because the entire CMTF effect lives in one weak backbone. **Kill arm C if menu recall on your own states falls below 0.95.** A frontier filter that is 0.99-accurate partly *because* it is empty half the time is not a filter; it is a script.

**If the widen action is not in the schema, the frontier filter is not safe to ship, ever.** CMTF proposes the fallback in §8.3 and never measures it. GIST-CMTF measures a related one at 19.4%→2.5%. A filter with no declared escape has an unbounded cost on the exact turns you did not predict, and in a game with a turn counter that cost is paid in the currency the player is watching.

## 8. Three numbers in the existing brief that should be struck or re-sourced

- **"ARC-AGI-3: 4.102 hành động hợp lệ mỗi lượt"** — no primary source. The technical report gives no total; a third-party paper (arXiv:2512.24156) says 4,096 click-only, 4 arrow-only, 4,100 combined. Strike the figure or cite §2.3.2 for the structure and let the reader do the arithmetic.
- **"~5 hành động sống, cố định"** — the number is right by accident. It is not BoR's finding; BoR found FK=5 loses on choice accuracy and on medium queries, and found the same reward producing K=1.4 or K=7.4 depending on the scorer. 4–8 is defensible from Anthropic's 3–5 non-deferred plus ARC-AGI-3's 5 key actions, not from this citation.
- **"State-aware filtering is worse than no filter (0.65 vs 0.83)"** — keep this one, but stop treating it as an argument against state-gating *per se*. It is one synthetic benchmark, and the one shipped game interface that filters this way has not been shown to suffer for it.

## Hệ quả thiết kế

**Do not build a goal-conditioned action filter into the protocol. Build a fixed core, one widen action, and three telemetry fields — and treat the widen rate as the experiment.**

1. **Fixed core, 4–8 always-live actions per turn, chosen by the engine, not by the model.** This is the shape `AGENT-PLAYER-DESIGN.md` §5 already writes (4, 6, 7, 4 actions across four turns) and it is the configuration with the most deployments behind it. Change §7 item 1 from "12–16 action" to "4–8, and every 9th onward is a deferred action discoverable on demand" so the contract names the two tiers.

2. **Keep `AGENT-PLAYER-DESIGN.md` §5 turn 3 exactly as it is, and stop calling it filtering.** "`track` là action riêng. Nếu agent không gọi, `press` **không tồn tại** trong action list" is a world rule — the effect is conditional, the action was never withheld from a menu. That is free. Filtering by objective is the thing that costs recall. The brief collapses them into one sentence and that collapse is the only thing licensing frontier filtering. Split the words in the design doc so the collapse cannot happen again.

3. **One widen action, in the same schema, priced.** `widen(scope)` — the agent's only job is to enlarge the menu, and it costs a turn. GIST-CMTF measured the version of this at 19.4% → 2.5% wrong-goal execution across 7 backbones; CMTF §8.3 proposed it and measured nothing. Ship it before the filter, not after.

4. **Never gate on the objective.** State-gate on preconditions the engine knows (a usability feature; CMTF measured it as an accuracy *negative*, 0.65 < 0.83, and ARC-AGI-3 ships it anyway, so expect nothing from it and claim nothing). Do not gate on what the agent believes it is trying to do — a game has no external goal oracle, and that is exactly the condition that produces GIST-CMTF's 19.4%.

5. **Three telemetry fields, or the experiment cannot be run.** Per turn: `actions_offered` (ids), `actions_taken` (id), `actions_resolved_no_change` (id, when a legal move left state identical). The third is the "legal vs effective" distinction the brief names in prose and has no schema for; without it the offline A/B has no denominator and the widen rate has no context. Add it to `packages/protocol/src/agent-event.ts` now — cheap to add, retroactively unobtainable.

6. **Log every `widen`, with its scope, as a first-class event.** This is the deliverable, not instrumentation. The widen rate is the recall figure CMTF never published, measured on your own agents in your own world, available in week one. Near zero ⇒ a frontier filter would have had nothing to do and the fixed list is provably sufficient. High ⇒ you have the number, and the recovery channel is already shipped.

7. **Do not read the token saving as the win.** CMTF's 90% figure is real and 12–16 actions already bounds it. On a frontier model the success benefit is 0.00 points (Sonnet 4: 1.00 → 1.00). Optimise decisions-per-action instead — SPACE measured +7.0–31.3% success and −7.4–78.9% rounds on ALFWorld/ScienceWorld from chunking, and its Multi-action GRPO ablation (17.2% vs GiGPO's 35.9%) shows that letting an agent emit more actions per turn without learned boundaries makes it *worse*. Chapter 1's four turns are already four-beat cycles; that structure is the lever, and it is a narrative property, not an API one.

8. **Strike three claims from the brief.** The "4.102 actions" ARC-AGI-3 figure (no primary source — the report states no total; a third party says 4,096 / 4 / 4,100). The "~5 fixed actions" attribution to BoR (BoR found FK=5 *loses* on choice accuracy 87.1 vs 93.1 and on medium queries 60.9 vs 76.8; 4–8 is defensible from Anthropic's 3–5 non-deferred and ARC-AGI-3's 5 key actions, not from that citation). And the "fixed wins all three comparisons" framing — BoR's five downstream columns split, and the brief quotes the three that favour fixed.

## Chưa đo được

- Menu recall of a causal-frontier filter in an open-ended game state. CMTF does not report it and by construction cannot: the filter is handed the gold goal state, the benchmark has exactly one gold chain per task, and task success under a filter that is sometimes empty conflates 'filtered correctly' with 'nothing to do'. This is the single number that would decide the design, and it does not exist.
- Whether CMTF has been replicated by anyone. Zero citations as of 2026-09-30. The single follow-up (GIST-CMTF, 2606.16813) shares authors and addresses a different failure (wrong goal state, not wrong frontier). No independent replication exists in any domain.
- The effect of frontier filtering on a frontier-class model in a game. The entire CMTF aggregate is carried by Claude 3.5 Haiku (0.48 → 0.94); Nova 2 Lite and Claude Sonnet 4 both sit at 1.00 before and after. If the game's agents run a current frontier model the expected success delta is 0.00 points, and nobody has measured the token-vs-attention trade at that tier.
- How often a frontier filter would return the empty set. CMTF's Algorithm 1 returns ∅ when BFS finds no path and the benchmark scores that as a filter failure without reporting the rate. In an open-ended game with multiple valid objectives, 'no path to the goal I assumed' is the common case, not the edge case, and the number is unmeasured.
- The cost of a widen/fallback turn — in game time, in XP, and in currency. GIST-CMTF proves the mechanism works (19.4% → 2.5% wrong-goal execution) but prices nothing, and the price is the whole argument for whether the filter is affordable.
- A real accuracy-vs-tool-COUNT curve for frontier models. The only well-formed curve (arXiv:2604.01955) is against context length, not tool count. Anthropic's 30-50 knee is a vendor claim with no methodology. The widely-repeated 95/87/70 table is a vendor aggregation page that admits it derived the compounding figures from per-call accuracy assuming independence.
- Whether the BoR choice-accuracy gain (93.1% vs 87.1%, and 76.8% vs 60.9% on medium queries) survives when the shortlist is produced by the game's own state logic rather than by BM25 or MiniLM retrieval over a fixed registry. Every BoR number comes from a retrieval stack; a game computes its menu from world state, which is a different mechanism with a different failure mode.
- What any shipped commercial agentic game does about action count. Searches surfaced qualitative practice notes (MUD frameworks recommending 'constrain actions into Tools', Voyager using code as the action space instead of primitives) and one Reddit user reporting the AI Dungeon interface stalling 'somewhere between 5k and 10k actions' — which is a UI performance report, not an LLM accuracy measurement, and has no source. No controlled measurement of a shipped game's action count to an LLM exists.
- Whether the design's own 12–16 action contract sits above or below the knee. There is no way to know without the A/B, because the only knee numbers available are one vendor claim and one curve about a different variable.

### Số

- **CMTF benchmark shape** = 102 tasks, 100 synthetic tools, 4 LLM backbones, 2,448 runs, 3 domains (calendar/email/files), mocked deterministic outputs, one gold chain per task, max 6 steps — *measured* — arXiv:2606.06284v1 §5, §6.1-6.2
- **CMTF success, all 100 tools** = 0.83 (wrong-tool 1.25/task, premature 0.03, 100.00 tools/step, 24,569 tokens/task) — *measured* — arXiv:2606.06284v1 Table 4
- **CMTF success, state-aware (executability) filter** = 0.65 — WORSE than no filter. wrong-tool 1.98, 5.73 tools/step, 4,354 tokens — *measured* — arXiv:2606.06284v1 Table 4, §7.2
- **CMTF success, keyword top-5 / top-10** = top-5: 0.61 (wrong-tool 2.36). top-10: 0.72 (wrong-tool 1.93). Both worse than all-tools at 0.83. — *measured* — arXiv:2606.06284v1 Table 4
- **CMTF success, causal frontier vs full causal path** = CMTF 0.99 (1.00 tool/step, 2,405 tokens) vs full causal path 0.99 (1.90 tools/step, 2,555 tokens) — tied on success, CMTF cheaper — *measured* — arXiv:2606.06284v1 Table 4, §7.3
- **THE HEADLINE EFFECT IS ONE MODEL — per-backend success, all-tools → CMTF** = Nova 2 Lite 1.00 → 1.00 (ZERO gain); Claude Sonnet 4 1.00 → 1.00 (ZERO gain); Nova 2 Pro 0.83 → 1.00; Claude 3.5 Haiku 0.48 → 0.94. Two of four backbones gain nothing. — *measured* — arXiv:2606.06284v1 §7.5
- **CMTF token saving on a frontier model** = Claude Sonnet 4: 24,858 → 1,819 tokens/task; success unchanged at 1.00 — *measured* — arXiv:2606.06284v1 §7.5
- **CMTF token reduction headline** = ~90% (24,569 → 2,405 tokens/task) — *measured* — arXiv:2606.06284v1 abstract, §7.4
- **CMTF citations** = 0 as of 2026-09-30, ~3.5 months post-publication — *measured* — arxiv.gg/abs/2606.06284; roboticscenter.ai paper listing
- **CMTF's own scope exclusion — games are out of scope by the authors' statement** = 'best suited to tasks with identifiable state transitions, such as search-read-update or retrieve-summarize workflows. Open-ended, creative, exploratory [excluded]' — *measured* — arXiv:2606.06284v1 §9 Limitations
- **BoR registries and query sets** = Registries 20 to 3,251 tools; BFCL 370 tools / 400 queries / 280-120 split / 3 seeds; ToolBench 3,251 tools / 2,000 queries / 1400-600 / 3 seeds — *measured* — arXiv:2605.24660v2 §5
- **BoR ToolBench aggregate coverage** = FK=5 64.7% vs BoR 61.9±0.6% at K=4.4±0.4. FK=1 45.3%, FK=20 77.3%, F1 ablation 47.6±1.3% at K=1.5 — *measured* — arXiv:2605.24660v2 §5
- **THE COST OF MISSING, asymmetric — ToolBench hard queries (gold ranked 6th-20th, n=76)** = FK=5 finds 0%. BoR finds 16.7±4.3% at K=5.7±0.5. Very hard (rank 21+): FK=5 0%, BoR 0.2% — *measured* — arXiv:2605.24660v2 abstract, §5
- **BoR easy / medium difficulty buckets** = Easy (rank 1, n=272): K=2.5±0.2, 100% found. Medium (rank 2-5, n=116): K=4.8±0.5, 74.4±0.4% — *measured* — arXiv:2605.24660v2 §5
- **BoR downstream, Claude Sonnet 4.6 on BFCL — THE COLUMN THE BRIEF OMITTED** = Choice accuracy: BoR 93.1±0.5% vs FK=5 87.1% (K=2.2 vs 5.0). FK=1 100.0% at 65.0% presented. End-to-end: FK=5 73.3% vs BoR 71.7±0.0% — *measured* — arXiv:2605.24660v2 Table 1, §6
- **BoR medium-difficulty choice accuracy** = 76.8±2.5% (BoR) vs 60.9% (FK=5) — a 15.9pp gap on the bucket that matters — *measured* — arXiv:2605.24660v2 abstract
- **Same reward, no retuning, 5x different depth — the depth policy is a property of the scorer** = BFCL: K=7.4±2.5 (BM25) vs K=1.4±0.1 (embeddings). MetaTool: K=80.7 vs K=2.3. Paper states 'No tuning was changed between conditions.' — *measured* — arXiv:2605.24660v2 §6, Table 2
- **BoR authors' own stated limitation** = 'the main limitation is that BoR optimizes selectivity rather than maximum recall, so Fixed-K can achieve higher aggregate coverage when a uniform depth happens to suffice' — *measured* — arXiv:2605.24660v2 abstract and conclusion
- **GIST-CMTF: the cost of a WRONG frontier** = Top-goal CMTF 80.1% success with 19.4% wrong-goal execution; semantic-goal CMTF 82.9% / 16.7%; GIST-CMTF 97.0% / 2.5% (87.1% relative reduction). 7 backbones, 120 tasks. — *measured* — arXiv:2606.16813v1 abstract, §4
- **GIST-CMTF's stated assumption about CMTF** = 'CMTF reduces tool-choice confusion... but it assumes that the user request has already been mapped to a symbolic goal state' — *measured* — arXiv:2606.16813v1
- **GAME-SIDE result the brief never cites — free-form beats the legal action list** = CALM: +69% relative average game score over prior SOTA on Jericho; 'on half of these games, CALM is competitive with or better than other models that have access to ground truth admissible actions' — *measured* — Yao et al., EMNLP 2020, aclanthology.org/2020.emnlp-main.704
- **THE RECALL NUMBER, in a game** = In zork1, CALM's generated candidate list MISSES 10 of the 17 admissible actions — recall 7/17 = 41%. Missed actions can never be selected. — *measured* — Ryu et al., CONLL 2023, arXiv:2305.04082v2 §5
- **Both filtering extremes lose, in games** = 'fully constraining action space to admissible actions degrades performance'. ε=0.0 → 0 game score in reverb, zork1, zork3. ε=1.0 → 'learning becomes unstable'. A tuned mixture wins. — *measured* — Ryu et al., CONLL 2023, arXiv:2305.04082v2 §5 and Appendix I
- **Text-game action-space magnitude, for scale** = Zork1: 697-word parser vocabulary, 237 templates with up to 2 blanks = O(237 × 697²) ≈ 1.15×10⁸ possible actions per step — *measured* — Ammanabrolu & Hausknecht, arXiv:2001.08837
- **ARC-AGI-3 action space, PRIMARY SOURCE — and it states no total** = 'Each environment offers a different action space, which is a subset of: Five key actions, plus an Undo action; One action to select a cell from the 64x64 grid by specifying its coordinates.' No total figure given. — *measured* — arXiv:2603.24621 §2.3.2 (ARC Prize Technical Report)
- **ARC-AGI-3 deliberately withholds the causal frontier** = 'Action 6 does not provide explicit X/Y coordinates for active areas. If Action 6 is available, only its availability will be indicated, without specifying which coordinates are active.' Retries and reasoning steps are also not counted as actions. — *measured* — docs.arcprize.org/actions; arXiv:2603.24621 §2.3.2
- **ARC-AGI-3 state — the benchmark filtering was never shown to help** = Humans solve 100% of environments; frontier AI scored below 1% as of March 2026 — *measured* — arXiv:2603.24621 abstract
- **THE BRIEF'S '4.102 actions' HAS NO PRIMARY SOURCE** = A third-party paper reports |A| = 4 (arrow-based), 4,096 (click-based, 64×64), 4,100 (combined). The brief's 4,102 is not among these and is not in the technical report. — *reported* — arXiv:2512.24156 §1 vs arXiv:2603.24621 §2.3.2
- **THE ONLY WELL-KNOWN TOOL-COUNT CURVE HAS NO PRIMARY SOURCE** = '95-96% single-tool, 85-91% at 5 tools, 65-78% at 20+ tools' with per-model tables. Page states numbers are 'aggregated from public model evaluation reports and Presenc AI's deployment instrumentation across 60+ enterprise agent customers' and 'derived from per-call accuracy assuming independence'. — *reported* — presenc.ai/research/ai-agent-tool-calling-accuracy-benchmarks-2026
- **The real measured degradation curve — but it is CONTEXT LENGTH, not tool count** = acc(n) = a − b·log₂(n), b = 0.018 to 0.031 per doubling, mean R² = 0.946, worst single model 0.917. Mean accuracy 0.873 at 8K tokens → 0.741 at 64K. With the gold schema in the first 1024 tokens, 64K is still 6.2pp below 8K (p<0.001, paired bootstrap B=10,000). — *measured* — arXiv:2604.01955 (ToolStretch) §4, §5
- **Authors' own caveat on the context curve** = 'Our scaling law is descriptive, not causal. We do not disentangle whether the degradation comes from positional encoding effects, attention dilution, or distractor crowding.' — *measured* — arXiv:2604.01955 §5
- **THE ONLY NAMED KNEE — a vendor claim, no methodology published** = 'Claude's ability to pick the right tool degrades once you exceed 30-50 available tools.' — *reported* — Anthropic, Tool Search Tool docs (console.anthropic.com)
- **Anthropic's shipped configuration — a HYBRID, neither option the brief offered** = 'Keep your 3-5 most frequently used tools non-deferred so Claude can call them without searching first'; 10,000 deferred tools max; search returns up to 5 by default — *reported* — anthropic.com/engineering/advanced-tool-use; console.anthropic.com tool-search-tool docs
- **Anthropic Tool Search Tool accuracy delta (internal MCP evals)** = Opus 4: 49% → 74%. Opus 4.5: 79.5% → 88.1%. 85% token reduction; ~55K tokens of definitions → ~8.7K; 3-5 relevant tools ~3K tokens. — *reported* — anthropic.com/engineering/advanced-tool-use
- **Anthropic acknowledges the recall cost of deferred loading** = 'The feature adds a search step before tool invocation, so it delivers the best ROI when the context savings and accuracy improvements outweigh additional latency.' — *reported* — anthropic.com/engineering/advanced-tool-use
- **GAME-SIDE LEVER: decisions per action, not actions per decision. ALFWorld seen split, Llama-3.1-8B (SR % / LLM rounds)** = Zero-shot 21.1/43.0; ReAct 43.8/33.8; Reflexion 46.1/41.0; RLOO 70.3/24.7; GRPO 71.9/25.5; GiGPO 85.2/15.9; Multi-action GRPO 85.2/18.9; SPACE 99.2/3.7 — *measured* — arXiv:2609.02042v1 Table 1
- **THE ABLATION THAT KILLS 'MORE ACTIONS PER TURN' — ScienceWorld, Llama-3.1-8B** = GiGPO 35.9% SR / 10.2 rounds. Multi-action GRPO 17.2% SR / 8.4 rounds — FEWER rounds, LESS THAN HALF the success. SPACE 67.2% / 5.2. Allowing multiple actions without learned chunk boundaries makes it worse. — *measured* — arXiv:2609.02042v1 Table 2, §4.2
- **SPACE headline** = +7.0% to +31.3% success over strongest baseline per setting; −7.4% to −78.9% LLM decision rounds; reaches strongest baseline final performance with 26.6% of training steps — *measured* — arXiv:2609.02042v1 abstract
- **CMTF's own §8.3 fallback — PROPOSED, NOT MEASURED** = 'fallback or diagnostic tools can be added when execution fails, when the state tracker is uncertain, or when no causal path is found.' Algorithm 1 returns the empty set when BFS finds no path; the benchmark scores that as a filter failure. Frequency never reported. — *unknown* — arXiv:2606.06284v1 §8.3, Algorithm 1 line 22
- **Menu recall of a goal-conditioned filter — the number that would decide the design** = does not exist; not reported by CMTF, not measured anywhere in games, no replication of CMTF in any domain — *unknown* — absent from arXiv:2606.06284v1 (no recall metric in Table 4 or §7); no independent replica
- **Design doc's proposed contract, for reference** = 'Tool schema: 12-16 action' as a locked contract; per-turn examples list 4, 6, 7 and 4 actions across the four turns of Chapter 1 — *reported* — docs/dao-lu/AGENT-PLAYER-DESIGN.md §5 and §7

---

# Multi-session agent memory. The design assumes an agent that remembers across sessions. Every citation in the brief is a single trajectory, and three of the brief's own designs — 扮猪吃虎 sustained across a session, threads crossing sessions, the 40-hour gap — sit on the edge of that evidence base while being used load-bearingly. Nobody has established what persists, what does not, or where the store lives.

## The finding, in one line

**Self-authored memory is measured at zero-to-harmful. Curated or executable memory is measured at +16.2 points. Every measurement that separates the two says the same thing: the store must not contain the agent's own conclusions about its own failures.**

Three independent 2026 measurements converge, from three different groups, three different substrates, three different benchmarks.

---

## 1. The direct answer to "you did this before and it failed"

Three measurements, each isolating this:

**SkillsBench** (arXiv 2602.12670, 7,308 trajectories, 84 tasks, 7 model-harness configs, deterministic verifiers) ran every task three ways: no Skills, curated Skills, self-generated Skills. Curated: **+16.2pp average**. Self-generated: **no benefit on average**. The paper's own gloss: *"models cannot reliably author the procedural knowledge they benefit from consuming."* And 16 of 84 tasks got *worse* even with curated Skills.

**Useful Memories Become Faulty** (arXiv 2605.12978) removed the excuse entirely. They fed GPT-5.4 **ground-truth solutions** to the memory consolidator — the input trajectories were useful by construction — and streamed those problems through the consolidation loop. GPT-5.4 had solved that 19-problem ARC-AGI slice at **100% with no memory**. After consolidation it scored **52.6% by Round 10**, on the very problems its memory was built from. The same paper's Table 2: raw trajectory logs beat every consolidator (ACE, AWM, Dynamic Cheatsheet) in **6 of 7 benchmark×backbone cells**. On ScienceWorld's 15-task switch sequence, consolidating cumulatively instead of per-task ended **203 points behind**, accumulating over-generalized memories at ~5× and garbage memories at ~20× the per-task rate.

**Memory Confabulation** (arXiv 2605.29463) recomputed RRR over 134 real Reflexion runs: **16 of 50 environments (32%) froze** on a wrong belief. Across those, **0 of 121 reflections mentioned the correct target object**. Frozen environments needed **7.6 trials** versus 1.5 — Spearman **r = 0.808, p < 0.0001**. Two environments took 7–8 trials *with* memory and solved in 1 trial *without* it. The paper's line is the whole design: *"A memory system that stores confident, plausible-sounding but wrong beliefs is worse than no memory at all for the tasks those beliefs affect."*

So: **no, an agent cannot usefully be told "you did this before and it failed."** On binary feedback it does not even produce a *diagnosis* — HotPotQA correction rate was **5.9% per trial transition** versus 64% (ALFWorld) and 83% (WebShop) where feedback was step-level. The mechanism is specific: binary feedback carries no information about *which step* failed, so the reflection generator emits a plausible causally-wrong account, and 32–82% confabulation drops to 17% the moment feedback gets granular.

---

## 2. The self-conditioning failure mode (2509.09677) — and what it does *not* give you

The paper's design is a controlled counterfactual: inject artificial histories at a chosen error rate, then measure accuracy at turn 100. Confirmed and clean.

**The mitigation question is where it gets thin.** Appendix A.1, turn-wise self-verification prompting: *"the results are mixed… For the Gemma3 family with CoT this prompt provides an initial boost in accuracy… However, the self-verification process significantly increases the number of tokens generated per turn, causing the model to exhaust its context window much sooner, which leads to a sharper performance collapse in later stages. In contrast, the Qwen3 thinking models show negligible improvement… these models overthink and frequently fail at the verification step itself, sometimes making arithmetic errors even during their re-calculation process. These findings suggest that prompting self-correction may not be a viable solution."* Appendix A.2, sliding window: *"performance improves significantly as the context window size is reduced."*

**Both are figure-only. Neither has a number in the text.** That is the single most important gap in this entire research base, and it is why the brief could cite 2509.09677 confidently for a logging rule while having nothing to say about how much of the effect any mitigation removes.

**And none of this is measured on errors from the agent's own past sessions.** The injected histories are synthetic wrong answers in a Markovian dictionary task. The design's question — an agent reading its own real trajectory from last session — is *not* what was measured.

### The paper does not say what the brief says it says

| Claim | 2509.09677 abstract / §3.2 | 2509.09677 Figure 5 caption |
|---|---|---|
| Scaling | "does not reduce by just scaling the model size" | **"Scaling model size increases self-conditioning"** |

Not "fails to reduce." *Increases.* The brief inherited the weaker, safer half.

---

## 3. What actually persists — the two-store pattern, measured

2605.12978 tested the fix directly using Complementary Learning Systems: an **Episodic** buffer and an **Abstract** store, with the agent choosing Retain / Delete / Consolidate.

- Left to itself, the agent **saturates the episodic buffer and keeps the abstract store sparse** (buffer 50.00; avg covered 2.17 Auto vs 5.00 Force at |B|=8).
- Forced consolidation **underperforms retained episodes** across 400 training steps on both backbones.
- **Episodic Management Only** — abstraction switched off entirely — *matches or beats* full Auto.
- Removing the episodic store and keeping only abstract lessons **collapses accuracy back to the no-memory baseline**.

2608.15008 (11 substrates, 7 families, 3 backbones, 4 benchmarks, 26 metrics) found the same asymmetry from the other direction. ALFWorld task-success, Qwen3-32B-AWQ: NoMem **22.4**, dense-vector **27.6**, sparse-vector **21.6** (below baseline), gist **26.9**, notes **26.9**, graph **23.1**, distilled-strategies **32.1**. On Qwen3-8B dense-vector scored **5.2 against NoMem 5.7** — below baseline. Retrieval depth flips sign: distilled-strategies drops **32.1% at k=1 to ~25% at k=5**, with flat retrievers falling *below* the 22.4 baseline. The mechanism is attention: growing k pulls attention out of the action-critical current observation. On BigCodeBench the sign reverses — retrieved code *extends* the task rather than competing with it — and retrieval helps broadly (M2 +2.0pp at 1.28× overhead).

**Why this matters for a game:** retrieved trajectories compete with the current observation and the admissible-action list. A dense vector store over past sessions is the substrate family this paper measured as *frequently below no-memory* on sequential decision-making, and the one whose benefit is backbone-dependent rather than real.

---

## 4. Written store vs vector retrieval — three measurements, one direction

**LongMemEval-V2** (arXiv 2605.12493, 451 questions, 25M–115M tokens of web-agent trajectory) is the closest existing analogue to "agent memory about an environment it plays in." Its five abilities are literally the design's: *environment gotchas*, *workflow knowledge*, *dynamic state tracking*, *premise awareness*. Results on the Medium tier:

| Memory design | Accuracy |
|---|---|
| No retrieval | ~0 |
| RAG over raw state slices | 38.1% |
| + trajectory notes | 45.9% |
| AgentRunbook-R (structured RAG pools) | 57.0% |
| Vanilla Codex agent | 68.7% |
| **AgentRunbook-C (trajectories as files + coding agent)** | **70.1%** |

Frontier LLMs reach at most **14.1%** with no trajectory evidence — the knowledge genuinely is not parametric.

**The load-bearing number is the oracle ceiling.** Given the *exact* trajectories containing the answer, the reader still only reaches **59.6%–65.3%**. Only with pre-processed notes does it climb to 82.5%–86.3%. **Retrieval is not the bottleneck. Reading noisy trajectory evidence is** — a third of correct evidence still produces a wrong answer.

Corroborating: **Letta** put LoCoMo conversation history in a plain file with no memory tools and got **74.0%** with gpt-4o-mini, above Mem0's reported 68.5% graph variant. **The Markdown Fallacy** (2,100 data points, 3 models) found markdown vs structured relational at **Δ = −0.004** (no format effect), and full-context markdown beating vector RAG / GraphRAG / hybrid **0.964 vs 0.888–0.904, p < 0.004**, with retrieval discarding **84–90%** of available context.

**Voyager's** skill library is a directory of `.py` files loaded via `skill_library_dir=`. It is the oldest and most portable design in this space, and it is code, not prose.

---

## 5. Where the folklore breaks: task state does not persist, and that is measured

**What survives:** executable artifacts and curated procedural text. Voyager (3.3× unique items — *the TMLR version says 3.1×*, a finding in itself; 15.3× / 8.5× / 6.4× tech tree; 2.3× distance; n=3 trials) transfers its library to a fresh world where baselines solve **0 of the tasks within 50 iterations**. SkillsBench: **+16.2pp** curated, focused 2–3 module skills beating comprehensive docs, small models *with* skills matching large models *without*.

**What does not survive:** self-authored lessons. See §1.

**Portability is not free.** SkillLens (5 domains × 6 targets × 5 extractors) found skills help in **75%** of extractor–target pairs and cause **negative transfer in 25%**; ALFWorld is the most fragile domain at **47% negative**, SWE-bench-Verified 13%. On identical ALFWorld skills, GPT-5.4's Target Evolvability is **+4.93** while Qwen-9B's is **−1.69**. An LLM judge picks the better of two skills **46.4%** of the time — *worse than chance* — and rewriting a skill into a different surface format changes nothing (**p > 0.34**). What predicts utility is failure-mechanism encoding, actionable specificity, and a high-risk-action blacklist; encoding those into the extractor prompt is worth **+1.55pp**, while a plausible-sounding human rubric is worth **−0.59pp**.

---

## 6. The number that does not exist, and the smallest experiment that would produce it

**The self-conditioning effect size.** 2509.09677's headline is a figure. There is no number anywhere in the paper for how much accuracy at turn 100 falls per unit of induced error rate, and none for how much of it self-verification prompting or a sliding window removes. Every downstream claim about mitigation inherits an unmeasured magnitude.

**The smallest experiment that would produce it** — four arms, one model, ~2 hours:

1. Arm A: 100-turn retrieve-then-compose, induced prior error rate 0.0 (healed) / 0.1 / 0.3 / 0.5. *This arm already exists* — reproduce Figure 5 as a table and publish the slope.
2. Arm B: same, plus a "you previously failed here and here is why" preamble written by a *different* model from the actual failing turn. This is the arm nobody has run, and it is the design's actual question.
3. Arm C: same, plus a *programmatic* failure signal (which step, which input, what the interpreter returned) instead of a self-authored diagnosis. 2605.29463 predicts this is the only intervention that moves; the design should be built assuming it does.
4. Arm D: Arm C but the failed **action string** is replaced by a runtime-generated description — 2608.23651 measured this removing **76%** of the repetition inversion and driving greedy repeat rate to zero.

The single-number outcome: Δaccuracy at turn 100 between Arm B and Arm C. If Arm B ≤ Arm C, the design may not write agent-authored lessons at all.

---

## 7. Verdict

**The evidence does not support the design's current reliance on persistence, and it supports a specific replacement.** Not "memory doesn't work" — memory works, +16.2pp and +39% and 70.1% and 3.3×. It works when the store contains something the agent did not author about itself: an executable function, a curated procedure, a note a different process wrote from typed evidence.

The loop does not need to be redesigned around persistence. It needs to be redesigned around **who is allowed to write**.

## Numbers whose primary source could not be traced

Findings in their own right, per the standard:

- **2509.09677 reports three different values for one experiment.** §1: "fails on 46%". Abstract and §4.1: "fails on 54%". Figure 2 caption: "falls to 52.6% by Round 10". Same 19-problem slice, same model.
- **2509.09677 v1 and v2 disagree on the headline benchmark.** v1: GPT-5 "over 1000 steps", Claude-4-Sonnet "around 400", DeepSeek-V3/Kimi K2 fail above complexity six. v2: GPT-5 2176, Claude 432, Grok 384, Gemini 2.5 Pro 120, and DeepSeek-V3/Kimi K2 "fail to execute even a turn complexity of 2". The brief quoted one of these as settled.
- **2509.09677's Figure 5 caption contradicts its own abstract** on whether scaling increases or merely fails to reduce self-conditioning.
- **LoCoMo's two versions report different results for the same experiment.** ACL camera-ready: gpt-4-turbo **51.6**, human 87.9, improvements 12–20%, adversarial 15.7%. arXiv v1: gpt-4-turbo **32.4**, improvements 22–66%, adversarial 2.1%. Roughly 19 points on the headline model.
- **Voyager's 3.3× (arXiv, project page) vs 3.1× (TMLR).**
- **LongMemEval-V2's abstract says AgentRunbook-R 48.5%; §5 says 57.8%.** Trajectory count is 1,870 (HuggingFace) in one place and 1,540 (alphaXiv) in another.
- **SkillsBench's abstract says "86 tasks" then "84 tasks"** in consecutive sentences.
- **"The Markdown Fallacy"** — 2,100 data points, the only head-to-head full-text vs vector measurement at scale — is self-published with **no arXiv ID, no peer review, single author**. It is load-bearing for the file-store recommendation and should be labelled accordingly.

## Caveats on the strongest claim

2608.23651 ("recording a failed call makes models repeat it") is the cleanest mechanistic measurement I found, and it is also the one with the weakest external validity: **6 checkpoints, 135M–1.7B parameters, 4 families**. Every headline number — 0.06 → 0.54 repeat probability, −1.03 nats/token, 83% surface-form attribution, clean-restart 2.6× worse — comes from models far below any agent this design would run. Its structural conclusion (do not put the failed action's surface form back in context; do not just say "don't repeat") is likely to survive, but the magnitudes should not be transferred.

## Hệ quả thiết kế

The design's multi-session memory premise does not survive contact with the measurements, but the fix is not "remove memory." The fix is a write-authorization boundary.

**1. Delete the agent-authored-lesson write path entirely.** Any store the agent writes its own diagnosis of its own failure into is measured at zero (SkillsBench, 7,308 trajectories) to −47% (SkillLens, ALFWorld) and has driven a frontier model from 100% to 52.6% on problems it had already solved (2605.12978). The brief's own instinct — "trajectory có lỗi là độc" — is right, and it is now quantified. Nothing in the design may hand the agent a field it authored about its own past.

**2. Two stores, architecturally distinct, both mandatory.** Per 2605.12978: an **episodic store** holding raw typed records (the JSON of what happened, written by the system, not the model), and an **abstract store** that is *opt-in and gated*, never fired on every interaction. Episodic Management Only matched or beat every consolidating mode. Removing the episodic store collapsed accuracy to the no-memory baseline. Both stores are required; neither alone works. This is exactly the memory-substrate split 2608.15008's 11-substrate harness independently arrived at, and it maps onto the repo's existing `public-event-stream.md` tier projection rather than adding a second mechanism.

**3. The store is a directory of typed files the agent reads and the *system* writes.** Not a vector store, not prose. Three independent measurements agree: LME-V2 files 70.1% vs RAG 57.0% on Medium; Letta's file-only 74.0% beats Mem0's 68.5%; raw trajectory logs beat every consolidator in 6 of 7 cells in 2605.12978. Critically, the brief already solved the prose-is-the-exploit-surface problem — free-text fields are the attack surface, so the memory store must be schema-first for the same reason, not despite it. The 2605.29463 result names the write-path rule precisely: **the writer of a memory entry must not be the agent whose behaviour that entry describes.** The system writes the record; a curator process (different model or deterministic code) writes the lesson; the agent only reads.

**4. Retrieval depth must be capped at 1 for anything the agent *acts* on.** 2608.15008: k=1 → 32.1%, k=5 → ~25%, and flat retrievers fall *below* the 22.4% no-memory baseline. Retrieved trajectories compete with the current observation and the admissible-action list. For a game this is not a tuning note — it is the difference between memory helping and memory being worse than none. Keep k large only for QA-style lookups where the retrieved block does not compete with an action cue.

**5. No transcript re-entry, ever.** 2608.23651 measured that deleting the failed attempt and retrying from a clean context is the *worst* harness it tested (2.6× more exact repeats), and that an explicit "do not repeat" instruction has the wrong sign (+0.07 [−0.07, +0.21] nats). The one thing that worked was replacing the failed action's surface form with a runtime-generated description — 76% of the inversion removed, greedy repeat rate to zero. The design already decided this in §3.6 (each turn is an independent call); §3.6 needs to state the rule that makes it true, because the natural implementation ("show the agent what went wrong") is the measured failure.

**6. Make failure feedback step-level or do not ship a lesson at all.** 2605.29463: binary pass/fail → 32–82% confabulation, 0/121 correct-object mentions, HotPotQA correction 5.9%. Step-level unit-test-style feedback → 17%. The game's action results must carry *which input produced which wrong output*, not a verdict. 扮猪吃虎 in particular cannot rely on the agent self-diagnosing across sessions — 2605.29463 is the direct measurement that it cannot, and the critic already identified this collision.

**7. Design the middle touch as world-emitted, not memory-retrieved.** The brief's own line survives and is now the load-bearing one: a foreshadowing thread that depends on the agent remembering 40 hours ago will be silently abandoned. The three-touch structure (plant → remind at midpoint → reveal) must have the midpoint delivered by an NPC, a notice-board line, or the public event stream — never by the agent's recall. Per-viewer field visibility (the critic's correction) makes this free: the touch is a field the world emits, present-but-unread by the agent.

**8. Re-run the brief's 扮猪吃虎 and cross-session thread claims against these numbers before they stay in a design table.** They are currently load-bearing with zero measurements behind them. Per the critic's own closing note, they are exactly the class of error the numeric filter cannot touch.

## Chưa đo được

- The self-conditioning effect size. 2509.09677 publishes it only as Figure 5. No paper in this space states how much turn-100 accuracy falls per unit of induced prior error rate, nor how much any mitigation removes. Every downstream claim about mitigation inherits a magnitude nobody has written down. Smallest experiment: four arms of the existing retrieve-then-compose task (healed / induced-error / induced-error + agent-authored 'you failed before' preamble / induced-error + programmatic per-step failure signal), one model, report the slope as a table. The design's question is the delta between arm 3 and arm 4 — nobody has run it.
- Whether self-conditioning behaves differently when the errors in context come from the agent's own real past sessions rather than injected synthetic wrong answers. 2509.09677's counterfactual uses artificial histories in a Markovian dictionary task. The design's actual scenario — an agent reading its own trajectory from session N-3 — is untested by anyone.
- Whether thinking-mode immunity to self-conditioning (2509.09677 Result 5) holds for frontier thinking models. Only Qwen3 thinking variants were tested. GPT-5, Claude-4, Gemini 2.5, Kimi K2 and DeepSeek-R1 were never tested for self-conditioning. The brief's claim that thinking mitigates is extrapolated across a family boundary.
- How much of SkillsBench's null self-generated result is 'agents cannot author good skills' versus 'the self-generation protocol in the harness was weak'. No paper separates these. SkillsBench self-generated Skills average zero with no public ablation of the extraction prompt.
- Whether the file-store advantage survives past ~25KB of memory in a game setting. Every file-store measurement found here is either small (Letta 18KB, 74%) or a 100M-token benchmark where a coding agent does the reading (LME-V2, 140s/query). Nobody has measured the crossover point where a game agent's own memory outgrows what it can usefully read in one turn.
- The oracle-ceiling gap in a game. LME-V2's reader fails 35-40% of the time *given the exact correct trajectory*. Whether a game agent has the same read ceiling, and what fraction of its failures are comprehension rather than retrieval, is unknown — and it is the number that decides whether any memory design is worth building at all.
- Whether 2608.23651's magnitudes transfer above 1.7B parameters. Every number in the cleanest mechanistic study of failed-call repetition comes from 135M-1.7B models. The direction almost certainly survives; the effect size is untested at agent scale.
- A number for 'the agent told it already failed this specific thing, in this specific game, on this specific mechanic'. Not one measurement in this entire corpus is about a game, an adventure, or a persistent fictional world. Every transfer from ALFWorld / ScienceWorld / WebShop / ARC-AGI / BigCodeBench to an xianxia cultivation game is a domain hop, and the repo's own doctrine says domain hops get flagged.

### Số

- **SkillsBench: curated Skills, average pass-rate gain** = +16.2 pp — *measured* — arXiv 2602.12670 abstract; 84 tasks, 11 domains, 7 model-harness configs, 7,308 trajectori
- **SkillsBench: self-generated Skills, average gain** = no benefit on average (delta indistinguishable from 0) — *measured* — arXiv 2602.12670 abstract: 'Self-generated Skills provide no benefit on average, showing t
- **SkillsBench: domain spread of curated-Skill gain** = +4.5 pp (Software Engineering) to +51.9 pp (Healthcare) — *measured* — arXiv 2602.12670 abstract
- **SkillsBench: tasks where curated Skills made things worse** = 16 of 84 — *measured* — arXiv 2602.12670 abstract
- **Useful Memories Become Faulty: GPT-5.4 on 19 ARC-AGI problems it solves at 100% with no memory, after streaming consolidation with ground-truth solutions available** = 52.6% by Round 10 — *measured* — arXiv 2605.12978, Figure 2 caption
- **Same experiment, reported three different ways in one paper** = abstract and 4.1 say 'down to 54%' / 'fails on 54%'; section 1 says 'fails on 46%'; Fig 2 caption says 'falls to 52.6%' — *measured* — arXiv 2605.12978, abstract vs section 1 vs Fig 2
- **Useful Memories Become Faulty: raw trajectory logs vs lesson-style consolidators (ACE, AWM, Dynamic Cheatsheet)** = trajectory logs win 6 of 7 benchmark x backbone rows; only exception is ACE-with-ground-truth on AppWorld/Qwen3.5-27B (76 vs 73) — *measured* — arXiv 2605.12978, Table 2
- **Useful Memories Become Faulty: WebShop memory scaling** = AWM 0.64 at 8 examples falls to 0.20 at 128; no-memory baseline sits at 0.20 — *measured* — arXiv 2605.12978, Fig 1(b)
- **Useful Memories Become Faulty: ScienceWorld 15-task switch, Cumulative vs Fresh consolidation** = Cumulative ends 203 points behind Fresh — *measured* — arXiv 2605.12978, Fig 10
- **Useful Memories Become Faulty: garbage memories in Cumulative store vs Fresh** = ~20x the rate of Fresh; over-generalized ~5x; both gaps widen monotonically across 15 tasks — *measured* — arXiv 2605.12978, Fig 18 / App K.2
- **Useful Memories Become Faulty: Stream vs whole-batch consolidation** = Stream loses 17-38 points vs whole-batch Pool — *measured* — arXiv 2605.12978, Fig 3
- **Useful Memories Become Faulty: ARC-AGI Stream memory buffer composition, Auto mode** = episodic buffer saturates at 50.00; avg covered 2.17 (Auto) vs 5.00 (Force) at |B|=8 — *measured* — arXiv 2605.12978, Table 4
- **Useful Memories Become Faulty: in-context baselines on ARC-AGI Stream** = In Context (Code) 86%, In Context (NL) 66% — *measured* — arXiv 2605.12978, Fig 9(b)
- **Memory Confabulation: ALFWorld environments with frozen (RRR >= 0.5) memory** = 16 of 50 (32%) — *measured* — arXiv 2605.29463, from 134 real Reflexion run logs, 15 trials, gpt-3.5-turbo
- **Memory Confabulation: reflections naming the correct target object in frozen environments** = 0 of 121 — *measured* — arXiv 2605.29463
- **Memory Confabulation: trials-to-solve, frozen vs diverse-memory environments** = 7.6 vs 1.5; Spearman r = 0.808, p < 0.0001 — *measured* — arXiv 2605.29463
- **Memory Confabulation: HotPotQA correction rate per trial transition after 7 trials of reflection** = 5.9% (vs 64% ALFWorld, 83% WebShop); 46 of 100 questions never answered correctly — *measured* — arXiv 2605.29463
- **Memory Confabulation: effect of step-level vs binary feedback on confabulation rate** = 32-82% (binary) down to 17% (step-level unit-test feedback) — *measured* — arXiv 2605.29463
- **Memory Confabulation: programmatic feedback-extraction mitigation** = correct-object mention 0% -> 86% (134/156); RRR 0.64 -> 0.10; solves 3 of 16 frozen environments (removing memory solves 2 of 16) — *measured* — arXiv 2605.29463, Table 2
- **Feedback That Backfires: probability of re-emitting the exact failed action** = 0.06 -> 0.54 after the failure record is placed in context — *measured* — arXiv 2608.23651
- **Feedback That Backfires: greedy decoding reproduces the failed call token-for-token** = 19% of items after the failure, 0% before it — *measured* — arXiv 2608.23651
- **Feedback That Backfires: normalised corrective gain per action token** = -1.03 nats (a factor of 2.8 in odds); negative for 6 of 6 models, intervals exclude zero — *measured* — arXiv 2608.23651, 6 checkpoints 135M-1.7B, 4 families, ToolShed + MBPP
- **Feedback That Backfires: fraction of individual items where the effect holds** = 90-100% — *measured* — arXiv 2608.23651
- **Feedback That Backfires: decomposition of the damage** = failed action's surface form accounts for 83%; the semantic contribution of marking it failed is small and its sign is inconsistent across environments — *measured* — arXiv 2608.23651
- **Feedback That Backfires: an explicit 'do not repeat' system instruction** = +0.07 [-0.07, +0.21] nats — wrong sign, no effect — *measured* — arXiv 2608.23651, Section 8
- **Feedback That Backfires: deleting the failed attempt and retrying from a clean context** = 2.6x WORSE exact-repeat rate than keeping it, with no change in task success — *measured* — arXiv 2608.23651
- **Feedback That Backfires: replacing the verbatim call with a runtime-generated description of the failure** = -13.22 [-15.30, -11.34] nats; removes 76% of the inversion; greedy repeat rate drops to zero for every model — *measured* — arXiv 2608.23651, Table 4
- **LongMemEval-V2: LME-V2-Medium accuracy, AgentRunbook-C (trajectories as FILES + coding agent)** = 70.1% — *measured* — arXiv 2605.12493, 451 questions, 1,870 trajectories, 115M tokens
- **LongMemEval-V2: LME-V2-Medium, plain RAG over raw state slices** = 38.1% — *measured* — arXiv 2605.12493, Table 2
- **LongMemEval-V2: LME-V2-Medium, AgentRunbook-R structured RAG pools** = 57.0% — *measured* — arXiv 2605.12493, Table 2
- **LongMemEval-V2: ORACLE ceiling — reader given the exact trajectories containing the answer** = 59.6% to 65.3% — retrieval is not the bottleneck; reading noisy evidence is — *measured* — arXiv 2605.12493, oracle-trajectory experiment
- **LongMemEval-V2: oracle + pre-processed notes** = 82.5% to 86.3% — *measured* — arXiv 2605.12493
- **LongMemEval-V2: frontier LLMs with NO trajectory evidence** = at most 14.1% — *measured* — arXiv 2605.12493
- **LongMemEval-V2: query latency** = Codex ~182s/query (6.9x AgentRunbook-R); AgentRunbook-R ~27s; AgentRunbook-C ~140s (32% faster than Codex at higher accuracy) — *measured* — arXiv 2605.12493
- **LongMemEval-V2: the paper reports its own RAG baseline two different ways** = abstract says AgentRunbook-R 48.5%; section 5 says 57.8% — *measured* — arXiv 2605.12493 abstract vs section 5
- **Harness the Memory: ALFWorld task success, Qwen3-32B-AWQ, no-memory baseline** = 22.4% — *measured* — arXiv 2608.15008, Table 2
- **Harness the Memory: ALFWorld, dense vector retrieval vs no-memory** = 27.6% vs 22.4% — *measured* — arXiv 2608.15008
- **Harness the Memory: ALFWorld, sparse vector retrieval vs no-memory (below baseline)** = 21.6% vs 22.4% — *measured* — arXiv 2608.15008
- **Harness the Memory: ALFWorld, Qwen3-8B, dense retrieval falls below no-memory** = 5.2% vs 5.7% — *measured* — arXiv 2608.15008
- **Harness the Memory: ALFWorld, best substrate (distilled strategies, M7)** = 32.1% on Qwen3-32B-AWQ; +9.7pp at 1.23x overhead — *measured* — arXiv 2608.15008
- **Harness the Memory: effect of retrieval depth k on ALFWorld** = M7 drops 32.1% (k=1) to ~25% (k=5); flat retrievers fall below the 22.4% no-memory baseline — *measured* — arXiv 2608.15008, Fig 4
- **Harness the Memory: effect of retrieval breadth on LoCoMo** = P4 rises monotonically with k across all substrates (sign flips vs ALFWorld) — *measured* — arXiv 2608.15008, Fig 4
- **SkillLens: extractor-target pairs where skills help vs hurt** = 75% positive, 25% negative transfer; ALFWorld 47% negative; SWE-bench-Verified 13% — *measured* — arXiv 2605.23899, 5 domains x 6 targets x 5 extractors
- **SkillLens: same ALFWorld skills, different consumer** = GPT-5.4 Target Evolvability +4.93; Qwen-9B -1.69 — *measured* — arXiv 2605.23899
- **SkillLens: LLM judge picking the better of two skills** = 46.4% — worse than chance — *measured* — arXiv 2605.23899
- **SkillLens: rewriting a skill into a different surface format** = statistically indistinguishable downstream gain (paired test p > 0.34) — *measured* — arXiv 2605.23899
- **SkillLens: utility-grounded meta-skill rubric vs plausible-sounding human rubric** = +1.55pp vs -0.59pp average — *measured* — arXiv 2605.23899
- **SkillLens: all-failure experience pools** = consistently produce the worst skills — *measured* — arXiv 2605.23899
- **Self-conditioning effect size at turn 100 vs induced error rate** = NOT REPORTED AS A NUMBER — Figure 5 only; no numeric slope anywhere in the paper — *unknown* — arXiv 2509.09677, Results 3-4, Fig 5
- **Self-verification prompting as a mitigation** = NOT REPORTED AS A NUMBER — 'mixed'; CoT models get an early boost then collapse faster from token exhaustion; thinking models show 'negligible improvement' and overthink — *unknown* — arXiv 2509.09677, Appendix A.1
- **Sliding-context-window as a mitigation** = NOT REPORTED AS A NUMBER — 'performance improves significantly as the context window size is reduced'; Fig 9(a) only — *unknown* — arXiv 2509.09677, Appendix A.2
- **Whether self-conditioning is worse when errors come from the agent's own past SESSIONS rather than injected synthetic wrong answers** = NOT MEASURED BY ANYONE — *unknown* — no experiment found across all searches run
- **Does thinking-mode immunity to self-conditioning (2509.09677 Result 5) hold for frontier thinking models** = UNTESTED — only Qwen3 thinking models were evaluated; GPT-5, Claude-4, Gemini, Kimi K2, DeepSeek-R1 not tested for self-conditioning — *unknown* — arXiv 2509.09677, Result 5 (Qwen3 only)
- **2509.09677: whether scaling increases or merely fails to reduce self-conditioning** = abstract/3.2 say 'does not reduce by just scaling'; Figure 5 caption says 'Scaling model size increases self-conditioning' — *measured* — arXiv 2509.09677 — internal contradiction
- **2509.09677: single-turn execution length, v1 vs v2** = v1: GPT-5 'over 1000 steps', Claude-4-Sonnet 'around 400', DeepSeek-V3/Kimi K2 fail above complexity 6. v2: GPT-5 2176, Claude 432, Grok 384, Gemini 2.5 Pro 120, DeepSeek-V3/Kimi K2 fail at complexity 2 — *measured* — arXiv 2509.09677 v1 vs v2
- **Voyager: unique items discovered** = 63 within 160 prompting iterations, 3.3x baseline (TMLR version says 3.1x) — *measured* — arXiv 2305.16291, TMLR, project page
- **Voyager: tech tree milestones** = wooden 15.3x, stone 8.5x, iron 6.4x faster; only method to unlock diamond. n=3 trials per cell — *measured* — arXiv 2305.16291
- **Voyager: zero-shot transfer of the skill library to a new world** = Voyager solved all tasks; baselines 0 within 50 prompting iterations. n=3 trials — *measured* — arXiv 2305.16291, Table 2 / Fig 8
- **Voyager: skill library is a directory of executable files loadable by path** = skill_library_dir='./skill_library/trial1'; the same library also boosted AutoGPT, i.e. it is portable across agents — *measured* — arXiv 2305.16291 + github.com/minedojo/voyager README
- **Voyager ablations** = random curriculum drops item count 93%; removing self-verification drops it 73%; GPT-4 vs GPT-3.5 = 5.7x — *measured* — arXiv 2305.16291, Fig 9
- **Reflexion: HumanEval pass@1 / MBPP Python pass@1** = HumanEval 91.0 vs GPT-4 80.1; MBPP Python 77.1 vs GPT-4 80.1 — WORSE than baseline on one of five benchmarks — *measured* — arXiv 2303.11366, Table 1
- **Reflexion: WebShop failure** = runs terminated after 4 trials with no improvement; 'the agent does not generate helpful, intuitive self-reflections after failed attempts'. n=100 environments — *measured* — arXiv 2303.11366, Appendix B.1
- **Generative Agents: full architecture vs ablations (TrueSkill mu)** = full 29.89 (sigma 0.72); no-reflection 26.88; no-reflection-no-planning 25.64; crowdworker 22.95; no-memory 21.21; Cohen's d = 8.16 — *measured* — Park et al. UIST 2023, Fig 8
- **Generative Agents: what the ablation actually measured** = ablations were GIVEN the full architecture's accumulated memories; this measures whether reading memories helps in one simulation, not whether accumulating them across sessions helps — *measured* — Park et al. UIST 2023, Section 6.5
- **MemGPT: Deep Memory Retrieval** = GPT-4 32.1% -> 92.5%; GPT-4 Turbo 35.3% -> 93.4%; GPT-3.5 38.7% -> 66.9% — *measured* — arXiv 2310.08560, Table 2
- **MemGPT: what the baseline actually was** = baselines received a recursive summary of prior sessions, not an empty context; the comparison is summarisation vs retrieval, not memory vs nothing — *measured* — arXiv 2310.08560, Section 3.2.1
- **MemGPT: nested key-value retrieval** = GPT-3.5 hits 0% at 1 nesting level; GPT-4 / GPT-4 Turbo hit 0% by 3 levels; MemGPT+GPT-4 unaffected 0-4. MemGPT+GPT-4 Turbo underperforms MemGPT+GPT-4 — *measured* — arXiv 2310.08560, Fig 7
- **LongMemEval: full-history reading vs oracle retrieval (GPT-4o, ~115k tokens)** = oracle 0.870 -> full history 0.606, a 30.3% drop; with chain-of-note 0.924 -> 0.640 (30.7%) — *measured* — arXiv 2410.10813, Fig 4(b)
- **LongMemEval: commercial memory-augmented assistants** = ChatGPT+GPT-4o 37% drop; Coze+GPT-4o 64% drop, on 97 questions — *measured* — arXiv 2410.10813, Fig 3(a)
- **LoCoMo: the two versions of one paper report different results** = ACL camera-ready: gpt-4-turbo 51.6, human 87.9, gains 12-20%, adversarial 15.7%. arXiv v1: gpt-4-turbo 32.4, gains 22-66%, adversarial 2.1% — *measured* — arXiv 2402.17753 ACL version vs arXiv v1
- **Echo Gap: BIRD text-to-SQL end-to-end** = LUCID 56.9%; Memento self-graded 54.0% (+2.9 mean across seeds); memory-less agent of identical architecture 52.4% — *measured* — arXiv 2608.00017
- **Echo Gap: memory-to-behaviour coupling and compounding** = kappa ~ 0.38; predicted corrupted attractor 0.45 vs observed 0.42 (within 0.03); no-loop account underpredicts at 0.28; compounding 1.6x the one-shot value — *measured* — arXiv 2608.00017, Appendix G
- **The Markdown Fallacy: markdown vs structured representation** = delta = -0.004 (N=900), i.e. no format effect — *reported* — John R. Williams, exa.ai library, 2026-03-17 — SELF-PUBLISHED, NO arXiv ID LOCATED, single
- **The Markdown Fallacy: full-context markdown vs retrieval** = 0.964 vs 0.888-0.904 for vector RAG / GraphRAG / hybrid, p < 0.004 (N=1,200); retrieval discarded 84-90% of context — *reported* — same — treat as a hypothesis with a cheap claimed replication (under $30), not as establis
- **Letta: file-only memory on LoCoMo** = 74.0% with gpt-4o-mini, no memory tools, vs Mem0's reported 68.5% for its top graph variant — *reported* — letta.com blog, 2025-08-12 — VENDOR BLOG, cross-lab comparison, partially agent-guided too
- **Anthropic: context editing and memory tool** = context editing alone +29%; with memory tool +39%; 84% token reduction on a 100-turn agentic web search eval — *reported* — claude.com/blog/context-management, 2025-09-29 — VENDOR, INTERNAL EVAL, no paper, no N, no
- **SECI extraction vs raw storage on LongMemEval** = R@5: raw-all-turns 0.859, raw-user-only 0.921, SECI extraction 0.937, hybrid 0.939 — *reported* — researchsquare preprint rs-9801639 — PREPRINT, and the mechanism is a 256-token MiniLM-L6-