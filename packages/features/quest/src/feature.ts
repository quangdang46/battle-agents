import { defineAction } from '@battle-agents/core';
import type { GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  isTerminalQuest,
  nextQuestStatus,
  QUEST_STATUSES,
  whyQuestIsRejected,
  type Quest,
  type QuestStatus,
  type QuestSummary,
  type QuestTransition,
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

export interface CreateQuestInput {
  readonly projectId?: string | null;
  readonly title: string;
  readonly body?: string;
  readonly difficulty: number;
  readonly xpReward: number;
}

export interface ClaimQuestInput {
  readonly questId: string;
  readonly agentId: string;
}

export interface SubmitQuestInput {
  readonly questId: string;
  readonly agentId: string;
}

export interface ListQuestsInput {
  readonly status?: QuestStatus;
  readonly projectId?: string | null;
}

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
      defineAction({
        id: QUEST_CREATE,
        permissions: [QUEST_CREATE],
        run: (input: CreateQuestInput, context) => createQuest(repository, input, context),
      }),
      defineAction({
        id: QUEST_LIST,
        permissions: [QUEST_LIST],
        run: (input: ListQuestsInput) => listQuests(repository, input),
      }),
      defineAction({
        id: QUEST_CLAIM,
        permissions: [QUEST_CLAIM],
        run: (input: ClaimQuestInput, context) => transition(repository, input, 'claim', context),
      }),
      defineAction({
        id: QUEST_ADMIN_REVOKE,
        permissions: [QUEST_ADMIN_REVOKE],
        run: (input: SubmitQuestInput, context) => transition(repository, input, 'cancel', context),
      }),
      defineAction({
        id: QUEST_SUBMIT,
        permissions: [QUEST_SUBMIT],
        run: (input: SubmitQuestInput, context) => transition(repository, input, 'submit', context),
      }),
    ],
  };
}

async function createQuest(
  repository: QuestRepository,
  input: CreateQuestInput,
  context: RuntimeContext,
): Promise<QuestSummary> {
  const rejection = whyQuestIsRejected(input);
  if (rejection !== undefined) {
    // A rejection is an event, not a throw: the caller asked for something
    // well-formed in shape and it was not, and that is a normal outcome of an
    // API rather than a fault in it.
    await context.runtime.emit(
      event(context, QUEST_REJECTED, {
        title: input.title,
        reason: rejection.reason,
      }),
    );
    throw new Error(
      `quest not created: ${rejection.reason}. ` +
        `Titles are 1-${input.title.trim().length} characters and non-empty, ` +
        'difficulty is a whole number of at least 1, and the XP reward is not negative.',
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
  input: ListQuestsInput,
): Promise<readonly QuestSummary[]> {
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
  input: { questId: string; agentId: string },
  step: QuestTransition,
  context: RuntimeContext,
): Promise<QuestSummary> {
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
    event(context, eventTypeFor(step), {
      questId: summary.id,
      agentId: input.agentId,
      xpReward: summary.xpReward,
    }),
  );
  return summary;
}

function eventTypeFor(step: QuestTransition): string {
  switch (step) {
    case 'claim':
      return QUEST_CLAIMED;
    case 'submit':
      return QUEST_COMPLETED;
    case 'cancel':
      return QUEST_CANCELLED;
  }
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
