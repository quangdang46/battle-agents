import { eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import { installations, users } from '../schema/index.js';

/**
 * Which human an installation belongs to.
 *
 * The one question a credential cannot answer about itself. `authenticate`
 * resolves a presented token to an `installations` row and hands the transport
 * an `installationId`; everything downstream that needs to know WHO is calling
 * has to ask this table, because `installations.user_id` is the only column in
 * the schema that connects a Bearer credential to a `users` row.
 *
 * A JOIN rather than a follow-up read, and the two are not equivalent. Reading
 * the installation and then the user is two round trips whose intermediate
 * answer can be acted on; one statement cannot be observed half-finished, and a
 * caller cannot be told a user exists by a route that never looked.
 *
 * It belongs here rather than in the session repository, which writes
 * installations but knows nothing about ownership: a "who owns this" question
 * answered by a store whose job is runs would be a second place to look for the
 * rule that an installation has exactly one owner.
 */

/** The human behind an installation, as the `users` row names them. */
export interface InstallationOwner {
  readonly userId: string;
  /** The GitHub login. Carried because a funding record is read by a person. */
  readonly login: string;
}

export class DrizzleInstallationRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  /**
   * The owner, or undefined for an installation that does not exist.
   *
   * `users.id` is the primary key of the join's far side and
   * `installations.user_id` is NOT NULL, so a real installation always has an
   * owner and the `undefined` is only ever "no such installation". The
   * signature is honest about that rather than typed non-optional, because a
   * caller that reached this with an id from an unverified payload is exactly
   * the case where a non-optional return would be a lie at runtime.
   */
  async findOwner(installationId: string): Promise<InstallationOwner | undefined> {
    const [row] = await this.#database
      .select({ userId: users.id, login: users.login })
      .from(installations)
      .innerJoin(users, eq(users.id, installations.userId))
      .where(eq(installations.id, installationId))
      .limit(1);
    return row;
  }
}
