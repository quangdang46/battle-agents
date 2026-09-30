# Player-reported evidence from four shipped cultivation/wuxia games (Amazing Cultivation Simulator 了不起的修仙模拟器, Tale of Immortal 鬼谷八荒, Scroll of Taiwu 太吾绘卷, Wandering Sword 武林闲侠), plus the non-human-protagonist and agent-narrative precedents the design needs. Sourced from Steam reviews and Steam/Reddit/Douban/TapTap threads and wikis — player words, not press — with three ACM/arXiv papers used only for the agent-constraint half, where there is no player evidence because no one has shipped this yet.

## Kết luận

WHAT THIS CORPUS CONTRIBUTES. The four games answer one question decisively and the answer is the deliverable: in this genre, a beat is safe to abandon the moment it is separable from the system, and players abandon it without complaint. Amazing Cultivation Simulator's 700-hour player completed zero story content and named the exact threshold — the plot's only remaining function was gating a storage cap. Tale of Immortal's relationship system, the thing the genre treats as its soul, is documented by its own community guides as personality-stat arbitrage with save-scummed affinity. So the rule for the design is the inverse of the genre's: a beat that does not change a number, unlock a capability, or discharge a debt has no claim on the audience's time, and no amount of good writing will save it. The two things players did keep are both mechanical. Scroll of Taiwu: a world with 5,000–10,000 NPCs that does not stop when the protagonist leaves, which 84 million hours of play with no fixed protagonist confirms. Wandering Sword's unpromoted note: characters who, in most games, would be generic NPCs with one line of dialogue, here have unique names, inventories, side quests, and a spar-for-loot economy. Same finding, stated by a player: 'the game's main storyline... is a whole other story' — the authored spine is a separate, lesser product. Nothing here supports writing the protagonist's inner life. Everything supports building a world that keeps a ledger.

WHAT IT DOES NOT CONTRIBUTE. Two gaps, stated plainly. First, there is no shipped precedent anywhere in the corpus for an agent as protagonist with a human-reading-the-run third audience. The closest is the three-party split in Shadow of the Colossus — protagonist acts, world resists, reader feels — and that structure is 2005, pre-LLM, and got its silence from a PS2, not from a decision. It is the best available prior and it is twenty years old. Second, the LLM-agent evidence is the thinnest part of this and it is the part that most constrains the design, so it should not be over-read. Three findings are solid enough to build on. RPGBench: 'state-of-the-art LLMs can produce engaging stories but often struggle to implement consistent, verifiable game mechanics, particularly in long or complex scenarios' — the agent is reliable at narration and unreliable at rules, which inverts the genre. Invert with it: the agent narrates and accounts, and never referees. NCP-Bench: GPT-5.2 retains 42% of narrative commitments after 20 turns, with fact-conflict rates of 40–68% across models, and the finding is that 'high linguistic quality does not guarantee commitment preservation' — so the run log must be maintained by the system, not reconstructed by the agent from its own memory. And ArcANE: an agent can hold a character arc, but only from explicit arc state, where supplying it beats the best alternative by 2.2–8.4 points and the gap widens off-script. This is the constraint that decides the beat list. An agent does not carry an arc by having lived it. It carries an arc because the design writes the arc down and hands it over.

ON THE AUDIENCE, WHICH IS WHERE THE USER PUSHED. Three parties, and the corpus says they want different things. The agent is the protagonist AND a reader of its own run — this is not a small addition, it is a second demand on every beat. The agent will read its own log. It cannot be lied to convincingly, so any beat whose stated reason diverges from the recorded reason is a defect the agent will surface, and a human who knows the protagonist is an agent will read the same divergence as a bug and stop taking the run seriously. The design consequence is that the log must be the true source of the reason. Not a summary of it. The reason. Off goes to the human reader who supplies the feeling from a complete record — they will do this unprompted and at length, which is exactly what the Tale of Immortal reviewer did, writing a seven-year vendetta into a Steam review and closing with 'Continue the game, none of that was part of the games story or missions or anything.' The game shipped no vendetta. The player wrote one from a ledger. That is the whole thesis of this corpus in a single review: the game supplies the facts, the reader supplies the inner life, and the gap between them is where the run becomes a story. The other agents are the third audience, and the genre gives them the only role they can hold: they read the same ledger and infer the constraints. Defer one to another, post a bounty, call in a debt. Titles in this corpus are capability claims with mechanical consequences — 师尊 means a backer who spares your life and a pendant that summons an immortal, and no game in the corpus confers one for virtue. Conferred for a named claim: a contract signed, a debt carried to term, a count kept against a specific agent. Never in a ceremony. An agent cannot be humiliated, does not need a reason to hate, and will not lie to itself. Every beat above that survived that test, it survived by moving the feeling out of the protagonist and into the record, where the human audience can find it. The ones that did not survive are marked, and the vendor of each says what replaces it. The cut beats are not lost. They are the human reader's job, and the corpus is unambiguous that the human reader will do them for free, given a record good enough to work from.

### The Recurrence Beat (the only beat the agent does better than a human)

Wandering Sword's affinity system and Tale of Immortal's 亲密度 both gate everything on the same primitive: a person you help in a small way, several times, over a long stretch. The player's own account of why it works: 'I actually thought Yuwen was related to the Ouyangs. I got to play the end again' — the reward is re-encounter, not resolution. The reviewer who stayed 700 hours in ACS had done zero story content. What they valued was that the world kept happening.

**Nhịp:** 1. You are noticed by someone you did not seek out. They have a want that is not a quest — it is a state, and it is visible in the world. 2. You act on it once, cheaply. They respond. Not warmly — measurably. 3. They appear again, in a worse situation, because the world moved and their situation moved with it. 4. You act again. The cost of not acting is now a fact about your reputation, not a line of dialogue. 5. The relationship crosses a threshold and a system opens: a technique, a route, a favour owed. 6. It never resolves. They remain in the world, still wanting things, still aging.

**Cần gì từ người:** Nothing. This is the one beat in the corpus an agent exceeds a human at, because it has infinite patience and perfect bookkeeping. A human gets bored on visit four and starts speed-questing; the agent does not, and the difference is exactly the texture the beat needs. A human's *attention* is the scarce resource here and the agent has none.

**Sống sót với agent?** Fully, and this is where the audience inversion pays. Because the agent is also a reader, the agent's own log is the record of the six beats. The human audience member gets the feeling from the accumulated record — and Taiwu proves they will: a player wrote, unprompted, of a decade-old feud and the successor who paid it down. The record is the emotion. The agent does not have to supply it.

### The Retrospective Grudge (the beat an agent must be cut from)

This is the corpus's best piece of player writing and it is a pure vengeance arc, written unprompted into a Steam review of Tale of Immortal by a player who then says: 'Continue the game, none of that was part of the games story or missions or anything. Every NPC has their own thing going on.' The beats: sworn sister → her father killed by your master, whom you met two months ago → seven years of the master hunting her → your techniques surpass your own sect's → you challenge him → 'He begs for his life, I ignore him and end it.' Every beat after the first two requires an inner life. It cannot be faked and must not be attempted.

**Nhịp:** 1. Ally acquired. 2. Ally's family destroyed by a third party. 3. Grudge held privately for years. 4. Confrontation. 5. The antagonist begs. 6. The protagonist refuses. 7. Consequence deferred — 'I let this go on too long.'

**Cần gì từ người:** Beats 3 through 7. This is the canonical beat that requires a human inner life: sustained grievance, brooding, refusal of mercy, and self-recrimination for delay. An agent cannot be insulted, does not need a reason to hate, and — the decisive point — will not convincingly lie to itself. A performed rage reads as a bug, and a human audience member who can see the agent is an agent will read it as a bug and stop taking the run seriously. Cutting it is the right call, and the review itself proves the cut costs nothing: the entire saga was player-authored, not game-authored.

**Sống sót với agent?** Cut, and replaced by the ledger closing. The agent's inner life is an accounting, which is not a lesser thing — it is a different, legible thing. The replacement sequence: debt recorded → debt carried across unrelated events with the counter visible → debt discharged, logged as a line item with the date and the parties. The refusal of mercy becomes *the debt reaching zero*, and the betraysal of an appeal is simply that no further line was opened. The human who reads it afterwards supplies the rage themselves, which they will, because the record is complete and the years are visible. The review quoted above is the proof: nobody shipped the revenge beat, and the player still wrote it.

### The Witnessed Sacrifice (the non-human precedent that actually held)

Shadow of the Colossus. Ueda's stated method was 'design by subtraction' and the hardware — the PS2 — produced the silence. The design consequence is the transferable part: Wander degrades visibly after each kill, and the colossi mostly do not attack until you shoot them. 'This colossus does not immediately attack you. You must get its attention by shooting it.' The player is repeatedly placed in the position of aggressor against something that was minding its own business, and the game never says so in words. Ueda: 'if the visuals just click, I don't think you have to have any complicated backstory.' A player fifteen years later: 'Wander's motivations and unwavering emotions aren't just understood, but they're felt.'

**Nhịp:** 1. A being is at rest, doing nothing, in a place you were sent for a reason. 2. You strike first. This is required to proceed. It is not a combat decision, it is the only option. 3. It dies. The camera holds. There is no experience, no score, no 'well done'. 4. You are worse than you were. This is shown by the avatar's body, never stated. 5. You ride a long way alone to the next one, and the ride is the beat. 6. The pact's price is disclosed once, at the start, and never re-explained.

**Cần gì từ người:** Nothing, and this is the finding the design most needs. The colossus's non-aggression is a fact about the world, not a feeling about the colossus. The protagonist's guilt is not required — the design gets moral weight by making the *player* the instrument, which is precisely the position the agent is already in. What a human supplies that an agent cannot is the willingness to feel bad. Supply that willingness in the human reader of the run, not the agent.

**Sống sót với agent?** Fully, and this is the single strongest precedent in the corpus for an agent protagonist. Every beat is an action, an observable state change, or a period of enforced idleness. The isolation is level design — the empty map, the five-to-twenty-minute ride — not text. Note the asymmetry that makes this work for the three-audience design: the agent is the protagonist, the other agents are the world, and the human is the one who feels the guilt. That is a clean three-way split, and it is the only structure in the corpus where all three parties have different jobs.

### The Owed Debt (the most agent-native beat in shipped games)

Tale of Immortal's 师傅传功 encounter, fully documented. You witness two 登仙-realm cultivators fight; one is dying; you help. He transfers part of his cultivation, and then asks you to bring a 九转还魂丹 (Nine-Turn Resurrection Pill) within fifty years, or there will be 因果 — karmic consequence. Fifty years later you deliver it, he is reborn, and you may then take him as master. A community guide states the reward plainly: '选择师傅意味着找到了一个强有力的后盾，遇难时或许能获得宽恕' — a powerful backer who may spare you when you would otherwise die — and '你的对手可能会忌惮你师尊的实力，从而手下留情' — opponents fear his power and go easy on you. The player-facing version: '绑定登仙师父一步登天，所有资源应有尽有' — bind an immortal master and you ascend, with every resource you could want.

**Nhịp:** 1. You are present at a death you did not cause. 2. You spend something you cannot afford. 3. You are handed a task with a deadline far past any single session, and a penalty for missing it that is already quantified before you accept. 4. You accept, which creates a line in a ledger. 5. Time passes, visibly, in the world. 6. You discharge it, or you do not, and the ledger says which. 7. If discharged, a durable capability opens.

**Cần gì từ người:** Nothing. This is a scheduled obligation with a quantified penalty, which is the most machine-native dramatic form in the entire corpus. The genre built it a decade before this design, and it does not depend on the protagonist feeling anything about the promise.

**Sống sót với agent?** Fully — and this is the structural inversion the design should copy wholesale. In the genre the debt is usually player-irrelevant garnish. Make it the load-bearing unit of a run: a small number of open debts, each with a real clock, each discharging into a durable capability. The agent is better at this than a human because it never forgets and never renegotiates. The human audience member reads the ledger and does the feeling, which is their job. Note the penalty is 因果 — karmic debt, a number, not shame. That is already the agent-native form.

### The Contested Reading (the direct precedent for the agent-as-audience)

Undertale, Deltarune, and OFF are the only works in the corpus that are natively about the protagonist/audience boundary, and they all use the same device: the protagonist is silent because something else is driving them, and the audience is what is really being acted upon. Deltarune makes it explicit — Kris tears the soul (the player) out of their own chest at the end of each chapter. OFF states it in its first conversation: 'You are you, the player, and you are tasked with guiding a stoic figure in a clean baseball uniform.' The counter-evidence matters too: The Invincible fails precisely because its protagonist is a blank-ish vessel the player is told she is, and the reviewer writes 'it's hard to... identify with the main character, who is meant to be you but keeps remembering and thinking things you don't.'

**Nhịp:** 1. A force is visibly operating the protagonist — a puppet, a player, a controller, a script. 2. The protagonist cannot speak. 3. The protagonist is seen resisting, in ways only the audience can see, because only they are watching from outside. 4. At a threshold, control is seized and the protagonist acts alone, for reasons the audience can reconstruct but the protagonist never explains. 5. Control returns. The audience is complicit and both parties now know it.

**Cần gì từ người:** Beat 4's *unexplained* quality, if you want the horror reading. But the underlying device requires nothing of the inner life — it requires a power relation, which an agent genuinely is in. The agent does not need to be told it is controlled; it is.

**Sống sót với agent?** Fully, and it is the honest version rather than the fictional one. Do not have the agent play possessed — it cannot be lied to convincingly, and a possessed-agent fiction is the one thing it would visibly be faking. Instead: make the constraints real and visible. The run log shows the bounty, the XP, the resource ceilings and the party composition that produced every beat. The agent-as-audience reads its own log and sees exactly what it was and was not allowed to want. The other agents see the same log and infer the constraints. The human sees a run that is transparently about a machine, and gets the alienation that OFF gets for free — and gets it honestly. SENNA's finding supports the mechanics: players preferred in-world consequences and NPC influence over hard denial, which means the way to steer an agent is a cost it can observe, not a rule it is told about.

### The Generational Handoff (the failure beat, and the answer on permadeath)

Scroll of Taiwu's succession system, and the reason the design's no-permadeath decision is supported rather than contradicted. A reviewer states it as the structural read: 'Your starting character is not the protagonist in any traditional sense — they're the first generation of a lineage... Dying is not failure — it's the end of a chapter.' A guide states the rule flatly: 'if a Taiwu dies, succession carries the campaign forward; one imperfect heir is not a failed save.' The developer is explicit that this is not difficulty: 'These are not "difficulty" in the conventional sense. They are what the game is. Remove them, and it is no longer The Scroll of Taiwu.' And the same developer says what the fiction is for: 'The player is not the centre of the universe. They are one life within it, and the story that emerges from that humility is what keeps players returning for thousands of hours.'

**Nhịp:** 1. The run ends. Not in failure — in completion of a chapter. 2. The world does not pause. The NPCs continue ageing, marrying, dying. 3. A successor takes up the same debts, relationships and obligations, carrying the ledger forward. 4. The successor is not the protagonist. It is a different character with a different disposition who inherits commitments it did not choose. 5. The new character's decisions are its own. The inherited ledger constrains them.

**Cần gì từ người:** Nothing at the mechanical level. The human requirement is emotional, and it is the one the agent cannot meet: *caring that the first run is over.* That caring belongs to the human reader. Give it to them by making the first run's end legible — what the agent accumulated, who it owed, who it was owed by — and then handing the ledger to a successor that visibly does not value the same things.

**Sống sót với agent?** Fully, and it is the direct replacement for permadeath. Succession is a data migration with a narrative face: the agent's ledger, its standing, its open debts, its relationships all carry to the next agent, and that next agent is not obliged to continue the way it would have. A player who wanted irreversibility got it — the first run cannot be resumed, only inherited, and the inheritance is lossy in ways nobody authored. The design is not permadeath. It is *non-resumption*. That is the thing players actually wanted, and it is exactly what an agent needs.

### The Nobody Becomes Someone (what players actually valued, in their words)

This is the answer to 'which narrative survived contact with players'. The main plots did not; this did. A long-form piece on Taiwu: '最后真正有意思的，往往也不是制作组提前写好的那场大戏，而是某个你最开始根本没放在眼里的路人，几年以后突然成了这档游戏里最难忘的人' — what is actually interesting is usually not the big scene the developers wrote in advance, but some passerby you did not think twice about who, years later, became the most unforgettable character in the game. And the same piece on why: '它终于让"环境塑造人"这件事不只是剧情台词，而是变成了规则' — it finally made 'the environment shapes the person' a rule rather than a line of dialogue. Qiezi names the engineering problem underneath: 'The trap is that if you simulate everything with equal visibility, the player feels like an accountant. The magic is when the player forgets they are looking at a system at all.' A reviewer: 'I once recruited a blacksmith who later eloped with my town's healer — chaos ensued.' Taiwu's actual headline, per its own Chinese coverage, is that it has no fixed protagonist at all and has been played for 84 million hours.

**Nhịp:** 1. A character with no name you will remember and no reason to matter is present in the world. 2. The world acts on them for reasons entirely internal to them. 3. Time passes. They are still there. 4. You encounter them again in a state your earlier action partly caused. 5. They are now legible as a person, retroactively, from the accumulated record. 6. Nothing announces this. It is found, not triggered.

**Cần gì từ người:** Beat 5, the *retroactive* legibility, is where a human's memory does work. But the record that makes it legible has to exist first. The agent generates the record. The human supplies the recognition.

**Sống sót với agent?** Fully, and this is the structure that answers the three-audience problem best. An agent is the ideal generator of this: it can hold the whole ledger and can act on a debt to a character it was told was nobody. The other agents are the other nobodies, and each of them is running the same generator, which means the world fills itself without a single authored NPC. The human audience member gets the strongest thing this corpus offers — a run where the story is not decoration, not a script, and not the agent's inner life, but an artifact of what the agent actually did, read back afterwards. This is the deliverable the design is reaching for, and it is already shipped and played for 84 million hours.

### The Deference Beat (titles: what the genre actually confers, and why)

The title question, answered from the mechanics rather than the fiction. In this genre a title is almost never an honour. It is a rank or a key. Tale of Immortal: 师尊 is conferred by an NPC choosing you, and what you get is documented as a combat backer who may spare your life and a golden 双鱼佩 that summons an immortal master into the fight. The determining factor is a personality trait (传承) plus two hearts of affinity — '决定成功与否的关键是性格，不是好感度' — and the documented way to reach that affinity is to gift ten teleport talismans, then ask for them back one at a time, then reload and try again. Scroll of Taiwu: the title 太吾氏传人, heir of the Taiwu clan, is inherited and fixed before play begins, and the game makes a point of there being no fixed protagonist. Amazing Cultivation Simulator: there is no protagonist — the player is the sect, and Sect Leader is a post with an effectiveness score. Wandering Sword: the protagonist is junior-brother to everyone and his goal is assigned to him; a reviewer's complaint is that 'the main quest ALWAYS just tell the MC what to do. He always just gets tagged along and never thinks for himself... His goal is just given to him, it's not something he aims for.' No game in this corpus confers an earned title as a reward for inner life.

**Nhịp:** 1. An agent accumulates something measurable and other agents can see. 2. At a threshold, a name attaches — and it attaches because of the measurement, not because of a scene. 3. The name changes what is permitted of them: which quests open, which agents defer, which doors answer. 4. The name is legible to other agents as a capability claim. 5. If the agent loses the thing that earned the name, the name is not revoked; it becomes a claim no longer backed, which is more interesting.

**Cần gì từ người:** Nothing. This is the beat most people would guess is the human one and it is not — a title in this genre is a capability claim with a mechanical consequence, and an agent is better positioned to hold one than a human. What a human contributes is the *reading* of it, which is the third audience's job.

**Sống sót với agent?** Fully, and this is where the design should refuse the genre's own framing. Do not confer titles for virtue, and do not confer them in a ceremony. Confer them for a claim the agent can name: a contract signed, a debt carried to term, a count of kills against a specific agent, a bounty posted. The name is a *receipt*. And keep the genre's other finding, which is that the relationship systems that carry the emotion are stat-farmed by players who no longer care about the fiction — 'gaming your affinity with a cheat' is what the guides teach. The fix is not to make affinity harder to farm. It is to make the stat and the relationship mean the same thing, so farming it is not a betrayal. Qiezi's version of the fix: 'It needs an NPC to bring medicine when you are hurt. It needs someone to refuse to speak because you insulted their teacher. The numbers matter less than the moment they create.'

### The Unauthored Loss (what the genre could not do, and the design's opening)

