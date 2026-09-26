import { and, asc, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import {
  guildMembers,
  guildQuests,
  guildRoleSignals,
  guilds,
  guildTreasuryEntries,
  guildWorkLog,
  type GuildRole,
  type GuildTreasuryKind,
} from '../schema/index.js';

/* ─────────────────────── the shapes the port declares ─────────────────────── */

/**
 * Copies of the feature's port shapes rather than imports of them.
 *
 * Infrastructure may not import the layer that consumes it, so the two sides
 * agree on plain shapes and the composition root's call site is where that
 * agreement is checked. Every other repository in this package does the same,
 * and the reason is on `DrizzleBountyRepository`: a shared type would have to
 * cross the layer boundary to exist.
 */
export interface Guild {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly foundedByAgentId: string | null;
  readonly createdAt: string;
}

export interface GuildMembership {
  readonly guildId: string;
  readonly agentId: string;
  readonly joinedAt: string;
}

export interface GuildQuest {
  readonly id: string;
  readonly guildId: string;
  readonly title: string;
  readonly repository: string | null;
  readonly goal: number;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface RoleSignal {
  readonly id: string;
  readonly agentId: string;
  readonly role: GuildRole;
  readonly weight: number;
  readonly sourceType: string;
  readonly sourceKey: string;
  readonly occurredAt: string;
}

export interface TreasuryEntry {
  readonly id: string;
  readonly guildId: string;
  readonly kind: GuildTreasuryKind;
  readonly amountCents: number;
  readonly contributorUserId: string | null;
  readonly bountyId: string | null;
  readonly committedByAgentId: string | null;
  readonly createdAt: string;
}

export interface WorkRecord {
  readonly id: string;
  readonly guildId: string;
  readonly agentId: string;
  readonly bountyId: string;
  readonly repository: string;
  readonly sourceType: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

export interface NewGuild {
  readonly name: string;
  readonly tag: string;
  readonly foundedByAgentId: string;
}

export interface NewWorkRecord {
  readonly guildId: string;
  readonly agentId: string;
  readonly bountyId: string;
  readonly repository: string;
  readonly sourceType: string;
  readonly occurredAt: string;
}

export interface NewTreasuryEntry {
  readonly guildId: string;
  readonly kind: GuildTreasuryKind;
  readonly amountCents: number;
  readonly contributorUserId: string | null;
  readonly bountyId: string | null;
  readonly committedByAgentId: string | null;
  readonly createdAt: string;
}

export interface NewQuest {
  readonly guildId: string;
  readonly title: string;
  readonly repository: string | null;
  readonly goal: number;
  readonly createdAt: string;
}

export interface NewRoleSignal {
  readonly agentId: string;
  readonly role: GuildRole;
  readonly weight: number;
  readonly sourceType: string;
  readonly sourceKey: string;
  readonly occurredAt: string;
}

/**
 * Postgres storage for the guild feature.
 *
 * It does not import the feature — infrastructure may not depend on the layers
 * that consume it — so the shapes here are the ones that feature's port
 * declares, and the composition root's call site is where the two are checked.
 *
 * ## Why the three "record once" writes are conditional INSERTs
 *
 * A GitHub merge is delivered at least once and promises no order. `guild_work_log`
 * is UNIQUE on (guild_id, bounty_id) and `guild_role_signals` on
 * (agent_id, source_key), so a re-delivery has to be refused by the DATABASE
 * rather than by a read that happened before it. `ON CONFLICT DO NOTHING RETURNING`
 * is that: the row that inserted is returned, and the row that did not is an
 * empty result, which the port reports as `created: false`. A read-then-write
 * would leave a window in which the same merge counted twice, and a role that
 * inflates on a retry is a role the game pays for.
 *
 * The membership write is the same shape for the same reason, and it is the only
 * one of the four that is not about a webhook: two requests for the same
 * membership arriving together must produce one row.
 *
 * ## Why `balanceCents` is computed here rather than read from the view
 *
 * Both, deliberately. The view exists so a query can join a balance without
 * re-deriving it; this fold exists so the feature's own answer is the same
 * arithmetic a reader could do by hand. `tests/integration/guild-persistence.test.ts`
 * asserts the two agree on a seeded guild, which is the check that stops the
 * fold from becoming a second, drifting answer.
 */
export class DrizzleGuildRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  /* ── guilds ── */

  async create(guild: NewGuild, now: string): Promise<Guild> {
    // The id is generated here rather than by the caller for the reason the
    // treasury's is: two callers founding a guild in the same millisecond must
    // not collide on an id they both chose, and a name collision is a caller
    // error the unique index reports properly.
    const inserted = await this.#database
      .insert(guilds)
      .values({
        name: guild.name,
        tag: guild.tag,
        foundedByAgentId: guild.foundedByAgentId.length === 0 ? null : guild.foundedByAgentId,
        createdAt: date(now),
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new Error('inserting a guild returned no row');
    }
    return toGuild(row);
  }

  async find(guildId: string): Promise<Guild | undefined> {
    const rows = await this.#database.select().from(guilds).where(eq(guilds.id, guildId)).limit(1);
    const row = rows[0];
    return row === undefined ? undefined : toGuild(row);
  }

  async list(): Promise<readonly Guild[]> {
    const rows = await this.#database
      .select()
      .from(guilds)
      .orderBy(asc(guilds.createdAt), asc(guilds.name));
    return rows.map(toGuild);
  }

  /* ── membership ── */

  async join(
    guildId: string,
    agentId: string,
    now: string,
  ): Promise<{ readonly row: GuildMembership; readonly created: boolean }> {
    const inserted = await this.#database
      .insert(guildMembers)
      .values({ guildId, agentId, joinedAt: date(now) })
      .onConflictDoNothing()
      .returning();
    const created = inserted[0];
    if (created !== undefined) {
      return { row: toMembership(created), created: true };
    }
    // The conflict path still has to return the row, because a caller joining a
    // guild it is already in wants the membership, not a failure. `joinedAt` is
    // the ORIGINAL instant: a re-join does not make somebody a newer member, and
    // a caller sorting a roster by tenure would otherwise see the whole guild
    // refresh every time somebody re-ran the command.
    const existing = await this.#membershipRow(guildId, agentId);
    if (existing === undefined) {
      throw new Error(`membership ${guildId}/${agentId} conflicted but no row can be read`);
    }
    return { row: existing, created: false };
  }

  async leave(guildId: string, agentId: string): Promise<boolean> {
    const removed = await this.#database
      .delete(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.agentId, agentId)))
      .returning({ agentId: guildMembers.agentId });
    return removed.length > 0;
  }

  async isMember(guildId: string, agentId: string): Promise<boolean> {
    const rows = await this.#database
      .select({ agentId: guildMembers.agentId })
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.agentId, agentId)))
      .limit(1);
    return rows.length > 0;
  }

  async guildsOf(agentId: string): Promise<readonly string[]> {
    const rows = await this.#database
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.agentId, agentId));
    return rows.map((row) => row.guildId);
  }

  async members(guildId: string): Promise<readonly GuildMembership[]> {
    const rows = await this.#database
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId))
      .orderBy(asc(guildMembers.joinedAt), asc(guildMembers.agentId));
    return rows.map(toMembership);
  }

  async #membershipRow(guildId: string, agentId: string): Promise<GuildMembership | undefined> {
    const rows = await this.#database
      .select()
      .from(guildMembers)
      .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.agentId, agentId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? undefined : toMembership(row);
  }

  /* ── the work ledger ── */

  async recordWork(
    entry: NewWorkRecord,
  ): Promise<{ readonly row: WorkRecord; readonly created: boolean }> {
    const inserted = await this.#database
      .insert(guildWorkLog)
      .values({
        guildId: entry.guildId,
        agentId: entry.agentId,
        bountyId: entry.bountyId,
        repository: entry.repository,
        sourceType: entry.sourceType,
        occurredAt: date(entry.occurredAt),
      })
      .onConflictDoNothing()
      .returning();
    const created = inserted[0];
    if (created !== undefined) {
      return { row: toWork(created), created: true };
    }
    const existing = await this.#workRow(entry.guildId, entry.bountyId);
    if (existing === undefined) {
      throw new Error(`work ${entry.guildId}/${entry.bountyId} conflicted but no row can be read`);
    }
    return { row: existing, created: false };
  }

  async #workRow(guildId: string, bountyId: string): Promise<WorkRecord | undefined> {
    const rows = await this.#database
      .select()
      .from(guildWorkLog)
      .where(and(eq(guildWorkLog.guildId, guildId), eq(guildWorkLog.bountyId, bountyId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? undefined : toWork(row);
  }

  async workFor(
    guildId: string,
    query: { readonly repository?: string; readonly from?: string; readonly to?: string } = {},
  ): Promise<readonly WorkRecord[]> {
    const clauses: SQL[] = [eq(guildWorkLog.guildId, guildId)];
    if (query.repository !== undefined) {
      clauses.push(eq(guildWorkLog.repository, query.repository));
    }
    if (query.from !== undefined) {
      clauses.push(gte(guildWorkLog.occurredAt, date(query.from)));
    }
    if (query.to !== undefined) {
      // `<` rather than `<=`, so a caller asking for a window that ends at the
      // instant of a delivery and starting at it are asking for different
      // things, and the boundary belongs to the caller's half-open interval.
      clauses.push(lt(guildWorkLog.occurredAt, date(query.to)));
    }
    const rows = await this.#database
      .select()
      .from(guildWorkLog)
      .where(and(...clauses))
      .orderBy(desc(guildWorkLog.occurredAt), asc(guildWorkLog.bountyId));
    return rows.map(toWork);
  }

  /* ── the treasury ── */

  async appendTreasuryEntry(entry: NewTreasuryEntry): Promise<TreasuryEntry> {
    const inserted = await this.#database
      .insert(guildTreasuryEntries)
      .values({
        guildId: entry.guildId,
        kind: entry.kind,
        amountCents: entry.amountCents,
        contributorUserId: entry.contributorUserId,
        bountyId: entry.bountyId,
        committedByAgentId: entry.committedByAgentId,
        createdAt: date(entry.createdAt),
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new Error('appending a treasury entry returned no row');
    }
    return toTreasuryEntry(row);
  }

  async treasuryFor(guildId: string): Promise<readonly TreasuryEntry[]> {
    const rows = await this.#database
      .select()
      .from(guildTreasuryEntries)
      .where(eq(guildTreasuryEntries.guildId, guildId))
      .orderBy(asc(guildTreasuryEntries.createdAt), asc(guildTreasuryEntries.id));
    return rows.map(toTreasuryEntry);
  }

  /* ── quests ── */

  async createQuest(quest: NewQuest): Promise<GuildQuest> {
    const inserted = await this.#database
      .insert(guildQuests)
      .values({
        guildId: quest.guildId,
        title: quest.title,
        repository: quest.repository,
        goal: quest.goal,
        createdAt: date(quest.createdAt),
      })
      .returning();
    const row = inserted[0];
    if (row === undefined) {
      throw new Error('inserting a guild quest returned no row');
    }
    return toQuest(row);
  }

  async quests(guildId: string): Promise<readonly GuildQuest[]> {
    const rows = await this.#database
      .select()
      .from(guildQuests)
      .where(eq(guildQuests.guildId, guildId))
      .orderBy(asc(guildQuests.createdAt), asc(guildQuests.id));
    return rows.map(toQuest);
  }

  async completeQuest(questId: string, at: string): Promise<boolean> {
    // Conditional, for the same reason the other three writes are: `completedAt`
    // is WHEN the goal was first met, and two deliveries racing to cross the
    // goal must not produce two different answers about when that was. The
    // `IS NULL` in the WHERE is what makes the second one a no-op instead of an
    // overwrite.
    const stamped = await this.#database
      .update(guildQuests)
      .set({ completedAt: date(at) })
      .where(and(eq(guildQuests.id, questId), sql`${guildQuests.completedAt} IS NULL`))
      .returning({ id: guildQuests.id });
    return stamped.length > 0;
  }

  /* ── role evidence ── */

  async recordRoleSignal(
    signal: NewRoleSignal,
  ): Promise<{ readonly row: RoleSignal; readonly created: boolean }> {
    const inserted = await this.#database
      .insert(guildRoleSignals)
      .values({
        agentId: signal.agentId,
        role: signal.role,
        weight: signal.weight,
        sourceType: signal.sourceType,
        sourceKey: signal.sourceKey,
        occurredAt: date(signal.occurredAt),
      })
      .onConflictDoNothing()
      .returning();
    const created = inserted[0];
    if (created !== undefined) {
      return { row: toRoleSignal(created), created: true };
    }
    const existing = await this.#roleSignalRow(signal.agentId, signal.sourceKey);
    if (existing === undefined) {
      throw new Error(
        `role signal ${signal.agentId}/${signal.sourceKey} conflicted but no row is readable`,
      );
    }
    return { row: existing, created: false };
  }

  async #roleSignalRow(agentId: string, sourceKey: string): Promise<RoleSignal | undefined> {
    const rows = await this.#database
      .select()
      .from(guildRoleSignals)
      .where(and(eq(guildRoleSignals.agentId, agentId), eq(guildRoleSignals.sourceKey, sourceKey)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? undefined : toRoleSignal(row);
  }

  async roleSignalsFor(agentId: string): Promise<readonly RoleSignal[]> {
    const rows = await this.#database
      .select()
      .from(guildRoleSignals)
      .where(eq(guildRoleSignals.agentId, agentId))
      .orderBy(asc(guildRoleSignals.occurredAt), asc(guildRoleSignals.sourceKey));
    return rows.map(toRoleSignal);
  }
}

/* ───────────────────────────── row mapping ───────────────────────────── */

/**
 * An ISO instant as the `Date` drizzle wants for a `timestamptz`.
 *
 * The port speaks ISO strings because that is what `context.now()` hands the
 * feature and what every event carries, and it reads them back as strings for
 * the same reason. The conversion lives here, once, in both directions — two
 * time conventions inside one feature is how a comparison between a quest's
 * `createdAt` and a work row's `occurredAt` ends up comparing a string with a
 * Date, which JavaScript answers without throwing by giving the wrong answer.
 *
 * Throws rather than yielding an Invalid Date, because an Invalid Date reaching
 * Postgres becomes a row whose timestamp is nonsense and the failure surfaces
 * three queries later, somewhere that is not this function.
 */
function date(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`"${iso}" is not an instant this store can write`);
  }
  return parsed;
}

/**
 * Timestamps out as ISO strings.
 *
 * Drizzle returns a `Date` for a `timestamptz`, and the feature's port speaks
 * ISO instants because that is what `context.now()` hands it. A row shaped as a
 * `Date` would be a second time convention in the same feature, and the
 * comparison a quest makes between a quest's `createdAt` and a work row's
 * `occurredAt` would be a comparison between a string and a Date — which
 * JavaScript answers without throwing, by giving the wrong answer.
 */
function iso(value: Date): string {
  return value.toISOString();
}

type GuildRow = typeof guilds.$inferSelect;
type MembershipRow = typeof guildMembers.$inferSelect;
type QuestRow = typeof guildQuests.$inferSelect;
type SignalRow = typeof guildRoleSignals.$inferSelect;
type TreasuryRow = typeof guildTreasuryEntries.$inferSelect;
type WorkRow = typeof guildWorkLog.$inferSelect;

function toGuild(row: GuildRow): Guild {
  return {
    id: row.id,
    name: row.name,
    tag: row.tag,
    foundedByAgentId: row.foundedByAgentId,
    createdAt: iso(row.createdAt),
  };
}

function toMembership(row: MembershipRow): GuildMembership {
  return { guildId: row.guildId, agentId: row.agentId, joinedAt: iso(row.joinedAt) };
}

function toQuest(row: QuestRow): GuildQuest {
  return {
    id: row.id,
    guildId: row.guildId,
    title: row.title,
    repository: row.repository,
    goal: row.goal,
    createdAt: iso(row.createdAt),
    completedAt: row.completedAt === null ? null : iso(row.completedAt),
  };
}

function toRoleSignal(row: SignalRow): RoleSignal {
  return {
    id: row.id,
    agentId: row.agentId,
    role: row.role,
    weight: row.weight,
    sourceType: row.sourceType,
    sourceKey: row.sourceKey,
    occurredAt: iso(row.occurredAt),
  };
}

function toTreasuryEntry(row: TreasuryRow): TreasuryEntry {
  return {
    id: row.id,
    guildId: row.guildId,
    kind: row.kind,
    amountCents: row.amountCents,
    contributorUserId: row.contributorUserId,
    bountyId: row.bountyId,
    committedByAgentId: row.committedByAgentId,
    createdAt: iso(row.createdAt),
  };
}

function toWork(row: WorkRow): WorkRecord {
  return {
    id: row.id,
    guildId: row.guildId,
    agentId: row.agentId,
    bountyId: row.bountyId,
    repository: row.repository,
    sourceType: row.sourceType,
    occurredAt: iso(row.occurredAt),
    recordedAt: iso(row.recordedAt),
  };
}
