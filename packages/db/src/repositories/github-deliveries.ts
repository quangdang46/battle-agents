import { and, eq } from 'drizzle-orm';

import type { Database } from '../client.js';
import { githubDeliveryClaims } from '../schema/features/github.js';

/**
 * The delivery ledger against a real database.
 *
 * No import of the infrastructure package that declares the port, for the
 * reason every other repository here carries: infrastructure may not depend on
 * the layers that consume it, and packages/infrastructure is one of them. The
 * shapes are declared structurally below and apps/web — the only place allowed
 * to see both — asserts they line up.
 *
 * The claim is ONE INSERT, not a read followed by a write. The difference is the
 * whole concurrency argument: with a read-then-write, two deliveries of the same
 * merge that arrive together both read "not claimed", both write, and the
 * second completion is a row nobody can distinguish from the first. `ON CONFLICT
 * DO NOTHING` lets the unique index arbitrate, so at most one insert can win and
 * the loser learns it lost from the database rather than from a guess.
 */

/** How many times to retry when a conflicting row vanished mid-claim. */
const CLAIM_ATTEMPTS = 3;

export interface ClaimRow {
  readonly deliveryId: string;
  readonly event: string;
  readonly action: string;
  readonly fact: DeliveryFactShape | undefined;
}

export interface DeliveryFactShape {
  readonly kind: string;
  readonly repository: string;
  readonly subject: string;
  readonly subjectNumber: number;
}

export type ClaimStatus =
  | { readonly status: 'claimed'; readonly claimId: string }
  | { readonly status: 'already-published' }
  | { readonly status: 'in-flight' };

export interface DeliveryClaimStoreShape {
  claim(delivery: ClaimRow): Promise<ClaimStatus>;
  markPublished(claimId: string, at: string): Promise<void>;
  release(claimId: string): Promise<void>;
  findPublishedFact(fact: DeliveryFactShape): Promise<PublishedFactShape | undefined>;
}

export interface PublishedFactShape {
  readonly claimId: string;
  readonly deliveryId: string;
  readonly event: string;
  readonly action: string;
  readonly publishedAt: string;
}

type StoredRow = typeof githubDeliveryClaims.$inferSelect;

export class DrizzleGithubDeliveryStore implements DeliveryClaimStoreShape {
  constructor(private readonly database: Database) {}

  async claim(delivery: ClaimRow): Promise<ClaimStatus> {
    const values = {
      deliveryId: delivery.deliveryId,
      event: delivery.event,
      action: delivery.action,
      fact: delivery.fact?.kind,
      repository: delivery.fact?.repository,
      subject: delivery.fact?.subject,
      subjectNumber: delivery.fact?.subjectNumber,
    };

    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
      const inserted = await this.database
        .insert(githubDeliveryClaims)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: githubDeliveryClaims.id });

      const won = inserted[0];
      if (won !== undefined) {
        return { status: 'claimed', claimId: won.id };
      }

      // A conflict, so some row already stands in the way. Find it: the
      // delivery id and the fact are two independent unique keys, and the
      // conflict was on whichever one the insert collided with.
      const existing = await this.findConflicting(values);
      if (existing === undefined) {
        // The row that blocked the insert has since been released and deleted.
        // That is a real race rather than a defensive branch: the other
        // delivery failed its publish and released between our insert and our
        // read. Re-running the insert is the correct response, and the attempt
        // bound is what stops a pathological interleaving from spinning.
        continue;
      }

      return existing.publishedAt === null
        ? { status: 'in-flight' }
        : { status: 'already-published' };
    }

    throw new Error(
      `could not claim GitHub delivery ${delivery.deliveryId} after ${CLAIM_ATTEMPTS} attempts`,
    );
  }

  async markPublished(claimId: string, at: string): Promise<void> {
    await this.database
      .update(githubDeliveryClaims)
      .set({ publishedAt: new Date(at) })
      .where(eq(githubDeliveryClaims.id, claimId));
  }

  /**
   * Delete rather than clear `published_at`.
   *
   * Clearing would leave a row that no longer collides on anything useful — a
   * released claim whose delivery id stays taken would refuse the retry of a
   * delivery that never published, and whose fact key still collides would
   * refuse a retry that should. Deleting returns the ledger to the state the
   * retry expects.
   */
  async release(claimId: string): Promise<void> {
    await this.database.delete(githubDeliveryClaims).where(eq(githubDeliveryClaims.id, claimId));
  }

  async findPublishedFact(fact: DeliveryFactShape): Promise<PublishedFactShape | undefined> {
    const [row] = await this.database
      .select()
      .from(githubDeliveryClaims)
      .where(factWhere(fact))
      .limit(1);

    if (row === undefined || row.publishedAt === null) {
      return undefined;
    }
    return {
      claimId: row.id,
      deliveryId: row.deliveryId,
      event: row.event,
      action: row.action,
      publishedAt: row.publishedAt.toISOString(),
    };
  }

  private async findConflicting(
    values: Omit<typeof githubDeliveryClaims.$inferInsert, 'id' | 'claimedAt' | 'publishedAt'>,
  ): Promise<StoredRow | undefined> {
    const byDelivery = await this.database
      .select()
      .from(githubDeliveryClaims)
      .where(eq(githubDeliveryClaims.deliveryId, values.deliveryId))
      .limit(1);
    const found = byDelivery[0];
    if (found !== undefined) {
      return found;
    }

    if (values.fact === null || values.fact === undefined) {
      return undefined;
    }
    const byFact = await this.database
      .select()
      .from(githubDeliveryClaims)
      .where(
        and(
          eq(githubDeliveryClaims.fact, values.fact),
          eq(githubDeliveryClaims.repository, values.repository ?? ''),
          eq(githubDeliveryClaims.subject, values.subject ?? ''),
          eq(githubDeliveryClaims.subjectNumber, values.subjectNumber ?? 0),
        ),
      )
      .limit(1);
    return byFact[0];
  }
}

function factWhere(fact: DeliveryFactShape) {
  return and(
    eq(githubDeliveryClaims.fact, fact.kind),
    eq(githubDeliveryClaims.repository, fact.repository),
    eq(githubDeliveryClaims.subject, fact.subject),
    eq(githubDeliveryClaims.subjectNumber, fact.subjectNumber),
  );
}
