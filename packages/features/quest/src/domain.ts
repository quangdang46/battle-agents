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
  | { readonly reason: 'title-empty' }
  | { readonly reason: 'title-too-long'; readonly max: number }
  | { readonly reason: 'difficulty-out-of-range' }
  | { readonly reason: 'xp-negative' };

export const MAX_QUEST_TITLE_LENGTH = 200;

/**
 * The one place a quest is judged creatable.
 *
 * Both rules here exist because the values become game state that other
 * features read: a negative reward would propagate into progression, and a
 * zero-difficulty quest would make a difficulty tier mean nothing. Rejecting at
 * the boundary is cheaper than defending the number everywhere it is used.
 */
export function whyQuestIsRejected(draft: {
  readonly title: string;
  readonly difficulty: number;
  readonly xpReward: number;
}): QuestRejection | undefined {
  const title = draft.title.trim();
  if (title.length === 0) {
    return { reason: 'title-empty' };
  }
  if (title.length > MAX_QUEST_TITLE_LENGTH) {
    return { reason: 'title-too-long', max: MAX_QUEST_TITLE_LENGTH };
  }
  if (!Number.isInteger(draft.difficulty) || draft.difficulty < MIN_DIFFICULTY) {
    return { reason: 'difficulty-out-of-range' };
  }
  if (!Number.isInteger(draft.xpReward) || draft.xpReward < MIN_XP_REWARD) {
    return { reason: 'xp-negative' };
  }
  return undefined;
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
