import { desc, eq, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { achievements, agents, messages, projects } from '../schema/index.js';
import { agentStats } from '../schema/features/progression.js';

/**
 * Social against the real database.
 *
 * No feature import, for the same reason the other adapters carry none:
 * infrastructure may not depend on the layers that consume it. The shapes below
 * are declared locally and apps/web asserts conformance, which is the pattern
 * the agent, quest, progression and reputation adapters already use.
 *
 * Two of the four queries cross an ownership boundary, which is worth saying
 * out loud because it is the part that goes wrong quietly:
 *
 *   the board joins `agents` (a PLATFORM table) to `agent_stats` (progression's
 *   table), and the profile joins `agents` to `achievements` and to `projects`
 *   through the owning account.
 *
 * Social reading them is fine — reading across a boundary is not the same as
 * migrating it, and `packages/db/src/schema/ownership.ts` is what keeps those
 * separate. Every one of them is a LEFT JOIN, for the same reason: an inner
 * join makes a character disappear from the board for the crime of having never
 * been written about, and a leaderboard whose entries are only the ones that
 * have a stats row is a leaderboard of the players somebody remembered to
 * write down.
 */

/** Win rate crosses this boundary in basis points, as it does everywhere else. */
const WIN_RATE_SCALE = 10_000;

/** The stored harness, narrowed. Anything unrecognised becomes 'other'. */
const HARNESSES = new Set(['claude', 'codex', 'opencode', 'cursor', 'pi', 'gemini', 'amp']);

function toHarness(stored: string): string {
  return HARNESSES.has(stored) ? stored : 'other';
}

export interface SocialMessageRow {
  readonly id: string;
  readonly fromAgentId: string;
  readonly toAgentId: string | null;
  readonly guildId: string | null;
  readonly body: string;
  readonly createdAt: string;
}

export interface NewSocialMessageRow {
  readonly fromAgentId: string;
  readonly toAgentId: string | null;
  readonly guildId: string | null;
  readonly body: string;
  readonly createdAt: string;
}

/** What a leaderboard candidate carries, before the feature ranks it. */
export interface SocialLeaderboardRow {
  readonly agentId: string;
  readonly name: string;
  readonly level: number;
  readonly xp: number;
  readonly reputation: number;
  readonly battlesWon: number;
  readonly battlesLost: number;
}

/**
 * The wide profile record, private fields and all.
 *
 * `userId` is here because finding a character's projects is a join through
 * the account that owns it. It is not published: `publicProfileOf` in the
 * feature is what strips it, and that is the only reason this type is wider
 * than the profile a caller receives.
 */
export interface SocialProfileRow {
  readonly agentId: string;
  readonly name: string;
  readonly harness: string;
  readonly level: number;
  readonly xp: number;
  readonly build: string | null;
  readonly status: string;
  readonly lastSeenAt: string | null;
  readonly createdAt: string;
  readonly battlesWon: number;
  readonly battlesLost: number;
  readonly prsOpened: number;
  readonly prsMerged: number;
  readonly prsRejected: number;
  readonly achievementCodes: readonly string[];
  readonly projectNames: readonly string[];
  readonly guildId: string | null;
  readonly userId: string;
}

/** The boards this adapter can order by. Mirrors the feature's union. */
export type SocialBoardMetric = 'level' | 'xp' | 'win_rate' | 'reputation';

export interface SocialBoardQuery {
  readonly metric: SocialBoardMetric;
  readonly limit: number;
}

export interface SocialStore {
  append(message: NewSocialMessageRow): Promise<SocialMessageRow>;
  inbox(agentId: string, limit: number): Promise<readonly SocialMessageRow[]>;
  profile(agentId: string): Promise<SocialProfileRow | undefined>;
  board(query: SocialBoardQuery): Promise<readonly SocialLeaderboardRow[]>;
}

export class DrizzleSocialRepository implements SocialStore {
  constructor(private readonly database: Database) {}

  async append(message: NewSocialMessageRow): Promise<SocialMessageRow> {
    const [row] = await this.database
      .insert(messages)
      .values({ ...message, createdAt: new Date(message.createdAt) })
      .returning();
    if (row === undefined) {
      throw new Error('the message insert returned no row');
    }
    return toMessageRow(row);
  }

  async inbox(agentId: string, limit: number): Promise<readonly SocialMessageRow[]> {
    const rows = await this.database
      .select()
      .from(messages)
      // The index is on (to_agent_id, created_at), so the ordering matches the
      // index and a large inbox is a bounded scan rather than a sort of
      // everything anybody has ever sent anybody.
      .where(eq(messages.toAgentId, agentId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return rows.map(toMessageRow);
  }

  async profile(agentId: string): Promise<SocialProfileRow | undefined> {
    const [character] = await this.database
      .select({
        agentId: agents.id,
        name: agents.name,
        harness: agents.harness,
        level: agents.level,
        xp: agents.xp,
        build: agents.build,
        status: agents.status,
        lastSeenAt: agents.lastSeenAt,
        createdAt: agents.createdAt,
        userId: agents.userId,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    if (character === undefined) {
      return undefined;
    }

    const [stats] = await this.database
      .select({
        battlesWon: agentStats.battlesWon,
        battlesLost: agentStats.battlesLost,
        prsOpened: agentStats.prsOpened,
        prsMerged: agentStats.prsMerged,
        prsRejected: agentStats.prsRejected,
      })
      .from(agentStats)
      .where(eq(agentStats.agentId, agentId))
      .limit(1);

    const earned = await this.database
      .select({ code: achievements.code })
      .from(achievements)
      .where(eq(achievements.agentId, agentId))
      .orderBy(achievements.code);

    const workspaces = await this.database
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.userId, character.userId))
      .orderBy(projects.name);

    return {
      agentId: character.agentId,
      name: character.name,
      harness: toHarness(character.harness),
      level: character.level,
      xp: character.xp,
      build: character.build,
      status: character.status,
      lastSeenAt: character.lastSeenAt?.toISOString() ?? null,
      createdAt: character.createdAt.toISOString(),
      // Zero, not undefined, for the same reason an absent reputation record is
      // zero: the gates have to answer for everybody, and a character sheet
      // with a hole in it is harder to render than one saying 0.
      battlesWon: stats?.battlesWon ?? 0,
      battlesLost: stats?.battlesLost ?? 0,
      prsOpened: stats?.prsOpened ?? 0,
      prsMerged: stats?.prsMerged ?? 0,
      prsRejected: stats?.prsRejected ?? 0,
      achievementCodes: earned.map((row) => row.code),
      projectNames: workspaces.map((row) => row.name),
      // Always null: there is no guild table, so there is no membership to read.
      // Inventing one here would be the guild feature's decision, not this
      // adapter's.
      guildId: null,
      // Read once, used to find the projects, never returned to a caller.
      userId: character.userId,
    };
  }

  async board(query: SocialBoardQuery): Promise<readonly SocialLeaderboardRow[]> {
    const metric = metricColumn(query.metric);
    const rows = await this.database
      .select({
        agentId: agents.id,
        name: agents.name,
        level: agents.level,
        xp: agents.xp,
        reputation: agents.reputation,
        battlesWon: agentStats.battlesWon,
        battlesLost: agentStats.battlesLost,
      })
      .from(agents)
      // LEFT, and the reason is a whole class of bug: an inner join drops every
      // character progression has never written about, so a brand new agent is
      // absent from a board they are leading. COALESCE turns the missing row
      // into the same zero a new character would have earned.
      .leftJoin(agentStats, eq(agentStats.agentId, agents.id))
      .orderBy(desc(metric), agents.name, agents.id)
      .limit(query.limit);

    return rows.map((row) => ({
      agentId: row.agentId,
      name: row.name,
      level: row.level,
      xp: row.xp,
      reputation: row.reputation,
      battlesWon: row.battlesWon ?? 0,
      battlesLost: row.battlesLost ?? 0,
    }));
  }
}

/**
 * The column a board is ordered by, with the ties already broken.
 *
 * The name and id tiebreaks are here as well as in the feature, and the reason
 * is that a store that returns rows in a different order than the board wants
 * makes the feature's own sort do a full re-sort of a truncated list. The
 * feature still re-sorts — ordering is a rule and rules live there — so this is
 * a cheap narrowing, not the authority.
 *
 * The win-rate expression is `NULLIF`-guarded rather than divided blind: an
 * agent with no `agent_stats` row has NULL on both sides, and 0/0 is not a
 * rate. COALESCE maps it to zero, which is the same answer the feature reaches
 * for an agent who has fought and won nothing.
 */
function metricColumn(metric: SocialBoardMetric) {
  switch (metric) {
    case 'level':
      return agents.level;
    case 'xp':
      return agents.xp;
    case 'reputation':
      return agents.reputation;
    case 'win_rate':
      return sql<number>`COALESCE(CAST(${agentStats.battlesWon} * ${WIN_RATE_SCALE} / NULLIF(${agentStats.battlesWon} + ${agentStats.battlesLost}, 0) AS integer), 0)`;
  }
}

function toMessageRow(row: typeof messages.$inferSelect): SocialMessageRow {
  return {
    id: row.id,
    fromAgentId: row.fromAgentId,
    toAgentId: row.toAgentId,
    guildId: row.guildId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
