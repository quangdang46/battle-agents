/**
 * The quest feature's public surface.
 *
 * Everything another package may name is here; the internals of the lifecycle
 * table and the store port are exported from their own modules and re-exported
 * only where a caller genuinely needs the type.
 */
export {
  questFeature,
  QUEST_CANCELLED,
  QUEST_CLAIM,
  QUEST_CLAIMED,
  QUEST_COMPLETED,
  QUEST_CREATE,
  QUEST_CREATED,
  QUEST_LIST,
  QUEST_REJECTED,
  QUEST_SUBMIT,
} from './feature.js';
export type {
  ClaimQuestInput,
  CreateQuestInput,
  ListQuestsInput,
  SubmitQuestInput,
} from './feature.js';

export {
  isTerminalQuest,
  MAX_QUEST_TITLE_LENGTH,
  MIN_DIFFICULTY,
  MIN_XP_REWARD,
  nextQuestStatus,
  QUEST_STATUSES,
  QUEST_TRANSITIONS,
  whyQuestIsRejected,
} from './domain.js';
export type { QuestRejection, QuestStatus, QuestTransition } from './domain.js';

export { isQuestStorageFailure, QUEST_ALREADY_CLAIMED, QUEST_NOT_FOUND } from './repository.js';
export type {
  NewStoredQuest,
  QuestFilter,
  QuestRepository,
  QuestStorageFailure,
  StoredQuest,
} from './repository.js';
export { QUEST_ACTION_IDS } from './manifest.js';
export type { QuestActionId, QuestActionTypes } from './manifest.js';
