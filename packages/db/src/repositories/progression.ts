import { eq } from 'drizzle-orm';

import { agentStats } from '../schema/features/progression.js';
import { agents } from '../schema/index.js';
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
export /**
 * The builds a character can be, spelled out rather than imported.
 *
 * The duplication is the price of the layering rule: this package may not
 * import the feature that declares the union. Spelling it out is honest about
 * that, where a cast to `string` would be a claim that the two can drift
 * freely. If a build is added to the feature and not here, the conformance
 * check in apps/web fails — which is the point of spelling it out.
 */
type BuildName =
  | 'generalist'
  | 'debugger'
  | 'researcher'
  | 'builder'
  | 'tester'
  | 'refactorer'
  | 'security'
  | 'infrastructure';

const DEFAULT_BUILD: BuildName = 'generalist';

const BUILD_NAMES: ReadonlySet<string> = new Set<BuildName>([
  'generalist',
  'debugger',
  'researcher',
  'builder',
  'tester',
  'refactorer',
  'security',
  'infrastructure',
]);

/** One recorded award with its build narrowed. */
interface StoredSignal {
  readonly build: Exclude<BuildName, 'generalist'>;
  readonly weight: number;
  readonly at: string;
}

function isBuildName(value: string | undefined): value is BuildName {
  return value !== undefined && BUILD_NAMES.has(value);
}

export interface ProgressionRow {
  readonly agentId: string;
  readonly xp: number;
  readonly level: number;
  readonly build: BuildName;
  readonly history: readonly StoredSignal[];
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
      .select({
        skillsJson: agentStats.skillsJson,
        historyJson: agentStats.historyJson,
        build: agentStats.build,
      })
      .from(agentStats)
      .where(eq(agentStats.agentId, agentId))
      .limit(1);
    return {
      agentId,
      xp: agent.xp,
      level: agent.level,
      // Narrowed rather than cast: a row can only hold one of the names the
      // column's default is drawn from, and a value outside the union is a
      // stored corruption that a cast would pass along as a valid build.
      build: isBuildName(stats?.build) ? stats.build : DEFAULT_BUILD,
      // Narrowed for the same reason the build is: a stored signal naming a
      // build that no longer exists is corruption, and passing it through as a
      // valid Specialist would make the classifier trust it.
      history: (stats?.historyJson ?? [])
        .filter((signal) => isBuildName(signal.build))
        .map((signal) => ({
          build: signal.build as Exclude<BuildName, 'generalist'>,
          weight: signal.weight,
          at: signal.at,
        })),
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
        // `skills_json` is deliberately absent. The column holds a skill map
        // that `ProgressionRow` does not carry, so a save has nothing to say
        // about it — and writing `{}` on every award destroys the map the
        // instant anything populates it. Leaving the column out of the update
        // is what "the feature does not own this" has to mean in SQL.
        build: progress.build,
        // The column is typed as a mutable array while the feature's port hands
        // out a readonly one, so the copy is what makes the two agree. A cast
        // here would silence the compiler and nothing else.
        historyJson: [...progress.history],
      })
      .where(eq(agentStats.agentId, progress.agentId));
  }
}
