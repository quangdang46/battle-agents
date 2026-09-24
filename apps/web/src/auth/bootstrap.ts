import { eq } from 'drizzle-orm';

import { users } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';

/**
 * First login creates a game account.
 *
 * Plan section 39: a new GitHub user becomes a `users` row, an empty agent list,
 * and a dashboard that asks them to connect a coding agent. This is deliberately
 * OUR code and not an auth callback, because the two are different jobs: Better
 * Auth answers "who is logged in", and this answers "does a game account exist
 * for them yet".
 *
 * The boundary that keeps them from merging is a test, not a convention: a human
 * session is never agent identity, and a game account never holds a session.
 */

/** What Better Auth knows about a signed-in person, and nothing more. */
export interface SignedInHuman {
  /** The auth library's user id. Never an agent id, never a session id. */
  readonly authUserId: string;
  readonly githubId: string;
  readonly login: string;
  readonly avatarUrl: string | null;
}

export interface GameAccount {
  readonly id: string;
  readonly githubId: string;
  readonly login: string;
  readonly avatarUrl: string | null;
  /** False when the row already existed, so a caller can skip the welcome. */
  readonly created: boolean;
}

/**
 * Finds or creates the game account for a signed-in human.
 *
 * Idempotent, because it runs on every request that needs the account and
 * returning a different account the second time would be a worse bug than a
 * redundant insert. The unique index on github_id is what actually makes the
 * race safe; this read-then-write is the common path, not the guarantee.
 */
export async function bootstrapGameAccount(
  database: Database,
  human: SignedInHuman,
): Promise<GameAccount> {
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.githubId, human.githubId))
    .limit(1);

  if (existing !== undefined) {
    return toGameAccount(existing, false);
  }

  const [created] = await database
    .insert(users)
    .values({
      githubId: human.githubId,
      login: human.login,
      avatarUrl: human.avatarUrl,
    })
    .onConflictDoNothing()
    .returning();

  if (created !== undefined) {
    return toGameAccount(created, true);
  }

  // Lost the race to a concurrent first login. Whoever won wrote the same row,
  // so read it back rather than reporting a failure the caller cannot act on.
  const [winner] = await database
    .select()
    .from(users)
    .where(eq(users.githubId, human.githubId))
    .limit(1);

  if (winner === undefined) {
    throw new Error(`could not create or find a game account for github id ${human.githubId}`);
  }
  return toGameAccount(winner, false);
}

type UserRow = typeof users.$inferSelect;

/**
 * One mapping, used by all three exits.
 *
 * The `created` flag is the only thing that differs between them, and it is
 * what lets a caller skip the welcome flow for somebody who has been here
 * before. Getting that flag wrong is the difference between greeting a
 * returning player as a new one and not.
 */
function toGameAccount(row: UserRow, created: boolean): GameAccount {
  return {
    id: row.id,
    githubId: row.githubId,
    login: row.login,
    avatarUrl: row.avatarUrl,
    created,
  };
}
