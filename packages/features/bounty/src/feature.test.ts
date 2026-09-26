import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  BOUNTY_CLAIM,
  BOUNTY_COMPLETED,
  BOUNTY_CREATE,
  BOUNTY_EXPIRE,
  BOUNTY_FUND,
  BOUNTY_LIST,
  BOUNTY_SUBMIT,
  bountyFeature,
  GITHUB_PULL_REQUEST_MERGED,
  PULL_REQUEST_MERGED_OUTCOME,
  type BountyRepository,
  type BountySummary,
  type NewStoredBounty,
  type PayoutIntent,
  type PayoutIntentStore,
  type StoredBounty,
} from './index.js';

const NOW = '2026-09-26T12:00:00.000Z';
const LATER = '2026-09-26T12:05:00.000Z';
const AGENT = 'agent-solver';
const OTHER_AGENT = 'agent-other';
const SPONSOR = 'user-sponsor';
const REPO = 'battle-agents' as const;
const REPO_NAME = 'local-dojo' as const;
const ISSUE = 42;
const PR = 43;
const ISSUE_URL = `https://github.com/${REPO}/${REPO_NAME}/issues/${ISSUE}`;
const PR_URL = `https://github.com/${REPO}/${REPO_NAME}/pull/${PR}`;

/* ─────────────────────────── in-memory doubles ─────────────────────────── */

/**
 * A store held in memory, so the lifecycle is tested without a database.
 *
 * The conditional updates are implemented as real conditional updates — the
 * method re-reads the row and refuses if the status is not the one it expected
 * — because a double that always succeeds would pass a test asserting that a
 * second claim loses, and the production guarantee is the WHERE clause. If this
 * store checked the status, the test is testing the double; if it does not, the
 * test proves nothing about the real one. The real conditional update is proved
 * by tests/integration/bounty-persistence.test.ts, and this file's job is the
 * feature's own refusals.
 */
class InMemoryBountyRepository implements BountyRepository {
  readonly rows = new Map<string, StoredBounty>();
  readonly funds = new Map<string, { readonly amountCents: number; readonly at: string }[]>();
  nextId = 1;
  /** Set by a test to make a claim lose, the way a concurrent claim would. */
  claimWins = true;

  async create(bounty: NewStoredBounty): Promise<StoredBounty> {
    const id = `bounty-${this.nextId}`;
    this.nextId += 1;
    const stored: StoredBounty = {
      id,
      repoOwner: bounty.repoOwner,
      repoName: bounty.repoName,
      issueNumber: bounty.issueNumber,
      issueUrl: bounty.issueUrl,
      prUrl: null,
      currency: bounty.currency,
      requirements: bounty.requirements,
      status: 'open',
      mode: bounty.mode,
      sponsorUserId: bounty.sponsorUserId,
      claimedAgentId: null,
      mergedBy: null,
      mergedAt: null,
      expiredAt: null,
      createdAt: bounty.now,
      expiresAt: bounty.expiresAt,
      rewardCents: 0,
      fundedAt: null,
    };
    this.rows.set(id, stored);
    this.funds.set(id, []);
    return stored;
  }

  async list(filter: { status?: string; repoOwner?: string; repoName?: string } = {}) {
    return [...this.rows.values()]
      .filter((row) => filter.status === undefined || row.status === filter.status)
      .filter((row) => filter.repoOwner === undefined || row.repoOwner === filter.repoOwner)
      .filter((row) => filter.repoName === undefined || row.repoName === filter.repoName);
  }

  async findById(bountyId: string): Promise<StoredBounty | undefined> {
    return this.rows.get(bountyId);
  }

  async findByPrUrl(prUrl: string): Promise<StoredBounty | undefined> {
    return [...this.rows.values()].find((row) => row.prUrl === prUrl);
  }

