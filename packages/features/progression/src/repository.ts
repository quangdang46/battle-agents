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
  /**
   * The record, or undefined when the agent has never earned anything.
   *
   * Undefined rather than a zeroed record, so a caller can still tell a new
   * character from an established one that happens to be at level 1. It is not
   * an error condition: an agent row with no progress is the normal state of
   * every agent until its first outcome arrives, and `progression.read` answers
   * for it rather than raising.
   */
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
