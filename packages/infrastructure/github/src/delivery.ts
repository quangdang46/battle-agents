/**
 * The durable delivery ledger, as a port.
 *
 * GitHub delivers at least once, out of order, and a retry is indistinguishable
 * from a second real event unless something durable remembers. An in-memory Set
 * of delivery ids is the obvious implementation and it is wrong in a specific
 * way: a restart empties it, and the next retry of a merge double-records it.
 *
 * So the key is not the delivery id. The delivery id (`X-GitHub-Delivery`) is
 * recorded because an operator needs it, but the constraint that decides
 * anything is the SEMANTIC fact: "this repository's pull request 7 was merged".
 * A redelivery under a fresh delivery id collides on that key and is refused,
 * which is the property a delivery-id cache cannot give you.
 *
 * This file declares the port and nothing else. The Drizzle implementation is in
 * packages/db, which is infrastructure too and which may not import this
 * package, so the two agree on the shapes structurally — the same arrangement
 * every other repository in packages/db already uses.
 */

/** The one thing a delivery asserts, in words that do not mention GitHub. */
export interface DeliveryFact {
  readonly kind: string;
  /** `owner/repo`, verbatim from the delivery. */
  readonly repository: string;
  /** What the number is a number OF — 'pull_request', 'issue'. */
  readonly subject: string;
  readonly subjectNumber: number;
}

export interface DeliveryClaim {
  /** `X-GitHub-Delivery`. Recorded for an operator; not the idempotency key. */
  readonly deliveryId: string;
  /** `X-GitHub-Event`, e.g. 'pull_request'. */
  readonly event: string;
  /** The delivery's own action, e.g. 'closed'. */
  readonly action: string;
  /**
   * Absent for a delivery this endpoint acknowledges and does not act on.
   * Such a delivery is still recorded — it arrived, it was authentic, and an
   * operator asking "did GitHub send this" deserves an answer — but it has no
   * semantic key, so only its delivery id can dedupe it.
   */
  readonly fact: DeliveryFact | undefined;
}

export type ClaimOutcome =
  /** The caller owns publishing this fact and must `markPublished` or `release`. */
  | { readonly status: 'claimed'; readonly claimId: string }
  /** The fact was published before. Publishing it again is the bug this prevents. */
  | { readonly status: 'already-published' }
  /** Another delivery of the same fact holds the claim right now. Do not publish. */
  | { readonly status: 'in-flight' };

export interface DeliveryClaimStore {
  claim(delivery: DeliveryClaim): Promise<ClaimOutcome>;
  markPublished(claimId: string, at: string): Promise<void>;
  /**
   * Give the claim back.
   *
   * Only the holder may call this, and only after a publish failed. Without it
   * a failed publish is permanent: the claim stays, the retry sees 'in-flight',
   * no-ops, and a merged pull request is silently never seen again. The window
   * this does not close is a crash between publishing and marking published,
   * which is why a consumer that mints game state must still make its own state
   * transition idempotent — see docs/design/github-webhook-events.md.
   */
  release(claimId: string): Promise<void>;
  /** What was published for a fact, for a later reconciliation pass. */
  findPublishedFact(fact: DeliveryFact): Promise<PublishedFact | undefined>;
}

export interface PublishedFact {
  readonly claimId: string;
  readonly deliveryId: string;
  readonly event: string;
  readonly action: string;
  readonly publishedAt: string;
}
