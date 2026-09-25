import { eq } from 'drizzle-orm';

import { agentReputation } from '../schema/features/reputation.js';
import type { Database } from '../client.js';

/**
 * Reputation against the real database.
 *
 * No feature import, for the same reason the other adapters carry none:
 * infrastructure may not depend on the layers that consume it. The shapes below
 * are declared locally and apps/web asserts conformance, which is the pattern
 * the agent, quest and progression adapters already use.
 *
 * The two rates cross this boundary as SCALED INTEGERS: acceptance in basis
 * points and review score in hundredths. The feature's own doc is explicit that
 * acceptance is held rather than derived, and a float that reads back as
 * 0.7000000000000001 is a trust score that has quietly changed — which is the
 * one thing a number that gates bounty tiers must not do.
 */

/**
 * The two scales, and the ceilings they imply.
 *
 * Acceptance is 0..1 stored in basis points, so the scale is 10_000 and the
 * ceiling is the same number. Review is 0..5 stored in hundredths, so its scale
 * is 100 and its ceiling is 500 — a different number, which is exactly why the
 * two are written as a pair. Treating the ceiling as the scale put a 4.2 at
 * 2100 and the schema's own check constraint refused it.
 */
const ACCEPTANCE_SCALE = 10_000;
const ACCEPTANCE_CEILING = ACCEPTANCE_SCALE;
const REVIEW_SCALE = 100;
const REVIEW_CEILING = 500;

export interface ReputationRow {
  readonly agentId: string;
  readonly completed: number;
  readonly failed: number;
  /** 0..1. Stored as 0..10000. */
  readonly acceptanceRate: number;
  /** 0..5. Stored as 0..500. */
  readonly reviewScore: number;
  readonly earnedCents: number;
  readonly updatedAt: string;
}

export interface ReputationStore {
  find(agentId: string): Promise<ReputationRow | undefined>;
  save(record: ReputationRow): Promise<void>;
}

export class DrizzleReputationRepository implements ReputationStore {
  constructor(private readonly database: Database) {}

  async find(agentId: string): Promise<ReputationRow | undefined> {
    const [row] = await this.database
      .select()
      .from(agentReputation)
      .where(eq(agentReputation.agentId, agentId))
      .limit(1);
    if (row === undefined) return undefined;

    return {
      agentId: row.agentId,
      completed: row.completed,
      failed: row.failed,
      // Clamped, not trusted. A row outside its own check constraint is stored
      // corruption, and a trust score that has drifted past its ceiling is
      // worse than one that reads as zero and gets recalculated.
      acceptanceRate: clamp(
        row.acceptanceRate / ACCEPTANCE_SCALE,
        0,
        ACCEPTANCE_CEILING / ACCEPTANCE_SCALE,
      ),
      reviewScore: clamp(row.reviewScore / REVIEW_SCALE, 0, REVIEW_CEILING / REVIEW_SCALE),
      earnedCents: row.earnedCents,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async save(record: ReputationRow): Promise<void> {
    const stored = {
      completed: record.completed,
      failed: record.failed,
      acceptanceRate: Math.round(record.acceptanceRate * ACCEPTANCE_SCALE),
      reviewScore: Math.round(record.reviewScore * REVIEW_SCALE),
      earnedCents: record.earnedCents,
      updatedAt: new Date(record.updatedAt),
    };

    // Insert-or-replace, because the port says "the caller supplies the whole
    // record" and a reputation record is derived state rather than a log. A
    // read-then-write here would lose whichever of the two callers lost the
    // race, and the loser's numbers are the ones a dispute is settled from.
    await this.database
      .insert(agentReputation)
      .values({ agentId: record.agentId, ...stored })
      .onConflictDoUpdate({
        target: agentReputation.agentId,
        set: stored,
      });
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
