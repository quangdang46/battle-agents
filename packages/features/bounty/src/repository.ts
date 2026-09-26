/**
 * How the bounty feature stores its records, described without naming a
 * database.
 *
 * The feature may not import drizzle, Compose or anything else in
 * `infrastructure` — that is what makes `presentation -> features -> core`
 * mean something rather than being a convention. So the feature states what it
 * needs and the wiring supplies it.
 *
 * Every id is a plain string for the reason given in
 * features/agent/src/repository.ts: a database column is a UUID and has no idea
 * what it is holding, and branding these would force the store to import the
 * feature to cast them.
 *
 * ## Why every move is one method and not a read followed by a write
 *
 * GitHub delivers a merge at least once and does not promise order. A handler
 * that read a bounty's status, decided, and then wrote it would complete the
 * same bounty twice under two concurrent deliveries, and the second write is
 * the one that pays. So each move here takes the status it expects and the
 * store performs the check and the write as a single statement, returning
 * undefined when somebody else got there first. `undefined` is therefore a
 * meaningful answer and not a missing row: it means "you lost", and the caller
 * has to treat losing differently from not existing.
 */

/** A failure a store reports, as a discriminant rather than a class. */
export const BOUNTY_NOT_FOUND = 'bounty-not-found';
export const BOUNTY_CLAIM_LOST = 'bounty-claim-lost';
export const BOUNTY_ALREADY_CLAIMED = 'bounty-already-claimed';
export const BOUNTY_SUBMIT_LOST = 'bounty-submit-lost';
export const BOUNTY_COMPLETE_LOST = 'bounty-complete-lost';
export const BOUNTY_EXPIRE_LOST = 'bounty-expire-lost';

export type BountyStorageFailure =
  | typeof BOUNTY_NOT_FOUND
  | typeof BOUNTY_CLAIM_LOST
  | typeof BOUNTY_ALREADY_CLAIMED
  | typeof BOUNTY_SUBMIT_LOST
  | typeof BOUNTY_COMPLETE_LOST
  | typeof BOUNTY_EXPIRE_LOST;

export function isBountyStorageFailure(error: unknown, code: BountyStorageFailure): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/** A bounty as the store holds it. The feature maps it into its own types. */
export interface StoredBounty {
  readonly id: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly prUrl: string | null;
  readonly currency: string;
  readonly requirements: readonly string[];
  readonly status: string;
  readonly mode: string;
  readonly sponsorUserId: string | null;
  readonly claimedAgentId: string | null;
  /** The GitHub login of whoever merged. A person, never an agent. */
  readonly mergedBy: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  /**
   * When the merge completed the bounty, and when an expiry ended it.
   *
   * Both read by the summary builder to resolve the payout rail's windows, so
   * neither is audit decoration: a deadline computed from a guessed instant is a
   * date the platform invented, and this package's whole argument is that it
   * does not invent facts.
   */
  readonly mergedAt: string | null;
  readonly expiredAt: string | null;
  /** Sum of the funding rows. Never a column on the bounty itself. */
  readonly rewardCents: number;
  /** The FIRST funding row's instant: when the bounty became claimable. */
  readonly fundedAt: string | null;
}

export interface NewStoredBounty {
  readonly repoOwner: string;
  readonly repoName: string;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly currency: string;
  readonly requirements: readonly string[];
  readonly mode: string;
  readonly sponsorUserId: string | null;
  readonly expiresAt: string | null;
  readonly now: string;
}

export interface BountyFilter {
  readonly status?: string;
  readonly repoOwner?: string;
  readonly repoName?: string;
}

export interface BountyRepository {
  create(bounty: NewStoredBounty): Promise<StoredBounty>;

  /**
   * Bounties matching the filter, newest first.
   *
   * No limit, for the reason features/quest/src/repository.ts gives: a store
   * that silently capped the list would make a bounty silently undiscoverable,
   * which is the failure mode this whole design has to avoid.
   */
  list(filter: BountyFilter): Promise<readonly StoredBounty[]>;

  findById(bountyId: string): Promise<StoredBounty | undefined>;

  /**
   * The bounty a merged pull request belongs to, found by the canonical URL.
   *
   * Correlation by URL rather than by repository alone because a repository has
   * many pull requests and a merge of the wrong one must complete nothing. The
   * URL is the exact key, and it is canonical on both sides: written here by
   * `submit`, reconstructed by the merge handler from the delivery's
   * coordinates.
   */
  findByPrUrl(prUrl: string): Promise<StoredBounty | undefined>;

  /**
   * Takes a bounty from `open` for one agent, or reports that somebody else did.
   *
   * The agent lands in the same statement as the status. A claim that read the
   * row, decided it was open, and then wrote would let two agents believe they
   * hold the same bounty, and the loser's pull request would be completed
   * against the winner's claim.
   */
  claim(bountyId: string, agentId: string, now: string): Promise<StoredBounty | undefined>;

  /**
   * Submits a pull request against a bounty THIS agent holds.
   *
   * `claimedAgentId` is in the WHERE clause rather than checked by the caller,
   * so the check and the write are one statement.
   */
  submit(
    bountyId: string,
    agentId: string,
    prUrl: string,
    now: string,
  ): Promise<StoredBounty | undefined>;

  /**
   * Completes a bounty that is `submitted`, or reports that it already was.
   *
   * The exactly-once gate. GitHub re-delivers and reorders, and the durable key
   * is this status transition rather than the delivery id: two deliveries of the
   * same merge produce one completion and one `undefined`, and the feature turns
   * the second into silence.
   */
  complete(
    bountyId: string,
    prUrl: string,
    mergedBy: string | null,
    now: string,
  ): Promise<StoredBounty | undefined>;

  /** Ends a bounty nobody finished. The `open OR claimed` pair is the WHERE clause. */
  expire(bountyId: string, now: string): Promise<StoredBounty | undefined>;

  /**
   * Records one sponsor's commitment and returns the new total.
   *
   * The total is a SUM, not a value the caller computed and passed in, so two
   * concurrent fundings cannot each write a total that includes only their own.
   */
  fund(
    bountyId: string,
    sponsorUserId: string,
    amountCents: number,
    now: string,
  ): Promise<{ readonly totalCents: number; readonly fundedAt: string }>;
}
