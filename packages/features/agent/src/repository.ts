/**
 * How the agent feature stores its records, described without naming a database.
 *
 * The feature may not import drizzle, Compose or anything else in
 * `infrastructure` — that is what makes `presentation -> features -> core`
 * mean something rather than being a convention. So the feature states what it
 * needs and the wiring supplies it.
 *
 * Ownership is a parameter on every method rather than a concern of the caller.
 * An unscoped `findById(agentId)` is the shape that produces the bug this
 * prevents: a route resolves an id from a URL, looks the agent up, and reads
 * another user's character because nothing on the way down asked who was
 * asking. A method that cannot be called without naming the owner cannot be
 * called that way.
 *
 * Every id here is a plain string, and that is deliberate. The feature's own
 * types brand UserId and AgentId so a command payload cannot confuse them, but a
 * database column is a UUID and has no idea what it is holding. Putting the
 * brands in this interface would mean the store had to import the feature to
 * cast them — which the layering rules forbid, and which would quietly make the
 * feature impossible to remove, because its storage binding would still name it.
 * The feature maps to its own types where it builds them.
 */

/**
 * The two failures a store reports, as a discriminant rather than as classes.
 *
 * The store lives in `infrastructure` and may not import this file, so it cannot
 * throw a class defined here, and an `instanceof` check across that boundary is
 * always false — which turns every expected failure into an unexplained crash.
 * What the two sides can agree on is a stable `code`, so that is the contract:
 * a store sets `code` on the error, the feature reads it, and neither imports
 * the other. Node errors already carry `code`, so this follows the local idiom.
 */
export const AGENT_NAME_TAKEN = 'agent-name-taken';
export const AGENT_NOT_OWNED = 'agent-not-owned';

export type AgentStorageFailure = typeof AGENT_NAME_TAKEN | typeof AGENT_NOT_OWNED;

/** True when `error` is a failure the store declared with this code. */
export function isAgentStorageFailure(error: unknown, code: AgentStorageFailure): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/** An agent as the store holds it. No brands: a column is a UUID, not an identity. */
export interface StoredAgent {
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

/** A machine the agent runs on. */
export interface StoredInstallation {
  readonly id: string;
  readonly ownerId: string;
  readonly installationKey: string;
  readonly label: string | null;
  readonly lastSeenAt: string | null;
}

export interface AgentRepository {
  /**
   * The agent, or undefined when this owner has no such agent.
   *
   * "Not yours" and "not there" both come back as undefined, so a caller cannot
   * learn from the answer that somebody else's agent id is real.
   */
  findOwned(ownerId: string, agentId: string): Promise<StoredAgent | undefined>;

  /**
   * As findOwned, but reports AGENT_NOT_OWNED instead of returning undefined.
   * For the paths that already know the id is valid, such as acting as an agent
   * a caller has just presented a credential for.
   */
  requireOwned(ownerId: string, agentId: string): Promise<StoredAgent>;

  listForOwner(ownerId: string): Promise<readonly StoredAgent[]>;

  /**
   * Creates the agent and returns it as stored, with the id the store assigned.
   *
   * The feature never invents an id: the store owns the primary key, and a
   * second source of ids is a second thing to keep consistent with it. A name
   * this owner already uses is reported as AGENT_NAME_TAKEN, so a duplicate
   * registration and a broken database are not reported the same way.
   */
  create(draft: NewStoredAgent, now: string): Promise<StoredAgent>;

  findInstallationForOwner(
    ownerId: string,
    installationId: string,
  ): Promise<StoredInstallation | undefined>;
}

export interface NewStoredAgent {
  readonly ownerId: string;
  readonly name: string;
  readonly harness: string;
}
