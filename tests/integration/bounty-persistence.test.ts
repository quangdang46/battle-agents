import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { bountyFeature, BOUNTY_COMPLETED, GITHUB_PULL_REQUEST_MERGED } from '@battle-agents/bounty';
import type { BountySummary, PayoutIntent } from '@battle-agents/bounty';
import {
  agents,
  bounties,
  bountyFunds,
  closeDatabasePool,
  createDatabase,
  DrizzleBountyRepository,
  DrizzlePayoutIntentStore,
  DrizzleStateStore,
  users,
  type Database,
} from '@battle-agents/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The bounty's exactly-once guarantee, proved against the real statement.
 *
 * The unit suite in packages/features/bounty/src/feature.test.ts uses an
 * in-memory double whose conditional updates are implemented by hand, so it can
 * only prove the FEATURE refuses in the right places. It cannot prove the
 * DATABASE refuses, and that distinction is the whole point of this file: the
 * guard is a WHERE clause, and a WHERE clause written by hand in a test double
 * is a restatement of the intention rather than a check on the code.
 *
 * The mutation that made the case: `complete()`'s `status = 'submitted'` was
 * deleted and the entire unit suite stayed green, because the double still
 * implemented the rule the real statement was supposed to enforce. The three
 * tests below are the ones that watch it.
 *
 * Nothing here truncates. The integration suites share one database, so every
 * fixture is a fresh set of rows and every assertion is about the row it just
 * wrote.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const AGENT_NAME = 'bounty-solver';

let pool: Pool;
let database: Database;

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

function runtime(): {
  readonly runtime: Runtime;
  readonly run: (id: string, input: unknown) => Promise<unknown>;
  readonly seen: GameEvent[];
} {
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((event) => seen.push(event));
  const composed = createRuntime({
    extensions: [
      bountyFeature({
        repository: new DrizzleBountyRepository(database),
        payouts: new DrizzlePayoutIntentStore(database),
      }),
    ],
    store: new DrizzleStateStore(database),
    bus,
  });
  return { runtime: composed, run: (id, input) => composed.runAction(id, input), seen };
}

/** A user and an agent that the foreign keys will accept. */
async function fixture(): Promise<{ readonly userId: string; readonly agentId: string }> {
  const githubId = `${randomUUID()}-bounty-sponsor`;
  const [user] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agents)
    .values({
      userId: user?.id ?? '',
      name: `${AGENT_NAME}-${randomUUID().slice(0, 8)}`,
      harness: 'claude-code',
    })
    .returning({ id: agents.id });
  return { userId: user?.id ?? '', agentId: agent?.id ?? '' };
}

/** create -> fund -> claim -> submit, with a real row behind every step. */
async function submitted(): Promise<{
  readonly bountyId: string;
  readonly agentId: string;
  readonly prUrl: string;
  readonly runtime: Runtime;
  readonly run: (id: string, input: unknown) => Promise<unknown>;
  readonly seen: GameEvent[];
}> {
  const { userId, agentId } = await fixture();
  const { runtime: composed, run, seen } = runtime();
  const slug = randomUUID().slice(0, 8);

  const created = (await run('bounty.create', {
    repoOwner: 'battle-agents',
    repoName: `dojo-${slug}`,
    issueNumber: 42,
  })) as BountySummary;
  await run('bounty.fund', {
    bountyId: created.id,
    amountCents: 20_000,
    sponsorUserId: userId,
    reportedBy: 'sponsor-person',
  });
  await run('bounty.claim', { bountyId: created.id, agentId });
  const prUrl = `https://github.com/battle-agents/dojo-${slug}/pull/43`;
  await run('bounty.submit', { bountyId: created.id, agentId, prUrl });

  return { bountyId: created.id, agentId, prUrl, runtime: composed, run, seen };
}

