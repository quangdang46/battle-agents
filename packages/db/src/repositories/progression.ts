import { eq } from 'drizzle-orm';

import { agentStats } from '../schema/features/progression.js';
import { agents } from '../schema/index.js';
import type { ProgressionSignal } from '../schema/features/progression.js';
import type { Database } from '../client.js';

/**
 * Progression against the real database.
 *
 * This file does not import the feature that describes what it stores, because
 * infrastructure may not depend on the layers that consume it. It matches the
 * feature's `ProgressionRepository` structurally, and apps/web asserts that it
 * does — a conformance check has to live where both sides may be imported, or
 * it is not a check.
 *
 * The record spans TWO tables, which is worth knowing before reading either.
 * XP and level are columns on `agents`, because they describe the character and
 * every surface reads them without joining. The build and the award history are
 * `skills_json` on `agent_stats`, because they are the feature's own state and
 * nothing else needs them. A repository that looked in one table for the whole
 * record would be simpler and wrong.
 *
 * Types below are declared locally rather than imported, and that duplication
 * is the price of the layering rule. The conformance test is what keeps it
 * honest.
 */

/** The shape the feature's port expects, kept honest by a conformance check. */
export interface ProgressionRow {
  readonly agentId: string;
  readonly xp: number;
  readonly level: number;
  readonly build: Readonly<Record<string, number>>;
  readonly history: readonly ProgressionSignal[];
  readonly updatedAt: string;
}

export interface NewProgressRow {
  readonly agentId: string;
}

export interface ProgressionStore {
  find(agentId: string): Promise<ProgressionRow | undefined>;
  ensure(progress: NewProgressRow, now: string): Promise<ProgressionRow>;
  save(progress: ProgressionRow): Promise<void>;
}

export class DrizzleProgressionRepository implements ProgressionStore {
  constructor(private readonly database: Database) {}

  async find(agentId: string): Promise<ProgressionRow | undefined> {
    const [agent] = await this.database
      .select({ xp: agents.xp, level: agents.level })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    if (agent === undefined) return undefined;

    const [stats] = await this.database
      .select({ skillsJson: agentStats.skillsJson, historyJson: agentStats.historyJson })
      .from(agentStats)
      .where(eq(agentStats.agentId, agentId))
      .limit(1);
    return {
      agentId,
      xp: agent.xp,
      level: agent.level,
      build: stats?.skillsJson ?? {},
      history: stats?.historyJson ?? [],
      // No updated_at column exists, so this is read time. The value is the
      // feature's contract and the schema cannot yet keep it; the comment is
      // here so the gap is visible rather than implied.
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Creates the stats row, or returns the one already there.
   *
   * The conflict target is the point: two awards for one agent arriving together
   * must produce one row, and "first one wins" is the same answer whichever
   * request lost. Read-then-write has a gap in it that only opens under
   * concurrency, which is the only time it matters.
   */
  async ensure(progress: NewProgressRow, now: string): Promise<ProgressionRow> {
    await this.database
      .insert(agentStats)
      .values({ agentId: progress.agentId })
      .onConflictDoNothing({ target: agentStats.agentId });

    const existing = await this.find(progress.agentId);
    if (existing === undefined) {
      // Reached only when the agent existed and was deleted between the insert
      // and this read. The foreign key is what normally refuses a progress row
      // for something that was never an agent, and it refuses it by throwing
      // from the query — not silently, which is why this branch is a race and
      // not the main guard.
      throw new Error(`progression for ${progress.agentId} was removed while it was being created`);
    }
    return { ...existing, updatedAt: now };
  }

  async save(progress: ProgressionRow): Promise<void> {
    await this.database
      .update(agents)
      .set({ xp: progress.xp, level: progress.level })
      .where(eq(agents.id, progress.agentId));

    await this.database
      .update(agentStats)
      .set({
        skillsJson: progress.build,
        // The column is typed as a mutable array while the feature's port hands
        // out a readonly one, so the copy is what makes the two agree. A cast
        // here would silence the compiler and nothing else.
        historyJson: [...progress.history],
      })
      .where(eq(agentStats.agentId, progress.agentId));
  }
}
