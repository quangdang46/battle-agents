/**
 * Battle: the same challenge, twice, in isolation, judged by a published rubric.
 *
 * Plan section 2.1 is the reason this feature exists and it is worth quoting the
 * shape of it: two real coding agents solve the SAME coding problem in ISOLATED
 * WORKSPACES, and the game only visualises the resulting state. Nothing here
 * simulates a fight. A battle is a lifecycle around work two agents really did.
 *
 * Three properties in this file are load-bearing, and each is a place where the
 * convenient model is the wrong one.
 *
 * 1. A BATTLE BINDS SESSIONS, NOT AGENTS. Plan section 3.1 names the
 *    anti-pattern by name — "Battle -> Claude vs Codex" is wrong, because the
 *    same Claude can fight two battles in two sessions. Battle#918 is
 *    Claude/Session#241 against Codex/Session#552. So every participant here is
 *    a `sessionId`, and nothing in this package reads an agent to decide who is
 *    fighting. The agent is looked up later, for the reward, and by the
 *    progression feature — never by this one. A model that put `agentId` on the
 *    participant row would pass every other test in this package.
 *
 * 2. THE RUBRIC IS PUBLIC. Plan section 17.4: a hidden rubric is
 *    indistinguishable from a rigged one. The weights therefore live on the
 *    battle, and `battle.weights` answers for a battle that is still running,
 *    to a caller that supplied nothing but the battle id. Storing the weights
 *    is the default; publishing them is the property.
 *
 * 3. A MODE IS A STRING AND AN UNRECOGNISED ONE IS TREATED AS THE STRICTEST.
 *    Same choice features/bounty made, same reason: the mode taxonomy belongs to
 *    ba-bounty-modes-tiers-seasons-62l, and a closed union here would be this
 *    bead quietly claiming half of it. What this feature needs is a stored value
 *    and two yes/no questions, and both are answered fail-closed.
 */

/* ───────────────────────────── states ───────────────────────────── */

export const BATTLE_STATUSES = ['running', 'paused', 'completed', 'abandoned', 'expired'] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

/**
 * What someone did to a battle, as opposed to a state it now has.
 *
 * `pause` and `resume` are here rather than inside the disconnect handler
 * because they are moves like any other, and a disconnect handler that decided
 * for itself when a battle may resume would eventually disagree with a command
 * handler that did not.
 */
export const BATTLE_TRANSITIONS = ['pause', 'resume', 'finish', 'abandon', 'expire'] as const;
export type BattleTransition = (typeof BATTLE_TRANSITIONS)[number];

const ALLOWED_TRANSITIONS: Readonly<
  Record<BattleStatus, Readonly<Record<BattleTransition, BattleStatus>>>
> = {
  running: {
    pause: 'paused',
    resume: 'running',
    finish: 'completed',
    abandon: 'abandoned',
    expire: 'expired',
  },
  // A paused battle is not a dead one. The participant is inside the grace
  // window and the match is still theirs to lose, so every move a running battle
  // accepts is accepted here. Only the expiry of that window closes them.
  paused: {
    pause: 'paused',
    resume: 'running',
    finish: 'completed',
    abandon: 'abandoned',
    expire: 'expired',
  },
  completed: {
    pause: 'completed',
    resume: 'completed',
    finish: 'completed',
    abandon: 'completed',
    expire: 'completed',
  },
  abandoned: {
    pause: 'abandoned',
    resume: 'abandoned',
    finish: 'abandoned',
    abandon: 'abandoned',
    expire: 'abandoned',
  },
  expired: {
    pause: 'expired',
    resume: 'expired',
    finish: 'expired',
    abandon: 'expired',
    expire: 'expired',
  },
};

/**
 * The state a battle moves to, or undefined when the move is not allowed.
 *
 * Undefined rather than a state, so a caller cannot mistake a refused move for
 * one that happened: the self-loops return `current`, and `next === current` is
 * the refusal. Same shape as the bounty and quest lifecycles, so a reader who
 * knows one knows the others.
 */
export function nextBattleStatus(
  current: BattleStatus,
  transition: BattleTransition,
): BattleStatus | undefined {
  const next = ALLOWED_TRANSITIONS[current][transition];
  return next === current ? undefined : next;
}

export function isTerminalBattle(status: BattleStatus): boolean {
  return status === 'completed' || status === 'abandoned' || status === 'expired';
}

/**
 * A state this build knows, or undefined when it does not.
 *
 * The bounty's equivalent answers `disputed`, because it owns a state that is
 * terminal and does nothing, and unknown statuses need somewhere to land. This
 * feature has no such state and inventing one — a "disputed" battle — would be a
 * sixth state the plan does not have. So the answer is undefined, and undefined
 * means every move is refused.
 *
 * That is strictly safer than picking one of the three terminals: mapping an
 * unknown status to `completed` would name a winner for a row nobody judged, and
 * mapping it to `abandoned` would record a forfeit that never happened. Refusing
 * to move a row this build cannot interpret is the only answer that cannot
 * transfer a reward by accident.
 */