  async claim(bountyId: string, agentId: string, now: string): Promise<StoredBounty | undefined> {
    void now;
    const row = this.rows.get(bountyId);
    if (row === undefined || row.status !== 'open' || !this.claimWins) {
      return undefined;
    }
    this.claimWins = true;
    return this.#put(bountyId, { status: 'claimed', claimedAgentId: agentId });
  }

  async submit(
    bountyId: string,
    agentId: string,
    prUrl: string,
    now: string,
  ): Promise<StoredBounty | undefined> {
    void now;
    const row = this.rows.get(bountyId);
    if (row === undefined || row.status !== 'claimed' || row.claimedAgentId !== agentId) {
      return undefined;
    }
    return this.#put(bountyId, { status: 'submitted', prUrl });
  }

  async complete(
    bountyId: string,
    prUrl: string,
    mergedBy: string | null,
    now: string,
  ): Promise<StoredBounty | undefined> {
    const row = this.rows.get(bountyId);
    if (row === undefined || row.status !== 'submitted' || row.prUrl !== prUrl) {
      return undefined;
    }
    return this.#put(bountyId, { status: 'completed', mergedBy, mergedAt: now });
  }

  async expire(bountyId: string, now: string): Promise<StoredBounty | undefined> {
    const row = this.rows.get(bountyId);
    if (row === undefined || (row.status !== 'open' && row.status !== 'claimed')) {
      return undefined;
    }
    return this.#put(bountyId, { status: 'expired', expiredAt: now });
  }

  async fund(
    bountyId: string,
    sponsorUserId: string,
    amountCents: number,
    now: string,
  ): Promise<{ readonly totalCents: number; readonly fundedAt: string }> {
    void sponsorUserId;
    const rows = this.funds.get(bountyId) ?? [];
    rows.push({ amountCents, at: now });
    this.funds.set(bountyId, rows);
    const bounty = this.rows.get(bountyId);
    if (bounty !== undefined) {
      this.#put(bountyId, {
        rewardCents: rows.reduce((total, row) => total + row.amountCents, 0),
        fundedAt: rows[0]?.at ?? null,
      });
    }
    return {
      totalCents: rows.reduce((total, row) => total + row.amountCents, 0),
      fundedAt: rows[0]?.at ?? now,
    };
  }

  #put(bountyId: string, changes: Partial<StoredBounty>): StoredBounty {
    const merged = { ...(this.rows.get(bountyId) as StoredBounty), ...changes };
    this.rows.set(bountyId, merged);
    return merged;
  }
}

class InMemoryPayoutIntents implements PayoutIntentStore {
  readonly rows = new Map<string, PayoutIntent>();

  async record(intent: PayoutIntent): Promise<void> {
    this.rows.set(intent.bountyId, intent);
  }

  async currentFor(bountyId: string): Promise<PayoutIntent | undefined> {
    return this.rows.get(bountyId);
  }
}

function harness(): {
  runtime: Runtime;
  repository: InMemoryBountyRepository;
  payouts: InMemoryPayoutIntents;
  seen: GameEvent[];
  act: <T>(id: string, input: unknown) => Promise<T>;
} {
  const repository = new InMemoryBountyRepository();
  const payouts = new InMemoryPayoutIntents();
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((entry) => seen.push(entry));
  const runtime = createRuntime({
    extensions: [bountyFeature({ repository, payouts })],
    store: new InMemoryStateStore(),
    bus,
    now: () => NOW,
  });
  return {
    runtime,
    repository,
    payouts,
    seen,
    // A cast at ONE place, in the test's own harness. `runAction` is generic in
    // both directions and the compiler cannot see through the wrapper, so
    // without it every call site in this file would need one — and a cast on
    // every call site is a cast nobody reads.
    act: <T>(id: string, input: unknown) => runtime.runAction(id, input) as Promise<T>,
  };
}