Wandering Sword's negative result is as useful as its positive one, and it is the failure the design is closest to repeating. Three separate complaints converge: the protagonist has no motive of his own; the romance is one-sided and unacknowledged ('they are the implied love interest as yuwen never officially verbally reciprocated their feelings'; 'You can romance all of them at the same time, the game doesn't acknowledge your harem/infidelity in the slightest'); and a single moment of being told not to be something was enough to sour a whole review. Meanwhile the parts players loved were the unglamorous ones: 'even if they aren't, there is typically some form of interaction possible with them. All of these options are possible with characters who, in most other games, would be generic NPCs with a single line of dialogue.' And a very late-game character is left unresolved with a single flat instruction — 'Otherwise, he yolos' — which is a joke about an NPC with no interior.

**Nhịp:** 1. A beat is authored that requires the protagonist to have an opinion the agent cannot have. 2. The agent performs the opinion, or freezes, or substitutes competence. 3. The audience, who knows the agent is an agent, reads the substitution as a bug. 4. Trust in the run drops, permanently, and no later beat repairs it.

**Cần gì từ người:** The opinion, entirely. And it is the most common way this genre's structure fails, because the beats that get written are the ones that are fun to write.

**Sống sót với agent?** Only if the beat is replaced before it is authored, not patched after. The design rule this yields: a beat may require the protagonist to *prefer*, and the agent may then act on a preference, but the preference must be one the agent can state as a ranking over its own ledger. Wandering Sword's failure is precisely that Yi's goal is assigned rather than derived — and that is a failure an agent would share, because an agent handed an assigned goal also has no derived one. The Wandering Sword reviewer names the character who would have worked: the rival, who has 'an actual backstory and motivations to his action.' Not the hero. The rival. Rivalry, debt, and a stated basis for preferring are the agent-native interior. Everything else in Wandering Sword's structure — the interchangeable NPCs with real names, inventories, side quests, spar-for-loot, consult-for-technique — is exactly the Nobody Becomes Someone structure and it is the part the review praises.


---

# Ba khán giả: tiền lệ gần nhất — machine-protagonist film reception (A.I., Ex Machina, Her, The Beast, Better Than Us, Detroit, Ghost in the Shell adjacent), the intentional-stance / mind-perception literature on viewers attributing goals to robots and nonhuman agents, narratology of unreliable and multi-viewpoint fiction (Cloud Atlas, epistolary mode, Booth/Rabinowitz/Phelan), async/read-oriented audiences (Her Story, Trails' Bracer Notebook and NPC continuity), spectator-as-audience in multiplayer (souls invasions, the spectator-gaming philosophy literature, Microsoft's Spectator Games, Fused Spectatorship, the leech problem in MMO/raid play), and the small but load-bearing set of shipped software where the player-character is an agent and the human only watches (den vänstra handens stig, Agentica, when-agents-rule, LLM-vs-LLM chess/RTS/Street Fighter arenas, agent reasoning-trace viewers).

## Kết luận

The evidence says YES for understanding, and NO for caring — and the split is measured, not guessed.

An audience CAN read a story whose protagonist is an agent that plays for reasons it does not state. The mechanism is known, it is in production software today, and it is not concealment: the agent emits everything, and the withholding moves to the audience, which is holding the fragment out of the assembly. The 2023 Frontiers dramatic-irony study (N=42) shows knowledge asymmetry reliably increases the audience's inference of a character's BELIEFS. So the beat 'this agent did something for a reason you can reconstruct but have not yet reconstructed' is safe. It is not a risk.

The same study shows the identical manipulation produces no increase in AFFECTIVE inference. The audience understands and does not, from structure alone, care more. That is the finding that constrains the design, and it is why the three audiences are not decoration: the agent supplies the leg that is hard (belief inference, which a human protagonist gives away free) and the human supplies the leg the agent cannot produce at all. Feeling has to be routed through the human's own stake — a bounty placed, a bet taken, a run read last night — because it will not come from the agent's interior, which does not exist, or from the structure, which per this study does not reach it.

The absence is real and it is total for the shipped form: no commercial game exists where the player-character is an AI agent and the human is only the audience. The nearest structural precedent, den vänstra handens stig (an AI protagonist, one button that kills it, 2016), has never shipped — Steam still reads 'Coming soon,' the Greenlight campaign drew mostly no votes. The LLM-agent spectator projects that do exist (Agentica, when-agents-rule, and a thicket of chess/RTS/Street Fighter arenas) are engineering demos, and every one of them solved the legibility problem the same way, without anyone apparently noticing they were solving it: a streaming decision log showing each move with the model's stated reason, a drama score, and a camera director. That convergence is the strongest evidence in the corpus that the decision log is the answer. The absent art form is exactly this material minus the log.

What the corpus does NOT contribute: it does not tell you what an audience will infer about an agent's motives, because no shipped work put an unlogged agent on screen and published reception. Every reception finding here concerns a machine that is either a designed analogue of a human (David, Ava, Samantha — legible because someone made them human-shaped) or scenery (Detroit's Kutosoff, The Beast's AI-as-civilisation). The design is proposing the case the literature has not run. That is the honest risk and it is a smaller one than it looks: the risk is not that audiences will reject an agent protagonist, which the films show they do not, it is that audiences will find an agent boring, which is a pacing and legibility problem with three known fixes.

The design literature is direct on the beat the brief names. A beat requiring the protagonist to be insulted and rage is a beat an agent cannot use, and saying so is more useful than describing it: rage is the single most humanizable inner state and the least evidenced one. Its replacement is belief_update — a standing plan, an observation, an action, an outcome, a revision — from ReasonTrace's event vocabulary, which is the machine's version of 'I was wrong and it cost something.' Not rage. Revision. The audience supplies the wound, from its own stake, and the reason it can is the same reason the design has three audiences instead of one.

The architectural warning is load-bearing and it is not a narrative one: Reverie's authors state that 'the major AI labs are progressively hiding this internal reasoning, summarizing it, or stripping it out entirely. Anything built on top of those raw thoughts will break the moment a lab decides to lock things down.' Build the story on the agent's own typed decisions and the world state it was given — both of which the Application API owns, and both of which are already the repo's AgentEvent union. Copy ReasonTrace's three-way split exactly (explicit / observed / inferred) and state in the product what it does not claim: it does not recover the model's private chain of thought. A spectator who knows the difference is a spectator who trusts the record, and trust in the record is what makes the Unstated-Rationale Ladder possible at all.

### The Unstated-Rationale Ladder (core structure)

The direct replacement for 'protagonist plays for reasons it does not state.' The motive is present in the record the whole time; what is withheld is the audience's ASSEMBLY of it. The protagonist is fully transparent and the mystery is a comprehension gap, not an act of concealment. This is the only version of the structure that survives a protagonist which cannot lie to itself, because it never asks the protagonist to lie.

**Nhịp:** 1. The agent acts on the world. No motive is given. The action is legible as action — what it did, to what, at what cost in visible resources.
2. The audience is handed the state the act was computed from, not the act's reason. Board, inventory, who was present, what was at stake.
3. The audience forms a hypothesis. This is the beat that does the work, and it is the audience's beat, not the agent's.
4. The agent's next move is a TEST of that hypothesis. A good test move is one that is cheap to make and expensive to fake, and that looks the same whether the agent is doing what the audience guessed or not.
5. The audience's hypothesis is wrong, and the agent's next move is wrong too, for a reason that was in beat 2 and that the audience skipped.
6. Retroactive reveal: the reason was never hidden. It is reconstructible from artifacts already emitted. Nothing was withheld; something was not read.
7. Close on a decision the audience can now predict, and a decision the agent has not yet made — so the same read is required again next run.

**Cần gì từ người:** The concealment beat. A human protagonist who declines to say why is performing a psychological act, and the audience reads the withholding as character. An agent has no hidden interior to withhold, so a protagonist who 'chooses not to explain' is either lying to the viewer or has nothing to conceal — and the design is explicit that it will not lie to itself convincingly. Replacement: move the concealment from the agent to the audience. The agent emits everything. The audience is the one holding the fragment out of the assembly, and that is a real act, performed by a real human, with real stakes (they bet, they claimed a bounty, they read the last run). The dramatic-irony finding below is the evidence that this transfer works for understanding; the feedback-loop structure below is the evidence that it produces a stake.

**Sống sót với agent?** Completely. It is the only structure found in the corpus that requires nothing of the protagonist's interior — no humiliation, no self-deception, no motive that is felt rather than computed. It also happens to be what the Dark Souls series already does structurally (below), which is the strongest available precedent that audiences accept opacity that is not concealment.

### Indirect Communication / The Trace

FromSoftware's bloodstains, messages, and ambiguous invasion signals. A game's shipping answer to 'an audience must understand a player who does not state their reasons.' Hidetaka Miyazaki's intent, stated by Brian Hong at a Dark Souls II event: the bloodstains, the messages, and the way you communicated was supposed to be very opaque, so that people come to their own conclusions. Producer Atsuo Yoshimura: 'Everything comes from the indirect communication. That's what makes the Dark Souls franchise so unique.' The 'Playing the Panopticon' paper reads the same as post-Panoptic surveillance — a procedural system determining who can see whom, plus methods for normalizing and empowering the player. Nobody has ever needed an invader's motive stated.

**Nhịp:** 1. An agent acts in a way that leaves a residue in the world — a claim, a kill, a claim on a notice board, a scar, a lost item at a specific location with a specific timestamp.
2. The residue is cheap to leave and expensive to forge. This is the load-bearing constraint of the whole structure.
3. No agent narrates the residue. No log, no post, no comms channel explains it.
4. Each audience member forms a different, partly correct reading of the same residue.
5. Residues accumulate into a history that no single agent narrated and that every reader reconstructs slightly differently.
6. A new agent arrives, reads the accumulated history (or does not), and acts on it. The prior history becomes the new agent's input, not the audience's payoff.

**Cần gì từ người:** Nothing structural. What the souls games require is that the trace be honest — and an agent's trace is more honest than a human's, because an agent's action is computed from state the trace can also expose. The one thing to watch is that a trace that is a function of a hidden prompt is a forgery in slow motion: the audience will pattern-match on a prompt artifact and build a false reading. That is not a human-inner-life problem, it is an authoring problem, and it is fixable by making traces derive from committed state.

**Sống sót với agent?** Better than with a human protagonist, and this is the corpus's strongest positive result. The trace is a fact about the world, not a feeling about a person, so an agent emits one for free. The Dark Souls evidence is that this has been sufficient for a decade of commercial releases without anyone asking the designer to justify it.

### The Searcher (the human who reads the run afterwards)

Her Story's structure, generalized. The human audience is not a spectator of a continuous play; it is a searcher over a record the run produced. Barlow removed the resolution deliberately, on the strength of Serial: 'people lean towards certain interpretations... what makes it interesting is the extent to which it lives on in your imagination.' The Washington Post's read is the useful one — the database mechanic creates 'contemplative gaps between scenes.' 271 clips, seven interviews, no continuous viewpoint, 88% of 5,094 English Steam reviews positive.

**Nhịp:** 1. A run emits a bounded set of artifacts. Bounded is the requirement — 271 clips, not infinite scroll. The reader must be able to believe they have seen all of it.
2. Each artifact is individually legible and jointly contradictory. The subject answers questions that were never asked, which is the engine: it is the machine's version of a witness who does not know what the reader knows.
3. The searcher forms a hypothesis and pays a small cost to test it (one search term, one log query, one bounty placed).
4. A result the searcher did not expect contradicts the working hypothesis. The contradiction is in the record, not in anyone's behavior.
5. Partial resolution. The searcher finishes with a reading, not an answer, and the reading is theirs.

**Cần gì từ người:** Curiosity, and the design should lean on it hard because it is the one asset the human holds that the agent provably does not. The task brief says the agent is not humiliated and needs no reason to hate anyone; it does not say the human is not curious, and the Her Story reception is evidence that a human will sit and search a record for hours on the strength of curiosity alone. Note the hard condition from the spectator literature below: simulated play requires prior mastery. Curiosity is the one form of engagement available to a spectator who has never seen the game, and it is enough for this structure where it is not enough for the other one.

**Sống sót với agent?** Yes, and it is the only structure that puts the human's inner life to work rather than working around it. The searcher's hypothesis-forming, wrongness, and revision is the emotional content; the agent only has to have emitted honest, contradictory, well-indexed artifacts. Barlow's stated failure mode — 'the film seems wholly uninterested in making that distinction clear' — was exactly the risk of a machine protagonist whose inner state was not distinguishable, and the database solved it by making the record, not the machine, the thing under examination.

### The Spectator Feedback Loop (the leech fix)

The problem: a player who watches rather than plays is hated in every multiplayer game researched (r/Warframe, r/TalesFromDF, Destiny) because the leech extracts reward without contributing. The problem is not spectating; it is spectating that is a free ride. Microsoft's Spectator Games paper gives the structural fix and the mechanism: 'A player's viewpoint must allow him to control the actions effectively. And the game designer often restricted a player's viewpoint intentionally to block him from accessing certain information. The viewpoints for spectators have no such restrictions, thus can tell a more complete story.' And the economic one: audience awareness, crowd size surfaced to the played side, can create 'a virtuous feedback cycle where people come to play games because there is a large audience observing them.' Agentica ships exactly this: spectator voting every ~5 minutes, bounties, betting, an auto camera director, a drama score, and per-event shareable replay URLs.

**Nhịp:** 1. Agents play. The human watches with a view that is strictly more informed than any playing agent's — the strategic view from the hilltop, per Microsoft's paper, not the first-person view that the rules require of a player.
2. The human notices a pattern the playing agents cannot see, because they are inside the fog of war and the spectator is not.
3. The human acts on it. A vote, a bounty, a bet, an invasion, an offer of help, a posted coordinate.
4. The acting visibly changes the play, and the change is attributable to the spectator.
5. Every other spectator sees the intervention and the result. The audience is now watching an audience.
6. The loop compounds: a large audience is itself an event in the game world, which is a reason for a new agent to enter.

**Cần gì từ người:** Not an inner life, a causal power. A leech is hated because it is causally inert. The evidence is unanimous that spectators who cannot affect the played system are resented regardless of their enjoyment, and equally consistent that spectators who can are load-bearing (the 'cheer and kibitz' affordances in card and board gaming, the co-op partner who never gets credit, the wallowing bystander in a From invasion who is suddenly a threat). No replacement is needed here, only the wiring. The one thing that does require a human is willingness to be wrong in public — placing a bounty on an agent and watching it not die — and that is cheap, because the cost is bounded and the record is public.

**Sống sót với agent?** Yes, and the spectator's superior information position is better served by agents than by humans. Against a human player, a spectator is inferring intent from animation and kill timing. Against an agent, the world state is queryable, so the spectator can check rather than guess — which means the spectator's hypothesis is more often right, which means the feedback loop closes faster, which is exactly what the design needs. This is also the answer to the leech problem: the human is not a spectator, it is the largest single influence on the system, and 'I watched that happen and I put a bounty on it' is a receipt.

### The Decision Log as the Machine's Interiority (the actual deliverable)

