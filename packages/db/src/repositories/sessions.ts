import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { SessionStatus } from '../schema/index.js';
import { agents, installations, projects, sessions } from '../schema/index.js';

/**
 * Postgres storage for the session lifecycle.
 *
 * It does not import the agent feature, for the same reason the agent
 * repository does not: infrastructure may not depend on the layers that
 * consume it. The shapes here are the ones the feature's session contract
 * declares, and the composition root's call site is where the two are checked
 * against each other.
 *
 * `statusChangedAt` is not a column. It is derived: for a disconnected session
 * it is when the session stopped, which is the moment the sweeper last moved
 * it, and for the resume decision that is the only timestamp that matters.
 * Storing it would be a second source of truth for something already implied.
 */

export class DrizzleSessionRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async findOrCreateInstallation(input: {
    ownerId: string;
    installationKey: string;
    now: string;
  }): Promise<{ id: string }> {
    const [created] = await this.#database
      .insert(installations)
      .values({
        userId: input.ownerId,
        installationKey: input.installationKey,
        lastSeenAt: new Date(input.now),
      })
      .onConflictDoUpdate({
        // Scoped to the owner, matching the unique index. Targeting the bare key
        // matched any user's row, so a colliding key silently returned
        // somebody else's installation and the session built on top of it
        // pointed at their data.
        target: [installations.userId, installations.installationKey],
        // Touched on every handshake so "last seen" answers the question the
        // dashboard actually asks, which is when this machine was last in use.
        set: { lastSeenAt: new Date(input.now) },
      })
      .returning({ id: installations.id });
    return requiredId(created, 'installation');
  }

  async findAgentByName(ownerId: string, name: string): Promise<{ id: string } | undefined> {
    const [row] = await this.#database
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.userId, ownerId), eq(agents.name, name)))
      .limit(1);
    return row === undefined ? undefined : { id: row.id };
  }

  async findOrCreateProject(input: {
    ownerId: string;
    name: string;
    now: string;
  }): Promise<{ id: string }> {
    const [created] = await this.#database
      .insert(projects)
      .values({ userId: input.ownerId, name: input.name })
      .onConflictDoNothing()
      .returning({ id: projects.id });
    if (created !== undefined) {
      return { id: created.id };
    }
    // No unique index on (user, name), so a concurrent handshake can lose the
    // race and insert nothing. Falling back to a read means two handshakes
    // arriving together still agree on one project rather than diverging.
    const [existing] = await this.#database
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, input.ownerId), eq(projects.name, input.name)))
      .limit(1);
    return requiredId(existing, 'project');
  }

  async findResumableSessions(input: {
    agentId: string;
    installationId: string;
    projectId: string | null;
  }): Promise<readonly { id: string; statusChangedAt: string }[]> {
    const projectMatches =
      input.projectId === null
        ? isNull(sessions.projectId)
        : eq(sessions.projectId, input.projectId);
    const rows = await this.#database
      .select({
        id: sessions.id,
        // endedAt is set when a run stops for any reason, so it is the closest
        // thing to "when this stopped being live" that the table already holds.
        statusChangedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.agentId, input.agentId),
          eq(sessions.installationId, input.installationId),
          eq(sessions.status, 'disconnected'),
          projectMatches,
        ),
      )
      .orderBy(desc(sessions.endedAt));
    return rows
      .filter((row) => row.statusChangedAt !== null)
      .map((row) => ({ id: row.id, statusChangedAt: row.statusChangedAt!.toISOString() }));
  }

  async createSession(input: {
    agentId: string;
    installationId: string;
    projectId: string | null;
    now: string;
  }): Promise<{ id: string }> {
    const startedAt = new Date(input.now);
    const [created] = await this.#database
      .insert(sessions)
      .values({
        agentId: input.agentId,
        installationId: input.installationId,
        projectId: input.projectId,
        startedAt,
        lastHeartbeatAt: startedAt,
      })
      .returning({ id: sessions.id });
    return requiredId(created, 'session');
  }

  async markSessionActive(sessionId: string, now: string): Promise<void> {
    const at = new Date(now);
    await this.#database
      .update(sessions)
      .set({ status: 'active', endedAt: null, lastHeartbeatAt: at })
      .where(eq(sessions.id, sessionId));
  }
}

/** A sweeper over the same table, for the cron that reaps stale sessions. */
export class DrizzleSessionSweeper {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async findActiveSessions(): Promise<readonly { id: string; lastHeartbeatAt: string }[]> {
    const rows = await this.#database
      .select({
        id: sessions.id,
        lastHeartbeatAt: sessions.lastHeartbeatAt,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(eq(sessions.status, 'active'));
    return rows.map((row) => ({
      id: row.id,
      // A session that never sent a heartbeat is judged from when it started.
      // Treating the absence as "not stale" would keep a session that died
      // between being created and first reporting in alive forever.
      lastHeartbeatAt: (row.lastHeartbeatAt ?? row.startedAt).toISOString(),
    }));
  }

  async findDisconnectedSessions(): Promise<readonly { id: string; statusChangedAt: string }[]> {
    const rows = await this.#database
      .select({ id: sessions.id, endedAt: sessions.endedAt })
      .from(sessions)
      .where(eq(sessions.status, 'disconnected'));
    return rows
      .filter((row) => row.endedAt !== null)
      .map((row) => ({ id: row.id, statusChangedAt: row.endedAt!.toISOString() }));
  }

  async markSessionStatus(sessionId: string, status: SessionStatus, now: string): Promise<void> {
    // Typed, not a string. The column is text rather than a Postgres enum, so
    // nothing downstream would reject a typo: the status would be written, no
    // query would ever match it again, and the session would be stranded. The
    // cast is a no-op on a text column and is gone.
    await this.#database
      .update(sessions)
      .set({ status, endedAt: new Date(now) })
      .where(eq(sessions.id, sessionId));
  }
}

/**
 * A write that should have created a row and did not.
 *
 * Thrown rather than returned as undefined: the caller asked to create
 * something, so an absent row is a broken invariant, and continuing would hand
 * back a session id that does not exist.
 */
function requiredId(row: { id: string } | undefined, what: string): { id: string } {
  if (row === undefined) {
    throw new Error(`database returned no ${what} for a write that should have created one`);
  }
  return row;
}