async function funded(h: ReturnType<typeof harness>, cents = 20_000): Promise<BountySummary> {
  const created = await h.act<BountySummary>(BOUNTY_CREATE, {
    repoOwner: REPO,
    repoName: REPO_NAME,
    issueNumber: ISSUE,
  });
  return h.act<BountySummary>(BOUNTY_FUND, {
    bountyId: created.id,
    amountCents: cents,
    sponsorUserId: SPONSOR,
    reportedBy: 'sponsor-person',
  });
}

/**
 * An event's payload as a record, for reading one key.
 *
 * `GameEvent.payload` is `unknown` by design — core knows nothing about any
 * feature's vocabulary — so a test that reads a key has to narrow it. A cast at
 * every call site is a cast nobody reads, so the narrowing lives here once and
 * says what it is.
 */
function payloadOf(event: GameEvent | undefined): Record<string, unknown> {
  const payload = event?.payload;
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`event ${event?.type ?? 'missing'} carried no payload object`);
  }
  return payload as Record<string, unknown>;
}

function mergeDelivery(overrides: Record<string, unknown> = {}): GameEvent {
  return {
    type: GITHUB_PULL_REQUEST_MERGED,
    occurredAt: LATER,
    actorId: 'github',
    payload: {
      repository: `${REPO}/${REPO_NAME}`,
      pullRequest: PR,
      merged: true,
      mergedAt: LATER,
      githubLogin: 'maintainer-person',
      deliveryId: 'delivery-1',
      ...overrides,
    },
  };
}

/* ─────────────────────────── the lifecycle ─────────────────────────── */

describe('a bounty is a real GitHub issue, not a record of one', () => {
  it('builds the issue link from the coordinates and never accepts a caller-supplied one', async () => {
    const { act } = harness();

    const created = await act<BountySummary>(BOUNTY_CREATE, {
      repoOwner: REPO,
      repoName: REPO_NAME,
      issueNumber: ISSUE,
      issueUrl: 'https://example.com/not-a-github-issue',
    });

    expect(created.issueUrl).toBe(ISSUE_URL);
  });

  it('refuses coordinates that are not GitHub owner/repository names', async () => {
    const { act } = harness();

    // The traversal case matters most: without a slug rule, these build a
    // github.com/owner/name/../../elsewhere link and every check above passes.
    for (const coordinates of [
      { repoOwner: 'battle agents', repoName: 'dojo' },
      { repoOwner: '..', repoName: '..' },
      { repoOwner: 'battle/agents', repoName: 'dojo' },
    ]) {
      await expect(act(BOUNTY_CREATE, { ...coordinates, issueNumber: ISSUE })).rejects.toThrow(
        /repo-coordinates-invalid/,
      );
    }
  });

  it('refuses a pull request from another repository', async () => {
    const h = harness();
    const { act } = h;
    const bounty = await funded(h);
    await act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });

    await expect(
      act(BOUNTY_SUBMIT, {
        bountyId: bounty.id,
        agentId: AGENT,
        prUrl: `https://github.com/someone/else/pull/${PR}`,
      }),
    ).rejects.toThrow(/not a pull request in that repository/);
  });

  it('refuses a URL that is not a github.com pull request at all', async () => {
    const h = harness();
    const { act } = h;
    const bounty = await funded(h);
    await act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });

    for (const prUrl of [
      'https://example.com/battle-agents/local-dojo/pull/43',
      'https://github.com/battle-agents/local-dojo/issues/43',
      'not-a-url',
      '',
    ]) {
      await expect(
        act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: AGENT, prUrl }),
      ).rejects.toThrow(/pr-url-not-a-github-pull-request/);
    }
  });
});

