import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * The durable record of what GitHub told us, and of what we did about it.
 *
 * This table exists because a delivery ledger held in memory is a cache, and a
 * cache is lost exactly when it is needed. A restart between two deliveries of
 * the same merge would let the second one through, and a second merge for the
 * same pull request is a second completion. The row is the memory.
 *
 * Two unique indexes, and the second is the one that does the work:
 *
 *   delivery_id  — X-GitHub-Delivery, one per delivery. Unique because it is
 *                  unique, and recorded because an operator asking "did GitHub
 *                  send this?" needs an answer that is not "probably".
 *
 *   (fact, repository, subject, subject_number) — the semantic key. A retry
 *                  arrives under a NEW delivery id, so only this index can catch
 *                  it. `fact` is null for a delivery this endpoint acknowledged
 *                  without acting on, and Postgres treats nulls as distinct in a
 *                  unique index, so those rows coexist and dedupe by delivery id
 *                  alone — which is the correct answer, because two deliveries
 *                  that assert nothing cannot collide on a meaning.
 *
 * `published_at` is the second half of the protocol. A claim row is written
 * BEFORE the event is published, which is what makes two concurrent deliveries
 * resolve to one publisher; `published_at` is what lets a later reconcile pass
 * see that the fact was not merely claimed but acted on. A row with a null
 * `published_at` is a delivery that is in flight, or one whose publish failed
 * and whose claim was released — in the second case the row is gone, because
 * release deletes it rather than clearing the timestamp.
 */
export const githubDeliveryClaims = pgTable(
  'github_delivery_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: text('delivery_id').notNull(),
    event: text('event').notNull(),
    action: text('action').notNull(),
    fact: text('fact'),
    repository: text('repository'),
    subject: text('subject'),
    subjectNumber: integer('subject_number'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('github_delivery_claims_delivery_id_key').on(table.deliveryId),
    uniqueIndex('github_delivery_claims_fact_key').on(
      table.fact,
      table.repository,
      table.subject,
      table.subjectNumber,
    ),
  ],
);
