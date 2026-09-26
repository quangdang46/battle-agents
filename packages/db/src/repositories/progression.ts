import { eq } from 'drizzle-orm';

import { agentStats, type AgentSkills } from '../schema/features/progression.js';
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
 * every surface reads them without joining. The build, the skill map and the
 * award history are on `agent_stats`, because they are the feature's own state
 * and nothing else needs them. A repository that looked in one table for the
 * whole record would be simpler and wrong.
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

/**
 * The eight skills, spelled out for the same reason the builds are.
 *
 * A stored map is a `Record<string, number>`, and handing that to a feature
 * whose own type names its eight disciplines is a compile error rather than a
 * narrowing — the difference between a record this adapter knows the shape of
 * and a blob it forwards and hopes for. Spelling them out is what makes
 * composition.ts refuse to build when a skill is added to the feature and not
 * here, which is the whole point of the duplication.
 */
const SKILL_NAMES = [
  'coding',
  'debugging',
  'testing',
  'research',
  'refactoring',
  'security',
  'documentation',
  'collaboration',
] as const;

type SkillName = (typeof SKILL_NAMES)[number];

function isSkillName(value: string | undefined): value is SkillName {
  return value !== undefined && (SKILL_NAMES as readonly string[]).includes(value);
}

/**
 * The stored map, narrowed to the eight and defaulted where it is missing.
 *
 * Two things happen here that a pass-through would not. An unknown key is
 * dropped, so a skill a newer build wrote cannot come back as a claim this one
 * has never heard of, and a key that is absent reads as zero rather than as
 * undefined, so a row written before the model landed is complete on the way out
 * instead of needing every consumer to know that it might not be.
 */
function readSkills(stored: AgentSkills | undefined): Record<SkillName, number> {
  // `Object.fromEntries` is typed `{ [k: string]: any }` and there is no way to
  // hand it a key union, so this is the one cast in the file and it is at the
  // only place TypeScript cannot be asked. The loop below then proves every key
  // is a number.
  const skills = Object.fromEntries(SKILL_NAMES.map((skill) => [skill, 0])) as Record<
    SkillName,
    number
  >;
  for (const [name, value] of Object.entries(stored ?? {})) {
    if (isSkillName(name) && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      skills[name] = value;
    }
  }
  return skills;
}

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
  /**
   * Experience per skill, counted and not levelled. The feature owns the curve
   * that turns a count into a level, so storing a level here would be a second
   * copy of a number the feature can retune, and the drift between them would be
   * invisible. The eight names are spelled out above for the same reason the
   * builds are, and a stored map is narrowed to them on the way out.
   */
  readonly skills: Readonly<Record<SkillName, number>>;
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
      .select({ xp: agents.xp, level: agents.level, createdAt: agents.createdAt })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    if (agent === undefined) return undefined;

    const [stats] = await this.database
      .select({
        skillsJson: agentStats.skillsJson,
        historyJson: agentStats.historyJson,
        build: agentStats.build,
        updatedAt: agentStats.updatedAt,
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
      // Narrowed to the eight, so a key a newer build wrote cannot come back as
      // a claim this one has never heard of, and a row with no skills at all
      // leaves here complete rather than as a map with holes in it.
      skills: readSkills(stats?.skillsJson),
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
      // The stats row is absent until the first award, so the agent's own
      // creation is the answer then. A progress record that has never been
      // written has never been updated, and the alternative — a fresh Date() —
      // is what made this field read time and moved on every call.
      updatedAt: (stats?.updatedAt ?? agent.createdAt).toISOString(),
    };
  }

  /**
   * Creates the stats row, or returns the one already there.
   *
   * The conflict target is the point: two awards for one agent arriving together
   * must produce one row, and "first one wins" is the same answer whichever
   * request lost. Read-then-write has a gap in it that only opens under
   * concurrency, which is the only time it matters.
   *
   * The insert carries the caller's `now` rather than leaving the column on its
   * database default, so the stored clock is the one the rest of the record was
   * written against. A row created with the server's time and then updated with
   * the feature's is a timestamp that belongs to neither.
   */
  async ensure(progress: NewProgressRow, now: string): Promise<ProgressionRow> {
    await this.database
      .insert(agentStats)
      .values({ agentId: progress.agentId, updatedAt: new Date(now) })
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
        // The whole map, because the feature owns the column and always has the
        // whole map: it reads the record before every award and the only writer
        // of this field is `apply`. An earlier version left the column out of the
        // update, which was right while nothing wrote skills and would have been
        // a silent destroy the moment something did.
        skillsJson: { ...progress.skills },
        build: progress.build,
        // The column is typed as a mutable array while the feature's port hands
        // out a readonly one, so the copy is what makes the two agree. A cast
        // here would silence the compiler and nothing else.
        historyJson: [...progress.history],
        // The feature's clock, not `now()`. This is the write that makes
        // `updatedAt` a fact about the record rather than a fact about the read.
        updatedAt: new Date(progress.updatedAt),
      })
      .where(eq(agentStats.agentId, progress.agentId));
  }
}