describe('a claim is exclusive', () => {
  it('gives the bounty to one agent and refuses the other', async () => {
    const h = harness();
    const { act } = h;
    const bounty = await funded(h);

    await act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });

    await expect(act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: OTHER_AGENT })).rejects.toThrow(
      /claimed by somebody else first/,
    );
  });

  it('refuses the second claim whatever mode the bounty carries', async () => {
    // The mode taxonomy belongs to a sibling bead, so this feature stores a
    // string and does not know the vocabulary. A mode it has never seen must
    // not be read as permission for two solvers: work paid twice is the failure
    // a mode taxonomy is not allowed to introduce.
    for (const mode of ['race', 'cooperative', 'anything-written-by-hand']) {
      const { act } = harness();
      const created = await act<BountySummary>(BOUNTY_CREATE, {
        repoOwner: REPO,
        repoName: REPO_NAME,
        issueNumber: ISSUE,
        mode,
      });
      await act(BOUNTY_FUND, {
        bountyId: created.id,
        amountCents: 20_000,
        sponsorUserId: SPONSOR,
        reportedBy: 'sponsor-person',
      });

      await act(BOUNTY_CLAIM, { bountyId: created.id, agentId: AGENT });

      await expect(
        act(BOUNTY_CLAIM, { bountyId: created.id, agentId: OTHER_AGENT }),
      ).rejects.toThrow(/claimed by somebody else first/);
    }
  });

  it('refuses a claim on a bounty nobody funded', async () => {
    const { act } = harness();
    const created = await act<BountySummary>(BOUNTY_CREATE, {
      repoOwner: REPO,
      repoName: REPO_NAME,
      issueNumber: ISSUE,
    });

    await expect(act(BOUNTY_CLAIM, { bountyId: created.id, agentId: AGENT })).rejects.toThrow(
      /below the 500-cent minimum/,
    );
  });

  it('refuses a claim once the seven-day window has shut', async () => {
    const h = harness();
    const bounty = await funded(h);
    // Funded EIGHT DAYS AGO, so the seven-day window shut an hour ago. The
    // instant is moved rather than the clock waited on, because a test that
    // sleeps is a test nobody runs twice. The direction matters: the window is
    // measured from the funding instant forward, so pushing `fundedAt` into the
    // future would leave it wide open.
    const stale = new Date(Date.parse(NOW) - 8 * 86_400_000).toISOString();
    const row = h.repository.rows.get(bounty.id) as StoredBounty;
    h.repository.rows.set(bounty.id, { ...row, fundedAt: stale });

    await expect(h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT })).rejects.toThrow(
      /claim window/,
    );
  });
});

describe('only the claimant submits', () => {
  it('refuses a submit from an agent that does not hold the claim', async () => {
    const h = harness();
    const { act } = h;
    const bounty = await funded(h);
    await act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });

    await expect(
      act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: OTHER_AGENT, prUrl: PR_URL }),
    ).rejects.toThrow(/claimed by/);
  });

  it('records the canonical pull request URL, not the one the caller typed', async () => {
    const h = harness();
    const { act } = h;
    const bounty = await funded(h);
    await act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });

    const submitted = await act<BountySummary>(BOUNTY_SUBMIT, {
      bountyId: bounty.id,
      agentId: AGENT,
      prUrl: PR_URL,
    });

    expect(submitted.prUrl).toBe(PR_URL);
    expect(submitted.status).toBe('submitted');
  });
});

/* ─────────────────────────── the merge, and the money ─────────────────────────── */

