import type { ReputationRecord } from './domain.js';

/**
 * What an outcome was, in the only two shapes one can be.
 *
 * A const array rather than a bare type for the reason every other vocabulary
 * in this repository is one: the storage layer holds its own copy of these
 * names, and a value only both sides can read is not a vocabulary.
 */
export const REPUTATION_OUTCOME_KINDS = ['completed', 'failed'] as const;
export type ReputationOutcomeKind = (typeof REPUTATION_OUTCOME_KINDS)[number];

/**
 * One outcome, named well enough to recognise a second telling of it.
 *
 * `bountyId` is the identity that does the work. `agentId` is carried because
 * the row needs it, and it is deliberately NOT part of the key: a second event
 * naming a different agent for the same bounty is a disagreement between two
 * claims, and crediting the second one is a guess. The first claim holds the
 * key instead, and the second event is refused.
 */
export interface ReputationOutcome {
  readonly agentId: string;
  readonly bountyId: string;
  readonly kind: ReputationOutcomeKind;
}

/**
 * How the reputation feature stores its records, without naming a database.
 *
 * Same shape and same reason as features/agent's port: a feature may not import
 * infrastructure, so it states what it needs and the wiring supplies it. The
 * Postgres implementation matches this structurally rather than importing it,
 * because infrastructure may not import the layers that consume it either.
 */
export interface ReputationRepository {
  /**
   * The record for an agent, or undefined when they have never finished
   * anything. A missing record is not a zero record: a new agent and an agent
   * whose record was lost are different situations, and only the store can
   * tell them apart.
   */
  find(agentId: string): Promise<ReputationRecord | undefined>;

  /** Inserts or replaces. The caller supplies the whole record; see rules.ts. */
  save(record: ReputationRecord): Promise<void>;

  /**
   * Records that this outcome has been counted, and reports whether this call
   * is the one that did it.
   *
   * True means first sighting: go and add it to the record. False means the
   * outcome is already in there and the caller must change nothing at all.
   *
   * The claim is the only serialisation point in this feature, which is why it
   * has to come BEFORE the record is read. Two deliveries of one merge racing
   * each other both find the same record, both add to it, and the loser's write
   * is the double count this method exists to prevent. Claiming first makes the
   * second one a no-op instead.
   *
   * The residue is a crash between the claim and the save: the outcome is
   * claimed, so a replay will not re-count it, and the record is one short.
   * Under-counting a bounty is the recoverable direction. Saving first and
   * claiming second is the other order, and it over-counts on the same crash —
   * which is the failure this bead is about.
   */
  claimOutcome(outcome: ReputationOutcome, now: string): Promise<boolean>;
}

/** A new agent's record: every outcome at zero, not undefined. */
export function freshRecord(agentId: string, now: string): ReputationRecord {
  return {
    agentId,
    completed: 0,
    failed: 0,
    acceptanceRate: 0,
    reviewScore: 0,
    earnedCents: 0,
    refusedOutcomes: 0,
    updatedAt: now,
  };
}