export function toKnownBattleStatus(stored: string): BattleStatus | undefined {
  return (BATTLE_STATUSES as readonly string[]).includes(stored)
    ? (stored as BattleStatus)
    : undefined;
}

/* ───────────────────────────── modes ───────────────────────────── */

/**
 * The modes this build can interpret, and no claim that it owns the list.
 *
 * Six, because plan section 15.1 names them for M4. They are exported so a
 * caller can read what this build understands and so the two places below can
 * say what an unrecognised mode costs. The taxonomy is NOT this bead's:
 * ba-bounty-modes-tiers-seasons-62l owns it, and a caller adding a seventh mode
 * here is adding it in the wrong file.
 */
export const BATTLE_MODES = ['speed', 'quality', 'survival', 'boss', 'team', 'tournament'] as const;
export type KnownBattleMode = (typeof BATTLE_MODES)[number];

/** What a battle is until somebody says otherwise. */
export const DEFAULT_BATTLE_MODE = 'speed';

export function isKnownBattleMode(mode: string): mode is KnownBattleMode {
  return (BATTLE_MODES as readonly string[]).includes(mode);
}

/**
 * How many sessions may fight in a battle of this mode.
 *
 * Two everywhere except `boss`, which is one agent against a thing rather than
 * against another agent — and one for a mode this build does not recognise,
 * because a capacity is a permission and a mode nobody can name has not been
 * shown to permit a second fighter.
 */
export const TWO_FIGHTER_CAPACITY = 2;
const SOLO_CAPACITY = 1;

export function battleCapacity(mode: string): number {
  if (!isKnownBattleMode(mode)) {
    return SOLO_CAPACITY;
  }
  return mode === 'boss' ? SOLO_CAPACITY : TWO_FIGHTER_CAPACITY;
}

/* ───────────────────────────── ties ───────────────────────────── */

/**
 * What a tied score resolves to.
 *
 * `fastest-valid` is section 10.3's speed rule: the first valid submission wins
 * a tie. `shared` is the tournament rule, and it is also the answer for every
 * mode the plan names no rule for — see `tiePolicyFor`.
 */
export type BattleTiePolicy = 'fastest-valid' | 'shared';

export const SPEED_MODE = 'speed';
export const TOURNAMENT_MODE = 'tournament';

/**
 * How a tie is settled in this mode.
 *
 * Only `speed` has a stated rule that prefers one participant, and only
 * `tournament` is named as a shared win. Everything else — including every mode
 * this build does not recognise — is `shared`, because preferring one fighter
 * over another requires a rule, and inventing one for a mode nobody has
 * described is how a judge becomes indefensible. A shared win is also the
 * recoverable answer: it can be disputed on the evidence, whereas an invented
 * tiebreak cannot be argued with at all.
 */
export function tiePolicyFor(mode: string): BattleTiePolicy {
  return mode === SPEED_MODE ? 'fastest-valid' : 'shared';
}

/* ───────────────────────────── the rubric ───────────────────────────── */

export const JUDGE_CRITERIA = [
  'correctness',
  'tests',
  'regression',
  'quality',
  'efficiency',
] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];

/**
 * The published rubric, as weights that must sum to one.
 *
 * The plan's own numbers (section 10.3), stored per battle rather than read
 * from a constant, because "published per match" is the whole fairness claim: a
 * battle whose weights differ from the next one's has to be able to SAY so
 * before it is judged, and a constant cannot.
 */
export type BattleWeights = Readonly<Record<JudgeCriterion, number>>;

export const DEFAULT_BATTLE_WEIGHTS: BattleWeights = Object.freeze({
  correctness: 0.5,
  tests: 0.2,
  regression: 0.1,
  quality: 0.1,
  efficiency: 0.1,
});

/**
 * How far a weight set may miss one and still be a rubric.
 *
 * Exact equality would reject the arithmetic rather than the idea — five
 * tenths summed in binary is not always exactly one. A millionth of a point is
 * far below any difference a judge could act on and far above the noise, so it
 * separates "these weights describe a rubric" from "these weights are a list of
 * numbers somebody liked".
 */
export const WEIGHT_SUM_TOLERANCE = 1e-6;

/** Why a weight set is unusable, or undefined when it is one. */
export type WeightsRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'criterion-missing' }
  | { readonly reason: 'criterion-not-finite' }
  | { readonly reason: 'weight-negative' }
  | { readonly reason: 'weights-do-not-sum-to-one' };

