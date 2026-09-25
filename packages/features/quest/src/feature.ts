import { defineAction } from '@battle-agents/core';
import type { GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  isCreatableQuestDraft,
  isListQuestsInput,
  isQuestTransitionInput,
  isTerminalQuest,
  MAX_QUEST_TITLE_LENGTH,
  nextQuestStatus,
  QUEST_LIST_SHAPE,
  QUEST_STATUSES,
  QUEST_TRANSITION_SHAPE,
  questInputRejected,
  titleForRejection,
  whyQuestIsRejected,
  whyQuestListIsRejected,
  whyQuestTransitionIsRejected,
  type CreatableQuestDraft,
  type Quest,
  type QuestStatus,
  type QuestSummary,
  type QuestTransition,
  type QuestTransitionInput,
} from './domain.js';
import type { QuestRepository, StoredQuest } from './repository.js';

export const QUEST_CREATED = 'quest.created';
export const QUEST_CLAIMED = 'quest.claimed';
export const QUEST_COMPLETED = 'quest.completed';
export const QUEST_CANCELLED = 'quest.cancelled';
export const QUEST_REJECTED = 'quest.rejected';

/**
 * What this feature offers, and therefore what a caller may be granted.
 *
 * The three verbs map one-to-one onto the lifecycle, so a surface never has to
 * invent a mapping between "what the user clicked" and "what the game calls it".
 */
export const QUEST_CREATE = 'quest.create';
export const QUEST_LIST = 'quest.list';
export const QUEST_CLAIM = 'quest.claim';
export const QUEST_SUBMIT = 'quest.submit';
// Three segments on purpose, and not decoration: the CLI resolves a verb by
// everything after the first dot, and until a real action had three segments
// there was no way to test that without inventing an id the build does not
// register. An admin revoking a quest is a real operation, so the id is real too.
export const QUEST_ADMIN_REVOKE = 'quest.admin.revoke';

/**
 * The shape a create is documented to take.
 *
 * An alias, not a second interface. The guard in `createQuest` narrows to
 * `CreatableQuestDraft`; a parallel declaration here that happens to look the
 * same is a third thing to keep in step, and a caller who satisfies one has not
 * necessarily satisfied the other.
 */
export type CreateQuestInput = CreatableQuestDraft;

/**
 * Aliases of the one shape the three transition actions take.
 *
 * The same reasoning as `CreateQuestInput`, and the reason the three actions
 * are wired to one validator: a second interface that happens to look the same
 * is a third thing to keep in step with `whyQuestTransitionIsRejected`.
 */
export type ClaimQuestInput = QuestTransitionInput;
export type SubmitQuestInput = QuestTransitionInput;

/**
 * The action each transition is reached through, with the event it emits.
 *
 * One table for both, because the rejection message has to name the action and
 * the domain event does not: `cancel` is `quest.admin.revoke` on one side and
 * `quest.cancelled` on the other, and two switches over the same three steps is
 * two places for those to stop agreeing.
 */
const TRANSITION_ACTIONS = {
  claim: { action: QUEST_CLAIM, event: QUEST_CLAIMED },
  submit: { action: QUEST_SUBMIT, event: QUEST_COMPLETED },
  cancel: { action: QUEST_ADMIN_REVOKE, event: QUEST_CANCELLED },
} as const satisfies Record<QuestTransition, { readonly action: string; readonly event: string }>;

/**
 * The quest feature.
 *
 * It owns the quest and nothing else. The XP a quest is worth is read by
 * progression from `quest.completed`; the money behind one is the bounty's
 * business. Nothing here imports either, which is what makes quest removable
 * and makes those features work with quest uninstalled.
 */
export function questFeature(dependencies: { readonly repository: QuestRepository }): GameFeature {
  const { repository } = dependencies;

  return {
    id: 'quest',
    persistedEvents: [
      QUEST_CREATED,
      QUEST_CLAIMED,
      QUEST_COMPLETED,
      QUEST_CANCELLED,
      QUEST_REJECTED,
    ],
    capabilities: [
      { name: QUEST_CREATE, description: 'Create a quest.' },
      { name: QUEST_LIST, description: 'Discover the quests available.' },
      { name: QUEST_CLAIM, description: 'Take a quest, starting it.' },
      { name: QUEST_SUBMIT, description: 'Hand a quest in, completing it.' },
    ],
    actionDefs: [
      // Every `run` takes `unknown`. Not shorthand: `act()` hands the payload
      // through as a generic, so a narrower parameter here is an annotation the
      // registry never checks, which is the defect this feature is being taught
      // to refuse. The guard below each one is what makes the shape true.
      defineAction({
        id: QUEST_CREATE,
        permissions: [QUEST_CREATE],
        run: (input: unknown, context) => createQuest(repository, input, context),
      }),
      defineAction({
        id: QUEST_LIST,
        permissions: [QUEST_LIST],
        run: (input: unknown) => listQuests(repository, input),
      }),
      defineAction({
        id: QUEST_CLAIM,
        permissions: [QUEST_CLAIM],
        run: (input: unknown, context) => transition(repository, input, 'claim', context),
      }),
      defineAction({
        id: QUEST_ADMIN_REVOKE,
        permissions: [QUEST_ADMIN_REVOKE],
        run: (input: unknown, context) => transition(repository, input, 'cancel', context),
      }),
      defineAction({
        id: QUEST_SUBMIT,
        permissions: [QUEST_SUBMIT],
        run: (input: unknown, context) => transition(repository, input, 'submit', context),
      }),
    ],
  };
}

