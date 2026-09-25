/**
 * Quests: the generic task unit a bounty is built on.
 *
 * A quest is deliberately thin. It is the smallest thing an agent can be asked
 * to do and have the platform record, and it earns its existence by being
 * something a BOUNTY can hang a reward on rather than by being expressive.
 *
 * The lifecycle is a pure function for the same reason the session lifecycle is
 * (see features/agent/src/session.ts): every "may this go from A to B" question
 * is answered in one place, and a command handler that decided for itself would
 * eventually disagree with a command handler that did not.
 */

export const QUEST_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/** What someone did to a quest, as opposed to a status it now has. */
export const QUEST_TRANSITIONS = ['claim', 'submit', 'cancel'] as const;
export type QuestTransition = (typeof QUEST_TRANSITIONS)[number];

/**
 * The statuses a quest can move to, and the one that is terminal.
 *
 * Both terminal states are terminal: a quest that was cancelled was not
 * completed, and a "completed" quest that is quietly reopened would let a reward
 * be claimed twice. There is no un-cancel either, for the same reason the
 * session machine refuses to resurrect a finished run.
 */
const ALLOWED_TRANSITIONS: Record<QuestStatus, Readonly<Record<QuestTransition, QuestStatus>>> = {
  open: { claim: 'in_progress', submit: 'completed', cancel: 'cancelled' },
  in_progress: { claim: 'in_progress', submit: 'completed', cancel: 'cancelled' },
  completed: { claim: 'completed', submit: 'completed', cancel: 'completed' },
  cancelled: { claim: 'cancelled', submit: 'cancelled', cancel: 'cancelled' },
};

/**
 * The status a quest moves to, or undefined when the move is not allowed.
 *
 * Undefined rather than a status, so a caller cannot mistake a refused
 * transition for one that happened. `submit` from `open` is allowed on purpose:
 * an agent that finished the work before it claimed the quest still gets credit,
 * and making it claim first would only produce a second event nobody needed.
 */
export function nextQuestStatus(
  current: QuestStatus,
  transition: QuestTransition,
): QuestStatus | undefined {
  const next = ALLOWED_TRANSITIONS[current][transition];
  return next === current ? undefined : next;
}

export function isTerminalQuest(status: QuestStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

export const MIN_DIFFICULTY = 1;
export const MIN_XP_REWARD = 0;

/** Why a proposed quest cannot be created, or undefined when it can. */
export type QuestRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'title-not-a-string' }
  | { readonly reason: 'title-empty' }
  | { readonly reason: 'title-too-long'; readonly max: number }
  | { readonly reason: 'difficulty-out-of-range' }
  | { readonly reason: 'xp-negative' };

export const MAX_QUEST_TITLE_LENGTH = 200;

/**
 * A draft that has been proven creatable.
 *
 * Declared here rather than in `feature.ts` so the validator and the code it
 * guards narrow to the same type. Two interfaces that look alike and are not is
 * how a caller ends up satisfying the validator and not the action.
 */
export interface CreatableQuestDraft {
  readonly title: string;
  readonly difficulty: number;
  readonly xpReward: number;
  readonly projectId?: string | null;
  readonly body?: string;
}

/**
 * The one place a quest is judged creatable.
 *
 * Both rules here exist because the values become game state that other
 * features read: a negative reward would propagate into progression, and a
 * zero-difficulty quest would make a difficulty tier mean nothing. Rejecting at
 * the boundary is cheaper than defending the number everywhere it is used.
 */
export function whyQuestIsRejected(draft: unknown): QuestRejection | undefined {
  // `unknown`, not a shape. The parameter used to be typed `{ title: string; ... }`,
  // which made `draft.title.trim()` typecheck and read as a guarantee — while
  // `act()` takes its input as a generic, so `act('quest.create', {})` compiled
  // clean and arrived here as `{}`. Every malformed call then died on
  // `undefined.trim()` instead of being rejected, which is the opposite of what
  // a rejection is for. A type annotation is a claim; this one was never checked.
  //
  // Narrowing here rather than at the action is the right place: every path into
  // createQuest arrives from the same boundary, and a caller that has already
  // proven the shape should not have to prove it twice.
  if (typeof draft !== 'object' || draft === null) {
    return { reason: 'not-an-object' };
  }
  const { title, difficulty, xpReward } = draft as {
    readonly title?: unknown;
    readonly difficulty?: unknown;
    readonly xpReward?: unknown;
  };

  if (typeof title !== 'string') {
    return { reason: 'title-not-a-string' };
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { reason: 'title-empty' };
  }
  if (trimmed.length > MAX_QUEST_TITLE_LENGTH) {
    return { reason: 'title-too-long', max: MAX_QUEST_TITLE_LENGTH };
  }
  if (typeof difficulty !== 'number' || !Number.isInteger(difficulty) || difficulty < MIN_DIFFICULTY) {
    return { reason: 'difficulty-out-of-range' };
  }
  if (typeof xpReward !== 'number' || !Number.isInteger(xpReward) || xpReward < MIN_XP_REWARD) {
    return { reason: 'xp-negative' };
  }
  return undefined;
}

/**
 * The same judgement, as a type guard.
 *
 * Both exist because a caller needs two different things from one pass: the
 * guard to narrow, and the reason to explain the refusal to whoever made the
 * call. Validating twice is cheap next to validating wrong, and the pair cannot
 * drift because the guard is defined in terms of the validator.
 */
export function isCreatableQuestDraft(draft: unknown): draft is CreatableQuestDraft {
  return whyQuestIsRejected(draft) === undefined;
}

/**
 * The title to name in a rejection, or a placeholder when there is not one.
 *
 * A rejection is most likely BECAUSE the title is missing or is not a string,
 * so the path that reports the rejection cannot assume it. Reading `input.title`
 * there is what made every malformed create die on `undefined.trim()` before it
 * managed to reject — the one caller guaranteed to be given the answer.
 */
export function titleForRejection(draft: unknown): string {
  if (typeof draft !== 'object' || draft === null) {
    return '(no draft)';
  }
  const { title } = draft as { readonly title?: unknown };
  return typeof title === 'string' ? title : '(no title)';
}

/** A quest as this feature holds it. Ids are plain: a column is a UUID, not an identity. */
export interface Quest {
  readonly id: string;
  /** Null for an internal quest that is not attached to a repository. */
  readonly projectId: string | null;
  readonly title: string;
  readonly body: string | null;
  readonly difficulty: number;
  readonly xpReward: number;
  readonly status: QuestStatus;
  readonly createdAt: string;
}

/** What a caller supplies to create one. */
export interface NewQuest {
  readonly projectId: string | null;
  readonly title: string;
  readonly body?: string;
  readonly difficulty: number;
  readonly xpReward: number;
}

/** A quest as a caller is allowed to see it. */
export interface QuestSummary {
  readonly id: string;
  readonly title: string;
  readonly difficulty: number;
  readonly xpReward: number;
  readonly status: QuestStatus;
}