describe('a merge completes the bounty exactly once', () => {
  async function submitted(): Promise<ReturnType<typeof harness>> {
    const h = harness();
    const bounty = await funded(h);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    await h.act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: AGENT, prUrl: PR_URL });
    return h;
  }

  it('completes it, and says who the agent was rather than who merged', async () => {
    const h = await submitted();

    await h.runtime.emit(mergeDelivery({ githubLogin: 'maintainer-person' }));

    const completed = h.seen.filter((event) => event.type === BOUNTY_COMPLETED);
    expect(completed).toHaveLength(1);
    // The agent comes from the claim. The GitHub account is kept under a name
    // that says what it is, and the two are routinely different people.
    expect(completed[0]?.payload).toMatchObject({
      agentId: AGENT,
      mergedBy: 'maintainer-person',
      rewardCents: 20_000,
    });
    expect(payloadOf(completed[0])['agentId']).not.toBe('maintainer-person');
  });

  it('pays the bounty award once, whichever of the two events arrives, and how often', async () => {
    // The decision this bead owns, asserted end to end rather than as prose.
    // The bounty feature emits BOTH names for a bounty merge, and the price of
    // the second is zero: see the `pr.merged` row in progression/src/rules.ts.
    const h = await submitted();

    for (const _attempt of [1, 2, 3]) {
      await h.runtime.emit(mergeDelivery());
    }

    expect(h.seen.filter((event) => event.type === BOUNTY_COMPLETED)).toHaveLength(1);
    const merged = h.seen.filter((event) => event.type === PULL_REQUEST_MERGED_OUTCOME);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.payload).toMatchObject({ completedBounty: true, agentId: AGENT });
  });

  it('moves the payout to pending, and never past it', async () => {
    const h = await submitted();

    await h.runtime.emit(mergeDelivery());

    // The obligation this satisfies: a completed bounty records payout intent
    // in the correct state. `pending` is "a reason to pay", not a payment.
    expect(h.payouts.rows.size).toBe(1);
    const intent = [...h.payouts.rows.values()][0] as PayoutIntent;
    expect(intent.state).toBe('pending');
    expect(intent.mode).toBe('intent-only');
    expect(intent.amountCents).toBe(20_000);
  });

  it('records a merge that completed no bounty as a fact worth nothing', async () => {
    const h = harness();

    await h.runtime.emit(mergeDelivery({ pullRequest: 999 }));

    const merged = h.seen.filter((event) => event.type === PULL_REQUEST_MERGED_OUTCOME);
    expect(merged).toHaveLength(1);
    // No claim, so no agent: an award here would have to invent one.
    expect(merged[0]?.payload).toMatchObject({ completedBounty: false, pullRequest: 999 });
    expect(payloadOf(merged[0])['agentId']).toBeUndefined();
    expect(h.seen.filter((event) => event.type === BOUNTY_COMPLETED)).toHaveLength(0);
  });

  it('ignores a delivery that is not a merge, and one it cannot place', async () => {
    const h = await submitted();

    await h.runtime.emit(mergeDelivery({ merged: false }));
    await h.runtime.emit(mergeDelivery({ repository: 'not-a-repository-name' }));

    expect(h.seen.filter((event) => event.type === BOUNTY_COMPLETED)).toHaveLength(0);
  });

  it('refuses more money for a bounty that is already completed', async () => {
    // Two refusals, in the order they fire. The terminal-status rule is the
    // lifecycle's own; the transition rule underneath it is the payout rail's,
    // and it is what stops money being added to something already payable once
    // the dispute path makes `completed` reachable-but-not-final. Which one
    // fires is asserted rather than assumed, because "it threw" would pass for
    // either.
    const h = await submitted();
    await h.runtime.emit(mergeDelivery());
    const bountyId = [...h.repository.rows.keys()][0] as string;

    await expect(
      h.act(BOUNTY_FUND, {
        bountyId,
        amountCents: 1_000,
        sponsorUserId: SPONSOR,
        reportedBy: 'sponsor-person',
      }),
    ).rejects.toThrow(/is completed and cannot be funded/);

    // The payout rule on its own, reached with the status put back to `claimed`
    // so the terminal check does not short-circuit it. The bounty is `pending`
    // now, and money cannot be added to something a solver is already owed.
    const row = h.repository.rows.get(bountyId);
    h.repository.rows.set(bountyId, { ...(row as StoredBounty), status: 'claimed' });

    await expect(
      h.act(BOUNTY_FUND, {
        bountyId,
        amountCents: 1_000,
        sponsorUserId: SPONSOR,
        reportedBy: 'sponsor-person',
      }),
    ).rejects.toThrow(/is already pending; a payable bounty cannot take more money/);
  });
});

