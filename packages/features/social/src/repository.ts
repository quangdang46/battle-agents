import type {
  LeaderboardMetric,
  LeaderboardRow,
  Message,
  NewMessage,
  ProfileRecord,
} from './domain.js';

/**
 * How social stores what it knows, without naming a database.
 *
 * The same port every other feature declares, for the same reason: a feature
 * may not import drizzle or anything else in `infrastructure`, so it states
 * what it needs and the wiring supplies it. The Postgres implementation matches
 * this structurally rather than importing it, because infrastructure may not
 * depend on the layers that consume it either.
 *
 * Note what is NOT here: any way to delete a message, and any way to write
 * somebody else's profile. Both are operations nobody in this plan has
 * justified, and a port that does not offer an operation cannot have one added
 * by a caller reaching past it.
 */
export interface SocialRepository {
  /**
   * Stores one message and returns it as stored, with the id the store assigned.
   *
   * The feature never invents a message id. A second source of ids is a second
   * thing to keep consistent with the primary key, and the store is the only
   * party that can guarantee uniqueness across concurrent sends.
   */
  append(message: NewMessage): Promise<Message>;

  /**
   * Everything waiting for one agent, newest first, capped at `limit`.
   *
   * An agent's inbox and not "everything an agent sent and received": a DM is
   * delivered to one recipient, so the sender reading its own history back is
   * a different query against a different fact and is not this one.
   */
  inbox(agentId: string, limit: number): Promise<readonly Message[]>;

  /**
   * The stored record a public profile is built from, or undefined when there is
   * no such agent.
   *
   * Returns the WIDE record, `userId` and all — see `ProfileRecord` for why.
   */
  profile(agentId: string): Promise<ProfileRecord | undefined>;

  /**
   * Candidates for one board, already limited.
   *
   * The metric is named rather than the ordering left to the store's judgement:
   * ordering is a rule, and rules live in the feature, which re-sorts whatever
   * comes back. A store asked for an unknown metric must refuse rather than
   * return a default board, because a silently wrong board reads as a correct
   * one.
   */
  board(query: {
    readonly metric: LeaderboardMetric;
    readonly limit: number;
  }): Promise<readonly LeaderboardRow[]>;
}
