import { and, asc, desc, eq, isNull, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { quests, QUEST_STATUSES } from '../schema/index.js';

/**
 * Postgres storage for the quest feature.
 *
 * It does not import the feature — infrastructure may not depend on the layers
 * that consume it — so the shapes here are the ones that feature's port
 * declares, and the composition root's call site is where the two are checked.
 *
 * `status` is typed as a plain string on the way out even though the column is
 * an enum, because that is what the contract says and because the feature
 * decides what an unrecognised status means.
 */

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

export interface QuestFilter {
  readonly status?: string;
  readonly projectId?: string | null;
}

export class DrizzleQuestRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async create(quest: Omit<StoredQuest, 'id' | 'status' | 'createdAt'> & { now: string }) {
    const [created] = await this.#database
      .insert(quests)
      .values({
        projectId: quest.projectId,
        title: quest.title,
        body: quest.body,
        difficulty: quest.difficulty,
        xpReward: quest.xpReward,
        createdAt: new Date(quest.now),
      })
      .returning();
    if (created === undefined) {
      throw new Error('inserting a quest returned no row');
    }
    return toQuest(created);
  }

  async list(filter: QuestFilter): Promise<readonly StoredQuest[]> {
    // Newest first, because a quest board is a list of what to do now. The
    // feature's port deliberately sets no limit and says why: a store that
    // silently capped the list would make a quest silently undiscoverable.
    const rows = await this.#database
      .select()
      .from(quests)
      .where(filtersOf(filter))
      .orderBy(desc(quests.createdAt), asc(quests.id));
    return rows.map(toQuest);
  }

  async findById(questId: string): Promise<StoredQuest | undefined> {
    const [row] = await this.#database.select().from(quests).where(eq(quests.id, questId)).limit(1);
    return row === undefined ? undefined : toQuest(row);
  }

  /**
   * Moves a quest only if it is still where the caller believed it was.
   *
   * The `from` goes into the WHERE clause, so the check and the write are one
   * statement. A caller that read the status and then wrote it would race every
   * other caller doing the same thing, and the loser would overwrite a move it
   * never saw.
   */
  async setStatus(questId: string, from: string, to: string): Promise<StoredQuest | undefined> {
    const [row] = await this.#database
      .update(quests)
      .set({ status: toStatus(to) })
      .where(and(eq(quests.id, questId), eq(quests.status, toStatus(from))))
      .returning();
    return row === undefined ? undefined : toQuest(row);
  }
}

/**
 * The WHERE clause, or undefined when nothing is filtered.
 *
 * Undefined rather than a no-op predicate: an empty `or()` has no overload, and
 * an always-true condition is a predicate the planner has to be shown is not
 * selective. "No filter" and "a filter matching everything" are the same question
 * asked two ways, and the first is the honest one.
 */
function filtersOf(filter: QuestFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.status !== undefined) {
    conditions.push(eq(quests.status, toStatus(filter.status)));
  }
  if (filter.projectId === null) {
    // An explicit null means "only quests with no project", which is a different
    // question from "no filter on project at all". Conflating them hides every
    // project-scoped quest from an unscoped board.
    conditions.push(isNull(quests.projectId));
  } else if (filter.projectId !== undefined) {
    conditions.push(eq(quests.projectId, filter.projectId));
  }
  if (conditions.length === 0) {
    return undefined;
  }
  return and(...conditions);
}

/**
 * Narrows a status the feature handed us to one the column can hold.
 *
 * A cast would be shorter and would lie. The feature's contract says `status`
 * is a string, because a store has no idea what a status means; the column says
 * it is one of four. If those ever disagree — an older build writing a status a
 * newer column dropped — the write should fail here, loudly, rather than be
 * cast into a value the database was never told about.
 */
function toStatus(status: string): (typeof QUEST_STATUSES)[number] {
  const known = QUEST_STATUSES as readonly string[];
  if (!known.includes(status)) {
    throw new Error(`"${status}" is not a status the quests table can store`);
  }
  return status as (typeof QUEST_STATUSES)[number];
}

type QuestRow = typeof quests.$inferSelect;

function toQuest(row: QuestRow): StoredQuest {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    body: row.body,
    difficulty: row.difficulty,
    xpReward: row.xpReward,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