/* ─────────────────────────── the sandbox notice ─────────────────────────── */

describe('no surface can show a reward without being told it is a target', () => {
  it('carries a sandbox notice on every bounty that has money attached', async () => {
    const { act } = harness();
    const created = await act<BountySummary>(BOUNTY_CREATE, {
      repoOwner: REPO,
      repoName: REPO_NAME,
      issueNumber: ISSUE,
    });

    // Unfunded: nothing money-shaped, so nothing to warn about.
    expect(created.payout.sandbox).toBe(false);
    expect(created.payout.notice).toBe('');

    const fundedBounty = await act<BountySummary>(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: 20_000,
      sponsorUserId: SPONSOR,
      reportedBy: 'sponsor-person',
    });

    // Funded: the notice is IN THE VALUE, not in a component somebody forgot.
    expect(fundedBounty.payout.sandbox).toBe(true);
    expect(fundedBounty.payout.notice).toMatch(/target, not a payment/);
    expect(fundedBounty.payout.notice).toMatch(/does not hold, route or process money/);
    expect(fundedBounty.payout.mode).toBe('intent-only');
  });

  it('reports the payout state through the list action too, not only through the writes', async () => {
    const h = harness();
    const { act } = h;
    const bounty = await funded(h);

    const listed = await act<readonly BountySummary[]>(BOUNTY_LIST, { repoOwner: REPO });

    const found = listed.find((entry) => entry.id === bounty.id);
    expect(found?.payout.state).toBe('funded');
    expect(found?.payout.notice).not.toBe('');
    expect(found?.rewardCents).toBe(20_000);
  });

  it('resolves the claim window from the funding instant, and the rest from nothing yet', async () => {
    const h = harness();
    const bounty = await funded(h);

    expect(bounty.payout.windows.claimAfterFundingDays).toBe('2026-10-03T12:00:00.000Z');
    // A merge has not happened and a transfer has not been reported, so the
    // other three are null rather than dates the platform would have invented.
    expect(bounty.payout.windows.reportTransferDays).toBeNull();
    expect(bounty.payout.windows.openDisputeDays).toBeNull();
    expect(bounty.payout.windows.refundUnclaimedDays).toBeNull();
  });
});

/* ─────────────────────────── refusals ─────────────────────────── */

