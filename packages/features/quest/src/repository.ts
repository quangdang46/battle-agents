import type { QuestStatus } from './domain.js';

/**
 * How the quest feature stores its records, described without naming a database.
 *
 * The feature may not import drizzle, Compose or anything else in
 * `infrastructure` — that is what makes `presentation -> features -> core` mean
 * something rather than being a convention. So the feature states what it needs
 * and the wiring supplies it.
 *
 * Every id is a plain string for the reason given in
 * features/agent/src/repository.ts: a database column is a UUID and has no idea
 * what it is holding, and branding these would force the store to import the
 * feature to cast them.
 */

/**
 * A failure a store reports, as a discriminant rather than a class.
 *
 * `instanceof` across the layering boundary is always false, which would turn
 * every expected failure into an unexplained crash. What the two sides can
 * agree on is a stable `code`.
 */
export const QUEST_NOT_FOUND = 'quest-not-found';
export const QUEST_ALREADY_CLAIMED = 'quest-already-claimed';

export type QuestStorageFailure = typeof QUEST_NOT_FOUND | typeof QUEST_ALREADY_CLAIMED;

export function isQuestStorageFailure(error: unknown, code: QuestStorageFailure): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/** A quest as the store holds it. The shape the feature maps into its own types. */
export interface StoredQuest {
  readonly id: string;
  readonly projectId: string | null;
  readonly title: string;
  readonly body: string | null;
  readonly difficulty: number;
  readonly xpReward: number;
  readonly status: string;
  readonly createdAt: string;
}

export interface NewStoredQuest {
  readonly projectId: string | null;
  readonly title: string;
  readonly body: string | null;
  readonly difficulty: number;
  readonly xpReward: number;
  readonly now: string;
}

export interface QuestFilter {
  readonly status?: QuestStatus;
  readonly projectId?: string | null;
}

export interface QuestRepository {
  create(quest: NewStoredQuest): Promise<StoredQuest>;

  /**
   * Quests matching the filter, newest first.
   *
   * No limit: a caller that wants fewer can take fewer, and a store that
   * silently capped the list would make a quest silently undiscoverable, which
   * is the failure mode this whole design has to avoid.
   */
  list(filter: QuestFilter): Promise<readonly StoredQuest[]>;

  findById(questId: string): Promise<StoredQuest | undefined>;

  /**
   * Moves a quest, or reports the status it was already in.
   *
   * `from` is part of the call rather than a read-then-write here so the check
   * and the write are one statement. A caller that read the status and then
   * wrote would race every other caller doing the same thing.
   */
  setStatus(questId: string, from: QuestStatus, to: QuestStatus): Promise<StoredQuest | undefined>;
}
