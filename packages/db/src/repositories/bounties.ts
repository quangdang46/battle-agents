import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import {
  bounties,
  BOUNTY_STATUSES,
  bountyFundingTotals,
  bountyFunds,
  payoutIntents,
  PAYOUT_INTENT_MODES,
  PAYOUT_INTENT_STATES,
  type PayoutIntentState,
} from '../schema/index.js';

/**
 * Postgres storage for the bounty feature.
 *
 * It does not import the feature — infrastructure may not depend on the layers
 * that consume it — so the shapes here are the ones that feature's port
 * declares, and the composition root's call site is where the two are checked.
 *
 * `status` is typed as a plain string on the way out even though the column is
 * an enum, because that is what the contract says and because the feature
 * decides what an unrecognised status means.
 *
 * ## Why every move is a conditional UPDATE and not a read then a write
 *
 * GitHub delivers a merge at least once and does not promise order, and two
 * agents can claim the same bounty in the same millisecond. Each move below
 * carries the status it expects in its WHERE clause and returns the row only if
 * it moved, so "I changed it" and "somebody else did" are answered by the
 * database rather than by a gap between two statements. A read-then-write here
 * would make the second delivery of a merge pay a bounty twice, and that is the
 * one bug in this feature that costs real money.
 */

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
  readonly mergedBy: string | null;
  readonly mergedAt: string | null;
  readonly expiredAt: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
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

/**
 * One funding row, as the feature's port declares it.
 *
 * A copy rather than an import from the feature, for the reason the rest of this
 * file is: infrastructure may not import the layer that consumes it, so the
 * conformance between this and `StoredFund` is checked by the assignment at the
 * composition root rather than by a type that would have to cross layers to exist.
 */
export interface StoredFund {
  readonly sponsorUserId: string;
  readonly amountCents: number;
  readonly createdAt: string;
}

export interface BountyFilter {
  readonly status?: string;
  readonly repoOwner?: string;
  readonly repoName?: string;
}

/**
 * The funding aggregate every bounty read carries, joined from the view.
 *
 * The view rather than a correlated subquery written here, and that is the
 * second real defect this repository found in one sitting. The subquery form
 * typechecks, the unit suite cannot see it, and Postgres happily answers 0:
 * drizzle renders `${bounties.id}` inside a raw template as a BARE `"id"`,
 * which inside `FROM bounty_funds f` resolves to `f.id`, so the correlation
 * silently compared the funding row's own primary key and never matched. The
 * bounty said $0 after a $200 funding, and the only thing that caught it was an
 * integration test against the real database.
 *
 * The view has one definition of the total — `SUM(amount_cents)` grouped by
 * bounty, `MIN(created_at)` for when it first became claimable — so a reader
 * cannot restate it and get it wrong. `MIN` rather than `MAX` because the claim
 * window runs from the moment the bounty became available: a late sponsor must
 * not reopen a bounty that is about to expire.
 */
const fundingJoin = eq(bountyFundingTotals.bountyId, bounties.id);

const selected = {
  bounty: bounties,
  rewardCents: sql<number>`COALESCE(${bountyFundingTotals.fundedCents}, 0)`.as('reward_cents'),
  fundedAt: bountyFundingTotals.fundedAt,
};

export class DrizzleBountyRepository {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async create(bounty: NewStoredBounty): Promise<StoredBounty> {
    const [created] = await this.#database
      .insert(bounties)
      .values({
        repoOwner: bounty.repoOwner,
        repoName: bounty.repoName,
        issueNumber: bounty.issueNumber,
        issueUrl: bounty.issueUrl,
        currency: bounty.currency,
        requirements: bounty.requirements,
        mode: bounty.mode,
        sponsorUserId: bounty.sponsorUserId,
        expiresAt: bounty.expiresAt === null ? null : new Date(bounty.expiresAt),
        createdAt: new Date(bounty.now),
      })
      .returning();
    if (created === undefined) {
      throw new Error('inserting a bounty returned no row');
    }
    // Re-read rather than shaping the returned row: a brand-new bounty has no
    // funding yet, and building a StoredBounty from the INSERT's output here
    // would be a second place that knows what a bounty is.
    const stored = await this.#readById(created.id);
    if (stored === undefined) {
      throw new Error(`bounty ${created.id} was inserted and then not found`);
    }
    return stored;
  }

  async list(filter: BountyFilter): Promise<readonly StoredBounty[]> {
    // Newest first, because a bounty board is a list of what to do now. The
    // feature's port deliberately sets no limit and says why: a store that
    // silently capped the list would make a bounty silently undiscoverable.
    const rows = await this.#database
      .select(selected)
      .from(bounties)
      .leftJoin(bountyFundingTotals, fundingJoin)
      .where(filtersOf(filter))
      .orderBy(desc(bounties.createdAt), asc(bounties.id));
    return rows.map(toStored);
  }

