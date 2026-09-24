import type { ReputationRecord } from './domain.js';

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
    updatedAt: now,
  };
}
