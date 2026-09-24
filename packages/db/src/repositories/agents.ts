import { and, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import { agents, installations } from '../schema/index.js';

/**
 * Postgres storage for the agent feature.
 *
 * This file does not import the feature that describes what it stores, because
 * infrastructure may not depend on the layers that consume it. It matches the
 * feature's `AgentRepository` structurally, and apps/web asserts that it does —
 * a conformance check has to live where both sides may be imported, or it is
 * just a comment.
 *
 * Every read is filtered by owner in the query itself. Fetching by id and
 * comparing the owner afterwards would be correct and slower, and would also
 * mean the only thing standing between two users' characters is a comparison
 * somebody can forget to write.
 */

const HARNESSES = new Set(['claude', 'codex', 'opencode', 'cursor', 'pi', 'gemini', 'amp']);

/** The stored harness, narrowed. Anything unrecognised becomes 'other'. */
function toHarness(stored: string): string {
  return HARNESSES.has(stored) ? stored : 'other';
}

export class DrizzleAgentRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async findOwned(ownerId: string, agentId: string): Promise<AgentRow | undefined> {
    const rows = await this.#database
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, ownerId)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? undefined : toIdentity(row);
  }

  async listForOwner(ownerId: string): Promise<readonly AgentRow[]> {
    const rows = await this.#database.select().from(agents).where(eq(agents.userId, ownerId));
    return rows.map(toIdentity);
  }

  /**
   * Throws when the agent is not the caller's. The caller cannot tell that case
   * from a missing agent, which is deliberate: an id that is real but belongs
   * to someone else must not be distinguishable from one that is not real.
   */
  async requireOwned(ownerId: string, agentId: string): Promise<AgentRow> {
    const found = await this.findOwned(ownerId, agentId);
    if (found === undefined) {
      throw storageFailure(AGENT_NOT_OWNED, `agent ${agentId} does not belong to user ${ownerId}`);
    }
    return found;
  }

  async create(
    draft: { ownerId: string; name: string; harness: string },
    now: string,
  ): Promise<AgentRow> {
    const rows = await this.#database
      .insert(agents)
      .values({
        userId: draft.ownerId,
        name: draft.name,
        harness: draft.harness,
        createdAt: new Date(now),
      })
      .onConflictDoNothing()
      .returning();
    const created = rows[0];
    if (created === undefined) {
      throw storageFailure(
        AGENT_NAME_TAKEN,
        `user ${draft.ownerId} already has an agent named "${draft.name}"`,
      );
    }
    return toIdentity(created);
  }

  async findInstallationForOwner(
    ownerId: string,
    installationId: string,
  ): Promise<StoredInstallationRow | undefined> {
    const rows = await this.#database
      .select()
      .from(installations)
      .where(and(eq(installations.id, installationId), eq(installations.userId, ownerId)))
      .limit(1);
    const row = rows[0];
    return row === undefined
      ? undefined
      : {
          id: row.id,
          ownerId: row.userId,
          installationKey: row.installationKey,
          label: row.label,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        };
  }
}

/** The shape the agent feature consumes. Declared here, checked in apps/web. */
export interface AgentRow {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly harness: string;
  readonly level: number;
  readonly xp: number;
  readonly reputation: number;
  readonly presence: string;
  readonly lastSeenAt: string | null;
  readonly createdAt: string;
}

/** The installation, in the shape the agent feature contract declares. */
export interface StoredInstallationRow {
  readonly id: string;
  readonly ownerId: string;
  readonly installationKey: string;
  readonly label: string | null;
  /** An ISO instant rather than a Date, matching the contract. */
  readonly lastSeenAt: string | null;
}

/**
 * The two failure codes the agent feature reads. They are duplicated here
 * rather than imported because the feature may not be imported from
 * infrastructure, and apps/web asserts the two lists still agree.
 */
export const AGENT_NAME_TAKEN = 'agent-name-taken';
export const AGENT_NOT_OWNED = 'agent-not-owned';

/** An error carrying the code the feature looks for, per the repository contract. */
function storageFailure(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

type AgentTableRow = typeof agents.$inferSelect;

function toIdentity(row: AgentTableRow): AgentRow {
  return {
    id: row.id,
    ownerId: row.userId,
    name: row.name,
    harness: toHarness(row.harness),
    level: row.level,
    xp: row.xp,
    reputation: row.reputation,
    presence: row.status,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