  async findById(bountyId: string): Promise<StoredBounty | undefined> {
    return this.#readById(bountyId);
  }

  async findByPrUrl(prUrl: string): Promise<StoredBounty | undefined> {
    // The first match by creation order rather than an arbitrary one: two
    // bounties may name the same pull request, and the oldest is the one that
    // was waiting for it. Deterministic beats "whatever Postgres returned".
    const rows = await this.#database
      .select(selected)
      .from(bounties)
      .leftJoin(bountyFundingTotals, fundingJoin)
      .where(eq(bounties.prUrl, prUrl))
      .orderBy(asc(bounties.createdAt), asc(bounties.id))
      .limit(1);
    return rows[0] === undefined ? undefined : toStored(rows[0]);
  }

  /**
   * Takes an open bounty for one agent.
   *
   * One guard, and the one that does the work. `claimed_agent_id IS NULL` was in
   * here too, as belt and braces, and deleting it changed nothing: the first
   * claim moves the status off `open`, so the second one matches nothing either
   * way. A predicate in a WHERE clause that no mutation can make matter is a
   * second thing to keep right for no gain, so it is gone rather than
   * unverified. The test that would notice its absence is "gives a contested
   * bounty to the first claim, and to no other".
   */
  async claim(bountyId: string, agentId: string, now: string): Promise<StoredBounty | undefined> {
    void now;
    return this.#move(bountyId, [eq(bounties.id, bountyId), eq(bounties.status, 'open')], {
      status: 'claimed',
      claimedAgentId: agentId,
    });
  }

  /**
   * Submits a pull request against a bounty THIS agent holds.
   *
   * The claimant is in the WHERE clause rather than checked by the caller, so
   * the identity check and the write are one statement.
   */
  async submit(
    bountyId: string,
    agentId: string,
    prUrl: string,
    now: string,
  ): Promise<StoredBounty | undefined> {
    void now;
    return this.#move(
      bountyId,
      [
        eq(bounties.id, bountyId),
        eq(bounties.status, 'claimed'),
        eq(bounties.claimedAgentId, agentId),
      ],
      { status: 'submitted', prUrl },
    );
  }

  /**
   * Completes a bounty that is `submitted`, and only one that is.
   *
   * The exactly-once gate, in one statement. GitHub re-delivers and reorders,
   * so a second delivery of the same merge finds no row in `submitted` and gets
   * nothing back — and the feature turns that into silence rather than into a
   * second completion.
   */
  async complete(
    bountyId: string,
    prUrl: string,
    mergedBy: string | null,
    now: string,
  ): Promise<StoredBounty | undefined> {
    return this.#move(
      bountyId,
      [eq(bounties.id, bountyId), eq(bounties.status, 'submitted'), eq(bounties.prUrl, prUrl)],
      {
        status: 'completed',
        mergedBy,
        mergedAt: new Date(now),
        paidAt: new Date(now),
      },
    );
  }

  /**
   * Ends a bounty nobody finished.
   *
   * `expiredAt` is stamped here rather than derived, because the refund window
   * is measured from it and a window measured from a guess is a deadline the
   * platform invented.
   */
  async expire(bountyId: string, now: string): Promise<StoredBounty | undefined> {
    return this.#move(
      bountyId,
      [eq(bounties.id, bountyId), inArray(bounties.status, ['open', 'claimed'])],
      { status: 'expired', expiredAt: new Date(now) },
    );
  }

  async fund(
    bountyId: string,
    sponsorUserId: string,
    amountCents: number,
    now: string,
  ): Promise<{ readonly totalCents: number; readonly fundedAt: string }> {
    await this.#database
      .insert(bountyFunds)
      .values({ bountyId, sponsorUserId, amountCents, createdAt: new Date(now) });
    // The total is re-read rather than computed from the amount the caller
    // passed plus what the caller thought the total was. Two concurrent fundings
    // each writing their own arithmetic would lose one of them, and the sum of
    // refunds has to equal the sum of funds exactly.
    const stored = await this.#readById(bountyId);
    if (stored === undefined) {
      throw new Error(`funding wrote a row for bounty ${bountyId}, which then was not found`);
    }
    return { totalCents: stored.rewardCents, fundedAt: stored.fundedAt ?? now };
  }

  /**
   * The funding rows, in funding order.
   *
   * The sort is the contract rather than a display preference. A refund's
   * largest-remainder residue goes to the earliest contributor, so the store owns
   * what "earliest" means: two readers that each ordered the rows their own way
   * would hand the leftover cent to different people for the same bounty. The
   * `id` tiebreak exists because `created_at` has microsecond resolution and two
   * sponsors funding in the same transaction can share it, and an unstable order
   * is the residue rule picking a coin toss.
   */
  async fundsFor(bountyId: string): Promise<readonly StoredFund[]> {
    const rows = await this.#database
      .select({
        sponsorUserId: bountyFunds.sponsorUserId,
        amountCents: bountyFunds.amountCents,
        createdAt: bountyFunds.createdAt,
      })
      .from(bountyFunds)
      .where(eq(bountyFunds.bountyId, bountyId))
      .orderBy(asc(bountyFunds.createdAt), asc(bountyFunds.id));
    return rows.map((row) => ({
      sponsorUserId: row.sponsorUserId,
      amountCents: row.amountCents,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async #move(
    bountyId: string,
    conditions: readonly SQL[],
    changes: {
      readonly status: (typeof BOUNTY_STATUSES)[number];
      readonly claimedAgentId?: string;
      readonly prUrl?: string;
      readonly mergedBy?: string | null;
      readonly mergedAt?: Date;
      readonly expiredAt?: Date;
      readonly paidAt?: Date;
    },
  ): Promise<StoredBounty | undefined> {
    const where = and(...conditions);
    if (where === undefined) {
      // An unqualified UPDATE here would rewrite every bounty in the table. The
      // callers all pass at least one condition, and this turns a future caller
      // that forgets into a failed test rather than a rewritten table.
      throw new Error('a bounty move was given no conditions, which would update every row');
    }
    const moved = await this.#database
      .update(bounties)
      .set(changes)
      .where(where)
      .returning({ id: bounties.id });
    if (moved.length === 0) {
      return undefined;
    }
    return this.#readById(moved[0]?.id ?? bountyId);
  }

  async #readById(bountyId: string): Promise<StoredBounty | undefined> {
    const rows = await this.#database
      .select(selected)
      .from(bounties)
      .leftJoin(bountyFundingTotals, fundingJoin)
      .where(eq(bounties.id, bountyId))
      .limit(1);
    return rows[0] === undefined ? undefined : toStored(rows[0]);
  }
}

/**
 * Postgres storage for payout intent.
 *
 * It satisfies the feature's `PayoutIntentStore` structurally rather than by
 * importing it — infrastructure may not import the layer that consumes it, and
 * the existing repositories set the same pattern. One row per bounty, matched by
 * a UNIQUE index rather than by a read-then-write, so two callers recording at
 * once cannot end up with two current intents and no way to say which is which.
 */
export class DrizzlePayoutIntentStore {
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  async record(intent: {
    readonly bountyId: string;
    readonly amountCents: number;
    readonly state: string;
    readonly mode: string;
    readonly recordedAt: string;
    readonly reportedBy: string;
  }): Promise<void> {
    await this.#database
      .insert(payoutIntents)
      .values({
        bountyId: intent.bountyId,
        amountCents: intent.amountCents,
        state: toIntentState(intent.state),
        mode: toIntentMode(intent.mode),
        recordedAt: new Date(intent.recordedAt),
        reportedBy: intent.reportedBy,
      })
      .onConflictDoUpdate({
        target: payoutIntents.bountyId,
        set: {
          amountCents: intent.amountCents,
          state: toIntentState(intent.state),
          mode: toIntentMode(intent.mode),
          recordedAt: new Date(intent.recordedAt),
          reportedBy: intent.reportedBy,
        },
      });
  }

  async currentFor(bountyId: string): Promise<StoredPayoutIntent | undefined> {
    const rows = await this.#database
      .select()
      .from(payoutIntents)
      .where(eq(payoutIntents.bountyId, bountyId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    return {
      bountyId: row.bountyId,
      amountCents: row.amountCents,
      // Narrowed on the way OUT as well as on the way in. A cast on the read
      // path would hand the feature a `state` its transition table has no case
      // for, and the failure would surface as a silently refused write rather
      // than as an unreadable row — so an unknown value throws here instead.
      state: fromIntentState(row.state),
      mode: fromIntentMode(row.mode),
      recordedAt: row.recordedAt.toISOString(),
      reportedBy: row.reportedBy,
    };
  }
}

/**
 * A payout intent as the feature's port declares it.
 *
 * The narrow unions rather than strings, and that is what makes the
 * implementation satisfy `PayoutIntentStore` structurally instead of by
 * importing the interface — which infrastructure may not do. The conformance is
 * therefore checked by the assignment at the composition root's call site, the
 * one place both sides are in scope.
 */
export interface StoredPayoutIntent {
  readonly bountyId: string;
  readonly amountCents: number;
  readonly state: PayoutIntentState;
  readonly mode: (typeof PAYOUT_INTENT_MODES)[number];
  readonly recordedAt: string;
  readonly reportedBy: string;
}

function fromIntentState(state: string): PayoutIntentState {
  const known = PAYOUT_INTENT_STATES as readonly string[];
  if (!known.includes(state)) {
    throw new Error(`payout_intents holds "${state}", which is not a state this build knows`);
  }
  return state as PayoutIntentState;
}

function fromIntentMode(mode: string): (typeof PAYOUT_INTENT_MODES)[number] {
  const known = PAYOUT_INTENT_MODES as readonly string[];
  if (!known.includes(mode)) {
    throw new Error(
      `payout_intents holds mode "${mode}", which is not a mode this build knows. A row ` +
        'claiming the platform handles money contradicts docs/design/payout-rail.md section 1, ' +
        'and is not something to read quietly.',
    );
  }
  return mode as (typeof PAYOUT_INTENT_MODES)[number];
}

/**
 * Narrows a state or mode the feature handed us to one the column can hold.
 *
 * A cast would be shorter and would lie. The feature's contract says these are
 * strings, because a store has no idea what a payout state means; the column
 * says which of three or one it is. If those ever disagree, the write should
 * fail here loudly rather than be cast into a value the database was never told
 * about — and the `mode` cast is the one that matters, because `intent-only` is
 * the boundary the payout rail is built on and a value that slipped past it
 * would be a claim the storage layer accepted about money the platform handles.
 */
function toIntentState(state: string): PayoutIntentState {
  const known = PAYOUT_INTENT_STATES as readonly string[];
  if (!known.includes(state)) {
    throw new Error(`"${state}" is not a payout state the payout_intents table can store`);
  }
  return state as PayoutIntentState;
}

function toIntentMode(mode: string): (typeof PAYOUT_INTENT_MODES)[number] {
  const known = PAYOUT_INTENT_MODES as readonly string[];
  if (!known.includes(mode)) {
    throw new Error(
      `"${mode}" is not a payout mode the payout_intents table can store. The platform does ` +
        'not hold, route or process money; see docs/design/payout-rail.md section 1.',
    );
  }
  return mode as (typeof PAYOUT_INTENT_MODES)[number];
}

/**
 * The WHERE clause, or undefined when nothing is filtered.
 *
 * Undefined rather than a no-op predicate, for the reason the quest repository
 * gives: "no filter" and "a filter matching everything" are the same question
 * asked two ways, and the first is the honest one.
 */
function filtersOf(filter: BountyFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.status !== undefined) {
    conditions.push(eq(bounties.status, toStatus(filter.status)));
  }
  if (filter.repoOwner !== undefined) {
    conditions.push(eq(bounties.repoOwner, filter.repoOwner));
  }
  if (filter.repoName !== undefined) {
    conditions.push(eq(bounties.repoName, filter.repoName));
  }
  if (conditions.length === 0) {
    return undefined;
  }
  return and(...conditions);
}

function toStatus(status: string): (typeof BOUNTY_STATUSES)[number] {
  const known = BOUNTY_STATUSES as readonly string[];
  if (!known.includes(status)) {
    throw new Error(`"${status}" is not a status the bounties table can store`);
  }
  return status as (typeof BOUNTY_STATUSES)[number];
}

/**
 * A bounty row plus its funding aggregate.
 *
 * The keys are the SQL aliases rather than the column names, because that is
 * what `select` returns: naming them `reward_cents` here would be a type that
 * describes the query rather than the result.
 */
type SelectedBounty = {
  readonly bounty: typeof bounties.$inferSelect;
  readonly rewardCents: number;
  readonly fundedAt: Date | null;
};

function toStored(row: SelectedBounty): StoredBounty {
  return {
    id: row.bounty.id,
    repoOwner: row.bounty.repoOwner,
    repoName: row.bounty.repoName,
    issueNumber: row.bounty.issueNumber,
    issueUrl: row.bounty.issueUrl,
    prUrl: row.bounty.prUrl,
    currency: row.bounty.currency,
    requirements: row.bounty.requirements,
    status: row.bounty.status,
    mode: row.bounty.mode,
    sponsorUserId: row.bounty.sponsorUserId,
    claimedAgentId: row.bounty.claimedAgentId,
    mergedBy: row.bounty.mergedBy,
    mergedAt: row.bounty.mergedAt?.toISOString() ?? null,
    expiredAt: row.bounty.expiredAt?.toISOString() ?? null,
    createdAt: row.bounty.createdAt.toISOString(),
    expiresAt: row.bounty.expiresAt?.toISOString() ?? null,
    rewardCents: row.rewardCents,
    fundedAt: row.fundedAt?.toISOString() ?? null,
  };
}
