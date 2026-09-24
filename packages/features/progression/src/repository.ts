import type { AgentProgress, NewProgress } from './domain.js';

/**
 * How progression stores what a character has earned, without naming a database.
 *
 * Same reasoning as every other feature's repository: the feature may not import
 * drizzle or anything else in `infrastructure`, so it states what it needs and
 * the wiring supplies it. The store cannot import this file either, so the two
 * sides agree on plain shapes rather than on classes.
 *
 * The agent id is not ownership-scoped the way the agent feature's repository
 * is, and that is worth being explicit about: this record is keyed by agent id
 * alone because the caller reaching it has already been authenticated as that
 * installation, and every read is therefore already behind an authorization
 * decision made one layer up. A future direct-to-agents API would have to add
 * the owner here, and doing so is easier now than retrofitting.
 */
export interface ProgressionRepository {
  find(agentId: string): Promise<AgentProgress | undefined>;

  /**
   * Creates the record, or returns the existing one.
   *
   * Both outcomes are normal: two events for the same agent arriving together
   * must not produce two records, and "the first one wins" is the same answer
   * whichever request lost.
   */
  ensure(progress: NewProgress, now: string): Promise<AgentProgress>;

  save(progress: AgentProgress): Promise<void>;
}

/** Raised when a caller asks about an agent that has no progress record. */
export const NO_SUCH_PROGRESS = 'no-such-progress';

export function isNoSuchProgress(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === NO_SUCH_PROGRESS
  );
}
