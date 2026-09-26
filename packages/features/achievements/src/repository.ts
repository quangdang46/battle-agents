import type { AchievementCode } from './rules.js';
import type { RecordedRow } from './rules.js';

/**
 * How achievements stores what it has derived, without naming a database.
 *
 * Three methods, and the shape of the port is the design rather than an
 * accident. `history` and `list` are the only ways anything is read, and
 * neither can name another feature's table: there is no `progression()` or
 * `bounties()` on this interface for a caller to reach through. That is what
 * makes "derived from the activity log, not from a feature table" a structural
 * property rather than a promise — the way to break it is to add a method here,
 * and adding one is a visible change to a file whose whole job is its shape.
 *
 * Nothing is ever updated in place. An award is a fact and facts are appended;
 * a repository with a `setCount` on it is how a badge becomes a counter.
 */
export interface AchievementsRepository {
  /**
   * The agent's own recorded outcomes of the given types, oldest first.
   *
   * "Its own" is the only filter beyond the types, and it is deliberately the
   * filter the log can answer. The count a rule needs is a property of the
   * trail, so this returns rows and lets the rules count them: a `count()`
   * pushed into the adapter would move the decision from a pure function that
   * can be tested against hand-built rows to a SQL expression that can only be
   * tested against a database.
   *
   * The order is the log's own sequence, not its timestamps. Two events in the
   * same millisecond have no order between their timestamps, and a projection
   * that resolves ties differently on a replay is a projection that cannot be
   * reproduced.
   */
  history(agentId: string, eventTypes: readonly string[]): Promise<readonly RecordedRow[]>;

  /**
   * The badges this agent holds, oldest award first.
   *
   * The codes only. No title, no detail, no level, no score: everything a badge
   * means is looked up in the catalogue when it is read, so rewording a badge
   * costs no history and a row can never claim to be something it is not.
   */
  list(agentId: string): Promise<readonly AwardedAchievement[]>;

  /**
   * Records that this agent holds this badge, and reports whether this call is
   * the one that made it true.
   *
   * True means first sighting. False means it was already there and the caller
   * must change nothing at all — not the timestamp, not a counter, nothing.
   *
   * The boolean is the whole contract, and it is the one thing that makes a
   * re-run harmless. The bus can deliver twice, a backfill will re-derive every
   * rule for every agent, and a handler that ran before its own write landed
   * will run again. "First bounty" granted twice is a correctness bug, and the
   * fix cannot be a check afterwards: the natural key is (agentId, code) and the
   * write has to be refused by whoever can refuse it atomically.
   */
  award(agentId: string, code: AchievementCode, now: string): Promise<boolean>;
}

/** One badge on a character's sheet. Three fields, and that is the whole model. */
export interface AwardedAchievement {
  readonly agentId: string;
  /**
   * A plain string, NOT AchievementCode, and the reason is the row rather than
   * the convenience: a badge awarded by an older build can hold a code this
   * build has dropped or renamed, and typing the port as a known code would make
   * "return it unchanged" unrepresentable. describeCode already narrows
   * defensively; the port demanding the narrow type only moved that decision
   * somewhere it was not being made.
   */
  readonly code: string;
  /** The instant the award happened, not the instant the badge was first seen. */
  readonly awardedAt: string;
}