describe('a malformed call is refused rather than crashing later', () => {
  it('refuses every action that names nothing, and says which rule it broke', async () => {
    const { act } = harness();

    // The first rule a payload breaks is the one reported, and coordinates come
    // first: a create with nothing at all is refused for its repository names.
    await expect(act(BOUNTY_CREATE, {})).rejects.toThrow(/repo-coordinates-invalid/);
    await expect(act(BOUNTY_CREATE, { repoOwner: REPO, repoName: REPO_NAME })).rejects.toThrow(
      /issue-number-not-an-integer/,
    );
    await expect(act(BOUNTY_CLAIM, { bountyId: 'b' })).rejects.toThrow(/agent-id-not-a-string/);
    await expect(act(BOUNTY_SUBMIT, { bountyId: 'b', agentId: 'a', prUrl: 7 })).rejects.toThrow(
      /pr-url-not-a-github-pull-request/,
    );
    await expect(act(BOUNTY_FUND, { bountyId: 'b', amountCents: 10.5 })).rejects.toThrow(
      /amount-not-integer-cents/,
    );
    await expect(act(BOUNTY_EXPIRE, { bountyId: '  ' })).rejects.toThrow(/bounty-id-empty/);
    await expect(act(BOUNTY_LIST, 'nope')).rejects.toThrow(/not-an-object/);
  });

  it('carries a stable code, because the refusal crosses a process boundary', async () => {
    const { act } = harness();

    const error: unknown = await act(BOUNTY_CLAIM, {}).catch((caught: unknown) => caught);

    expect((error as { code?: unknown }).code).toBe('malformed-input');
  });

  it('expires an unfinished bounty and refuses to expire a finished one', async () => {
    const h = harness();
    const finished = await funded(h);
    await h.act(BOUNTY_CLAIM, { bountyId: finished.id, agentId: AGENT });
    await h.act(BOUNTY_SUBMIT, { bountyId: finished.id, agentId: AGENT, prUrl: PR_URL });
    await h.runtime.emit(mergeDelivery());

    const stale = await funded(h, 5_000);

    const expired = await h.act<BountySummary>(BOUNTY_EXPIRE, { bountyId: stale.id });
    expect(expired.status).toBe('expired');

    // A completed bounty is terminal, and an expiry that "worked" on it would
    // rewrite the record of work somebody was paid for.
    await expect(h.act(BOUNTY_EXPIRE, { bountyId: finished.id })).rejects.toThrow(
      /is completed and cannot be expired/,
    );
  });

  it('refuses a claim on a bounty somebody is arguing about', async () => {
    // `disputed` is terminal HERE on purpose: the column is reserved by the
    // payout rail and the moves out of it belong to a sibling bead. What this
    // bead can do is refuse to move it, so an argument nobody has settled here
    // does not get completed underneath the people having it.
    const h = harness();
    const bounty = await funded(h);
    h.repository.rows.set(bounty.id, {
      ...(h.repository.rows.get(bounty.id) as StoredBounty),
      status: 'disputed',
    });

    await expect(h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT })).rejects.toThrow(
      /claimed by somebody else first/,
    );
  });

  it('treats a status this build has never heard of as one it must not move', async () => {
    const h = harness();
    const bounty = await funded(h);
    h.repository.rows.set(bounty.id, {
      ...(h.repository.rows.get(bounty.id) as StoredBounty),
      status: 'quantum-superposition',
    });

    // Not `open`: an unknown status must not become claimable. And not
    // `completed`: that would pay a bounty twice.
    await expect(h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT })).rejects.toThrow();
    const listed = await h.act<readonly BountySummary[]>(BOUNTY_LIST, {});
    expect(listed.find((entry) => entry.id === bounty.id)?.status).toBe('disputed');
  });
});

describe('the whole slice, in order, with no database', () => {
  it('goes issue -> bounty -> claim -> pull request -> merge -> paid XP, and stops at pending', async () => {
    const h = harness();

    // 1. A sponsor puts a reward on a real issue.
    const created = await h.act<BountySummary>(BOUNTY_CREATE, {
      repoOwner: REPO,
      repoName: REPO_NAME,
      issueNumber: ISSUE,
      requirements: ['regression test'],
    });
    expect(created.status).toBe('open');

    // 2. Funding is recorded, and it is recorded as a claim by a person.
    const fundedBounty = await h.act<BountySummary>(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: 20_000,
      sponsorUserId: SPONSOR,
      reportedBy: 'sponsor-person',
    });
    expect(fundedBounty.rewardCents).toBe(20_000);

    // 3. An agent claims, 4. codes and opens a pull request.
    await h.act(BOUNTY_CLAIM, { bountyId: created.id, agentId: AGENT });
    await h.act(BOUNTY_SUBMIT, { bountyId: created.id, agentId: AGENT, prUrl: PR_URL });

    // 5. A maintainer merges it.
    await h.runtime.emit(mergeDelivery());

    // 6. The bounty is completed, the work is credited, and the money is
    //    `pending` — a reason to pay, and never a payment.
    const listed = await h.act<readonly BountySummary[]>(BOUNTY_LIST, { status: 'completed' });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.payout.state).toBe('pending');
    expect(listed[0]?.payout.sandbox).toBe(true);
    expect([...h.payouts.rows.values()][0]?.state).toBe('pending');
  });
});