async function createQuest(
  repository: QuestRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<QuestSummary> {
  // Narrowed by a guard, not by an annotation. `act()` takes its input as a
  // generic, so nothing upstream proved the shape, and the previous signature
  // (`input: CreateQuestInput`) was a claim the code never checked: a malformed
  // call reached `input.title.trim()` and died on a TypeError instead of being
  // rejected. After the guard, every read below is a string or a number.
  if (!isCreatableQuestDraft(input)) {
    const rejection = whyQuestIsRejected(input) ?? { reason: 'not-an-object' as const };
    // A rejection is an event, not a throw: the caller asked for something
    // well-formed in shape and it was not, and that is a normal outcome of an
    // API rather than a fault in it.
    await context.runtime.emit(
      event(context, QUEST_REJECTED, {
        // Read defensively: the title is frequently the thing that is missing,
        // and this is the one caller guaranteed to be handed the answer.
        title: titleForRejection(input),
        reason: rejection.reason,
      }),
    );
    // The code is the one every other refusal in this feature carries, and the
    // one `act()` throws for a non-object payload, so a caller can branch on
    // "this call was malformed" without caring which of the five it called.
    throw Object.assign(
      new Error(
        `quest not created: ${rejection.reason}. ` +
          'A title is a non-empty string of at most ' +
          `${MAX_QUEST_TITLE_LENGTH} characters, difficulty is a whole number of at least 1, ` +
          'and the XP reward is a whole number that is not negative.',
      ),
      { code: 'malformed-input' },
    );
  }

  const created = await repository.create({
    projectId: input.projectId ?? null,
    title: input.title.trim(),
    body: input.body ?? null,
    difficulty: input.difficulty,
    xpReward: input.xpReward,
    now: context.now(),
  });

  await context.runtime.emit(
    event(context, QUEST_CREATED, {
      questId: created.id,
      title: created.title,
      difficulty: created.difficulty,
      xpReward: created.xpReward,
    }),
  );
  return toSummary(toQuest(created));
}

async function listQuests(
  repository: QuestRepository,
  input: unknown,
): Promise<readonly QuestSummary[]> {
  if (!isListQuestsInput(input)) {
    const rejection = whyQuestListIsRejected(input) ?? { reason: 'not-an-object' as const };
    throw questInputRejected(QUEST_LIST, rejection, QUEST_LIST_SHAPE);
  }
  const stored = await repository.list({
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
  });
  return stored.map((row) => toSummary(toQuest(row)));
}

/**
 * Moves a quest one step and reports what happened.
 *
 * A refused transition is refused HERE rather than in the store, and the store
 * is told which statuses are acceptable, so the two checks cannot drift: the
 * lifecycle lives in domain.ts and the store only enforces what it was handed.
 */
async function transition(
  repository: QuestRepository,
  input: unknown,
  step: QuestTransition,
  context: RuntimeContext,
): Promise<QuestSummary> {
  if (!isQuestTransitionInput(input)) {
    const rejection = whyQuestTransitionIsRejected(input) ?? { reason: 'not-an-object' as const };
    throw questInputRejected(TRANSITION_ACTIONS[step].action, rejection, QUEST_TRANSITION_SHAPE);
  }
  const current = await repository.findById(input.questId);
  if (current === undefined) {
    throw new Error(`no quest ${input.questId}`);
  }

  const quest = toQuest(current);
  if (isTerminalQuest(quest.status)) {
    // Reported rather than silently re-emitted as a completion: a caller that
    // submits twice is a bug, and answering "it worked" teaches it to submit
    // twice.
    throw new Error(`quest ${quest.id} is already ${quest.status} and cannot be ${step}ed`);
  }

  const next = nextQuestStatus(quest.status, step);
  if (next === undefined) {
    throw new Error(`quest ${quest.id} cannot be ${step}ed from ${quest.status}`);
  }

  const moved = await repository.setStatus(quest.id, quest.status, next);
  if (moved === undefined) {
    // The status was not what the caller saw, so somebody else moved it between
    // the read and this write. That is a real conflict, not a missing row.
    throw new Error(`quest ${quest.id} changed while ${step}ing it; read it again and retry`);
  }

  const summary = toSummary(toQuest(moved));
  await context.runtime.emit(
    event(context, TRANSITION_ACTIONS[step].event, {
      questId: summary.id,
      agentId: input.agentId,
      xpReward: summary.xpReward,
    }),
  );
  return summary;
}

/**
 * Narrows whatever the store returned to a status this feature knows.
 *
 * The column is text, so a status written by a future version, or by hand, can
 * be something this build has never heard of. An unknown status becomes
 * `open` rather than crashing the caller: the quest stays visible and
 * claimable instead of vanishing from a list because of a string.
 */
function toHarnessFreeStatus(stored: string): QuestStatus {
  return QUEST_STATUSES.includes(stored as QuestStatus) ? (stored as QuestStatus) : 'open';
}

function toQuest(row: StoredQuest): Quest {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    body: row.body,
    difficulty: row.difficulty,
    xpReward: row.xpReward,
    status: toHarnessFreeStatus(row.status),
    createdAt: row.createdAt,
  };
}

function toSummary(quest: Quest): QuestSummary {
  return {
    id: quest.id,
    title: quest.title,
    difficulty: quest.difficulty,
    xpReward: quest.xpReward,
    status: quest.status,
  };
}

function event(context: RuntimeContext, type: string, payload: Record<string, unknown>): GameEvent {
  return { type, occurredAt: context.now(), actorId: 'quest', payload };
}