export function whyWeightsAreRejected(input: unknown): WeightsRejection | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { reason: 'not-an-object' };
  }
  const record = input as Record<string, unknown>;
  let total = 0;
  for (const criterion of JUDGE_CRITERIA) {
    const weight = record[criterion];
    if (weight === undefined) {
      return { reason: 'criterion-missing' };
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      return { reason: 'criterion-not-finite' };
    }
    if (weight < 0) {
      return { reason: 'weight-negative' };
    }
    total += weight;
  }
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    return { reason: 'weights-do-not-sum-to-one' };
  }
  return undefined;
}

export function isBattleWeights(input: unknown): input is BattleWeights {
  return whyWeightsAreRejected(input) === undefined;
}

/** The published rubric, as a plain object, for a caller that serialises it. */
export function publishWeights(weights: BattleWeights): {
  readonly weights: BattleWeights;
  readonly criteria: readonly JudgeCriterion[];
  readonly published: true;
} {
  return {
    weights,
    // The criterion list travels with the weights because a weight set with no
    // named criteria is a list of numbers, and the reader cannot tell which key
    // is 0.5 and which is 0.1. The order is the declaration order, so two
    // published rubrics read the same way.
    criteria: JUDGE_CRITERIA,
    published: true,
  };
}

/* ───────────────────────────── the arena gate ───────────────────────────── */

/**
 * The trust at which a session may be admitted to a battle.
 *
 * Low, named rather than derived, and above zero on purpose. Section 10.2's
 * ladder puts "the arena" behind level 10, and level is progression's to own;
 * this is trust, because trust is what reputation.read answers and
 * reputation.read is the capability this feature declares a dependency on.
 *
 * Above zero means a brand-new character cannot fight, which is a real cost and
 * not an oversight. A battle spends two agents, two isolated workspaces and a
 * judge run, and the bead that scoped this says that cost is a product
 * constraint rather than an operations detail — so admitting an agent with no
 * record of finishing anything is admitting somebody who has never shown they
 * can. If a first record has to be earned somewhere else, the bounty lifecycle
 * is where it is earned; this feature is not a cheaper place to earn it.
 */
export const ARENA_MIN_TRUST = 500;

export function mayEnterArena(trust: number): boolean {
  return Number.isFinite(trust) && trust >= ARENA_MIN_TRUST;
}

/* ───────────────────────────── what a caller is shown ───────────────────────────── */

/**
 * One participant, as a spectator is shown it.
 *
 * `sessionId` and never an agent id. That is not a privacy decision, it is the
 * model: the thing that fought is a run, and a run is what the rubric was
 * applied to. `agentId` is here when one is known because a spectator watching a
 * battle wants to know who they are watching, and it is nullable because a
 * participant whose session has not been observed starting has no agent this
 * feature can name.
 */
export interface BattleParticipantView {
  readonly sessionId: string;
  readonly agentId: string | null;
  readonly joinedAt: string;
  readonly submittedAt: string | null;
  /** Null until the battle is judged, and 0..1 after. */
  readonly score: number | null;
  readonly won: boolean;
  /**
   * The six battle-local stats, and null for a session that has done nothing.
   *
   * Null rather than six zeros, because "has not fought yet" and "fought and
   * achieved nothing" are different readings of the same six numbers and an
   * arena that cannot tell them apart will animate a participant who is idle.
   *
   * BATTLE-LOCAL, and that is the whole point of the type living here rather
   * than on a character sheet: progression owns the eight RuneScape skills and
   * deliberately names no skill for a won battle, so these six are the arena's
   * and nobody else's.
   */
  readonly stats: BattleStatsView | null;
  readonly charge: BattleChargeView | null;
}

export interface BattleStatsView {
  readonly str: number;
  readonly int: number;
  readonly wis: number;
  readonly luk: number;
  readonly def: number;
  readonly dex: number;
}

export interface BattleChargeView {
  readonly charge: number;
  readonly damage: number;
  readonly criticalHits: number;
}

/**
 * A battle as anybody may read it, including a logged-out spectator.
 *
 * The weights are on the view unconditionally and not behind a flag, because
 * `battle.weights` exists to serve this and a view that could withhold them
 * would be a second, worse answer to the same question.
 */
export interface BattleView {
  readonly id: string;
  readonly mode: string;
  readonly status: BattleStatus;
  readonly weights: BattleWeights;
  /** The bounty both fighters are solving, when the battle is on a real one. */
  readonly bountyId: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  /** When a disconnect paused it, and the instant that pause runs out. */
  readonly pausedAt: string | null;
  readonly resumeDeadline: string | null;
  readonly participants: readonly BattleParticipantView[];
  readonly winnerSessionIds: readonly string[];
  /**
   * Whether the arena gate is being applied, and why not when it is not.
   *
   * Reported rather than inferred, so a caller can tell "the gate let me in" from
   * "there is no gate because reputation is not installed" — which look
   * identical from the outside and mean completely different things about how
   * much the result is worth.
   */
  readonly entryGated: boolean;
  readonly entryGatedReason: 'gated-on-trust' | 'open-no-reputation';
}