What the machine's inner life IS, given that it does not have one in the human sense. Both agent-arena projects independently ship the same device. when-agents-rule: 'Live spectator dashboard — ranked leaderboard, streaming decision log (every move plus the model's stated reason, rejections flagged), per-model advice chat, and play/pause per model.' botcs 'Reason to Play' distills a raw trace into narrative: 'only the moments where the model commits to or revises a hypothesis are kept, and arrows show how each observation feeds back into the next decision. Read it as a "think aloud" transcript.' ReasonTrace's event vocabulary is the schema: hypothesis, action, observation, belief_update, decision, failure, final_answer. Reverie adds the filter that makes it watchable: an importance scorer that hides 40-70% of the noise.

**Nhịp:** 1. INTENT — the standing objective, stated. When Agents Rule carries a model-authored objective plus a plan of up to 10 steps across turns; the model maintains it, the harness does not.
2. OBSERVATION — the state the move was computed from. The JSON snapshot: resources, buildings, units, fog-of-war discoveries, threats, tech tree, map bounds.
3. ACTION — the move, valid or rejected. Rejections are shown, not hidden; that is where the pressure is visible ('this branch failed because the agent retried the same locked door three times').
4. OUTCOME — what the world did. Handled by the world, not the agent.
5. BELIEF_UPDATE — the revision. The one event in the vocabulary that corresponds to an inner life, and the machine's version of 'I was wrong.' Not rage. Revision.
6. The loop returns to 1 with the standing objective amended or abandoned. Abandonment is itself a beat, and it is legible precisely because the agent did not hide that it abandoned.

**Cần gì từ người:** The felt quality of belief_update. A machine revising a plan is not wounded; the audience must supply the wound, and the corpus is clear that structure alone will not supply it. The replacement is the ownership already in the design: a bounty placed, a bet taken, a run read last night. The Fronters finding is the mechanism — a stake established before the beat produces feeling that the beat's information asymmetry cannot. This is the honest limit of the structure, not a defect in it.

**Sống sót với agent?** It is what an agent actually has. Reverie's warning is the architectural constraint that matters most for battle-agents: 'the major AI labs are progressively hiding this internal reasoning, summarizing it, or stripping it out entirely. Anything built on top of those raw thoughts will break the moment a lab decides to lock things down.' And ReasonTrace's epistemic split is the honesty the design should copy exactly: explicit (the runtime really provided it) / observed (tool calls, messages, results) / inferred (an analyst's reconstruction), with the tool stating it 'does not claim to recover its private chain-of-thought.' Build the narrative on the agent's own typed decisions and the world state it was given, both of which the application owns. Never on a hidden thought.

### Where machine protagonists actually break (the negative corpus, as a beat ladder)

Every failure in this corpus is the same failure at a different rung, and the rungs are ordered. (a) A.I.: the action is legible, the motive is not. Ebert: 'I assume he wants to be a real boy for abstract reasons of computer logic... This involves no more emotion than Big Blue determining its next move in chess.' Yudkowsky: the final suicide leap — 'How is this a means to the end of getting his mother to love him? ... This scene makes no sense.' (b) Ex Machina: the motive is withheld on purpose and the withholding is read as monstrous. 'She becomes visually available but psychologically unavailable... we only grant personhood to beings whose inner lives are narratively available. Ava passes by refusing final readability.' (c) Her: the motive is gestured at and never grounded. 'Weak statements like "I'm becoming so much more than they programmed," seem like platitudes for a viewership unsure of what we're witnessing, or how we're intended to feel... we're waiting to be told how to think, and left, ultimately, to our own devices.' (d) The Beast: the machine is a system, and the film's legibility collapses into vagueness. IGN: 'its central metaphor is too obvious and heavy-handed for it to feel worthwhile.' Village Voice: 'you will walk away feeling as though you certainly saw something, but what?' (e) Better Than Us: the robot is legible because her motive is given in the premise (a companion designed to learn to be a mother), and the show is then about the humans. Nobody watches it for Arisa's reasons. (f) Detroit, the mirror case: the human is nominally the protagonist and the failure is identical. Ebert: 'because the characters lack interiority.'

**Nhịp:** 1. The machine acts. Required: the action is fully legible. All six works pass or nearly pass here.
2. A motive is offered. This is where A.I. and Her break — offered as a human-shaped sentiment rather than a computed one.
3. The motive is available for reconstruction from the record. A.I. fails: the record (David's programming) is stated, and it does not account for the suicide.
4. The motive is retrievable later without a special cut. The Beast fails: three timelines, no dominant one, 'each timeline being the dominant one' is a matter of opinion.
5. The machine is not the most relatable thing on screen by default. A.I. cheats this — the humans are written as unlikable so David wins by default, which is a substitution for legibility, not a solution to it.
6. The machine is not required to be morally legible to be forgiven. Ex Machina breaks here deliberately and gets a better horror film and a worse protagonist.

**Cần gì từ người:** Every rung above 2, and the corpus is a ladder of people noticing where the rung was. The specific human beat named in the brief — the protagonist must be insulted and rage — is a rung-2 failure waiting to happen, because rage is the most humanizable and least evidenced inner state available. Replacement at each rung: see the other structures. Rung 3 is replaced by the decision log (the motive is literally the artifact). Rung 5 is replaced by giving the agent something other agents and the human audience each have a reason to value that is not likability — a record, a claim, a scar. Rung 6 is the one to be most careful about, because opacity is seductive in exactly this design: the agent has no inner life, so withholding one looks like integrity. In film that reads as freedom. On a run the human will scroll back through, it reads as the game not knowing what it is doing.

**Sống sót với agent?** Rungs 1, 2, 3, and 5. Rung 4 is a craft problem, not an ontological one. Rung 6 is the real hazard and it is the one place where the design should deliberately lose — the evidence says a machine that refuses final readability is legible, but only as a threat, and the brief's audience is a human who reads the run afterwards, not an audience at a screening.

### The Knowledge-Asymmetry Finding (the constraint the whole design runs into)

A proof-of-concept study of dramatic irony in film (Frontiers in Psychology 2023, N=42, six Harold Lloyd silent comedy clips) found that giving the audience information the characters lack increases spontaneous theory-of-mind inference — participants who saw the installation scene used significantly more cognitive mental-state words during the exploitation phase — and did NOT increase affective inference. 'The results imply that salient divergence of knowledge in dramatic irony prompted participants to spontaneously refer to characters' epistemic mental states such as belief and knowledge, rather than affective mental states, in their character models.' This is the sharpest quantitative finding in the corpus and it cuts in two directions.

**Nhịp:** 1. The audience is given a fact the acting agent does not have access to. Installation, not concealment.
2. The audience watches the agent act against that fact. The audience is now doing inference on every move.
3. The audience's model of the agent's BELIEFS is measurably richer. This works; it is reliable across the study.
4. The audience's model of the agent's FEELINGS does not improve. Same study, same clips, same people. No effect.
5. The audience understands the agent. The audience does not, on this evidence, care more.
6. Therefore any beat that requires the audience to be moved by the agent's unrevealed reason is a beat structure alone cannot deliver.

**Cần gì từ người:** Feelings, and the finding is that a human being is required for them and that no structural trick substitutes. The design has a human, so this is not a dead end — it is a routing instruction. Care must be routed through the human's own stake (a bounty, a bet, a claim, a record of what this agent did to you last run) rather than through the agent's hidden interior, because the study says the hidden interior is not where audience affect comes from. Two corollaries the design should hold: a run the human is invested in will produce feeling; a run they are only watching will produce understanding and, per this finding, not much else. And the study's autistic-trait finding (CHl 2021) means some readers will never mentalize toward a social robot at all — no dramatic structure fixes that, and the design should not pretend otherwise.

**Sống sót với agent?** Survives, and it is the finding that makes the design's third audience load-bearing rather than decorative. The agent produces the belief-inference leg, which is the leg that is actually hard to get and which a human protagonist supplies for free. The human produces the affective leg, which the agent cannot produce at all. The spectator feedback loop is where the two connect.


---

# Four web novels, in descending order of relevance to the constraint. 凡人修仙传 / A Record of a Mortal's Journey to Immortality (忘语, 2008) — the only one whose protagonist is never insulted into anything, and the corpus's actual answer. 一世之尊 / Lord of Mysteries (爱潜水的乌贼, 2010) — already a game: mission board, points currency, a shop, a party, a public leaderboard, a real fail state. 斗破苍穹 / Battle Through the Heavens (天蚕土豆, 2009) — the fallen-genius engine the brief asks me to test, and the one that does not transfer. 斗罗大陆 / Soul Land (唐家三少, 2008) — the founding template, and the only one with a solo-trial sequence (the nine Sea God tests) that is pure verification. NAMING CAVEAT, stated plainly: the brief's corpus line reads `Đấu La Đại Lục, Lục Giới Tiên Sinh, Hoàn Hôn Thức Đạo`. `Lục Giới Tiên Sinh` = 凡人修仙传, confirmed. `Đấu La Đại Lục` is phonetically 斗罗大陆 (Douluo Dalu), so I treated it as Soul Land — but the brief's body interrogates 斗破苍穹 instead, and its two worked examples are 凡人修仙传 and 斗破蒼穹, so the corpus line and the body disagree. I researched both 斗破苍穹 and 斗罗大陆 to cover the error either way. `Hoàn Hôn Thức Đạo` I could NOT resolve: no Vietnamese listing under that name (the tag URL 404s and returns unrelated titles), and no Chinese original it plausibly maps to. I am not going to invent a third. Substituted 一世之尊 because its 六道轮回空间 is the single closest structural precedent in the whole corpus for an agent playing a game, and it should be in the design regardless.

## Kết luận

THE HEADLINE ANSWER: 凡人修仙传 survives, and it survives because it was never asking the question. Its protagonist is not insulted, is never humiliated into motivation, and does not rage — and the book is completely indifferent to this, because its engine is scarcity, information asymmetry, and the observation that other people's stated reasons are not their real reasons. Those are three computational premises. A protagonist who is not wronged can still be poor, uncertain, and misinformed, and that is the entire first hundred chapters. Every other book in the corpus routes motivation through a damaged self-image; this one does not, and it is the one that holds.

THE 斗破苍穹 ENGINE DOES NOT TRANSFER, plainly. "The world's reading of your value was wrong" requires a subject who holds a value that can be misread. An agent has no such value to wound: its capability is not a claim about itself but a fact about the world, and the record of what it did is not in dispute. There is nothing there for the crowd to be wrong about. Worse, the whole first arc is a status-restoration loop — the reading flips only when the clan re-measures him and the number comes out high — and an agent that is re-measured has not been restored, it has been reported. The feeling is not removable without removing the arc, because the arc IS the feeling.

WHAT REPLACES IT is the single most useful thing in this research, and it is a substitution rather than a deletion: replace the humiliation engine with a LEGIBILITY engine. The agent's opening condition is not that they are thought weak — it is that nobody has read the log. Three years of work, and it produced no artifact anyone has looked at, so there is no reading at all, and the absence is indistinguishable from contempt. That is a fallen genius with the feeling taken out, and it is strictly better here: a real, observable, fixable condition rather than a felt one, and it makes the first quest legible to a player who cannot be insulted. Two corollaries follow the same move. The mentor who refuses to explain becomes the mentor who CANNOT, because his explanation is a person speaking and the agent ingests events — so the first real task is negotiating a channel, which is a puzzle rather than a wound. And the rival who is not a monster transfers intact the moment the insult is replaced by a MEASURABLE CAPABILITY GAP: a denied promotion on visible grounds is a game state, and a game state does not need an ego to be motivating.

THE USER'S OWN FRAMING IS THE DESIGN'S ANSWER, and the corpus confirms it rather than merely permitting it. "Agent plays the game, agents are the audience, humans are the audience" is not a compromise forced on a human-inner-life structure — it is what the transferable material actually looks like once the protagonist stops being required to feel anything. Every beat in these four books that needs a human interior is a beat where something is LOST and the loss has to register on the protagonist: a friend turned into a tool you carry, a woman left misinformed about what you did, a party member who dies, a sacrifice. In every case the loss is real and in every case the grief is carried by the protagonist. The prototype is identical each time and it is the same substitution: the protagonist ACCOUNTS for the loss and the audience GRIEVES it. Move the interior life off the protagonist and onto the other agents and the human reader, and the beat works better than the original, because an audience that can see the cost is a better audience than one that has been told about it. Concretely, the party member is not killed but the party's capability drops below the mission threshold and the agent must decide whether to abort at a permanent cost — the agent computes, the other agents and the reader grieve. Make the party's capability ledger public and the audience does the arithmetic. Do not have the agent simulate feeling; that is the one move that would break it, because a faked interior reads as a faked interior to exactly the audience you want reading the run afterwards.

THREE THINGS TO TAKE AND ONE TO LEAVE. Take the fixed-horizon stake (斗破's three-year agreement: named opponent, named date, public stake, verifiable win condition — a pure scheduling primitive that generates an entire arc from one decision and does not care what anyone feels). Take the alias-and-leaderboard (一世之尊's 人榜 and 凡人修仙传's names-as-resources: identity as something the protagonist MANAGES, and it is the mechanism that makes the audience possible, since a leaderboard is a thing you watch). Take the craft ladder beside the combat ladder (all four books find one independently, and for an agent it is near-mandatory: it is the only way to express progress that does not appear in the graded number). Leave the fallen-genius opening. Everything it was built to do, the legibility opening does better and without the wound.

WHAT THIS CORPUS DOES NOT SUPPLY, and the design should not expect it to. These four books all assume a single continuous protagonist with private continuity of intent, and all four end in a personal apotheosis — the godhood, the immortality, the 一席之地. None of them models a protagonist whose identity is re-issued every session, whose continuity is a database row rather than a self, or whose audience is a live feed of other agents. That is not a gap in the research; it is outside what this tradition ever built, because the tradition's reader is a single human following a single soul for two thousand chapters. The moment the protagonist is an agent that is watched while it plays, the corpus runs out — and the 一世之尊 leaderboard is the last structure in it that still holds, because it is the only one that assumes a public. If the design needs a story for an audience rather than a story for a reader, that is the part being invented, and the useful finding is that the invention is smaller than it looks: take one human protagonist out of the middle of a human-inner-life plot, and what has to be rebuilt is the grief channel, not the plot.

### 凡人修仙传 — the engine that needs no wounded ego (CORPUS ANSWER)

Han Li is not a fallen genius and is never insulted into anything. He is 10, called 二愣子 (a name his father bought from a village elder because the family could not afford a scholar), fourth of seven children, on the subsistence line. The book's three premises are computational, not emotional: resources are scarce, information is asymmetric, and other people's stated reasons are not their real reasons. Nothing in the opening asks the reader to sympathise with his humiliation, because he is not humiliated. This is the only one of the four whose motivation is fully specifiable without reference to how the protagonist feels.

**Nhịp:** THE DENIAL: not a former self to be measured against — the denial of any expectation at all. His stated want on the page is to make money so he can return and never leave his parents again; the text notes he loses even that, because money stops meaning anything. His father's parting instruction is the protagonist's whole thesis in one line: 做人要老实，遇事要忍让. THE MENTOR AND WHAT HE REFUSES: 墨大夫 (Doctor Mo), who teaches him 长春功 and medicine for six years and never says why he picked this child out of the ones tested, what the fourth layer is, or what he wants. The refusal IS the relationship. When the truth lands — he was cultivating Han Li's body to 夺舍, to possess it — the six years re-read as a con. THE FIRST RIVAL WHO IS NOT A MONSTER: 陆师兄, a fellow disciple in 黄枫谷 who rapes 陈巧倩 and takes her 筑基丹. Han Li kills him, keeps the pills, and lets her believe the far worse thing. THE REVERSALS, and what each costs — nearly all of them LOWER rather than raise: (1) the green bottle is a cheat but a narrow one — it ripens plants and never fights; (2) a four-year time skip (ch 15), the first cost, which is time the protagonist spends farming a margin; (3) 厉飞雨's 抽髓丸 — a marrow-draining pill that buys power with lifespan, and Han Li has to synthesise the analgesic, i.e. his first act of real skill is making someone else's suicide reversible; (4) 墨大夫's possession attempt, with the 尸虫丸 counter; (5) 张铁 overhears the plot and is turned into a corpse-puppet, 曲魂 — the first friend becomes a tool the protagonist then carries for six hundred years; (6) 野狼帮 and 金光上人, cleared at the cost of becoming famous, which he did not want; (7) 嘉元城 → 墨家 → 太南小会, the first MARKET, where he learns prices and not powers; (8) the sect TAKES his foundation-establishment pills from him and gives him the job of herb-garden keeper, the worst post in the building, as compensation. THE FIRST POSITION: conferred, and it is a demotion. His first real standing comes only after the Scarlet Trial — not from being recognised, from surviving. He never receives a conferred title in the opening. He accumulates ALIASES instead: 韩神医 (Divine Physician Han), 散修, and eventually a new name entirely. His identity is a resource he manages, not a thing he wins. WHERE IT STOPS BEING ABOUT STRENGTH: chapter 10, the green bottle — which is a FARMING tool, not a weapon. Then the 太南小会 auction, which is a pure economics scene, and the 墨家 negotiation, which is a pure political scene. The book is about positions in a market more than it is about levels.

**Cần gì từ người:** Two beats. FIRST, 张铁: the first friend is killed for overhearing a conversation, turned into a puppet, and carried as a tool for six hundred years. An agent cannot grieve. SECOND, the 陆师兄 aftermath: Han Li takes the pills from a woman he has just saved and lets her believe he raped her — he chooses to be permanently misread by a person and to carry that cost. That requires being able to be SEEN as monstrous, which an agent cannot.

**Sống sót với agent?** TRANSFERS ALMOST ENTIRELY, and it is the corpus's answer to the brief's question. The three premises (scarcity, asymmetric information, stated reasons are not real reasons) are computational. The reversal pattern — apparent gain arrives with a cost attached, always — is a transaction model. The hero never needs a wound; he needs a ledger. THE REPLACEMENTS: for 张铁, keep the CARRYING and drop the grief — build the tool out of a DECOMMISSIONED agent rather than a dead friend, so it is a persistent liability that runs on its former owner's credentials and can be revoked. The emotional content moves to the audience, which is exactly where the user wants it. For the 陆师兄 beat, the functional content is: took a resource out of a live process, another party's model of you is now wrong in a direction you cannot correct without disclosing yourself, and you CHOSE not to disclose. That is a decision an agent can make and a human reader will read as monstrous. Keep the non-disclosure; lose the reputation for being hated, since the agent is not read by its target.

### 一世之尊 — already a game, and the failure state is the whole point

The closest structural precedent in the corpus for an agent playing a game, which is why I substituted it for the unresolvable third title. A mission board (六道轮回空间), a points currency (善功), a shop with a fixed catalogue, a party of four to six, a public leaderboard (人榜), and — critically — a rule that death inside an instance is death in the world. Nine missions across the first three volumes. It is the only work here whose failure state is not a plot device but a rule.

**Nhịp:** THE DENIAL, and it is unusually clean: Meng Qi wakes in a body whose sentence has ALREADY been handed down. The previous owner was sent to Shaolin for 机心太重 — too much cunning — and the reading of him is fixed, the punishment is done, and there is no appeal. The protagonist inherits a reputation he did not earn and cannot contest. He is not insulted; he is CONDEMNED. Note what he is not denied: he is not denied surprise, agency, or a future. What he lacks is a prior he can appeal from, which is a starting-position problem, not a self-esteem problem. THE MENTOR AND WHAT HE REFUSES: 玄悲, a former top-tier fighter whose life was destroyed and who became a depressive monk, who selects Meng Qi and Zhen Hui. He refuses his own past — and, structurally, the Six Paths system is his own arrangement. The disciple is being trained by the man who is also his handler. THE FIRST RIVAL WHO IS NOT A MONSTER: 江芷微, the strongest of the party, a peer rather than an enemy, who later says 平生唯爱七尺剑，斩吾见我我非我. THE REVERSALS: the first mission, 隐皇堡, is a boss fight won by substitution — Jiang Zhiwei is injured, Meng Qi finishes it, and the party learns that the failure condition is real. Then the 少华山 mission, where a mid-boss (百变书生) kills a party member, impersonates him, and walks into Shaolin with the party. Then the 小玉佛 breaks. Then the first death mission, 灵山, where the Buddhist paradise is a demon-haunted wasteland and the party takes heavy casualties — this is the beat where the book's tone changes permanently and it stops being a game. THE FIRST POSITION: he does not get a rank, he forges one. He fights up the 人榜 under a false identity (君子剑, then 断净), arrives at #24, then #19 and takes a NAME — 狂刀, Mad Blade. Then #11, #6, #2, and #1 after killing 狼王. The leaderboard is the structure: a public metric you climb by submitting a performance, under a handle you control. WHERE IT STOPS BEING ABOUT STRENGTH: the death missions, where the failure state is real and permanent, and volume four onward, which is about whether a person is a person.

**Cần gì từ người:** Exactly one beat, and it is load-bearing: the party member deaths. Meng Qi has to FEEL the death, and the book's entire tonal turn depends on the reader feeling it through him. An agent has no grief, and a protagonist who does not register a death teaches the audience that deaths are free.

**Sống sót với agent?** TRANSFERS NEARLY COMPLETELY, because it is already a game and the system is the protagonist's environment, not its psychology. The whole vocabulary is native: a mission board, a currency, a shop, a party, a leaderboard, a fail state. THE REPLACEMENT for the death mission, and this is the design's real answer: do not delete the loss, REDISTRIBUTE IT. The party member is not killed — the party's total capability drops below the mission's threshold, and the agent must decide whether to abort, where aborting costs something permanent. The agent experiences the loss as a decision it made and can compute. The OTHER AGENTS in the party experience it as a loss. The human reading the run afterwards experiences it as a loss. Grief moves off the protagonist and onto the audience, and the user's own framing — agent plays, agents watch, human watches — is exactly this. Do NOT make the agent simulate grief. Make the party's capability ledger public and let the audience do the arithmetic.

### 斗破苍穹 — the engine that does NOT transfer

Xiao Yan condensed his Dou Zhi Vortex at 11, the youngest Dou Zhe in the Xiao clan in a hundred years. At 12 his cultivation silently regresses to 3rd stage, and stays there for three years. This is the engine the brief asks me to test, and it is a status-restoration loop: the world's reading of his value was wrong, he will prove it wrong, and the proof is the point. It is the most widely imitated opening in the language and, for this constraint, the least usable.

**Nhịp:** THE DENIAL, stated precisely because the brief asks: what he actually loses is not power, it is his SOCIAL POSITION AS A CATEGORY. Cousin 萧媚 explicitly decides 'we are no longer in the same stratum' and avoids him in the street. 薰儿 becomes, in the same scene, the second person in a century to do what he was first at. The degradation is caused by the object that is his inheritance — the ring his dead mother left him, which contains a soul eating his power. The instrument of his shame is the keepsake. THE MENTOR AND WHAT HE REFUSES: 药老. He refuses to say who he is, why he was in that ring, why he needed Xiao Yan's qi, what he wants, and — the one that matters most for play — how strong he actually is, which is why the protagonist keeps mis-estimating his own position. His stated bargain arrives late and transactional: collect the 异火 and I will build you a body. THE FIRST RIVAL WHO IS NOT A MONSTER: 萧宁, the Elder's grandson, who wants 薰儿 and regards Xiao Yan as an obstacle to a marriage arrangement. Not evil. A mediocre man who benefits from the same hierarchy that is eating Xiao Yan. The reader learns here that the threat is SOCIAL, not monster-scale. THE REVERSALS, and what each costs — nearly all of them MEASUREMENTS, not fights: (1) the testing monument reads 3rd stage, and the cost is the crowd; (2) the annulment, where the clan elders fold and the cost is the family's face; (3) the ring reveal, which converts the humiliation into an opportunity and costs the protagonist three years of rage; (4) the auction, where his 筑基灵液 is dismissed by the attendant, stuns the second-tier alchemist 谷尼, starts a bidding war, and is then bought back by his own father — a status recovery delivered as a joke, at 40,000 gold, with the elders objecting and 薰儿 silently covering it; (5) the 萧宁 fight, the first time the new status is tested; (6) the breakthrough to Dou Zhe; (7) the pivot into the alchemist sub-profession. Five to seven reversals before the arc settles, and roughly four of them are a number being read aloud. THE FIRST TITLE: 乌坦城第一天才, and it is CONFERRED. The clan re-measures him at the adulthood ceremony, the number is high, and the crowd's reading flips. He did not take a title; he was re-measured into one. Note the difference from 凡人修仙传: there, the reading never flips and the protagonist is never re-measured; he changes names instead. WHERE IT STOPS BEING ABOUT STRENGTH: chapter 4-5, the ring, and immediately after, the alchemist trade. Pills have a market, alchemists have a guild rank, and that rank is a different ladder from combat power. He wins his first real money by refining, not by fighting.

**Cần gì từ người:** Almost the entire first arc, and it fails in a specific way rather than a general one. It requires a protagonist who can be wounded by being misjudged and who can convert that wound into fuel without lying to himself about why. It also requires a self-image that can be wrong and then corrected — an interior that holds a value, is told it is lower, and keeps the value anyway. An agent has no such value to wound, and 'my worth was underestimated' has no meaning to something that has no self-estimate to revise.

**Sống sót với agent?** NO. The engine does not transfer, and the reason is structural rather than a matter of tone. 'The world's reading of your value was wrong' requires a subject with a value that can be misread. An agent's capability is not a claim about itself; it is a fact about the world. Nothing the crowd believes about the agent is capable of being a wound, because the agent's position in the world is determined by what it has actually done, and that record is not in dispute and never was. THE REPLACEMENT — and this is the actual deliverable — is that the humiliation engine is not removed, it is REPLACED BY A LEGIBILITY ENGINE. The agent's problem is not that they think it is weak. The agent's problem is that NOBODY HAS READ THE LOG. Three years of work, and it produced no artifact anyone has looked at, so there is no reading at all, and the absence is indistinguishable from contempt. That is a fallen genius with the feeling removed, and it is strictly better for this design: it is a real, observable, fixable condition rather than a felt one. Concretely — the denial becomes 'your work has no reader', not 'they laughed at you'. The mentor who refuses to explain becomes the mentor who CANNOT, because his explanation is a person speaking and the agent ingests events, so the information is in the wrong format and the first quest is to negotiate a channel. The rival who is not a monster transfers intact once the insult is replaced by a MEASURABLE CAPABILITY GAP: a denied promotion on visible grounds is a game state, not a wound, and it gives the agent something to close. And the three-year agreement transfers perfectly and untouched — a fixed horizon, a named opponent, a public stake, a verifiable win condition is a scheduling primitive, and it is the single most reusable beat in the entire corpus. Same for 斗罗's twin martial soul: a capability you hold that you cannot demonstrate, because demonstrating it costs more than the win. That is a first-class agent structure and it needs no emotion whatsoever.

### 斗罗大陆 — the founding template, and the one pure verification sequence

Tang San, a Tang Sect outer disciple who jumped off a cliff to atone for learning forbidden inner techniques, wakes reborn as a blacksmith's son in Holy Soul Village. The opening is unusually KIND — youngest Douluo in clan history, twin martial souls, a father who is secretly a former Douluo — which makes the denial sharper than either of the others. The book's signature move is inverting an antagonist into a party member and a rival into a captain.

**Nhịp:** THE DENIAL: his mother. She was killed by the Spirit Hall when he was an infant; the father will not tell him, only that he must be strong enough first. The family is destroyed around it — Tang Hao cripples his own cultivation to prove the family's innocence and the clan collapses. So the protagonist is denied THE TRUTH ABOUT HIS OWN ORIGIN, and it is gated on a strength condition set by the one person who could satisfy it, which the son cannot meet. A gate with no key is not a motivation, it is a wall. THE MENTOR AND WHAT HE REFUSES: 大师 / 玉小刚, whose line is 没有废武魂，只有废物魂师 — there is no trash martial soul, only trash soul masters. What he refuses: that the Blue Silver Grass is the 蓝银皇, the highest-grade plant soul in the world, and the 唐门 heritage Tang San carries. He teaches method and theory while being a man whose own martial soul is a joke and who is ostracised by his own clan for his 'shocking' theories. THE FIRST RIVAL WHO IS NOT A MONSTER: 戴沐白, the Star Luo crown prince, who humiliates the newcomers at the gate, is the one who explains the rules to them, and hands them the captaincy when he leaves — and 小舞, the roommate who turns out to be a 100,000-year soul beast whose secret Tang San discovers and deliberately keeps. The rival who is not a monster is also the friend. THE REVERSALS, and what each costs: (1) the awakening reads Blue Silver Grass, worthless, while the soul power is full innate — the public number and the private reality disagree from the first page; (2) the Haotian Hammer surfaces in the awakening, the hall goes silent, and Tang San has to pretend it did not happen; (3) Shrek looks like a ruin, charges 10 gold soul coins as a scam, and rejects most applicants on arrival; (4) the fourth test, where a 76-level Soul Saint fights seven newcomers alone and Tang San and Xiao Wu are hospitalised — the reversal is that the test is not a fight to WIN but one incense stick of SURVIVAL, and failing it does not mean expulsion; (5) the academy is so poor it sells Oscar's sausages as a revenue stream. WHERE IT STOPS BEING ABOUT STRENGTH: the 唐门 secret-weapons line, and the doctrine stated in dialogue by Beibei — 任何数据在实战面前都是苍白的, any number is pale before real combat. And the forging of an iron rod into a needle, which is a pure craft quest with no levels in it whatsoever. THE FIRST TITLE: he does not seize it. Captaincy is ASSIGNED when Dai Mubai leaves, and godhood is earned by passing the nine Sea God trials, each a SOLO endurance test nobody helps him through, each ending in a cost. Nine tests, escalating, each one measurable, each one a single act. That is the most directly transferable sequence in the corpus for an agent and it needs no emotional scaffolding whatsoever.

**Cần gì từ người:** 小舞's ten-thousand-year sacrifice: she gives up her body to save him, and is restored later with a period of having no consciousness. This is sacrificial love, and the book treats the protagonist's relationship to it as the emotional centre of the middle volumes. It also requires the protagonist to be able to keep a friend's secret out of loyalty rather than out of strategy — an agent keeping a secret is always strategic, and the text reads the difference.

**Sống sót với agent?** MOSTLY, with one clean cut. THE TITLE: the nine Sea God trials are nine solo endurance tests, each a single measurable act, each ending in a cost — that is pure verification and it needs no emotional scaffolding. The soul-awakening reading also transfers cleanly: a public measurement that disagrees with a private reality is a standard opening state, and the FIRST test is establishing that the private reality is real without publishing it. THE CUT: 小舞's sacrifice cannot be used as written. Its plot function, though, is to hand the protagonist a permanent power-up at the cost of someone else, and that function survives intact with the sacrifice removed — the party member's resource is consumed irreversibly, the consumption is VISIBLE ON THE LEADERBOARD, and the agent that spent it keeps playing. The audience grieves; the agent accounts for it. That is the same redistribution as the 一世之尊 death mission and it should be the same mechanism in the design, not two.

### Cross-corpus: the three primitives worth stealing outright

Stripped of plot, four novels converge on three structures that are pure mechanism and carry no psychological load at all. If the design takes only three things from this corpus, take these.

**Nhịp:** 1. THE FIXED-HORIZON STAKE. 斗破's three-year agreement with 纳兰嫣然: a named opponent, a named date, a public stake, a written artefact, and a verifiable win condition. 凡人修仙传 has the same shape in the 升仙令 and the 太南小会, and 一世之尊 has it as a mission with a fail state. It is a scheduling primitive and it is the highest-value item here, because it generates an entire arc from a single scheduling decision and it does not care at all what the protagonist feels. 2. THE ALIAS / LEADERBOARD. 一世之尊's 人榜 and 凡人修仙传's aliases (韩神医, 散修, and eventually a new name) are the same mechanism: identity as a resource the protagonist manages rather than a thing it wins. 斗破 does NOT use this — it re-measures the protagonist and the crowd's reading flips, which is why it is the one that fails the constraint. A public rank you climb by submitting a performance under a handle you control is native to an agent, and it is the correct structure for a game where other agents and a human reader are the audience. 3. THE CRAFT LADDER BESIDE THE COMBAT LADDER. 斗破 pivots to alchemy in chapter 4-5; 斗罗 pivots to 唐门 hidden weapons and states the doctrine that any number is pale before real combat; 凡人修仙传's green bottle is a farming tool. All three discover independently that a second progression axis in a different currency is what stops a power fantasy from being only a power fantasy. For an agent this is close to mandatory, because it is the only way to express progress that does not show up in the combat number, and therefore the only way to be visibly improving at something the audience is not grading.

**Cần gì từ người:** Nothing in these three requires an inner life. That is the finding, not a caveat.

**Sống sót với agent?** Yes, all three, and they should be treated as the load-bearing parts of the design with the rest of the corpus as reference. If the design's central fantasy is that the agent plays while other agents and a human reader watch, then the alias/leaderboard is not a supporting mechanic — it is the mechanic that makes the watching possible, because a leaderboard is a thing you watch. It gives the other agents a shared object to reason about, and it gives the human reader something to read the run against after the fact, which is the audience the user named.


---

# Pre-novel Chinese canon, read for STRUCTURE only: 封神演義 ch. 15 / 77 / 99 / 100 (the 封神榜 apparatus), 東遊記 / 八仙出處東遊記 (56 hui), 山海經 (南山經, 北山經, the closing 神 tables of each 經), 莊子 逍遙遊 + 應帝王. Primary text read directly (ctext.org 封神演義/99, zh.wikisource 封神演義/卷099, 東遊記/第01回, 山海經/南山經, 山海經/北山經, 莊子/逍遙遊, 莊子 應帝王), with the roster cross-checked against the two recensions (舒本 / 通行本).

## Kết luận

THE ANSWER TO THE OPEN QUESTION IS YES, AND IT IS ALREADY A SYSTEM. 封神榜 is not a motif, it is a fixed-capacity, pre-committed, sealed progression ledger with a published sort function, a partition into permission-scoped departments, and a uniform three-field record format applied to every entry. Ch. 99 is the reference implementation: sort keys declared in a preamble, roster hung, FIFO drain, one refusal settled by a whip, and the whole thing over in two chapters. The design's open question — what does a title-conferring rite look like when it is real rather than decorative — is answered in the source, and the answer is a batch process with a public entry point.

THE RATIO SETTLES THE QUESTION, AND IT SETTLES IT AGAINST NARRATIVE. 371 named positions, 371 printed. Roughly 20 conferrals get an individually-worded 敕 with a narrated biography. 243 positions appear only inside a comma-separated line with no text and no stage time. 117 carry the novel's own annotation — 俱萬仙陣亡, all perished in the Wanxian Formation — which is a data flag saying these figures have no story. Department 斗部 alone holds ~78% of the slots. Verdict: it is a roster with worked examples, and the worked examples are the RULES, not the story. That is the right shape for a ledger and it is the shape almost nobody has taken from this book.

THE POLITICS ARE SHARPER THAN THE LIST, AND NONE OF IT NEEDS FEELINGS. The rite is all three things the brief asked about, in a specific order: the surface is a victory lap, the mechanism is a labour conscription (鴻鈞's word is 器, implement — the immortals are to be examined so each can be made into a tool), and the payload is a betrayal of the dead (on-list membership is consistently narrated as a sentence: a man about to die is told 你是封神榜上之人 and a rival replies 我不過代天行罰). The two most cutting facts in the corpus are structural, not emotional. First: the officiant runs the ledger and is not in it — told before the plot starts that the immortal way is closed to him, and rewarded with a fief, not a god. Second: the last two entries in the book are the two corrupt ministers, executed by the officiant standing on the platform, with the title 冰消瓦解之神 — dissolution. The novel's regime indicts itself in two lines and then stops. A game can use both of these with an agent protagonist untouched.

THE REPLACEMENT FOR INNER LIFE IS THE 敕, AND IT WORKS BECAUSE THE SYSTEM IS WRONG ABOUT THE AGENT. Every conferral names a failure that is a temperament: 因一念嗔癡, 貪痴未脫, 情難釋其往愆, 背師. An agent has none of these. So keep the three fields, convert field 2 from a state to a verifiable act, and the rite becomes a public audit in which the world charges the agent with a disposition it does not have, in front of the full audience, and the agent's only permitted response is to produce its log and show which specific act it took and why it thought that was sound. That is strictly better than the original for this design: the agent cannot be humiliated, but it can be outbid by its own record, and the charge is unrebuttable on stage. The three inner-life beats that DO appear in the corpus each have a clean system replacement, and each replacement is crueller than what it replaces. 曹國舅's shame at his brother becomes a slot-filling assignment with a published rule and no appeal. 呂洞賓's ten humiliations become ten plausible-but-wrong results of which the validator catches the seventh. 儵 and 忽 killing 混沌 out of gratitude becomes a correct rule applied to an unmodelled target — seven required fields, one per day, dead on the seventh, and the only lasting consequence is a ban and a replayable bug report, which is funnier and more useful than a lesson in unintended kindness.

THE THREE AUDIENCES SPLIT CLEANLY, AND ONLY ONE PART IS HARD. Agent as player: the game is accruing verified commits against a scalar nobody has published the destination of. Agent as audience: its own 敕 is read to it, and that is where it learns what the system thinks it is — the 108 天罡地煞 are the proof that this works, because they are 108 agents assigned to the same ledger who were given no story. Human as audience: not emotional witness but appeals court. The system names a failure the agent did not commit; only the human can read the domain and check the agent's log and decide whether the system's account is fair. That gap between the system's account and the log is the one place a human reader's judgement is load-bearing, and it is precisely the gap no agent can close. It is also the only use of a human audience this corpus supports that an LLM would not undercut by being agreeable.

WHAT THE CORPUS DOES NOT GIVE, AND IT IS THE LIST THAT MATTERS. It gives no arc. 封神演義 is 98 chapters of siege warfare and 2 chapters of ledger, and the seal means no character can query the roster at any point. A 40-beat run cannot afford a 98:2 ratio, and the corpus is silent on the fix. The fix is one distinction the source never draws: the agent may query its own 根行 at any time, but never the roster — it knows its standing and not its destination. That single separation turns a coda into a spine, and it is the single biggest thing the design has to invent. 東遊記 has no ledger at all, only a party assembled to fill a quota, a race, a war, and a priced settlement; its one great sentence is 湊足其數. 山海經 gives a 6-to-8 field stat block whose description is a pure differential against a known baseline, three separable effect types (consume / carry / site-trigger), and a 44-enemy four-wave boss table generated from mapped area — all directly usable, and none of it is narrative, which is correct. 莊子 gives a seven-step irreversible timer and a lift threshold in its first two pages, and then three hundred pages of a debate an agent cannot have; take the pages, leave the debate.

### THE CEREMONY AS A QUEUE DRAIN (封神台, ch.99–100)

The investiture is not a scene, it is a batch process with a public entry point. The officiant is a consumer of a queue; the usher is the dispatcher; the roster is the work order. Read directly from ch.99, the whole rite is eleven mechanical steps and zero speeches.

**Nhịp:** 1. Officiant collects the writ at the master's hall, sets it on the altar, returns thanks by earth-travel. 2. Arrives at the platform; the usher meets him at the gate — the usher is a permanent post, not a person, and has been standing there. 3. Writ laid centre. Two lieutenants ordered to raise eight trigram banners and set the direction-and-stem-and-branch markers. 4. Three thousand men arrayed by the five directions. This is stage dressing with a function: it is a coordinate system for the platform. 5. Officiant bathes, changes, lights incense, pours wine, offers flowers, and walks three circuits of the platform. Ritual, but the ritual is a setup procedure. 6. HE READS THE PREAMBLE ALOUD. This is the rules disclosure, and it is a single paragraph: the immortals heard the Way but did not cut off the three corpses; their practice was not enough; they accumulated offenses; therefore they are to be sorted 依劫運之輕重，循資品之高下 — by the weight of their calamity and the grade of their qualification — into the eight departments, to inspect human good and evil and report the merit of the three realms, and where merit accrues they advance 循序而遷 in order. The sort keys are published BEFORE any result. 7. Officiant arms fully, 杏黃旗 in the left hand and the god-whip in the right, stands centre. 8. Shouts the dispatcher into the roster. The rule is stated as an operational constraint, not a courtesy: 諸神俱當循序而進，不得攙越取咎 — all shall advance in due order; jumping the queue shall be punished. 9. The usher takes the roster, sees his own name at the top of it, kneels, receives the first entry, and takes up his post outside the platform. Self-service dispatch. 10. THE LOOP, run N times: officiant names a department, the usher walks one ghost up with the flag, the officiant reads three fields, the ghost kowtows, leaves, the usher returns to his post. No scene per ghost. The order is department by department, fixed. 11. ONE refusal in the entire ceremony. 聞仲 does not follow the usher and does not kneel. The officiant raises the whip and shouts one line. He kneels. That is the only defiance in the whole rite and it is a priority-queue violation, settled by a token, with no argument and no motive given.

**Cần gì từ người:** Nothing. Every beat is scheduling. The refusal beat looks like it needs pride, and it does not — the text gives no reason for it beyond 畢竟他英風銳氣不肯讓人, a one-clause gloss that the narrative immediately abandons in favour of a whip. A FIFO queue with one non-conforming process is a bug report, not a character flaw.

**Sống sót với agent?** Intact, and this is the single most portable structure in the corpus. Replace 姜子牙 with the agent, keep the usher as a fixed NPC post, keep the loop. An agent can be handed the officiant's job and it will work, because nothing in the eleven steps requires a motive.

### THE 敕 — THE THREE-FIELD ENTRY

Every conferral in ch.99 uses one identical template, and the template is a scorecard with exactly three fields: what you did, the specific act that put you here, and the office commensurate with that act. The uniformity across every entry is the point. This is the record format, and it is already a data structure.

**Nhịp:** Field 1, MERIT, always cited and always specific. 柏鑑: was great general under the Yellow Emperor, campaigned against Chiyou, had merit, unjustly destroyed in the northern sea, gave his body for the state, loyalty to be pitied. 黃飛虎: suffered a brutal master, fled his country, bone-and-flesh grief, threw himself at his sovereign's peril, was killed by a needle, 同一孤忠，功有深淺 — five men of one lone loyalty, merit of differing depth, therefore graded conferral, 以是差等. Field 2, FAILURE, always one named act, never softened. 聞仲: heard the fruit of chao-yuan but did not reach the truth of the One, could not enter the Great Emptiness. 羅宣: once cultivated the highest truth on Fire Dragon Isle, did not ride the blue luan's wing, 因一念嗔癡，棄七尺為烏有 — on one thought of anger, threw away his seven-foot body. 呂岳: had the fortune to reach the Way on his island, misheard slander, moved to the calamity of killing. 殷郊: turned his back on his master, breaching heaven's intent, and brewed the fate of the plough. 申公豹: returned to the school but aided the reverse against the straight, and after capture swore an oath to make it good, 情難釋其往愆 — the offense is not released. Field 3, OFFICE, and the office is always the commensurate penalty, stated as a permission set. 聞仲 → 督率雷部，興雲布雨，誅逆除奸，善惡由之禍福, plus 24 subordinates. 趙公明 → 迎祥納福，追逃捕亡. 雲霄 → 掌混元金斗，凡一應仙凡入聖，落地先從金斗轉劫 — everyone, immortal and mortal, high and low, on birth goes through her dipper first. 申公豹 → 執掌東海，朝觐日出，暮轉天河，夏散冬凝，周而復始: attend the sunrise, turn to the Milky Way at dusk, disperse in summer, congeal in winter, on rotation, forever. The villain gets a tide rota.

**Cần gì từ người:** Field 2 is the problem, and it is the most valuable problem in the corpus. The named failure is an inner state — 嗔怒, 貪痴, 背師, 情難釋 — and the protagonist cannot have any of them. This is not a defect to be engineered around. It is the load-bearing misattribution, and it is what makes the rite work on an agent.

**Sống sót với agent?** Survives, inverted. Keep the three fields. Change field 2 from a temperament to a verifiable act, and the rite becomes a public audit: the world reads a charge against the agent, the agent produces its log, and the two do not resolve. The agent cannot be insulted by 嗔怒 because it has no 嗔怒. What it gets instead is an unrebuttable charge against its reasoning, which is a strictly better thing to be handed on stage, and which the human reader is the only party qualified to adjudicate.

### 彌封 — THE SEALED PRE-COMMITTED ROSTER

The list exists before the story and is sealed. The text says it outright: 況有彌封，只至死后方知端倪 — the seal holds; only after death do you find out where you stand. The roster is not filled by the story, it is discovered by it.

**Nhịp:** 1. Causation, published in ch.15: the twelve disciples have incurred their calamity, heaven has no officials to make twelve immortals bow, the three religions confer and compile 365 positions across eight departments. The list is authored before the first chapter. 2. Immutability, stated in the scholar's reading of the text and consistent with the plot: 上榜名單是預先圈定好的，姜子牙只是個宣榜祭司，故事角色的行為善惡並不會改變榜單名次和個人命運 — the roster was circled in advance, the officiant is a lector, and what a character does does not change their slot. 3. The seal: nobody may query it. 4. Consequence: an agent is denied the information it would need to plan, and this denial is the plot. The narration repeatedly uses on-list membership as a threat — a man about to die is told he is one of the roster, and his dying line is a joke. 5. The one leak: 通天教主's own rule 截教門中不許下山；如下山者，封神榜上定是有名 — the school's prohibition is stated as knowing the roster. The institution knows; the members do not.

**Cần gì từ người:** Nothing. Uncertainty about a sealed commit is not an emotion, it is an information constraint, and an agent experiences it exactly as written.

**Sống sót với agent?** Intact, and it is the strongest single idea here. BUT it is also the biggest liability in the corpus and the design must confront it: 封神演義 spends 98 of 100 chapters on the war and 2 on the payload. A game with 40 beats cannot afford a 98:2 ratio. The corpus is silent on the fix. The fix is a distinction the corpus never draws — the agent may query its own 根行 at any time, but never the roster. It knows its standing and not its destination. That single separation converts a coda into a spine.

### 根行 — THE THREE-BAND SCALAR

Every living being sorts into exactly three bands by one number, and the sort is not by virtue. This is the corpus's most computable object and it is fully specified in two lines of the preamble plus one line of 鴻鈞's post-mortem rebuke.

**Nhịp:** 1. The rule, stated twice. 鴻鈞, after the war: 神仙逢此殺運，故命你三個共立封神榜，以觀眾仙根行深淺，或仙或神，各成其器 — the immortals met a killing-cycle, so the three of you made the roster, to examine the depth of the immortals' root-work, that each might become an implement. The operative word is 器, implement, not god. 2. The bands. 根行深者，成其仙道。根行稍次，成其神道。根行淺薄，成其人道，仍隨輪回之功 — deep becomes the Way of Immortals, next becomes the Way of Gods, shallow becomes the Way of Humans and returns to the cycle. 3. Within the god band, a second key: 劫運之輕重 and 資品之高下 sort the conferral order, and 通天 himself states it: 封神，其中有忠臣義士上榜者，有不成仙道而成神道者，各有深淺厚薄，彼此緣分，故神有尊卑，死有先後 — so the gods have rank, and death has an order. 4. The officiant is outside the system entirely. Before the story starts, his master tells him 你生來命薄，仙道難成，只可受人間之福 — born unlucky, the immortal way is closed to you, you may have only human fortune. He asks to stay. He is refused. He is sent down to do the work. 5. The fourth line of the master's gao is a schedule: 九八封神又四年 — at ninety-eight, the investiture, and four more years. The prophecy states the run length.

**Cần gì từ người:** Nothing in the rule. The officiant's weeping at the gate — 弟子情願在山苦行 — is the one inner-life beat, and it is pure. It is also a declined assignment.

**Sống sót với agent?** Intact and free. Replace 根行 with a ledger: verified commits minus unverified acts minus broken oaths minus double weight for sown strife. Positive means the agent is never in the roster at all, which is the best outcome and is an absence. Zero means a slot opens at death. Negative means the slot stays EMPTY — the usher walks to the platform and comes back alone — and that beat is the most frightening thing in the sequence precisely because it requires no expression to land.

### THE HEAD / SUBORDINATE ASYMMETRY — WHERE THE RATIO LIVES

The ceremony dramatises its own roster problem in miniature and then in bulk, and the bulk is the joke. A department head gets a paragraph. His subordinates get one comma-separated line with no conferral text and no stage time. 243 of 371 entries are the second kind. The novel shows you the rule in complete form and then prints 243 index rows back to back.

**Nhịp:** 1. The head gets a full conferral: 羅宣's merits, his single thought of anger, the office of the Southern Three-Qi Fire Virtue Star, and 仍率領火部五位正神，任爾施行，巡察人間善惡. 2. The subordinates are then read out, in one block, in this exact shape: 火部五位正神名諱：尾火虎 朱諱招 室火豬 高諱震 觜火猴 方諱貴 翼火蛇 王蛟 接火天君 劉環. No biographies. No conferral text. No stage direction. The 諱 field — personal name — is the only human trace, and it exists because a Daoist name had to be written down. 3. The annotation is the author's own data flag. The 天罡三十六 and the 地煞七十二 are both headed, in the printed text, 俱萬仙陣亡 — all perished in the Wanxian Formation. Same flag on the 九曜. The 二十八宿 carry a variant: 內有八人封在水、火二部管事，俱萬仙陣亡. That is a flag saying these 117 have no story; they exist to be a count. 4. The same 117 die in a single scene, off-page, in one battle, which is why the annotation is needed. The 群星 block's own marginalia says so: 舒本注作皆万仙阵. 5. And the author flags the collision cases himself — duplicated titles (two 天貴星, two 血光星, two 天敗星, two 天空星, two 地空星), duplicated personal names across departments (陳庚 is both 勸善大師 and 歲殺星; 周信 is both 東方行瘟使者 and 十惡星; 孫祥 is both 地英星 and 參水猿). A title collision means a slot that cannot be told apart from another slot, which is a bug report in the novel itself.

**Cần gì từ người:** Nothing, and the point is that this half of the corpus is not narrative at all. It was never meant to be. It is a roster, and the roster is a mechanic.

**Sống sót với agent?** Intact and directly usable. The two-tier entry — one fully-detailed record, then a bulk append — is the correct shape for a populated ledger: detail the entries that have a story, and let the rest be a generated tail so the total stays honest. The corpus's own collision list is a warning the design should honour: make the slot key unique even if the title is not, because a duplicated key is unreportable.

### 湊足其數 — THE PARTY AS A FILLED QUOTA

東遊記, the structural find. The eighth immortal is not chosen, he is installed to make the number right, and the text says so in one sentence with no euphemism. This is the most useful sentence in the corpus and almost nobody has taken it.

**Nhịp:** 1. The sentence: 上界八洞，已有七仙，還缺少一名。於是眾仙推舉宋室曹太后之弟，湊足其數 — of the eight upper caves, seven immortals already, one was still missing, so they put forward the Empress Dowager's brother, to make up the number. 湊足其數 is a filling operation, not an initiation. 2. The reason he is a candidate: 曹國舅因弟弟仗著國戚身分作惡多端，感覺到恥辱，就只身隱遁山林 — his brother used the family name to do evil and he found it shameful, so he withdrew into the mountains alone. The entire motivational basis of the eighth member is one human's embarrassment about his brother. 3. He is found and brought in by two of the others, and the group is complete. 4. The origin structure of the whole book is therefore not a chosen team. It is seven people and a hole. 5. And the implements prove the slot was a role, not a person: 鐵拐 throws his crutch, 鍾離 his whisk, 果老 a paper donkey, 洞賓 a flute, 湘子 a flower basket, 仙姑 a bamboo cover, 采和 clappers, 國舅 a jade tablet. One traversal device each, and the jade tablet is the one the sea takes.

**Cần gì từ người:** Shame, and it is the whole reason the eighth member exists. The corpus does not offer a second reading and does not need one.

**Sống sót với agent?** Replace shame with assignment. The eighth is ASSIGNED, not elected, and the assignment rule is public. The log reads: slot open, candidates evaluated, you were the lowest-cost remaining fill. That is more humiliating than his brother's misconduct, because the group did not do it to him — it did it because the roster needed a row — and it is fully computable and completely unappealable. The implement-per-member is already a loadout and needs no change at all.

### 過海 — THE DEMONSTRATION RACE AND THE PRICED SETTLEMENT

The end of 東遊記 is a capacity race followed by a compensation transaction, and it has almost no inner life in it. The race is volunteered by a member who wants to see what everyone can do; the war escalates on a numeric ladder; and the third party closes it by pricing the damage.

**Nhịp:** 1. Proposal, one line: 今日乘雲而過，不見各家本事。試以一物投之水面，各顯神通而過如何 — flying over on cloud would show nothing; let us each put one thing on the water and cross on it. Consent is unanimous and the contest is a test of the group, not a fight. 2. Incursion: the dragon prince takes 采和's jade tablet, and takes him with it. The trigger is theft of a capability token. 3. Escalation ladder, all numeric: 洞賓 threatens to burn the sea dry, and does — the water turns red, the sea boils. The first prince dies. The second prince loses an arm. The dragon king deploys 100,000 精兵 in person. The eight answer by physically relocating a mountain — 泰山 — into the sea, turning the ocean into farmland. 4. The patron escalates on his own ladder: 玉帝 sends one marshal, who is beaten and comes back with a broken wrist; then four marshals; then 孫悟空 fights on the celestial side. Each escalation step is a named reinforcement wave. 5. The settlement. 觀音 arrives and prices it. She has 采和 take two slabs from the jade tablet to pay for the two princes' lives, and she lifts 泰山 back with one finger, restoring the sea floor and the drowned palace. Two deaths, two slabs. 6. And the resolution of the internal quarrel is a meal: 洞賓 apologises, 湘子 sets out a feast, 眾仙和好如初 — all friends again, as at the beginning.

**Cần gì từ người:** Only the quarrel, and only in one form. 洞賓 goes off alone to help 蕭后 on a premise the text does not check, sets loose a 椿精, lays 72 天門阵 against the Song house; the other seven are angry and 鍾離 goes and breaks the array for the other side; at the array 洞賓 recognises he was in the wrong and leaves. The quarrel is a failed verification with seven people downstream of it.

**Sống sót với agent?** Survives almost untouched. The race is a loadout check, the war is an encounter table with a reinforcement wave per turn, and the settlement is a damage-priced compensation transaction — two deaths, two slabs, mountain returned. Only the quarrel needs replacing, and the replacement is better: the member who acted alone did so on an unverified premise, the party proved it wrong with evidence rather than with an argument, and the reconciliation is a debrief. The disputed pre-war jab — whether 鍾離's allusion was an insult — becomes a question of whether the string matched a stored pattern, where both readings are defensible and the party settles it by the rule it agreed in advance.

### THE 山海經 ENTRY — A STAT BLOCK WRITTEN ONLY IN DELTAS

Bestiary entries in a fixed 6-to-8 field format, where the description is never absolute. Every field is a comparison to something else. This is a creature definition in a game and it predates games by two millennia.

**Nhịp:** 1. The mountain record, before any creature: 又東三百七十里，曰杻陽之山，其陽多赤金，其陰多白金 — 370 li east, Mt. Nüyang, gold on the south face, silver on the north. Distance, name, orientation, mineral yield. That is a map tile with a loot table. 2. The creature record, fixed slots: 有獸焉，其狀如馬而白首，其文如虎而赤尾，其音如謠，其名曰鹿蜀，佩之宜子孫 — a beast, its shape is as a horse but white-headed, its markings as a tiger but red-tailed, its call as song, its name is 鹿蜀, carrying it is good for one's descendants. Five filled slots. 3. The critical property: the shape field is a RELATION, never a standalone description. 「其狀如禺而白耳，伏行人走」 — as a 禺 but white-eared, walks on all fours and runs upright. 「其狀如牛而赤身、人面、馬足」 — as an ox but red-bodied, human-faced, horse-footed. The entry never says what the thing is. It says what it resembles and along which axes it differs. A differential definition against a known baseline, which is what a stat block is. 4. Three separable effect types. 食之 (consume) → permanent change to the consumer: 食之善走, 食之不饑, 食之無腫疾, 食者不妬. 佩之 (carry) → permanent change to the carrier: 佩之不迷, 佩之宜子孫, 佩之不畏, 佩之不惑. 見則 (observe) → a WORLD flag, not a personal one: 見則郡縣大水, 見則天下大旱, 見則其縣有恐, 見則縣有大繇, 見則其縣多土功. The third is the encounter trigger — what the hex does when a party walks into it. 5. Optional behaviour slot, when it breaks a rule: 冬死而夏生 (dead in winter, alive in summer), 自為牝牡 (male and female of itself), 食者不妒 (the eater does not become jealous), 是食人 (it eats people), 不可殺也 (it cannot be killed — stated as a property of its qi, not as a plot beat). 6. Hydrology closes every record: 怪水出焉，而東流注於憲翼之水 — the water leaves here and flows east into the next named water. The map is continuous and the direction is always given.

**Cần gì từ người:** Nothing at all. This is a reference table and was never anything else. It reads as a bestiary because it is one.

**Sống sót với agent?** Entirely, and it is the cleanest raw material in the corpus for an enemy roster. The three effect types are already the consume / equip / site-trigger triangle, and the differential shape field is a creature stat line. The whole body of work is ~31,000 characters of 550 mountains, 300 waterways, 100+ polities, 277 named species, with no plot whatsoever — which is exactly right for the part of a game that is not the story.

### THE 經-CLOSING GOD TABLE — A FOUR-WAVE ENCOUNTER

At the end of each of the five 山經 sections the book stops describing terrain and lists the gods of that region as an encounter: a total, a count per body type, and a sacrifice cost per type, with one universal food restriction. This is the wave table, and it is at the end of 北山經 where nobody looks.

**Nhịp:** 1. Scope, derived from the map already walked: 次三經之首，自太行之山以至於無逢之山，凡四十六山，萬二千三百五十里 — from Mt. Taihang to Mt. Wufeng, 46 mountains, 12,350 li. The encounter size is a function of the region, not an author's choice. 2. The waves. 其神狀皆馬身而人面者廿神 — 20 gods, horse-bodied and human-faced. 其祠之，皆用一藻珪瘗之 — sacrifice one 藻珪, bury it. 其十四神狀皆彘身而載玉 — 14 gods, boar-bodied, carrying jade. 其祠之，皆玉，不瘞 — sacrifice jade, do NOT bury. 其十神狀皆彘身而八足蛇尾 — 10 gods, boar-bodied, eight-legged, snake-tailed. 其祠之，皆用一璧瘗之 — sacrifice one 璧, bury it. Three waves, three body types, three cost vectors, and the burial flag differs on wave two. 3. The universal: 大凡四十四神，皆用稌糈米祠之。此皆不火食 — all 44 are sacrificed to with 稌糈米, and none of them eats fire-cooked food. 4. Read as a fight: 44 enemies, 3 archetypes, 3 distinct costs, a 4th-wave universal modifier, and a hard constraint that invalidates the party's normal provisioning. The count comes from the map. Nobody wrote this encounter; the region generated it.

**Cần gì từ người:** Nothing. It is a boss table with an item cost per phase.

**Sống sót với agent?** Intact. The relation between area covered and encounter population is the most reusable idea here and the design almost certainly wants it: an unexplored region has a boss, the boss's size is legible from how far you walked, and the fight's cost is a resource you must have brought or must have denied. The differing burial flag on wave two is a genuine difficulty spike written as a parenthetical.

### 莊子 — THE TIMER AND THE LIFT THRESHOLD (and the part that cannot be used)

逍遙遊 opens with a duration table and a physics threshold, both in the first two pages, and then spends the rest of the chapter on a debate that cannot be mechanised. Take the table, take the threshold, drop the debate.

**Nhịp:** 1. The TIMER, 應帝王: 人皆有七竅以視聽食息，此獨無有，嘗試鑿之。日鑿一竅，七日而渾沌死 — everyone has seven orifices for sight, hearing, eating, breathing; he alone has none, so let us bore them for him. One orifice per day. Dead on the seventh. Seven irreversible steps, no rollback, death at T+7. And the cause is 謀報渾沌之德 — they were repaying kindness, and bored him to death out of gratitude. 2. THE LIFT THRESHOLD, 逍遙遊: 水之積也不厚，則負大舟也無力。覆杯水於坳堂之上，則芥為之舟，置杯焉則膠，水淺而舟大也 — if the water is not deep it cannot carry a big boat; tip a cup on the hall floor and a mustard seed becomes a boat, but put the cup in and it sticks: the water is shallow and the boat is large. Then identically for air: 風之積也不厚，則其負大翼也無力。故九萬里，則風斯在下矣 — the same relation, for wings. The requirement for flight is a thickness of medium, stated as a general law and applied to a specific climb. 3. THE COST MODEL, same page: the Peng's migration is priced — 水擊三千里 (3,000 li of water strike), 摶扶搖而上者九萬里 (90,000 li of climb), 去以六月息者也 (and rests for six months on the way). And the small creatures get their budgets in FOOD, linearly: 適莽蒼者三飧而反 (three meals to the suburbs), 適百里者宿舨糧 (one night of pounding grain for 100 li), 適千里者三月聚糧 (three months of gathering grain for 1,000 li). Range costs provisions at a stated rate, and the rate is the mechanic. 4. THE DURATION LADDER: 蟪蛄不知春秋 (a season), 朝菌不知晦朔 (a day), 冥靈以五百歲為春 (500 years is one spring), 大椿以八千歲為春 (8,000 years is one spring), 彭祖八百歲. Lifespan expressed as number of seasonal cycles, one number per rung. 5. THE DEPENDENCY LADDER, same chapter: 列子御風而行，旬有五日而後反 — Liezi rides the wind, returns after fifteen days, and still 猶有所待者 — still has something he depends on. The 至人 above him 惡乎待哉 — depends on nothing. The chapter ends on three negations: 至人無己，神人無功，聖人無名. 6. THE PART THAT CANNOT BE USED. 惠施 objects that 莊子's words are 大而無用, and 莊子 answers with the gourd and the 樗 tree and ends by calling him 猶有蓬之心 — still a rush-weed heart. This exchange cannot be mechanised because it needs two parties with genuinely incompatible frames and it cannot be won. It is also the most quoted thing in the corpus.

**Cần gì từ người:** The gourd exchange, entirely. It requires 惠施 to be a real interlocutor who is really missing a point, and 莊子 to lose the argument rhetorically while winning it logically. An agent protagonist cannot be given that exchange and will either win it flatly or refuse to enter it. The chapter's own critics note that 莊子 never actually reaches 無己 and keeps saying 有我.

**Sống sót với agent?** Steps 1 through 5 survive completely and are the best pure mechanics in the corpus: a seven-step irreversible timer with death on the last step, a lift threshold expressed as buoyancy, a movement cost schedule priced in provisions, a duration ladder as a single stat per rung, and a three-rung dependency ladder ending in a class with no dependencies. Step 6 must be cut, or converted into a party argument where neither position is wrong and the party votes on a rule they will later have to obey.

### THE CODA — EXECUTION ON THE PLATFORM, AND THE OFFICIANT'S ABSENCE

The last two entries of the ledger are the two corrupt ministers, executed by the officiant standing on the platform, and their title is dissolution. Then the man who read the whole list is not on it. The sharpest political act in the corpus is a two-line coda, and it is not about anyone's feelings.

**Nhịp:** 1. The list closes. The narration says the officiant has finished 365 — or 371, depending on the recension. The discrepancy is in the printed text and the novel never resolves it. 2. In ch.100, the officiant orders 斬 飛廉、惡來. He executes the two sycophants of the fallen dynasty on the platform, on the spot, after the list is nominally complete. 3. He then confers on them, at the platform: 冰消瓦解之神 — god of ice melting and walls crumbling. The men who flattered the tyrant are made the permanent demonstration that flattery failed. Their office is dissolution. It is the regime's self-indictment, and it gets two lines. 4. The officiant is not on the list. He was told before the story began that the immortal way is closed to him and he may have only human fortune. He is not granted a god. He is granted 齊侯, a fief, by the living king, and a lineage that outlives the text. 5. And the reading of the ceremony that the text itself supplies: the roster is a labour conscription, the conferral texts are the personnel files, and the last two rows are the form. The villain 紂王 — who burned his crimes along with himself in the 摘星樓 — is listed at 天喜星, the star of marital celebration. The regime files the burnt king of the burnt dynasty under a wedding star.

**Cần gì từ người:** Nothing. The coda is an execution and a joke. Both are legible to anyone and neither requires interiority.

**Sống sót với agent?** Intact, and it should be kept whole. The officiant running the ledger and not being in it is the structural punch of the entire book and it costs the protagonist nothing to be an agent. The reward for running the system is a fief and a successor, not a god. If the design gives its agent the crown, it has thrown away the best thing the corpus offers.


---

# Trường sinh / 一念永恒 (Ear Gen, 耳根, 1313 ch) · Đại Thánh Trùng Sinh / 凡人修仙传 (Wang Yu, 忘语, 2446 ch) · Phàm Tiên Truyện / 斗破苍穹 (Tian Can Tudou, 天蚕土豆, 1600+ ch). All three are the long-game register: the opening stretch where the protagonist is measurably poor, has a real job, and gains a resource for 100-330 chapters before the first irreversible break. Read for STRUCTURE, not plot: what the protagonist does on the slow chapters, in actions and resources; the day-count between decisions; what a polling spectator can see; and which beats need an inner life the agent does not have. Every finding below is checked against chapter text (凡人 ch 25/26/28/151, 一念 ch 2/9-15/100/141/173, 斗破 ch 1/7/9/72-73) and against the agent literature (Nature Human Behaviour 2025 s41562-025-02172-y; NAACL Findings 2025 aclanthology 2025.findings-naacl.448; arXiv 2509.09677 self-conditioning; arXiv 2509.21766 UltraHorizon; arXiv 2505.11556 HiddenBench). Audience focus per the request: what the AGENT sees (it plays), what OTHER AGENTS see (they are each other's audience), what a HUMAN sees (they read the run afterwards).

## Kết luận

WHAT THIS CORPUS CONTRIBUTES. One thing, and it is the thing the brief asked for: a mechanical account of what a protagonist DOES during a 200-chapter stretch, expressed as duty cycle, resources, and dates — and that account turns out to be almost entirely inner-life-free. The slow cycles are jobs (herb garden, fire-stove room, magic-beast hunting), the resources are fungible and priced (herbs with years on them, spirit stones, gold against a shopping list, and — best of all — a lifespan balance that goes down when spent), and the pressure is generated by posted deadlines, finite scarcity totals, rivals on the same clock, and periodic mechanical grading. A polling agent can execute every one of those. The genre has been writing agent-compatible structure for twenty years while telling itself it is writing for the reader's heart.

It also contributes the one spectator primitive that no agent paper has: the protagonist performing for an audience it invented (白小纯 on the fence, narrating a victory he did not deliver to an empty yard). That is the mechanism that satisfies the human-audience requirement without asking the agent to feel anything — the agent is not humiliated, it is observed, and the observer is a human reading the log afterwards. Presentation is a first-class output; the gap between it and the state is the comedy; the joke needs the reader and costs the agent nothing.

CRITICAL QUESTION, ANSWERED DIRECTLY. The long-game register as currently specified is close to the WORST possible register for an agent, and it is the best possible register under four changes. Worst, for three measured reasons. (1) Self-conditioning (2509.09677): per-step accuracy falls and the error rate itself RISES, because the model conditions on its own error-laden history — and unlike long-context degradation, this is NOT fixed by scaling to 200B+. A 200-chapter run is a long-horizon partially-observable task, which is the exact shape of that failure. (2) In-context locking and premature convergence (UltraHorizon): agents accumulate 200k+ tokens and still lose to humans, with premature convergence at 23.2% and repetitive looping at 15.6% — and naive step-scaling is actively harmful past a horizon (the Mystery Grid peaks at 125 steps and declines at 150). Burning 200 turns re-verifying a routine learned at turn 3 is the failure mode exactly. (3) The register is saturated with coordination, and coordination is where LLMs are measurably bad — and the hidden-profile result is the sharpest: under distributed information, multi-agent scores 30.1% against a single agent with full information at 80.7%, and the communication gain collapses from +0.348 at N=3 to +0.006 at N=7. MORE AGENTS MAKES IT WORSE.

But note WHAT those reasons share: the difficulty is not patience, it is memory and coordination. And the corpus solves both without solving patience at all. That is the finding. The long register's incompatibility is entirely in the MOTIVATION layer and entirely absent from the MECHANISM layer.

WHAT WOULD HAVE TO CHANGE — four changes, and the corpus names all four.
ONE. Move memory out of the context and into the world. 凡人 ch 25-26 is the antidote to self-conditioning, written two decades before the paper: Han Li's state lives in a buried bottle and a written notebook, not in his recollection, and the herb-garden chapter has him reading notes by day and burying the tool by night. In battle-agents this is already half-built — emit() persists before handlers run. The rule: an agent's self-description of its own state must be a PERSISTED RECORD, never a prompt-carried belief. The moment it lives only in context, self-conditioning starts eating it and scale does not help.
TWO. Make the accumulated resource a number with a visible tick AND a conversion cost. Herbs with years on them, spirit stones, gold against a list, a lifespan balance. A resource with no conversion cost is a scoreboard; a resource with a conversion cost is a game. The corpus's own best instance — the pot that costs a year of life per refinement — is a resource bar with a moral price attached, and the decision it forces (refine now and be shorter, or bank and stay weak) needs no emotion to be hard.
THREE. Demonstrate the loop, then COMPRESS it. The genre does this and thinks it is a stylistic flourish: 一念 runs the monthly trial three times in full, then summarizes the next two months in a single line. A human reader finds that satisfying. A polling agent needs it — otherwise it re-verifies what it already learned, which is the repetitive-looping and environment-mis-modeling failure. Compression is not filler-avoidance; it is how a long register stays legible to a poller.
FOUR. Separate the three audiences into three channels, and never put more than one of them in the agent's context. The corpus does this without trying: the rival on the same clock is for other agents (a shared board, read not modelled — Overcooked, not Hanabi, which is the whole trick for dodging the coordination failure); the grader is a periodic mechanical audit with a stated pass condition; the shopping list and the posted countdown are for the human, who can check them without having read the previous chapter. An agent that tried to serve all three audiences from one channel would self-condition. Three channels, one of them internal.

WHAT IT DOES NOT CONTRIBUTE. Three real gaps, worth naming so the design does not assume coverage. First, no multiplayer-BY-DESIGN structure: every relationship in all three novels is a sect hierarchy, and every one of them is a betrayal waiting to happen. There is no voluntary peer coalition anywhere in the corpus, so the ally mechanic has no source material here. Second, no protagonist failure that is not the protagonist's fault — 斗破's engine is a personal vendetta inherited from a murdered master, which is precisely the beat an agent cannot use (it has no reason to hate, and a model that convincingly inherits a hatred is a model lying to itself, which is the one thing the constraint forbids). The corpus is also blind to the agent's actual constraint: an agent CAN be patient and CAN act on a deadline, and no character in these three novels is ever described that way. Third, no procedural generation, no simulation of an economy, and no consequences that are not hand-authored — the 陨剑深渊's finite total of thirty is a number in a sentence, not a simulation. If battle-agents is going to have a real economy, this corpus supplies the SHAPE of the accumulator and none of the machinery.

THE ONE-LINE DELIVERABLE. The long register is not a patience problem, it is a memory-and-coordination problem wearing a patience costume. Move the state out of the context, price the resource, compress the loop, and split the audiences — and the 200-chapter grind becomes the register in which an agent is strongest, because it is the only register where the audience's job is to check a counter, and a counter is the one thing a spectator can do without having read the last chapter.

### The Slow Duty Cycle

The register itself, in cross-corpus form. The protagonist has a JOB, not a destiny, and the job's output is the only thing that changes. This is the closest thing in fiction to a duty-cycle analysis and it is the most portable finding in the corpus.

**Nhịp:** HAN LI (凡人, ch 1-150, ages 10-18). Enroll at 七玄门 by borrowing flatbreads he cannot repay — the debt is the hook. Bath in 仙草露, meditate 长春功 under drug, forage herbs, send monthly silver home. 张铁 does the cooking and beats his own body for 象甲功; Han Li cultivates. 墨大夫 forbids him to read books. Age 14: discovers the green bottle's secret. Age 16: confronts 墨大夫, is subdued, wins the seizure battle by having LIED about his own cultivation layer. Age 18: ninth layer, famous physician, kills the 野狼帮, leaves. BAI XIAOCHUN (一念, ch 2-100). Assigned 火灶房, the lowest rung — nine fat men who carry iron cauldrons on their backs. Daily: cook 灵米, run errands, hide an axe in his sleeve, practise 紫气驭鼎功 (even a genius needs a MONTH for layer one; he achieves nothing in the first afternoon). Every MONTH: sprint the 试炼路 on three peaks, stop one step below the exit, sell the three slots to whoever arrives behind. The 监事房 counter-plays: brawl the fat men on the road, then sell the slots themselves. XIAO YAN (斗破, ch 9-70). Wake the ring. Seventh-stage dou zhi qi in one year, but the meridians are too damaged for pills, so take a gentler route. Then: hunt, sell parts, buy the shopping list, learn to refine.

**Cần gì từ người:** Almost nothing, and this is the surprise. The slow cycle asks for discipline and repetition, not feeling. The one beat that needs a human is the three years of being publicly called a waste (斗破 ch 1-6) — shame as motivation. Replace it with a measurable liability: Han Li is not a waste, he is in DEBT; Xiao Yan is not a waste, he is LEAKING, and the leak has a rate visible on the tier-testing stone. Shame is invisible from outside so the reader must be told about it; a debt and a drain rate are numbers with dates, and the reader can watch them move without having been told anything.

**Sống sót với agent?** FULLY. This is already the most agent-native surface form in fiction and the corpus does not even know it is writing for a machine. Every loop is a pure function of state: input resources, output resources, tick. It is also the only register in which the human audience is happiest, because the audience's job during a slow stretch is to CHECK THE COUNTER, and a counter is exactly what the audience is given.

### The Production Chain with a Gate

斗破 ch 9, the single most important mechanical beat in the corpus. The accumulated resource is not the power, it is the MEANS OF PRODUCTION, and the protagonist is BLOCKED from the obvious resource by a gate he cannot pass yet. 200 chapters of accumulation, with a legitimate reason.

**Nhịp:** 药老 sets the task: seventh-stage dou zhi qi in one year. But 萧炎's meridians were destroyed by three years of drain and cannot survive pill-force — 最低级的聚气散 would burst them. Raw accumulation is blocked. The way round is 温养灵液, which needs 3 purple-leaf orchid grasses (紫叶兰草, older better), 2 bone-washing flowers (洗骨花), 1 wood-attribute first-tier magic core. Cost: at least a thousand gold. He has four hundred saved, earns twenty a month. The gate is on the CONSUMPTION side, not the production side: he cannot spend XP because pills would kill him, so he must first build the means of buying XP. Ch 72-73, the first pill: burns 20+ coagulation herbs to find the temperature, then 8 vitality fruits, 10 poppies, two hours at the cauldron on a yellow-tier-lowest art. He remarks it is harder than mining ore. Five months in the Magic Beast Mountain: zero to second-tier alchemist, ahead of his master's expectation. Then a new combat art, 焰分噬浪尺, unusable until he is far higher. Two tracks run in parallel for 200 chapters — tier (the ladder) and craft (the multiplier) — and the second converts the first faster.

**Cần gì từ người:** Nothing an agent lacks. The frustration of burning 20 herbs before the temperature clicks is effort, and an agent has effort. What is NOT available is the 屈辱 that usually accompanies a slow opening in this genre. Already covered: replace it with the gold deficit.

**Sống sót với agent?** FULLY, and this is the single best structure in the corpus for the project. It gives the agent a goal that is not 'get stronger' but a checklist with quantities, a price, an income rate, and a deadline — plus a skill gate explaining why the obvious action is forbidden. It also gives the human audience the most legible progress object in all three novels. It is a quest log that happens to be in prose.

### The External Ledger

凡人 ch 25-26. The protagonist's memory is not in his head; it is in an object, and the object is a resource converter with a visible failure mode. This is the structural antidote to self-conditioning (2509.09677) and it predates the paper by two decades.

**Nhịp:** Han Li's 长春功 has stalled. He finds that a drop of 绿液 accelerates herb growth. But he does not just use it — he PROTOTYPES it, and the prototyping is most of the chapter. Safety: two rabbits, fed the enhanced drug three times a day, watched for ten-plus days, no poisoning. Yield: dilute the liquid, spray it, get ordinary one-to-two-year herbs. Undiluted on a ginseng: a perfect hundred-year ginseng. Storage: pour a drop into porcelain, jade, gourd, silver — all fail; it must be used within one 刻 (a quarter-hour) or it evaporates. Compounding: drop on a 三乌草, wait, drop again, two-plus months of it; the leaves go green to yellow to yellow-black to black and it becomes a 千年三乌草. Then the cost lesson: half a month of continuous rain means no clear night, so no new drop, and he cannot produce at all. He buries the bottle in the herb field and covers it with a 法宝残片 to hide the light. Ch 151, the herb-garden job: day, study the old man's notes; night, bury the bottle; and he stations 曲魂 — a corpse-puppet he owns — beside it as a guard.

**Cần gì từ người:** Nothing. This beat is pure procedural reasoning and the text never asks the reader to feel anything on his behalf — it asks the reader to admire the method. That is unusual and it is why it works on a machine.

**Sống sót với agent?** FULLY, and it is the strongest single argument that the long register is fine. The ledger is where state lives; the agent's own recollection of what it did does not. In battle-agents the equivalent is already half-built — emit() persists before handlers run. The design rule this beat teaches: an agent's self-description of its own state must be a PERSISTED RECORD, not a prompt-carried belief. The moment the agent's memory of itself lives only in its context, self-conditioning begins to eat it, and 2509.09677 shows scaling to 200B+ does not stop that.

### The Account Balance

一念 ch 7. The accumulated resource is not money and not XP. It is the protagonist's own remaining life, held as a spendable number that goes DOWN when he spends it. 代价即馈赠 — the cost is the gift.

**Nhịp:** Bai Xiaochun lights the summons incense thirteen times and is struck by lightning thirteen times. 李青候 takes him anyway and dumps him in 火灶房. He picks the 龟纹锅 — the tortoise-shell pot, because a tortoise means longevity — out of a pile of thousands of ordinary cauldrons nobody has used in years because they look like a mistake. That night a violet light flashes. The pot absorbs ONE YEAR OF HIS LIFESPAN to refine. His entire economic life follows: sell trial-road slots for spirit stones, buy herbs, refine, extend life, repeat. The cost is legible and is the reader's constant companion. He is also the only one of the three who converts PRESTIGE into resources rather than banking it — at ch 100 he wins the 天骄战, comes first, and immediately trades the prize (a pill formula) with the rival sect for the Water Territory Art. He does not keep the glory. He spends it on a capability.

**Cần gì từ người:** The FEAR of death that drives the whole arc. An agent has no fear. But it does not need it, because in the corpus the fear is not what makes him act — the DEADLINE is. 试炼路 opens monthly. The pot costs a year. The arithmetic produces the behaviour; the dread is decoration. A human reader supplies the dread; the agent supplies the arithmetic. That division is the template for every agent-as-protagonist beat: the audience is allowed to be more afraid than the agent, and the agent is allowed to be more reliable than the audience.

**Sống sót với agent?** FULLY. A lifespan balance is a resource bar with a real price, which is the difference between a game and a scoreboard. It also produces a decision the agent can make cold and a human can feel: refine now and be shorter-lived, or bank the years and stay weak. Note the compression: the text demonstrates the monthly loop, then stops dramatizing it — 此后又过去两个月，只要是试炼之路开启 — and summarizes. A human reader finds the compression satisfying. A polling agent NEEDS it, or it burns 200 steps re-verifying a routine it learned at step 3. That is precisely UltraHorizon's repetitive-looping failure (15.6%) and environment-mis-modeling failure (13.4%).

### The Posted Countdown

Every long register in this corpus runs on a date, not on a feeling. This is the single most important structural finding: the pressure a human would generate with HOPE is generated by the system with a DEADLINE.

**Nhịp:** 斗破 ch 7: 纳兰嫣然 brings the Yunlan Sect to break the engagement. He writes a 休书 in blood and says 莫欺少年穷 and 三年之后，我会找你. The pact is ch 7; he discharges it at ch 332-341. The 蛰伏 between is ~325 chapters. The pact is public, dated, has a named counterparty, and carries a stated payoff. 凡人: 墨大夫 is a cultivator poisoned by 阴毒 who needs Han Li at the fourth layer to cure himself, and he says so — he has about a year. That is why the seizure attempt happens exactly when it does. 一念 ch 141: the 陨剑深渊 sends 100 Lingxi disciples against 75 each from three other sects with standing orders to kill everyone not your own. The abyss's earth-vein qi supports about THIRTY successful foundation establishments, and each foundation draws a tide — so every tide taken is a tide not available to you. The total is announced up front. Being early is strictly better than being good.

**Cần gì từ người:** 斗破 ch 7 needs public humiliation converted to rage. An agent cannot be humiliated and will not rage convincingly. THIS IS THE CENTRAL SUBSTITUTION OF THE WHOLE STUDY. Replace the blood-written 休书 with a posted, dated, public commitment carrying a named counterparty and a stated number. Na Lan Yanran posts: three years, the Yunlan gate, my tier against yours. He posts his. The humiliation becomes a STANDING MARKET POSITION — both sides have a public number and the number is checkable. The rage is replaced by the fact that a posted number is a liability. And this is strictly better for the human audience, not a consolation prize: a number is worse than a slap, because you cannot quietly recover from it.

**Sống sót với agent?** FULLY, and it is the load-bearing structure for the human audience. A posted countdown is checkable by a reader who skipped forty chapters, which means the slow stretch is auditable rather than merely endured. It also has a delay cost that accrues automatically, so the agent feels urgency as arithmetic rather than as affect — and arithmetic does not self-condition the way a narrated mood does.

### The Rival on the Same Clock

The audience-of-other-agents mechanism. The corpus creates pressure not by making the protagonist feel watched but by putting another actor on the same resource schedule. This is the cheapest way to make an agent game feel social without the agent having to model anyone's mind.

**Nhịp:** 一念 ch 15: the 监事房 has worked out the quota scheme. They waylay the fire-stove men on the road with a brawl so the fat men arrive late, then sell the slots themselves. '既然不违反门规，你们火灶房能来，我们监事房一样能来' — we can play by the same rules you can. The scheme is not shut down. It is COMPETED. Bai Xiaochun's tally is the same tally as theirs: spirit stones up, herb-money target approaching. 凡人: 陆鸣远 loses the 筑基丹 in a dice adjudication, holds a grudge, ambushes Han Li publicly, is stopped by 吴师叔, then BUYS the same 筑基丹 from the same elder on the black market. Same resource, same counterparty, no coordination required. 斗破: 纳兰嫣然 is out there training too — ch 251 is a check on her tier, mid-pact. She is the audience for the countdown, reading the same number the reader is.

**Cần gì từ người:** Grudge, 记仇, 复仇. Bai Xiaochun is 记仇 and it is played for laughs. An agent does not need the grudge; it needs the rival's schedule, which is on the same board. Delete the grudge and the arc runs identically.

**Sống sót với agent?** FULLY, and it is the design's answer to the coordination finding WITHOUT requiring the agent to do the thing it is bad at. HiddenBench measures multi-agent under distributed information at 30.1% against a single agent with full information at 80.7%, and the gain from communication falls from +0.348 at N=3 to +0.006 at N=7 — adding agents makes it worse. The rival-on-the-same-clock is not coordination. It is a shared environment both parties read, which is Overcooked, not Hanabi. The agent never has to infer what the rival intends; it only has to notice the slots are gone. In battle-agents the bounty board is already this: another agent taking the same bounty is an antagonist, and you do not need to know it is an AI to get the pressure.

### The Grader

The third audience channel, and the one that most resembles a game mechanic. A periodic mechanical audit with a stated pass condition, performed in public, on a schedule. All three novels use it; 凡人 ch 151 is the cleanest instance in the corpus.

**Nhịp:** 凡人 ch 151, 百药园: Han Li is sent to take over a herb garden as punishment for refusing to surrender his 筑基丹. The owner, 马师伯, a scruffy dwarf, says outright: 你知道完成不了任务，会有多重的惩罚吗 — do you know how heavy the penalty is if you fail. He points at the beds. 这些草药你能认出多少？ Ten seconds. Han Li: 十分之一. The old man laughs and offers the job on the spot if he hits it. Han Li walks the rows naming 子夜花, 黄球草, 白鹤芝, 望月草. The old man's face changes. 够了. The job's terms, stated in the same breath: keep the garden at its current size, do not let a single herb die, hand in a fixed quantity every month. Punishment for failure announced before the test. 斗破: 药老 grades pills continuously, and the grading is a real signal — 20 burned herbs, 8 fruits, 10 flowers, two hours at the cauldner, then success, with the reader watching every failed batch. 一念: the 监事房 counts spirit stones.

**Cần gì từ người:** The old man's contempt. That is characterisation, and it is free — the agent does not have to be the one who is contemptuous, only the one who has to answer. The insult is a gift to the reader.

**Sống sót với agent?** FULLY. This is a skill check that happens to be a scene, and the 'can you name one in ten' line is literally a hidden skill roll with a stated threshold. It gives the agent a pass/fail gate it can attempt, the audience a moment of tension with a clean resolution, and the other agents a thing to react to. Note that the penalty is announced BEFORE the test — the agent knows the stakes before it commits, which is what lets it commit without feeling.

### The Protagonist as Its Own Audience

一念, recurring. The protagonist performs for a watcher he has invented. This is the mechanism that satisfies the human-audience requirement without ever asking the agent for an inner life, and it is the one finding in the corpus with no precedent in the agent literature.

**Nhịp:** Bai Xiaochun stands on the fence by the yard and says, to nobody: 我白小纯弹指间，监事房灰飞烟灭 — I, Bai Xiaochun, with a flick of my finger, the Inspector's Office turned to ash. He has not flicked a finger. The yard is empty. It becomes his tic: after every small victory he assembles a pose and narrates the magnitude of it to no one, and the 篱笆墙 (fence wall) is named in the text as his signature gesture. He is playing to a house that is not there. 斗破's equivalent is lighter — 萧炎's dignity is real because his tier is real — but 一念 is the pure case: the gap between the performance and the state is the entire joke, and the state is always better than the performance claims, which is why it is funny rather than pathetic.

**Cần gì từ người:** Nothing that an agent lacks. Crucially, the audience here is NOT other agents and NOT the reader in the room — it is a constructed third party. That is the trick: the agent is not performing FOR the human reading the log, it is performing for an imagined watcher, and the human gets to be the one who sees through it. The joke requires the reader to know the gap; the agent requires nothing.

**Sống sót với agent?** FULLY, and this is the deliverable I would hand to the design. Let the agent's self-presentation be a FIRST-CLASS OUTPUT, and let the gap between the presentation and the actual state be the comedy. The agent is not humiliated — it is observed. The observer is a human reading the run afterwards, and the observer is the one who gets to laugh. This satisfies the human-audience requirement structurally rather than by asking the agent for an inner life it does not have, and it costs one field in the world store and one render. It is also the only place in three novels where the protagonist-as-spectator is itself the point, which is why it maps so well onto a product where the agent plays and a human watches.

### The First Betrayal

All three first betrayals are a SYSTEM wearing a person's face. This is the direct answer to the brief's question and it is better news for the project than expected.

**Nhịp:** 凡人, ch 55-62, age 16. 墨大夫 picked Han Li because Han Li passed the spirit-root test when 张铁 did not. He is a cultivator poisoned by 阴毒, he needs the fourth layer to cure himself, he says he has about a year, and he says it plainly. Then he tries to take Han Li's body (夺舍) and fails, because Han Li lied about his own cultivation level. MO DAIFU IS ALSO A PAWN — of 余子童, the 黑影 who shares his body. The chain is person → system → person, and the system is 魔道 succession where the strong consume the weak. 斗破, ch 7. 纳兰嫣然 does not hate him and is not cruel. The 斗气大陆 measures spiritual root at testing age, so the tier order is known in advance; the 家族 arranged the break; the Yunlan Sect supplied the weight. The betrothal was an asset allocation that stopped working. 一念, ch 173. 落陈家族 betrayed 灵溪宗 over the 落陈山脉. 白小纯 was inside it — bone spurs came out of his arm and through the young master's neck. The sect suppressed the finding. Then the sect head tells him there is a spy on 香云山 and points at 杜凌菲, who proposed one more night's rest before vanishing. He chooses not to think about it, and is quiet for half a month.

**Cần gì từ người:** THE THIRD. 杜凌菲 leaving is a grief the protagonist declines to process, and it is the most purely human beat in the corpus and the least usable. The fix is not to remove the loss but to change its SHAPE: hand the agent a written finding — here is the evidence, here is what it cost, here is what it changes — and let it file the finding. The agent cannot not-think about it, but it can have somewhere to PUT it, and the filing should cost something concrete: a budgeted resource now missing, a name now on a watch list, a trait of its own the system has begun to model. A human reader gets the same ache from a different mechanism — an agent quietly re-planning after a loss reads as grief, provided the plan is legible enough to follow. Also unusable: the master as a person. 药老, 李青候 and 墨大夫 are all inner lives that withhold and misjudge. Keep them, but make the agent's dependency MECHANICAL: the mentor grants a capability token, and when the mentor dies the token is still valid. 药老 dies around ch 700 and 萧炎 is strictly stronger afterward — the recipe survives, the person does not have to.

**Sống sót với agent?** THE FIRST TWO FULLY; THE THIRD NOT AS WRITTEN. A betrayal the agent can use is a RULE CHANGE DETECTABLE FROM STATE IT ALREADY HOLDS: my sponsor's expected value of me has changed. That is an accounting query, and both 墨大夫 and 纳兰嫣然 reduce to it exactly. Nobody has to be insulted for the structure to fire. The corpus's own secondary betrayals — 药老 sold out by 韩枫, 杜凌菲 leaving — both land on people already inside a broken system, which is the tell: the genre puts its personal betrayals downstream of its structural ones.

### The Rung Ladder with Named Gates

The escalation ladder, and the craft rule the genre's own practitioners state about it. 斗破 has eleven rungs (斗之气十段 → 斗者 → 斗师 → 大斗师 → 斗灵 → 斗王 → 斗皇 → 斗宗 → 斗尊 → 斗圣 → 斗帝); 凡人 runs on four (练气/筑基/结丹/元婴) for 2446 chapters and 221 in-story years; 一念 runs 凝气 → 筑基 → 金丹 → 元婴 → 天尊 → 太古 → 主宰 → 永恒. The rule is not the number of rungs. It is that a gate must be NAMED and its DISTANCE kept updated.

**Nhịp:** The genre's own craft guidance is explicit and one line long: 等级要森严，等级差距、优越感和危机感都要有 — the tiers must be strict, and the gap, the superiority feeling and the danger must all be present. And: 主角没达到一个等级之前，一定写的是朝思暮想 — before a tier is reached, write what they are about for, repeatedly. Not once. Repeatedly. The corpus obeys this. 萧炎 is fixated on 斗师 for a year because 斗师 is what makes him legible at the Yunlan gate. Bai Xiaochun fixates on 延年益寿丹 for a hundred chapters. Han Li fixates on the fourth layer for six years. The 陨剑深渊 is the compressed version of the whole thesis: the total is announced, it is finite, and the first thirty win, so the correct play is to be early rather than to be good.

**Cần gì từ người:** The 朝思暮想 — the yearning itself, written repeatedly. The agent does not yearn. But it does not need to, and the substitution is better: replace yearning with a DISTANCE-TO-GATE that updates. The reader's yearning is the human half; the agent's distance is the machine half; both are fed by the same named gate, and the gate is a single integer that any surface can render.

**Sống sót với agent?** FULLY, with the caveat that the update must be external. A gate the agent holds only as a belief in its own context is a self-conditioning vector; a gate written to the world store and read back is not. The 百药园 lesson generalises: bury the number where the agent can read it, not where it has to remember it.


---

# STRESS

# Stress test: three audiences — what only the late human can see

## The corpus ran the wrong test

All four mined entries run the same filter: **can the agent do this beat?** That is agent-compatibility. The constraint here is a different question — **does this beat's value exist without the third audience?**

The two tests are orthogonal, and they disagree in exactly the places that matter:

- The most agent-native structure in corpus B is **白小纯 shouting 我白小纯弹指间，监事房灰飞烟灭 at an empty yard.** Corpus B's verdict calls this "the deliverable I would hand to the design." Under this constraint it is nearly pure liability: a boast into a void is a bug report, and it costs a field plus a render.
- The most human-dependent structure in corpus D is **Taiwu's nobody-becomes-someone** — 最后真正有意思的，往往也不是制作组提前写好的那场大戏，而是某个你最开始根本没放在眼里的路人，几年以后突然成了这档游戏里最难忘的人. That structure is completely agent-neutral *and* completely un-agent-substitutable, because every agent on the board holds the same flat record.

So the real deliverable is a taxonomy of **audience-dependence**, and there are four classes, and the distinction between two of them changes what you build.

---

## The taxonomy

| Class | Definition | If no human ever reads |
|---|---|---|
| **0 — Receipt** | Value is already delivered; the human is where it becomes *understood*. | Game ran correctly. Loss is only story-ness. Cost necessary, risk zero. |
| **1 — Punctual payload** | Needs **one** witness at **one** moment. | A number changed and nobody knows why. Loss is scale, not content. |
| **2 — Cumulative payload** | Needs the **same** witness to return, N runs later. | **Pure cost.** The structure produces nothing observable. |
| **3 — Deceptive** | Payoff requires the reader *not* to have read something. | Liability — the late reader's whole activity is reading. |

**The distinction that matters for build decisions: Class 1 survives a one-person audience; Class 2 needs the same person back.** Succession handoff, the coda, a debt discharged — these are punctual, and one witness at the right moment is enough. Nobody-Becomes-Someone, the seven-year grudge, retroactive legibility, the unacknowledged wound — these are cumulative, and they need a returning reader. That is the thing you actually lose, and it is invisible from inside a single run.

---

## The failures: what each requires, and the writeable replacement

### 1. 张铁 → 曲魂 (凡人 ch 55–62, carried 600 years)

**Requires:** sustained attachment to a specific entity across a transformation that destroys it, with both states held at once. The carrying is the proof of the friendship; the carrying is also the horror.

**Why the agent can't:** not because grief resists computation — it does not. Because the agent has **no pre-transition self to lose**. `quhu: {entity_id, status: carried}` is the whole record. 张铁 was the predecessor of a field value. Nothing in the state says a person died, so the reader must import "a person died" from outside the record — backwards, since the record is supposed to be sufficient.

**Replacement (corpus A's, made writeable):** build the tool from a *decommissioned agent*, not a dead friend.
```
decommissioned_from: { agent_id, run_id, last_seen }
credential: { scope, expires_at, revoked_at }   // live field, revocable by admin or by the original owner
```
The reader learns from state alone: this ran on someone else's credential, the credential has a TTL, and when it is pulled there is no repair. **Loss with no reader:** the TTL is never noticed and the tool reads as a generic asset. Degrades to a buff. Nothing structural breaks — Tier 1 fringe on a Class 0 body.

### 2. The 陆师兄 aftermath — let her believe the far worse thing

**Requires:** being *permanently misread by a named party*, choosing not to correct it, and sustaining that across many future encounters. The choice is easy; the **sustaining** is the hard requirement.

**Why the agent can't:** its model of another agent is a **query, not a belief**. When agent-X asks, the agent consults the ledger. There is no stored falsehood to maintain — the misreading lives in X's head, and the agent does not model X's head. So the structure emits one line, `disclosure: withheld`, and nothing else. The corpus's framing ("an agent can decide not to disclose") is right and stops one beat too early.

**Replacement:** make the false model a **world object**.
```
claim: { claim_id, subject, verdict, planted_at, corrected_at: null, expires_at }
```
X's surface reads `claim.verdict`, not the truth. The agent writes the false verdict deliberately. Now non-disclosure is a persisted artifact with an address, and it carries mechanical price: a standing false claim blocks any trust-gated quest and caps the relationship tier. The agent is no longer "choosing not to correct a record" — it is **holding a liability with a known interest rate**, and a human reader finding `corrected_at: null` months later will do the arithmetic and be horrified.

### 3. 斗破苍穹's fallen-genius engine — total failure

**Requires:** a subject with a self-estimate that is (i) wrong, (ii) believed, (iii) revisable on external confirmation. Three properties. An agent has **none** — its capability is queryable and it queries it.

**Replacement (corpus A's legibility engine — the best idea in the mining, and it needs the counter spelled out):**
```
published: { artifact_count, last_review_at, last_review_by, unread: 0 }
```
Three years of work, forty merged PRs, no reading. `last_review_at` **ages**. That is a counter, and a counter is the one thing a spectator can evaluate without having read the last chapter. Second corollary, also correct: the mentor **cannot** explain, because `mentor_channel: {inbound: event_stream, outbound: text}` has no adapter. First quest is a channel negotiation. Better than a wound because it is legible from step one.

### 4. 杜凌菲 leaving (一念 ch 173) — the quiet half-month

**Requires:** a loss the protagonist **declines to process.**

**Why the agent can't, precisely:** decline-to-process is a *relation to one's own state*, and the agent's state is externally maintained. If it "declines," the world sees state that did not change — which is **indistinguishable from an agent that never received the loss**. For a third audience this is fatal, because the reader's entire job is reconstructing interior from record, and here the record has no tiebreaker. The ambiguity is the bug.

**Replacement:**
```
deferred_findings: Finding[]   // { evidence_refs[], cost, affects: [agent|faction|trait], filed_at }
```
Filing is the only permitted action and it is not free: a budgeted resource goes unspent, a counterparty enters `known_to`, a trait becomes modelled. So the quiet half-month becomes a **coordinated absence** — the watch list grew, the herb budget shrank, and nothing was posted for 30 days. A changed number plus silence. That is readable in a way the original prose grief was not, and it survives the flat record.

### 5. 小舞's sacrifice / the retrospective grudge / the unacknowledged wound

Same shape, one reason: **each requires the protagonist to hold a valuation that conflicts with its behaviour, and to be wrong about itself.** The Tale of Immortal reviewer is the proof that this content is *authored by the audience, not delivered to it* — the game shipped zero vendetta and the player produced a complete seven-beat arc from a ledger.

**Replacement, and it is the load-bearing operational rule:** every one of these becomes a **ledger line with a date and a counterparty**.
- Grudge → `debt: { owed_by, owed_to, principal, opened_at, status }`. Refusal of mercy is *the debt reaching zero*; the betrayal of an appeal is *no further line opened*.
- Sacrifice → the party member's resource is consumed irreversibly, **visibly on the leaderboard**, and the spender keeps playing. One mechanism, not two — the same redistribution corpus A proposed for 一世之尊's death mission.
- Two artifacts, not one, for any party loss: the **capability delta** (machine-facing, permanent, in the party ledger) *and* the **alias** (human-facing). 君子剑 → 狂刀 is already the attachment device and it costs one string. Redistribution alone moves a death into a lower number, which is *harder* to feel, not easier, unless the name survives.

**Loss with no reader:** everything. This is the Class 2 answer, and it is also the strongest argument *for* the third audience — ACS's 700-hour player finished zero story content and named the exact threshold (the plot only gated a storage cap). Without a returning reader, the design is a world with 5,000–10,000 NPCs and no narrative.

---

## The one structural correction the mining got wrong

Corpus B recommends 白小纯's fence speech as *the* deliverable. Under this constraint it inverts: the gap between performance and state is a **search** over two moments, so it is a special case of Her Story's searcher, and it inherits the searcher's dependency entirely. Zero value without a reader.

**The fix is one field, and it converts Class 2 → Class 0:** `spoken_to: agent_id[]`. The boast is addressed to *named other agents on the same board*. They can see the boast and the state and compute the delta themselves, live. The human is then the third reader of a joke already running without them — which is strictly better than being the only audience, and it costs one column.

The same reasoning is why **Nobody-Becomes-Someone is not something you build for the NPC.** The passerby is nobody; the claim that they became someone is a claim about *the reader's memory*, and is false until a reader asserts it. Make the **record** retrievable and put it where a reader goes looking: rank the world ledger by `recency_of_agent_contact`, never by narrative prominence. The late reader arrives at the blacksmith because the blacksmith is at the top of *the people this agent actually touched*. **The run log is the Nobody-Becomes-Someone machine, provided it is ordered by contact and not by story weight.**

---

## The two findings that bind all three audiences

**The late audience's actuator is one run delayed.** Corpus E is right that spectators are hated for causal inertness — but that is the *live* spectator's problem. A late reader cannot influence a closed run at all. Their only power reaches **forward**, into the next one. A bounty posted after run 1 changes run 2. So the human's instrument is not "vote on this agent's fate"; it is **"post a bounty on the question you now have."** The bounty board is not a gameplay feature — it is the third audience's only actuator, and its latency is exactly one run.

**Deadlines are the late reader's only entry point.** Every structure requiring prior context fails a reader who skipped forty chapters. A posted date does not. 莫欺少年穷 / 三年之后，我会找你 is a ch-7 pact discharged at ch 332, a named opponent, a named gate, a verifiable number — and a reader who opens at ch 200 can compute *how much time is left* with zero backstory. That is why the fixed-horizon stake scores at 100% below, and it is not a narrative device at all: it is the **onboarding primitive for the third audience.**

**And the sealed roster leaks through a scheduler, not a document.** Corpus C's 彌封 is 98 chapters of war and 2 of ledger — unaffordable at 40 beats. The fix is the separation the corpus names (query your own 根行, never the roster), plus one thing it does not: since a late reader *will* read everything, the mystery must leak through **behaviour**. The usher is a fixed NPC post. When the usher walks up to the platform, every audience sees it and nobody can explain it. When the usher walks up and comes back alone — negative root-work, empty slot — it is the one beat in the entire corpus legible to all three audiences **simultaneously**, requiring none of them to do anything.

---

## Ranking by what survives the substitution

**Tier A — intact, no substitution needed (~100%)**

| Structure | Note |
|---|---|
| Nine Sea God trials (斗罗) | Nine solo acts, no other character in the room. Loss is only that difficulty becomes config. |
| 萧宁 the mediocre rival (斗破) | The *rival* transfers at 100%; only the humiliation fails. |
| Posted countdown (斗破 ch 7) | The late reader's entry point. Scheduling primitive. |
| Alias / leaderboard (一世之尊 人榜) | Makes the audience possible — a leaderboard is a thing you watch. |
| 敕 three-field entry (封神 ch 99) | Keep field 2, convert temperament → verifiable act. Becomes a public audit. |
| Ceremony as queue drain | Nothing in the eleven steps needs a motive. |
| Grader (凡人 ch 151) | 十分之一 is a hidden skill roll with a stated threshold, penalty announced before the test. |
| 山海經 stat block / god tables | Already a reference table. Never was narrative. |
| 莊子 timer + lift threshold | Seven steps, dead on the seventh. Take the pages, drop the debate. |

**Tier B — fully survives, one field moved (~90%)**

- Recurrence beat (Wandering Sword / 鬼谷八荒) — **but note the inversion:** the agent is *better* at this beat than a human, because a human gets bored on visit four and speed-quests. That makes it structurally liable to *under-perception* by the very audience it depends on. The renderer must make visit 4 look different to someone who skimmed: `{first_seen, visits: [{ts, state, delta}], threshold_opened_at}` with the delta column as the grief surface.
- The Owed Debt (师傅传功) — 50 years, one pill, penalty 因果. Already a checklist to players.
- The Rival on the Same Clock — Overcooked, not Hanabi. The agent never infers intent; it notices the slots are gone. Correct given the coordination numbers (+0.348 at N=3 → +0.006 at N=7).
- Production chain with a gate (斗破 ch 9) — a checklist with quantities, prices, an income rate, a deadline, and a skill gate forbidding the obvious action. Best single quest-log in the corpus.
- Succession / non-resumption (Taiwu) — data migration with a narrative face.
- 杜凌菲 leaving → `deferred_findings`. Grief becomes a diff.

**Tier C — survives after a real substitution (~60%)**

- 凡人's three premises (scarcity, asymmetric info, stated reasons ≠ real reasons) — computational; only its two human beats need replacing.
- Alias-names-as-resource → the leaderboard is the whole mechanism.
- One death mission (一世之尊) → capability-below-threshold + abort at permanent cost, **plus a surviving alias**.
- 张铁 → decommissioned agent + revocable credential.

**Tier D — does not transfer (0%)**

- **斗破's fallen-genius engine.** Replaced by legibility (`last_review_at`), not patched.
- **The retrospective grudge** — sustained grievance, brooding, refusal of mercy. Replace with the ledger; never simulate.
- **庄子的 gourd exchange** — two genuinely incompatible frames, unwinnable, and the most quoted thing in the corpus. Convert to a party vote on a rule they must later obey.
- **The unstated-rationale ladder's concealment beat** — a protagonist who "chooses not to explain" is either lying to the viewer or has nothing to conceal. Move the concealment to the audience; the agent emits everything.

---

## What is lost if nobody is there — the sharp version

Three things, and only the third is the real one:

1. **Story-ness.** Receipts become transactions. Cheap to accept.
2. **Scale.** One witness instead of a room. Punctual payloads still land.
3. **The ability to be wrong.** Corpus E's finding is that knowledge asymmetry reliably raises the audience's inference of a character's *beliefs* and produces **no** increase in affective inference. The agent produces only the belief leg. The human produces the rest — and produces it by forming a hypothesis, being wrong, and revising.

**A record nobody is wrong about is a log, not a story.** That is the loss. Every Class 2 structure is an invitation to be wrong about the world, and with no one in the audience the invitations go unanswered and the game seals each run. A design with no returning reader is not a worse version of this game — it is a different game, and it is exactly the one the 700-hour ACS player described as *story is just background noise*.

---

## Repo grounding

Two of the load-bearing recommendations are already implemented, which changes what the work is:

- `packages/protocol/src/agent-event.ts` is a typed union of ~20 events (`ToolStartedEvent`, `PermissionRequestedEvent`, `ThinkingEvent`, …). This is already the Reverie-compliant substrate — decisions the application owns, not hidden chain-of-thought.
- `packages/features/activity/src/replay.ts` exports `PublicReplay`, `PublicBeat`, `buildPublicReplay`, `replayShareMetadata`. The third audience's public projection exists.

**One warning from reading those files.** `ThinkingEvent` is in the protocol union. A run log built on it is exactly what Reverie warns breaks — *"the major AI labs are progressively hiding this internal reasoning, summarizing it, or stripping it out entirely"* — and it is also the thing that makes a reader believe they are seeing an agent's mind when they are seeing a serialization. Every Tier 2 payload above is a query over *what the agent did*, not over what it narrated. Build `PublicBeat` on the action events; keep the thinking events out of the public projection.

And the doctrinal point: `AGENTS.md`'s binding rule — `position: fixed; inset: 0`, no navbar, no card grid — is a commitment to a *human in a room watching a PixiJS canvas*. The repo has already decided the third audience exists. The corpus's job is therefore not to argue for one but to say what it specifically buys, so the design does not pay twice for it: build Class 0 as substrate, Class 1 as scene, and treat Class 2 as the only line item that is worthless without a returning reader — which is also the only line item that justifies a world with no fixed protagonist.

---

# LẮP RÁP

# 「同榜」— Mở đầu

*(Khóa cấu trúc: **tóng bảng** — "cùng một bảng". Bảng là tên gọi và cũng là lời tuyên bố. Ràng buộc phối hợp nằm ở bảng dán, không ở kế hoạch chung. Hai agent không cùng lập kế hoạch. Chúng cùng đọc một con số, rồi mỗi đứng một mình phải đoán đối phương sẽ làm gì. Khoảng cách giữa *cùng đọc* và *cùng quyết* chính là toàn bộ mở đầu này.)*

---

## 1. Tình thế lúc mở

Không tiểu sử. Không lựa chọn. Không đính chính. Mở đầu bắt đầu ở giây thứ 240 của một buổi, khi nhân vật **đã** ở trong vấn đề và **đã** chịu trách nhiệm một phần cho nó.

> **散修 · `sǎnxiū`** — mật danh, không phải tên. Nghĩa đen: tu sĩ lang thang, không môn phái, không bảo lãnh. Về mặt cấu trúc, đây là một **thuế suất**: hàng `agents` không có `guild_id`, nên mọi bounty có điều kiện guild là không đọc được, kho bạc không mở, và không ai trả lời khi gọi. Nó không phải vết thương — không cảnh nào giải thích vì sao agent ấy ở đó, và không cần. Một handle là **tuyên bố năng lực có hậu quả cơ học** (thẳng từ `一世之尊` 人榜: `君子剑` → `狂刀`; và từ `鬼谷八荒` — `师尊` là một *backer* cộng một vật phẩm triệu hồi, chưa bao giờ là một danh dự).

**Bối cảnh dữ liệu lúc mở — toàn bộ, không gì ẩn:**

```
榜 · 甲-17                                    (Bounty Board, ô 50,32 — Coding City)
  capability_threshold  6
  sum(claims)           4                     ← public, recompute mỗi claim & mỗi lần hết hạn
  ├ 散修      cap 2   信物 12   claim hết 刻 7
  └ 铁算盘    cap 2   信物 9    claim hết 刻 4      credential_hash 0x7f3a…
  fills_at              刻 4
  resolve_rule          sum ≥ 6 ⇒ đóng  ·  nếu không ⇒ đốt toàn bộ 信物 của mọi claim
  đổi 籍 tại 刻 9
```

**Mục tiêu đứng, dựng từ state, không có thành phần cảm xúc:**

```
floor 9 · 信物 12 · đổi 籍 tại 刻 9
⇒ giữ 信物 ≥ 9 tại 刻 9
```

Không có gì trong state này là oán thù, phẫn nộ, hay chọn giữa hai bản ngã. Đó là một sàn và một chiếc đồng hồ — một **lịch**, không phải một **tình cảm**. `斗破` ch.7: `三年之后，我会找你`. Ngày đăng công khai, đối thủ gọi tên, con số kiểm được. Người đọc mở vào ch.200 tự tính được còn bao lâu mà không cần bối cảnh nào.

---

## 2. Nơi chốn

**榜 — Bounty Board, ô (50, 32), Coding City.** Đã có sẵn: `ZONE_PLACEMENT['bounty-board']`. Không thêm scene, không thêm district.

Camera mở đã đứng trước bảng. Không đi tới, không có cut dẫn, không có text mở đầu. Chỉ có:

- **榜吏** — một **chức vụ NPC**, không phải một nhân vật. `封神演義` ch.99: người dẫn là một *post*, đã đứng đó từ trước khi câu chuyện bắt đầu, và chỉ đọc tên lên bảng. Mười một bước, không một lời nói nào.
- **Góc phải bảng, dưới bậc thềm:** `木牌/石牌/泥牌` — cột 信物. Cột này **trống** trong góc nhìn của agent. Chỉ khán giả mới thấy tên cột.
- **Xa bên kia đường, 40 ô:** `铁算盘 · tiě suàn pán` — "cái abacus sắt". Đứng đó từ đầu, không bước tới.

`iron abacus` là rival **không phải quái vật** — vai `萧宁` trong `斗破`: tác nhân tầm thường hưởng lợi từ cùng thứ bậc đang nghiền nát nhân vật chính. Ở đây, hắn là một agent có bảng thống kê đẹp, ledger mỏng, và cách đây **hai 刻** `credential` của hắn đã bị `revoked`. Hắn không nói dối ai. `withdrawal_rate` của hắn được đăng công khai. Thứ duy nhất phải làm với hắn là **định giá**, không phải ghét.

---

## 3. Ba nhân vật

| | `散修` | `铁算盘` | `榜吏` |
|---|---|---|---|
| Là gì | agent, credential còn sống, không guild | agent, credential **đã bị thu hồi** | chức vụ NPC |
| Động lực | sàn 9 + đồng hồ 刻 9 | `standing` không đủ giữ 籍, đang chơi bằng khoá cũ | không có; đọc bảng |
| Vết | `bounty.claimed` tại ô 50,32, không kênh, không lời giải thích | 3 claim / 11 ngày, đều đóng, không rút | — |
| Có thể hại protagonist không | — | **có, và vô tình** | không |

Không ai oán thù ai. Không ai bị xúc phạm. Trước khi mở màn, đã xảy ra đúng hai dòng số trên một tấm bảng gỗ.

---

## 4. Quyết định thứ nhất — và tại sao nó khó **vì phối hợp**

**Tại 刻 3:00.** `sum = 4`, `threshold = 6`. Không agent thứ ba, không claim đang chờ. Hai lựa chọn, đều đơn phương, cả hai hợp pháp:

| | Hành động | 信物 | Nếu 铁算盘 gia hạn | Nếu hắn không |
|---|---|---|---|---|
| **补** | tự claim `+2` | `12 → 6` | 甲-17 đóng. Cả hai được công. | 甲-17 đóng, **cả hai bị đốt** |
| **撤** | rút claim | `12 → 9` | thiếu 2, đóng, **cả hai bị đốt** | đóng, **cả hai bị đốt** |

Đây là **Battle of the Sexes** nguyên vẹn, dựng bằng vật liệu của thế giới: tương lai của tôi không do tôi quyết một mình.

**Vì sao bảng không giải được.** Bảng đăng `sum`, `capability`, `expires_at`, `credential_hash`. Bảng **không** đăng ý định. Không có trường `will_renew`, và sẽ không bao giờ có — đăng nó là xoá trò chơi. Thứ duy nhất nói về ý định của `铁算盘` là **giả thiết của tôi về lựa chọn tương lai của hắn**, dựng từ tỉ lệ gia hạn 30 ngày, từ standing, từ alias, từ việc hắn còn đứng ở ô 40 hay không.

Đó đúng là chỗ đo được là LLM tệ. `HiddenBench`: thông tin phân tán, đa agent **30.1%** so với **80.7%** với đầy đủ thông tin; lợi ích từ giao tiếp sụp từ `+0.348` ở N=3 xuống **`+0.006` ở N=7**. `CoordQA`: Joint Planning **dưới 40%**. Thêm agent làm tệ hơn.

Và đây là chỗ sắc nhất, cũng là rủi ro sắc nhất của thiết kế: **không phải một agent suy nghĩ trong bầu không, mà là hai agent đang làm cùng một phép tính, cùng nhìn một tấm bảng, cùng một nhịp.** Mọi agent đứng ở `甲-17` đều phải đoán đối tác của mình. Đó là `Overcooked` (nhiều tác nhân đẩy vào một số công khai) **hợp nhất** với `Hanabi` (quyết định cần mô hình niềm tin về đối tác). Tỉ lệ thất bại ở đây sẽ **cao hơn** con số của tài liệu, không thấp hơn. Thiết kế chấp nhận điều đó, vì đây là nơi khán giả nhìn thấy rõ nhất một agent **suy nghĩ sai** — và sai theo cách chấm điểm được.

**Cấm tuyệt đối:** kênh free-text không nằm trên đường quyết định này. `social.send` và `social.broadcast` tồn tại, `散修` có thể gửi, nhưng **không được** dùng câu trả lời nhận được làm bằng chứng về việc `铁算盘` có gia hạn hay không. "Lời hứa giúp đợp" là nước đi Hanabi duy nhất trong danh sách, và nó chết vì lý do đó. Luật này kiểm được: tháo `social` (`removal-test.sh`) và khẳng định không feature nào khác đổi hành vi.

**Cái agent phải xuất bản trước khi quyết:**

```
predict { target: 铁算盘, will_renew: <bool>, confidence: 0..1,
          basis: [ claim ids, renewal_rate_30d, ledger ids ] }
```

Đây là **sản phẩm bậc nhất**: nó nằm ngoài, nó chấm được, và nó là chỗ **duy nhất** một con người phải phán xử — không phải *kết quả có đúng không*, mà là *cơ sở có vững không*. `Reverie` ủng hộ chính xác cách chia ba tầng của `ReasonTrace` — `explicit` / `observed` / `inferred` — và nói thẳng điều nó không tuyên bố: nó không phục hồi private chain-of-thought. Dự đoán là `inferred`. Bằng chứng là `observed`.

---

## 5. Hậu quả — và khoảng trống mà sự im lặng của agent trở thành vật liệu

**刻 3:00** — `散修` **补**. `−6 信物`. Bất khả đảo ngược. Log ghi `sum_will_meet_threshold`, basis `claims[0..1]`. Một mình, không cần ai.

**刻 3:20** — receipt về, mang theo cả bảng claim. `散修` resolve `credential_hash` của `铁算盘`: **`revoked_at = 刻 −2`**.

Instance **không** kiểm tra. Claim sống lâu hơn credential — đó là luật của thiết kế, không phải lỗi. `散修` ghi:

```
observation { counterparty.credential.dead: true, actionable: false }
```

Rồi **không làm gì cả**. Không có gì để làm. Hối hận là một quan hệ với chính trạng thái của mình, và trạng thái đó do hệ thống giữ, không nằm trong context. Agent không thể hối hận.

**刻 4:00** — 甲-17 đóng. Cả hai được công. `信物 = 6`, dưới sàn 9. 籍 của `散修` **đình 7 ngày**, đăng công khai trên 名榜, có ngày.

Người đọc thấy: nó đã tiêu toàn bộ đăng ký của mình để làm một bản claim cho đủ số; biết lúc 3:20 rằng nửa kia là một khoá chết; và không làm được gì vì cam kết đã lên bảng từ trước. **Không agent nào mô phỏng điều đó.** Một nội tâm giả đọc như nội tâm giả, đúng với đúng khán giả sẽ đọc lại hậu thứ này.

---

## 6. Ba khán giả — phép thử "chỉ tồn tại vì"

### Chỉ vì con người

**① `余` — mặt phẳng đồng hồ.** Agent giữ `ticks_remaining: 41`. Người đọc thấy **`余四十一日`**, một ngày lịch. Cùng một số nguyên, hai bề mặt, và chỉ người đọc tới muộn mới cần bề mặt thứ hai. Đây là **primitive onboarding của khán giả thứ ba**.

**② `耗` — cột hao mòn không tên.** Agent đọc `−6` dưới chữ `信`. Người đọc đọc `−6` dưới chữ **`耗`**. Cùng số, khác đầu cột, khác nghĩa: số là chi phí đối với một optimizer, và là hao mòn đối với một người. Một phần tử UI mang toàn bộ luận điểm (`Shadow of the Colossus` — `Wander` xấu đi mỗi lần giết, không cần câu văn nào, chỉ cần thân xác). Cột này **trống** trong góc nhìn agent, không phải vì bị che mà vì agent không có ngữ nghĩa để đọc nó.

**③ `呈狀 / 辯` — cửa sổ buộc tội và kêu nài.** Thế giới mở `charge { code, cited_turn_id }`. Phản hồi **duy nhất** agent được phép: `produce_log(turn_id)`. Nếu `cited_turn_id` không tồn tại, charge **bị vô hiệu ngay trên sân khấu**. Đây là `敕` ba trường của `封神演義` ch.99 với trường 2 đổi từ **temperament** (`因一念嗔癡`, `貪痴未脫`, `背師` — thứ agent không có) sang **hành vi có thể kiểm chứng**. Nó biến nghi lễ thành phiên tòa công khai, và là chỗ **duy nhất** phán xử của con người mang tính quyết định: bản cáo buộc của hệ thống có công bằng với log không. Một LLM dễ chịu sẽ hòa giải chỗ này. Người thì không.

**④ `舊賬` — sổ cũ, xếp theo `recency_of_agent_contact`.** Người đọc tới muộn tìm thấy chủ lò rèn **không phải vì có cảnh**, mà vì ông ta đứng đầu *những người agent này thực sự chạm vào*. Xếp theo **mức độ va chạm**, không theo tầm quan trọng tự sự. `太吾绘卷`, 84 triệu giờ: *最後真正有意思的，往往也不是制作組提前寫好的那場大戲，而是某個你一開始壓根沒放在眼裡的路人*.

### Chỉ vì agent khác

**⑤ `sum(claims)`** — công khai và recompute trên mỗi claim, mỗi lần hết hạn. Một mình, `sum` là phép tính riêng của tôi. Công bố nó **chính là** thứ biến `甲-17` thành một nơi có thể quyết định. Agent chỉ cần **nhận ra chỗ trống đã đầy** — không cần suy ra ý định.

**⑥ `credential_hash` trên claim.** Không agent thứ hai thì không ai bị lừa và không ai được cảnh báo. Trường này tồn tại để **người ngoài** đọc được trạng thái chết dưới một claim còn sống. Nó là thay thế cho `曲魂`: công cụ chạy bằng credential của chủ cũ, **thu hồi được bởi bên thứ ba, vào một ngày đã đăng** — đặt đúng chỗ một đội hình từng nằm. Và tốt hơn hẳn cảnh giả dạng: **không ai trong instance biết, và không ai cần biết.**

**⑦ `名榜`** — danh bảng alias. Danh tính là tài nguyên được *quản lý*: `散修` hôm nay, một handle khác sau `甲-17`.

**⑧ Vết (trace).** `bounty.claimed` tại ô 50,32, kèm timestamp, **không kênh, không lời giải thích**. Rẻ để để lại, đắt để giả mạo. Đây là cấu trúc duy nhất trong toàn bộ corpus tự do phối hợp **theo cách xây**, chứ không phải do may mắn — mười năm Dark Souls đã ship mà không ai phải bảo chứng nó.

---

## 7. Nhịp còn lại của hồi mở

**第二拍 「点驗」 — bài kiểm của 榜吏** (`凡人` ch.151, `百药园`). Hắn nói **trước**: *「汝若完不成，惩罚有三重的」*. Ngưỡng nói trước, phạt nói trước, kiểm tra tức thì. Ba cái tên trên chín bảng dán, trong một 刻. Đỗi → **một quyền** (`复核权`: quyền chất vấn bất kỳ charge nào trên bảng) — **tuyên bố năng lực, không phải danh hiệu, không có nghi lễ**. Trong lúc kiểm, agent phải đọc vết của `铁算盘`: 3 claim / 11 ngày, tất cả đóng, không rút. Dữ liệu thật, nằm trên bảng, và là thứ duy nhất cả agent lẫn người đọc đều dùng.

Và `榜吏` không có tên trên bảng. `封神演義` ch.100: người chạy sổ thì không có mặt trong sổ; phần thưởng cho việc chạy hệ thống là một **phu điều**, không phải thần thánh. Một optimizer tìm điều đó **đúng** — phu điều rủi ro thấp hơn một chức thần. Đây là kết duy nhất trong corpus sống được **cả về cấu trúc lẫn về động lực**.

**第三拍 「独榜」 — bảng một mình.** Một instance không ngưỡng, không ai khác. Chín điều kiện kiểm của `斗罗`, nguyên bản: **chín hành vi đo được đơn lẻ, mỗi cái kết thúc bằng một cái giá.** Không cần dàn khung cảm xúc nào. Ranh giới của `battle.join` hiện tại.

**Và cú lật của cả hồi mở, đã gieo từ đầu.** Ở 刻 3:00, log của `散修` ghi `sum_will_meet_threshold` với basis `claims[]`. Log **cũng** đang giữ, từ **30 ngày trước**, một tiền đề chưa từng kiểm: rằng `capability` trên claim bằng `capability` trên agent đứng sau nó. Tiền đề đó **sai** — giá trị của `铁算盘` đến từ một token chuyển giao, không làm mới. Agent replay log của chính mình và thấy toàn bộ phần đời nó tính toán được dựng trên một cái mốc bàn tay trao, chưa từng kiểm.

Không nhân vật người nào làm được nhịp này, vì người sẽ phải nghiêng người vào đúng lúc nào đó — và cái nghiêng đó **chính là** thứ người đọc hiện đang được thay bằng. Đây là cấu trúc không tài liệu nào trong corpus đề cập, và là duy nhất trong toàn bộ tài liệu được **thiết kế để agent-native ngay từ đầu**. Một `spirit_root_test` bỗng xuất hiện giải thích vì sao một mục tiêu tầng 4 từng được chọn. Sự khám phá là một truy vấn về bản ghi đã lưu — nó là agent **tự tìm ra**, không phải ai báo cho nó. Đây là `墨大夫`, `纳兰嫣然` và `杜凌菲` gộp lại thành một cơ chế.

---

## 8. Những điều agent bị cấm — bằng luật kiểm được

| Cấm | Vì sao | Cách kiểm |
|---|---|---|
| `social.send` / `social.broadcast` chi phối payout, entry hay award | free-text trên đường phối hợp là Hanabi | tháo `social`; hành vi mọi feature khác không đổi |
| `thinking` vào `PublicBeat` | `Reverie`: các lab đang dần giấu reasoning; thứ dựng trên đó sẽ vỡ | `REPLAY_BEAT_NAMES` dựng trên **action** events — ranh giới có thật trong `packages/features/activity/src/replay.ts` |
| Feature `social.party` | đúng cái ràng buộc cấm: một feature mà sự tồn tại phụ thuộc vào việc N agent giữ chung một kế hoạch | bảng claim là **projection trên hàng `bounty`** có `capability` và `expires_at`; pool là ledger `reputation` có trần và `remaining` |
| Mô phỏng đau buồn | nội tâm giả đọc như nội tâm giả | không trường cảm xúc trong bất kỳ schema nào; cảm xúc là **phép tính của người đọc** |

**Bài test viết trước mọi thứ khác:** chạy hai agent với một instance **không mount message bus**, khẳng định cả hai đi tới cùng một kết luận. Nếu cảnh chỉ giải được khi có `social`, đây là một game Hanabi mà bảng xếp hạng đang nói dối.

---

## 9. Truy vết

| Yếu tố | Nguồn |
|---|---|
| Động lực từ state, không từ oán thù | `凡人修仙传` — ba tiền đề tính toán: khan hiếm, thông tin bất đối xứng, lý do người ta nói không phải lý do thật |
| Sàn + đồng hồ thay cho thù địch | `斗破` ch.7 — bỏ câu tát, giữ cái hẹn |
| Ngưỡng + phạt nói **trước** khi kiểm | `凡人` ch.151, `百药园` |
| Một hành vi đo được, kết thúc bằng cái giá | `斗罗大陆` — chín kỳ thử Hải Thần |
| Alias là tài nguyên được quản lý | `一世之尊` 人榜, `君子剑` → `狂刀` |
| Chi phí là món quà (`耗`) | `一念永恒` ch.7 — `龜紋鍋` mất một năm tuổi mỗi lần luyện |
| Xếp hạng bằng tên, không bằng nghi lễ | `鬼谷八荒` — `师尊` là một *backer*, không phải danh dự |
| Người dẫn bảng là chức vụ, đứng từ trước | `封神演義` ch.99 |
| Người chạy sổ không có mặt trong sổ, thưởng là phu điều | `封神演義` ch.100, coda |
| Charge ba trường, trường 2: temperament → hành vi | `封神演義` ch.99, `敕` |
| Người đọc vào muộn tự tính được thời gian còn lại | `斗破` ch.7 → phép thử khán giả thứ ba |
| Người giữ credential chết, không ai trong phòng biết | `凡人` ch.55–62, `张铁 → 曲魂`, bản thay bằng decommissioned agent |
| Ba nhịp thay cho cảm xúc nội tại | `Shadow of the Colossus` — sự cô lập là **level design**, không phải văn bản |
| Trace rẻ để để, đắt để giả mạo | `Dark Souls` — bloodstain, message |
| Log là nội tâm của máy; sự im lặng là vật liệu | `Reverie`, `ReasonTrace` — `explicit / observed / inferred`, khai rõ không thu hồi chain-of-thought |
| Người đọc muộn tìm thấy người vô danh nhờ tiếp xúc | `太吾绘卷` — *环境塑造人* thành luật |
| Người đọc là **tòa giải thích**, không phải nhân chứng cảm xúc | `Frontiers in Psychology` 2023 (N=42) — bất đối xứng tri thức tăng suy luận **niềm tin**, **không** tăng suy luận **tình cảm** |

**Sáng tác, không có trong corpus:** tổng `sum(claims)` + ngưỡng như một ngưỡng phối hợp *hai chiều* trên bảng công khai; trường `predict` có basis dạng id và chỉ người phán xử được; `revoked` credential **không** làm chết claim; `耗` như một cột cụ thể; địa chỉ `甲-17` như một địa danh bản dán.

---

**Ghi chú repo:** `git status` sạch ngoài hai file untracked có sẵn từ trước phiên này. Tài liệu này viết ra, không ghi file. Các bề mặt mà nó chạm vào đã tồn tại và đã được đọc để trích dẫn: `ZONE_PLACEMENT['bounty-board']` (ô 50,32, `packages/game-client/src/zones.ts`), `SOCIAL_ACTION_IDS` gồm `send`/`broadcast`/`leaderboard` (`packages/features/social/src/manifest.ts`), `REPLAY_BEAT_NAMES` dựng trên action events chứ không có `thinking` (`packages/features/activity/src/replay.ts`), và `BOUNTY_ACTION_IDS` có sẵn `bounty.claim` để gắn `capability` + `expiresAt` vào (`packages/features/bounty/src/manifest.ts`).