function mergeEvent(prUrl: string, deliveryId: string): GameEvent {
  const parsed = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(prUrl);
  if (parsed === null) {
    throw new Error(`fixture pull request URL is not a github.com pull request: ${prUrl}`);
  }
  const [, owner, repo, number] = parsed as unknown as [string, string, string, string];
  return {
    type: GITHUB_PULL_REQUEST_MERGED,
    occurredAt: '2026-09-26T12:00:00.000Z',
    actorId: 'github',
    payload: {
      repository: `${owner}/${repo}`,
      pullRequest: Number.parseInt(number, 10),
      merged: true,
      mergedAt: '2026-09-26T12:00:00.000Z',
      githubLogin: 'maintainer-person',
      deliveryId,
    },
  };
}

describe('a bounty is completed exactly once, by the state transition', () => {
  it('moves submitted -> completed once, and refuses the second delivery', async () => {
    const { bountyId, prUrl, seen, runtime: composed } = await submitted();

    // Two deliveries, DIFFERENT delivery ids, same merge. A guard keyed on the
    // delivery id would let this pair through; a guard keyed on the status does
    // not. GitHub does reissue ids, so this is the pair that pays twice.
    await composed.emit(mergeEvent(prUrl, 'delivery-a'));
    await composed.emit(mergeEvent(prUrl, 'delivery-b'));

    const completions = seen.filter((event) => event.type === BOUNTY_COMPLETED);
    expect(completions).toHaveLength(1);
    expect(completions[0]?.payload).toMatchObject({ bountyId, agentId: expect.any(String) });

    const [row] = await database.select().from(bounties).where(eq(bounties.id, bountyId)).limit(1);
    expect(row?.status).toBe('completed');
    // The instant of the completion is stored, which is what the dispute
    // windows are measured from. A window measured from a guess is a deadline
    // the platform invented.
    expect(row?.mergedAt).toBeInstanceOf(Date);
    expect(row?.mergedBy).toBe('maintainer-person');
  });

  it('records the payout intent as pending, and never as a payment', async () => {
    const { bountyId, prUrl, runtime: composed } = await submitted();

    await composed.emit(mergeEvent(prUrl, 'delivery-c'));

    const store = new DrizzlePayoutIntentStore(database);
    const intent = (await store.currentFor(bountyId)) as PayoutIntent;
    expect(intent.state).toBe('pending');
    // The single-member mode union, at the storage layer. This is the boundary
    // docs/design/payout-rail.md section 1 is about, and it is a CHECK in the
    // schema as well as a union in the feature.
    expect(intent.mode).toBe('intent-only');
    expect(intent.amountCents).toBe(20_000);
  });

  it('gives a contested bounty to the first claim, and to no other', async () => {
    const { userId, agentId } = await fixture();
    const { run } = runtime();
    const slug = randomUUID().slice(0, 8);

    const created = (await run('bounty.create', {
      repoOwner: 'battle-agents',
      repoName: `race-${slug}`,
      issueNumber: 7,
    })) as BountySummary;
    await run('bounty.fund', {
      bountyId: created.id,
      amountCents: 5_000,
      sponsorUserId: userId,
      reportedBy: 'sponsor-person',
    });

    // Two claims, fired together. `Promise.all` rather than a sequential await
    // because a sequential pair cannot race: the second would simply see the
    // first's row.
    const results = await Promise.allSettled([
      run('bounty.claim', { bountyId: created.id, agentId }),
      run('bounty.claim', { bountyId: created.id, agentId }),
    ]);

    expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((entry) => entry.status === 'rejected')).toHaveLength(1);

    const [row] = await database
      .select()
      .from(bounties)
      .where(eq(bounties.id, created.id))
      .limit(1);
    expect(row?.status).toBe('claimed');
    expect(row?.claimedAgentId).toBe(agentId);
  });

  it('keeps the reward a SUM, so a second sponsor does not erase the first', async () => {
    // The payout rail's section 3.1 claim, against the real schema. There is no
    // bounties.amount_cents column, and packages/db/src/verify.ts fails the
    // build if one is added.
    const { userId } = await fixture();
    const second = await fixture();
    const { run } = runtime();
    const slug = randomUUID().slice(0, 8);

    const created = (await run('bounty.create', {
      repoOwner: 'battle-agents',
      repoName: `funded-${slug}`,
      issueNumber: 9,
    })) as BountySummary;

    const afterFirst = (await run('bounty.fund', {
      bountyId: created.id,
      amountCents: 12_500,
      sponsorUserId: userId,
      reportedBy: 'first-sponsor',
    })) as BountySummary;
    expect(afterFirst.rewardCents).toBe(12_500);

    const afterSecond = (await run('bounty.fund', {
      bountyId: created.id,
      amountCents: 7_500,
      sponsorUserId: second.userId,
      reportedBy: 'second-sponsor',
    })) as BountySummary;

    expect(afterSecond.rewardCents).toBe(20_000);
    // The claim window runs from the FIRST funding, not the latest, so a late
    // sponsor cannot keep a bounty available forever.
    expect(afterSecond.fundedAt).toBe(afterFirst.fundedAt);
  });

  it('reads three sponsors back in funding order, and a cancelled stack still adds up', async () => {
    // The unit suite proves the feature refuses in the right places; this proves
    // the real ORDER BY and the real aggregate agree with it, because those are
    // the two things a hand-written double would have got right by construction.
    //
    // Ordering is not cosmetic. A refund's largest-remainder residue goes to the
    // earliest contributor, so if the store and the arithmetic disagreed about
    // "earliest" the same bounty would hand a leftover cent to a different person
    // depending on who asked. Three rows rather than two because the third is
    // what makes an ordering distinguishable from an accident of two.
    const alice = await fixture();
    const bob = await fixture();
    const carol = await fixture();
    const { run } = runtime();
    const slug = randomUUID().slice(0, 8);

    const created = (await run('bounty.create', {
      repoOwner: 'battle-agents',
      repoName: `stack-${slug}`,
      issueNumber: 11,
    })) as BountySummary;

    let latest = created;
    for (const [sponsor, cents, who] of [
      [alice.userId, 20_000, 'alice'],
      [bob.userId, 5_000, 'bob'],
      [carol.userId, 10_000, 'carol'],
    ] as const) {
      latest = (await run('bounty.fund', {
        bountyId: created.id,
        amountCents: cents,
        sponsorUserId: sponsor,
        reportedBy: `${who}-person`,
      })) as BountySummary;
    }

    expect(latest.rewardCents).toBe(35_000);
    expect(latest.funds.map((fund) => [fund.sponsorUserId, fund.amountCents])).toEqual([
      [alice.userId, 20_000],
      [bob.userId, 5_000],
      [carol.userId, 10_000],
    ]);

    // Cancelling must not swallow the stack, and the shares the platform states
    // must be the sum of the rows rather than a second total that can drift from
    // them. `expired` is reachable from `open`, so no agent is needed.
    const expired = (await run('bounty.expire', { bountyId: created.id })) as BountySummary;
    expect(expired.payout.refund.totalCents).toBe(35_000);
    expect(expired.payout.refund.shares).toEqual([
      { sponsorUserId: alice.userId, amountCents: 20_000 },
      { sponsorUserId: bob.userId, amountCents: 5_000 },
      { sponsorUserId: carol.userId, amountCents: 10_000 },
    ]);
    expect(
      expired.payout.refund.shares.reduce((total, share) => total + share.amountCents, 0),
    ).toBe(expired.rewardCents);

    // And the underlying rows are still the ledger, three of them, untouched by
    // the refund statement the platform just made about them.
    const rows = await database
      .select({ sponsorUserId: bountyFunds.sponsorUserId, amountCents: bountyFunds.amountCents })
      .from(bountyFunds)
      .where(eq(bountyFunds.bountyId, created.id));
    expect(rows).toHaveLength(3);
  });
});
