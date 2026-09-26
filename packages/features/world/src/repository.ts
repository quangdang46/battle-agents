/**
 * The port, not the storage.
 *
 * A feature declares what it needs and infrastructure supplies it, which is what
 * keeps a repository swap from being a change to the feature and what lets the
 * whole world be deleted with `rm -rf` and still compile. The methods are named
 * for what a caller means, not for SQL.
 */
export interface WorldRepository {
  /**
   * This character's base, or undefined when they have never opened one.
   *
   * Undefined rather than a synthesised empty base, and the difference is the
   * one M5 exists to be able to make: "has never built anything" and "nobody has
   * heard of this character" are different facts, and a repository that invents
   * an empty row for the second one erases the first.
   */
  find(agentId: string): Promise<BaseView | undefined>;

  /** The character standing in a base, creating it if this is the first call. */
  ensure(agentId: string, now: string): Promise<BaseView>;

  /**
   * Records a building at a level.
   *
   * The level is absolute rather than a delta on purpose. "Upgrade" as `+1`
   * means the stored number is only ever correct relative to what was there
   * before, which is exactly the in-memory-relative state M5's cold-restart test
   * exists to rule out.
   */
  save(input: { agentId: string; buildings: Readonly<Record<string, number>>; now: string }): Promise<void>;
}

/** A character's base, as the feature reads it back. */
export interface BaseView {
  readonly agentId: string;
  /** Buildings standing, keyed by building id, at their level. */
  readonly buildings: Readonly<Record<string, number>>;
  readonly updatedAt: string;
}
