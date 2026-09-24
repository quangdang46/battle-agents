import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import type { Database } from '../client.js';
import { agentCredentials } from '../schema/index.js';

/**
 * Postgres storage for agent credentials.
 *
 * It cannot import the agent feature — infrastructure may not depend on the
 * layers that consume it — so the shapes here are the ones that feature's
 * credential contract declares, and the composition root's call site is where
 * the two are checked against each other.
 *
 * Every read and write is by hash. There is no query anywhere in this file that
 * could return a token, because there is no column that holds one.
 */

export interface StoredCredential {
  readonly id: string;
  readonly tokenHash: string;
  readonly installationId: string;
  readonly agentId: string | null;
  readonly scopes: readonly string[];
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface NewStoredCredential {
  readonly id: string;
  readonly tokenHash: string;
  readonly installationId: string;
  readonly agentId: string | null;
  readonly scopes: readonly string[];
  readonly expiresAt: string | null;
}

export class DrizzleCredentialStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async findByHash(tokenHash: string): Promise<StoredCredential | undefined> {
    const [row] = await this.#database
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.tokenHash, tokenHash))
      .limit(1);
    return row === undefined ? undefined : toCredential(row);
  }

  async findById(id: string): Promise<StoredCredential | undefined> {
    const [row] = await this.#database
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.id, id))
      .limit(1);
    return row === undefined ? undefined : toCredential(row);
  }

  async insert(credential: NewStoredCredential): Promise<void> {
    await this.#database.insert(agentCredentials).values({
      id: credential.id,
      tokenHash: credential.tokenHash,
      installationId: credential.installationId,
      agentId: credential.agentId,
      scopes: [...credential.scopes],
      expiresAt: credential.expiresAt === null ? null : new Date(credential.expiresAt),
    });
  }

  /**
   * Immediate revocation.
   *
   * Sets revoked_at rather than deleting the row. The row is the record that
   * this credential existed and when it stopped working, and a token that
   * simply vanished is indistinguishable from one that was never issued.
   */
  async revoke(id: string, now: string): Promise<void> {
    await this.#database
      .update(agentCredentials)
      .set({ revokedAt: new Date(now) })
      .where(eq(agentCredentials.id, id));
  }

  async listForInstallation(installationId: string): Promise<readonly StoredCredential[]> {
    const rows = await this.#database
      .select()
      .from(agentCredentials)
      .where(eq(agentCredentials.installationId, installationId))
      .orderBy(desc(agentCredentials.createdAt));
    return rows.map(toCredential);
  }

  /**
   * Revokes every live credential for an installation except `keepId`.
   *
   * This is what makes rotation free of downtime: the replacement is issued and
   * usable before this runs, and the old one stops working the moment it does.
   * Revoking first and issuing second would leave a window with neither.
   */
  async revokeAllExcept(installationId: string, keepId: string, now: string): Promise<number> {
    const revoked = await this.#database
      .update(agentCredentials)
      .set({ revokedAt: new Date(now) })
      .where(
        and(
          eq(agentCredentials.installationId, installationId),
          isNull(agentCredentials.revokedAt),
          // The replacement is excluded, or rotation would revoke the token it
          // just issued and leave the installation with nothing that works.
          ne(agentCredentials.id, keepId),
        ),
      )
      .returning({ id: agentCredentials.id });
    return revoked.length;
  }
}

type CredentialRow = typeof agentCredentials.$inferSelect;

function toCredential(row: CredentialRow): StoredCredential {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    installationId: row.installationId,
    agentId: row.agentId,
    scopes: row.scopes,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}
