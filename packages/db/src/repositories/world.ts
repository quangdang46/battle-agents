import { eq } from 'drizzle-orm';

import { agentBases } from '../schema/features/world.js';
import type { Database } from '../client.js';

/**
 * The world against the real database.
 *
 * This file does not import the feature that describes what it stores, because
 * infrastructure may not depend on the layers that consume it. It matches the
 * feature's `WorldRepository` structurally, and apps/web asserts that it does — a
 * conformance check has to live where both sides may be imported, or it is not a
 * check.
 *
 * Types below are declared locally rather than imported, and that duplication is
 * the price of the layering rule. The conformance test is what keeps it honest.
 */

/** The shape the feature's port expects, kept honest by a conformance check. */
interface BaseRow {
  readonly agentId: string;
  readonly buildings: Readonly<Record<string, number>>;
  readonly updatedAt: string;
}

export class DrizzleWorldRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  /**
   * Undefined for a character who has never opened a base, and NOT an empty one.
   *
   * The distinction is the whole content of M5. A repository that synthesised an
   * empty base here would make "has never built anything" and "nobody has heard
   * of this character" the same answer, and a client drawing a city would show
   * an empty plot for a character who does not exist.
   */
  async find(agentId: string): Promise<BaseRow | undefined> {
    const [row] = await this.#database
      .select({
        buildingsJson: agentBases.buildingsJson,
        updatedAt: agentBases.updatedAt,
      })
      .from(agentBases)
      .where(eq(agentBases.agentId, agentId))
      .limit(1);
    if (row === undefined) {
      return undefined;
    }
    return {
      agentId,
      buildings: row.buildingsJson,
      // The STORED instant, formatted once here rather than at each read.
      // Returning a Date and letting the feature format it would put the format
      // in two places, and the cold-restart test compares this value across a
      // process boundary.
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Create the base if this is the first time, then read it back.
   *
   * `onConflictDoNothing` rather than an upsert, because a concurrent second
   * caller must not overwrite buildings the first one just raised. The read-back
   * afterwards is what makes the return the row that is actually stored, which
   * is the one a caller should reason about.
   */
  async ensure(agentId: string, now: string): Promise<BaseRow> {
    await this.#database
      .insert(agentBases)
      .values({ agentId, buildingsJson: {}, updatedAt: new Date(now) })
      .onConflictDoNothing({ target: agentBases.agentId });

    const existing = await this.find(agentId);
    if (existing === undefined) {
      // Reached when the agent existed and was deleted between the insert and
      // this read. The foreign key is what normally refuses a base for something
      // that was never an agent, and it refuses it by throwing from the query —
      // not silently, which is why this is a race and not the main guard.
      throw new Error(`a base for ${agentId} was removed while it was being created`);
    }
    return existing;
  }

  /**
   * Write the whole building map back.
   *
   * The map rather than a delta, and absolute levels rather than increments. A
   * `+1` would make the stored number correct only relative to what was there
   * before, which is precisely the in-memory-relative state M5's cold-restart
   * test exists to rule out: what is in this row has to BE the base, with
   * nothing held anywhere else that a restart would lose.
   */
  async save(input: {
    agentId: string;
    buildings: Readonly<Record<string, number>>;
    now: string;
  }): Promise<void> {
    await this.#database
      .update(agentBases)
      .set({ buildingsJson: { ...input.buildings }, updatedAt: new Date(input.now) })
      .where(eq(agentBases.agentId, input.agentId));
  }
}
