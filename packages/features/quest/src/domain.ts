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

/**
 * Every way this feature refuses a payload, or undefined when it accepts one.
 *
 * One union for all five actions rather than one per action. A rejection is
 * turned into a sentence naming what the action wanted, and a caller that
 * switched on the reason to work out WHICH action it was would be switching on
 * the id it just called, which it already knows.
 */
export type QuestRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'title-not-a-string' }
  | { readonly reason: 'title-empty' }
  | { readonly reason: 'title-too-long'; readonly max: number }
  | { readonly reason: 'difficulty-out-of-range' }
  | { readonly reason: 'xp-negative' }
  | { readonly reason: 'quest-id-not-a-string' }
  | { readonly reason: 'quest-id-empty' }
  | { readonly reason: 'agent-id-not-a-string' }
  | { readonly reason: 'agent-id-empty' }
  | { readonly reason: 'status-not-a-known-status' }
  | { readonly reason: 'project-id-not-a-string' };

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
  if (
    typeof difficulty !== 'number' ||
    !Number.isInteger(difficulty) ||
    difficulty < MIN_DIFFICULTY
  ) {
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

/* ───────────────────────────── the other four actions ───────────────────────────── */

/**
 * A claim, a hand-in and an admin revoke, as one shape.
 *
 * Three actions and one payload: they differ in which step they ask for and in
 * nothing else. Declaring the fields three times is three chances for a
 * validator and the action it guards to disagree about what a quest id is, which
 * is the failure `CreateQuestInput` being an alias exists to prevent.
 */
export interface QuestTransitionInput {
  readonly questId: string;
  readonly agentId: string;
}

/** What a listing may be narrowed by. Both halves are optional; neither may be junk. */
export interface ListQuestsInput {
  readonly status?: QuestStatus;
  readonly projectId?: string | null;
}

/**
 * Why a transition cannot be asked for, or undefined when it can.
 *
 * `unknown` for the same reason `whyQuestIsRejected` takes one: the two ids went
 * straight into `repository.findById` off a payload `act()` never checked, so
 * `act('quest.claim', {})` was a query for a quest whose id was `undefined`. The
 * store answering "no quest undefined" is a true answer to a question nobody
 * asked.
 */
export function whyQuestTransitionIsRejected(input: unknown): QuestRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  const { questId, agentId } = input as {
    readonly questId?: unknown;
    readonly agentId?: unknown;
  };

  if (typeof questId !== 'string') {
    return { reason: 'quest-id-not-a-string' };
  }
  if (questId.length === 0) {
    return { reason: 'quest-id-empty' };
  }
  if (typeof agentId !== 'string') {
    return { reason: 'agent-id-not-a-string' };
  }
  if (agentId.length === 0) {
    return { reason: 'agent-id-empty' };
  }
  return undefined;
}

/**
 * Why a listing cannot be asked for, or undefined when it can.
 *
 * The status is the field that mattered: it went into the store's filter as
 * whatever arrived, so `act('quest.list', { status: 'nonsense' })` handed an
 * uninterpreted string to a query and got back an empty list, which reads as
 * "there are no quests" rather than as "that status does not exist". The
 * defensive narrowing on the way OUT (`toHarnessFreeStatus`) only ever saw
 * statuses a store had already accepted.
 */
export function whyQuestListIsRejected(input: unknown): QuestRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  const { status, projectId } = input as {
    readonly status?: unknown;
    readonly projectId?: unknown;
  };

  if (status !== undefined && !QUEST_STATUSES.includes(status as QuestStatus)) {
    return { reason: 'status-not-a-known-status' };
  }
  // null is a real answer here — it is how a caller asks for quests attached to
  // no repository — so only a value that is neither null nor a string is junk.
  if (projectId !== undefined && projectId !== null && typeof projectId !== 'string') {
    return { reason: 'project-id-not-a-string' };
  }
  return undefined;
}

/** The same two judgements, as guards, so no read below them needs a cast. */
export function isQuestTransitionInput(input: unknown): input is QuestTransitionInput {
  return whyQuestTransitionIsRejected(input) === undefined;
}

export function isListQuestsInput(input: unknown): input is ListQuestsInput {
  return whyQuestListIsRejected(input) === undefined;
}

/** What a transition wanted, as a sentence the caller can act on. */
export const QUEST_TRANSITION_SHAPE =
  'A claim, a hand-in and a revoke all take a non-empty questId and a non-empty agentId, both strings.';

/** What a listing wanted. Built from the statuses so the two cannot disagree. */
export const QUEST_LIST_SHAPE = `A listing takes an optional status, which must be one of ${QUEST_STATUSES.join(', ')}, and an optional projectId, which must be a string or null.`;

/**
 * The error a refused payload becomes, on every action but the create.
 *
 * Built from the validator's verdict and never from the payload. That is the
 * rule `titleForRejection` exists to carve out: the one caller guaranteed to be
 * handed the answer is the one that must not be reading the input, because
 * reading it there is what made every malformed create die before it could
 * reject. `titleForRejection` reads a title because the rejection EVENT records
 * what was attempted; a message only has to say what was wanted.
 *
 * The code matches the one `act()` throws for a non-object payload, so a caller
 * can branch on "this call was malformed" without caring which door it came
 * through.
 */
export function questInputRejected(
  action: string,
  rejection: QuestRejection,
  expected: string,
): Error {
  return Object.assign(new Error(`${action} rejected: ${rejection.reason}. ${expected}`), {
    code: 'malformed-input',
  });
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
