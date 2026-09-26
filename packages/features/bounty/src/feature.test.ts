import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  allocateProRata,
  BOUNTY_ACTION_IDS,
  BOUNTY_CLAIM,
  BOUNTY_COMPLETED,
  BOUNTY_CREATE,
  BOUNTY_EXPIRE,
  BOUNTY_FUND,
  BOUNTY_FUNDING_REFUSED,
  BOUNTY_LIST,
  BOUNTY_SUBMIT,
  bountyFeature,
  FUNDING_REFUSALS,
  FUNDING_REFUSAL_DISPOSITIONS,
  GITHUB_PULL_REQUEST_MERGED,
  markPending,
  NO_MONEY_WAS_TAKEN,
  PULL_REQUEST_MERGED_OUTCOME,
  REFUND_DISPOSITIONS,
  type BountyRepository,
  type BountySummary,
  type NewStoredBounty,
  type PayoutIntent,
  type PayoutIntentStore,
  type StoredBounty,
  type StoredFund,
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
  readonly funds = new Map<string, StoredFund[]>();
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

  /**
   * Writes a mode straight onto the row, for the rows no create can produce.
   *
   * Not part of `BountyRepository` — the real store has no such method, because
   * the real `bounties_mode_known` CHECK is what stops a mode arriving from
   * outside. This exists so a test can stand up the two rows the CHECK makes
   * unreachable through the API: a row written before the taxonomy existed, and
   * a row from a build that has since added a mode this one has never heard of.
   * A test that reached those states by loosening the guard would be testing its
   * own loosening.
   */
  forceMode(bountyId: string, mode: string): void {
    const row = this.rows.get(bountyId);
    if (row === undefined) {
      throw new Error(`no bounty ${bountyId} to set a mode on`);
    }
    this.rows.set(bountyId, { ...row, mode });
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
    const rows = this.funds.get(bountyId) ?? [];
    // The sponsor is kept, not discarded. An earlier version of this double threw
    // it away, which meant the feature's per-sponsor attribution could have been
    // empty and every attribution assertion would still have passed — the double
    // was the reason the property was untestable rather than unproved.
    rows.push({ sponsorUserId, amountCents, createdAt: now });
    this.funds.set(bountyId, rows);
    const bounty = this.rows.get(bountyId);
    if (bounty !== undefined) {
      this.#put(bountyId, {
        rewardCents: rows.reduce((total, row) => total + row.amountCents, 0),
        fundedAt: rows[0]?.createdAt ?? null,
      });
    }
    return {
      totalCents: rows.reduce((total, row) => total + row.amountCents, 0),
      fundedAt: rows[0]?.createdAt ?? now,
    };
  }

  /**
   * Sorted, as the real store sorts, because the order is the contract.
   *
   * The harness clock is constant, so every row in a test shares one
   * `createdAt` and the sort is decided entirely by stability — which is
   * exactly the case the real store's `id` tiebreak exists for. Pinning the order
   * here means a test that depends on who is "earliest" depends on the store's
   * promise rather than on insertion order leaking through.
   */
  async fundsFor(bountyId: string): Promise<readonly StoredFund[]> {
    return [...(this.funds.get(bountyId) ?? [])]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((row) => ({ ...row }));
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
  store: InMemoryStateStore;
  act: <T>(id: string, input: unknown) => Promise<T>;
} {
  const repository = new InMemoryBountyRepository();
  const payouts = new InMemoryPayoutIntents();
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((entry) => seen.push(entry));
  const store = new InMemoryStateStore();
  const runtime = createRuntime({
    extensions: [bountyFeature({ repository, payouts })],
    store,
    bus,
    now: () => NOW,
  });
  return {
    runtime,
    repository,
    payouts,
    seen,
    // Handed back so a test can tell "was emitted" from "was written down". The
    // bus fires for every event and the store only for the ones the feature
    // declared persisted, and the refusal is only evidence if it is the second.
    store,
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
    // A mode this feature has never seen must not be read as permission for two
    // solvers: work paid twice is the failure a mode taxonomy is not allowed to
    // introduce. That claim is still true, but it can no longer be set up
    // through `bounty.create`, which holds a supplied mode to the taxonomy
    // (packages/features/bounty/src/modes.ts) and refuses anything outside it.
    //
    // The row is written onto the store directly instead, which is how a mode
    // this build cannot name actually arrives: a row written before the
    // taxonomy existed, or by a build that has since added one. Constructing it
    // through the door it comes through is the difference between testing the
    // behaviour and testing the setup.
    for (const mode of ['race', 'cooperative', 'anything-written-by-hand']) {
      const { act, repository } = harness();
      const created = await act<BountySummary>(BOUNTY_CREATE, {
        repoOwner: REPO,
        repoName: REPO_NAME,
        issueNumber: ISSUE,
      });
      await repository.forceMode(created.id, mode);
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

    // Asserted on the DISPOSITION rather than on the old wording, because the
    // sentence is not the contract and a future edit to it must not be able to
    // leave this green. `already-payable` and the statement that nothing was
    // taken are the two facts a sponsor is owed; the prose around them is not.
    await expect(
      h.act(BOUNTY_FUND, {
        bountyId,
        amountCents: 1_000,
        sponsorUserId: SPONSOR,
        reportedBy: 'sponsor-person',
      }),
    ).rejects.toMatchObject({
      code: FUNDING_REFUSALS.payable,
      status: 409,
      refusal: {
        disposition: FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable,
        notice: expect.stringContaining(NO_MONEY_WAS_TAKEN),
      },
    });
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

/* ─────────────────── open funding: more than one sponsor ─────────────────── */

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CAROL = 'user-carol';

/** Creates a bounty and funds it from the named sponsors, in order. */
async function stacked(
  h: ReturnType<typeof harness>,
  amounts: readonly { readonly sponsor: string; readonly cents: number }[],
): Promise<BountySummary> {
  const created = await h.act<BountySummary>(BOUNTY_CREATE, {
    repoOwner: REPO,
    repoName: REPO_NAME,
    issueNumber: ISSUE,
  });
  let latest = created;
  for (const entry of amounts) {
    latest = await h.act<BountySummary>(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: entry.cents,
      sponsorUserId: entry.sponsor,
      reportedBy: `${entry.sponsor}-person`,
    });
  }
  return latest;
}

describe('anyone may fund, and a stack is the sum of the rows', () => {
  it('takes money from three people who do not own the repository', async () => {
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 20_000 },
      { sponsor: BOB, cents: 5_000 },
      { sponsor: CAROL, cents: 10_000 },
    ]);

    // The mechanic, and the sum rather than a scalar. Asserting the total alone
    // would pass for a stored column that a later funding forgot to update, so
    // the total and the three rows are asserted together: the total has to be
    // EXACTLY these three numbers.
    expect(bounty.rewardCents).toBe(35_000);
    expect(bounty.funds).toEqual([
      { sponsorUserId: ALICE, amountCents: 20_000, createdAt: NOW },
      { sponsorUserId: BOB, amountCents: 5_000, createdAt: NOW },
      { sponsorUserId: CAROL, amountCents: 10_000, createdAt: NOW },
    ]);
    expect(bounty.funds.reduce((total, fund) => total + fund.amountCents, 0)).toBe(
      bounty.rewardCents,
    );
  });

  it('carries the whole stack on a read, not only on the write that made it', async () => {
    // The failure this guards is a store that is correct and a product that
    // cannot see it. Attribution that exists on the response of `fund` and not
    // on `list` is a bounty board where a second sponsor is invisible and the
    // only caller who can see them is the one who just paid.
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 20_000 },
      { sponsor: BOB, cents: 5_000 },
    ]);

    const listed = await h.act<readonly BountySummary[]>(BOUNTY_LIST, { status: 'open' });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.funds).toEqual(bounty.funds);
    expect(listed[0]?.rewardCents).toBe(25_000);
  });

  it('keeps a repeat sponsor as two contributions rather than merging them', async () => {
    // The rows are the ledger, and a sponsor topping up twice has two entries in
    // it. Collapsing them would lose the order the largest-remainder residue is
    // paid out in, which is the one thing the refund arithmetic depends on.
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 1_000 },
      { sponsor: ALICE, cents: 500 },
    ]);

    expect(bounty.funds).toHaveLength(2);
    expect(bounty.rewardCents).toBe(1_500);
  });
});

describe('a top-up is refused once the money is payable, and the refusal is recorded', () => {
  it('turns a stranger away from a completed bounty and leaves a row saying so', async () => {
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 20_000 },
      { sponsor: BOB, cents: 5_000 },
    ]);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    await h.act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: AGENT, prUrl: PR_URL });
    await h.runtime.emit(mergeDelivery());

    await expect(
      h.act(BOUNTY_FUND, {
        bountyId: bounty.id,
        amountCents: 7_000,
        sponsorUserId: CAROL,
        reportedBy: 'carol-person',
      }),
    ).rejects.toMatchObject({ code: FUNDING_REFUSALS.terminal });

    // The attempt is on the record, and WRITTEN DOWN rather than merely
    // announced. Payout-rail section 4.2 settles a dispute out of the log, and a
    // sponsor who was told "refused" with nothing in the log is a sponsor who
    // cannot find out why. Asserting against the bus would pass for an event
    // that is emitted and thrown away, which is the defect this whole
    // persistence claim exists to rule out — and it did: removing the event from
    // `persistedEvents` left every bus-level assertion in this file green.
    const recorded = h.store.recorded().filter((entry) => entry.type === BOUNTY_FUNDING_REFUSED);
    expect(recorded).toHaveLength(1);
    expect(payloadOf(recorded[0])).toMatchObject({
      bountyId: bounty.id,
      sponsorUserId: CAROL,
      amountCents: 7_000,
      reason: FUNDING_REFUSALS.terminal,
      disposition: FUNDING_REFUSAL_DISPOSITIONS.bountyFinished,
      bountyStatus: 'completed',
      // The log row answers the question the exception answers, in the same
      // words. Payout-rail section 4.2 settles a dispute out of the log, and a
      // reader there who is not told their money never left them has to assume
      // the worst.
      notice: expect.stringContaining(NO_MONEY_WAS_TAKEN),
    });

    // And nothing was taken. The sum of the funding rows is what the existing
    // sponsors are owed, so a refused contribution must not appear in it.
    const after = await h.act<readonly BountySummary[]>(BOUNTY_LIST, {});
    expect(after[0]?.rewardCents).toBe(25_000);
    expect(after[0]?.funds).toHaveLength(2);
  });

  it('names the payable state rather than the status when the lifecycle is not the reason', async () => {
    // Reached the way the payout rail reaches it: the intent is `pending` while
    // the status is not terminal. A completed bounty is refused by the lifecycle
    // rule above, so the payable rule on its own has to be set up directly —
    // otherwise a green test here could be passing on the wrong refusal.
    const h = harness();
    const bounty = await stacked(h, [{ sponsor: ALICE, cents: 20_000 }]);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    h.payouts.rows.set(
      bounty.id,
      markPending({
        bountyId: bounty.id,
        amountCents: 20_000,
        reportedBy: 'maintainer-person',
        now: LATER,
      }),
    );

    await expect(
      h.act(BOUNTY_FUND, {
        bountyId: bounty.id,
        amountCents: 7_000,
        sponsorUserId: BOB,
        reportedBy: 'bob-person',
      }),
    ).rejects.toMatchObject({ code: FUNDING_REFUSALS.payable });

    const refused = h.store.recorded().filter((entry) => entry.type === BOUNTY_FUNDING_REFUSED);
    expect(payloadOf(refused[0])).toMatchObject({
      reason: FUNDING_REFUSALS.payable,
      disposition: FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable,
      bountyStatus: 'claimed',
      sponsorUserId: BOB,
      // The status says `claimed` and the payout says `pending`, and they are
      // recorded separately on purpose: a reader deciding whether the work is
      // done needs the payout's word for it, and conflating the two is how a
      // refusal ends up explaining itself with the wrong evidence.
      payoutState: 'pending',
    });
    const after = await h.act<readonly BountySummary[]>(BOUNTY_LIST, {});
    expect(after[0]?.rewardCents).toBe(20_000);
    expect(after[0]?.funds).toHaveLength(1);
  });
});

describe('a solver having started is not a reason to refuse a stranger money', () => {
  // The answer to the open question in docs/design/payout-rail.md section 7 —
  // "whether sponsors stack on bounties the solver has already claimed". The
  // boundary is the MERGE, because that is what moves the intent off `funded`:
  // claim and submit leave it alone, so a bounty a solver is working on can still
  // be funded, and the refund arithmetic is identical either way.
  //
  // This test can fail. It is the guard on a decision that a future contributor
  // could reasonably get backwards by reading "claimed" as "the work is already
  // done, lock it".
  it('still takes a top-up on a claimed bounty and on a submitted one', async () => {
    const h = harness();
    const bounty = await stacked(h, [{ sponsor: ALICE, cents: 20_000 }]);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });

    const afterClaim = await h.act<BountySummary>(BOUNTY_FUND, {
      bountyId: bounty.id,
      amountCents: 5_000,
      sponsorUserId: BOB,
      reportedBy: 'bob-person',
    });
    expect(afterClaim.status).toBe('claimed');
    expect(afterClaim.rewardCents).toBe(25_000);

    await h.act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: AGENT, prUrl: PR_URL });
    const afterSubmit = await h.act<BountySummary>(BOUNTY_FUND, {
      bountyId: bounty.id,
      amountCents: 10_000,
      sponsorUserId: CAROL,
      reportedBy: 'carol-person',
    });
    expect(afterSubmit.status).toBe('submitted');
    expect(afterSubmit.rewardCents).toBe(35_000);
    expect(afterSubmit.funds.map((entry) => entry.sponsorUserId)).toEqual([ALICE, BOB, CAROL]);
    // Nobody who funded after the claim is lost when the work is done.
    expect(afterSubmit.payout.refund.totalCents).toBe(0);
  });
});

describe('a cancelled bounty states where the sponsors money went', () => {
  it('owes every sponsor back exactly what they put in, and the shares add up', async () => {
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 20_000 },
      { sponsor: BOB, cents: 5_000 },
      { sponsor: CAROL, cents: 10_000 },
    ]);
    const expired = await h.act<BountySummary>(BOUNTY_EXPIRE, { bountyId: bounty.id });

    const { refund } = expired.payout;
    expect(refund.disposition).toBe(REFUND_DISPOSITIONS.owedInFull);
    expect(refund.totalCents).toBe(35_000);
    expect(refund.shares).toEqual([
      { sponsorUserId: ALICE, amountCents: 20_000 },
      { sponsorUserId: BOB, amountCents: 5_000 },
      { sponsorUserId: CAROL, amountCents: 10_000 },
    ]);
    expect(refund.shares.reduce((total, share) => total + share.amountCents, 0)).toBe(35_000);
    // The 90-day window was already being computed with no reader. It now has
    // one, and a sponsor can see the date their record stops being evidence.
    expect(refund.deadline).not.toBeNull();
    expect(refund.deadline).toBe(expired.payout.windows.refundUnclaimedDays);
  });

  it('refuses to decide when a solver had started, and says who decides', async () => {
    // Payout-rail section 3.2 and 4.1: the repository owner decides, the platform
    // holds the evidence. Returning an allocation here would be the platform
    // adjudicating a dispute its own design doc reserves to a human, so `shares`
    // is empty while `totalCents` still reports what is unspent.
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 20_000 },
      { sponsor: BOB, cents: 5_000 },
    ]);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    const expired = await h.act<BountySummary>(BOUNTY_EXPIRE, { bountyId: bounty.id });

    expect(expired.payout.refund.disposition).toBe(REFUND_DISPOSITIONS.ownerDecides);
    expect(expired.payout.refund.totalCents).toBe(25_000);
    expect(expired.payout.refund.shares).toEqual([]);
  });

  it('owes a completed bounty nothing back, because the money is the solvers', async () => {
    const h = harness();
    const bounty = await stacked(h, [
      { sponsor: ALICE, cents: 20_000 },
      { sponsor: BOB, cents: 5_000 },
    ]);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    await h.act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: AGENT, prUrl: PR_URL });
    await h.runtime.emit(mergeDelivery());

    const listed = await h.act<readonly BountySummary[]>(BOUNTY_LIST, { status: 'completed' });
    expect(listed[0]?.payout.refund.disposition).toBe(REFUND_DISPOSITIONS.notApplicable);
    expect(listed[0]?.payout.refund.totalCents).toBe(0);
    // Still carrying the stack, because a solver asking who funded the work they
    // did is a question the answer to which should not expire with the bounty.
    expect(listed[0]?.funds).toHaveLength(2);
  });
});

/* ───────────────────────────── the refund arithmetic ───────────────────────────── */

describe('splitting a refund', () => {
  const stack = [
    { sponsorUserId: ALICE, amountCents: 20_000 },
    { sponsorUserId: BOB, amountCents: 5_000 },
    { sponsorUserId: CAROL, amountCents: 10_000 },
  ];
  const totalOf = (shares: readonly { readonly amountCents: number }[]): number =>
    shares.reduce((sum, share) => sum + share.amountCents, 0);

  it('gives back exactly what it was given, for every amount from zero to the whole', () => {
    // The property the whole ledger rests on, swept rather than sampled. A sweep
    // is the point: a hand-picked table of round numbers is the shape of a test
    // that passes while the rounding rule is wrong for the amounts nobody tried.
    for (let cents = 0; cents <= 35_000; cents += 1) {
      const shares = allocateProRata(stack, cents);
      expect(totalOf(shares)).toBe(cents);
      expect(shares).toHaveLength(stack.length);
      // No sponsor is dropped or invented: the rows are the ledger.
      expect(shares.map((share) => share.sponsorUserId)).toEqual([ALICE, BOB, CAROL]);
    }
  });

  it('never returns a cent more than a sponsor put in', () => {
    for (let cents = 0; cents <= 35_000; cents += 137) {
      allocateProRata(stack, cents).forEach((share, index) => {
        expect(share.amountCents).toBeGreaterThanOrEqual(0);
        expect(share.amountCents).toBeLessThanOrEqual(
          (stack[index] as { amountCents: number }).amountCents,
        );
      });
    }
  });

  it('gives the leftover cent to the earliest contributor, not to the biggest', () => {
    // Largest-remainder makes this a rule rather than an iteration accident. 1
    // cent out of 35_000 floors every share to zero, so whoever is first takes
    // the residue — and "first" is funding order, which is why the store sorts.
    const shares = allocateProRata(
      [
        { sponsorUserId: ALICE, amountCents: 20_000 },
        { sponsorUserId: BOB, amountCents: 5_000 },
        { sponsorUserId: CAROL, amountCents: 10_000 },
      ],
      1,
    );
    expect(shares).toEqual([
      { sponsorUserId: ALICE, amountCents: 1 },
      { sponsorUserId: BOB, amountCents: 0 },
      { sponsorUserId: CAROL, amountCents: 0 },
    ]);
  });

  it('refuses a refund larger than the money in, and one that is not whole cents', () => {
    // A refund bigger than the total is a debt nobody owes, and a float is how a
    // cent goes missing between the funds and the refunds. Both throw rather than
    // clamping, because a clamped refund silently pays somebody the wrong amount.
    expect(() => allocateProRata(stack, 35_001)).toThrow(/exceeds the 35000 cents funded/);
    expect(() => allocateProRata(stack, -1)).toThrow(/whole number of cents/);
    expect(() => allocateProRata(stack, 1.5)).toThrow(/whole number of cents/);
  });

  it('keeps a zero-contribution sponsor on the ledger', async () => {
    // `amountCents: 0` is a legal funding row: the guard refuses negatives, not
    // zeroes. Dropping the row from the allocation would make "who was refunded"
    // stop matching "who funded", and the reconciliation would need a special
    // case for exactly the sponsor nobody remembers.
    const shares = allocateProRata(
      [
        { sponsorUserId: ALICE, amountCents: 0 },
        { sponsorUserId: BOB, amountCents: 1_000 },
      ],
      1_000,
    );
    expect(shares).toEqual([
      { sponsorUserId: ALICE, amountCents: 0 },
      { sponsorUserId: BOB, amountCents: 1_000 },
    ]);
  });
});

/* ─────────────────────── funding is open; awarding is not ─────────────────────── */

describe('funding is open to anyone, and nothing else is', () => {
  it('exposes no action a caller could award or complete a bounty with', async () => {
    // The second half of the authorization rule, and the half that is structural.
    // Funding being open is a product pillar (plan 11.2); awarding staying closed
    // is why the product is not a way to pay strangers. There is no transport,
    // capability or input that reaches a completion — the only writer of
    // `completed` is the merge handler, which is fed by a GitHub delivery and
    // correlates on a pull request URL in the bounty's OWN repository.
    //
    // A list assertion rather than a comment, because the failure it guards
    // against is exactly the kind that arrives as a feature: someone adds
    // `bounty.complete` because the CLI needs a way to close a bounty by hand.
    // This goes red the moment that id appears, and the fix has to be a GitHub
    // state check rather than a permission on the new action.
    const ids: readonly string[] = BOUNTY_ACTION_IDS;
    for (const name of ids) {
      expect(name).not.toMatch(/award|complete|pay|settle|dispute/);
    }

    // And the mechanism, not just the absence: a merge for a DIFFERENT
    // repository's pull request completes nothing on this bounty, so a caller
    // cannot nominate somebody else's PR as the paying one.
    const h = harness();
    const bounty = await stacked(h, [{ sponsor: ALICE, cents: 20_000 }]);
    await h.act(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    await h.act(BOUNTY_SUBMIT, { bountyId: bounty.id, agentId: AGENT, prUrl: PR_URL });

    await h.runtime.emit(mergeDelivery({ repository: `${REPO}/some-other-repo`, pullRequest: PR }));
    const after = await h.act<readonly BountySummary[]>(BOUNTY_LIST, { status: 'submitted' });
    expect(after).toHaveLength(1);
    expect(after[0]?.status).toBe('submitted');
    // Still a target, not a payment: a bounty nobody could close by fiat.
    expect(after[0]?.payout.state).toBe('funded');
    expect(after[0]?.payout.sandbox).toBe(true);
  });

  it('records no sponsor at create, so the first funder is a third party by construction', async () => {
    // The boundary between a single-sponsor bounty and a co-funded one is a
    // parameter rather than a fork, and it is a parameter of ONE LINE: `create`
    // stores no sponsor, so the funding row is the only place a sponsor ever
    // appears. There is no owner-only path for a third-party bounty to diverge
    // from, which is the two-copies-drift failure the design warns about —
    // there is only the one path, and this asserts the field that makes it one.
    const h = harness();
    const created = await h.act<BountySummary>(BOUNTY_CREATE, {
      repoOwner: REPO,
      repoName: REPO_NAME,
      issueNumber: ISSUE,
    });

    expect(created.sponsorUserId).toBeNull();
    expect(created.funds).toEqual([]);
    expect(created.rewardCents).toBe(0);

    // Bob, who does not own the repository and did not open the issue, funds it.
    const funded = await h.act<BountySummary>(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: 5_000,
      sponsorUserId: BOB,
      reportedBy: 'bob-person',
    });
    // The sponsor is on the funding row and nowhere else. A second funder now has
    // somewhere to go that is not the first funder's identity.
    expect(funded.sponsorUserId).toBeNull();
    expect(funded.funds).toEqual([{ sponsorUserId: BOB, amountCents: 5_000, createdAt: NOW }]);
  });

  it('refuses a top-up that names no sponsor at all, rather than writing an unattributed row', async () => {
    // The pay rail's own rule — every fact is somebody's claim — applied to the
    // row that decides who gets money back. A funding row with a blank sponsor
    // would be a ledger entry nobody can be paid from and nobody can be traced
    // to, and `fundsFor` would happily return it.
    const h = harness();
    const bounty = await stacked(h, [{ sponsor: ALICE, cents: 20_000 }]);

    await expect(
      h.act(BOUNTY_FUND, {
        bountyId: bounty.id,
        amountCents: 1_000,
        sponsorUserId: '   ',
        reportedBy: 'nobody',
      }),
    ).rejects.toMatchObject({ code: 'malformed-input' });

    const after = await h.act<readonly BountySummary[]>(BOUNTY_LIST, {});
    expect(after[0]?.funds).toHaveLength(1);
    expect(after[0]?.rewardCents).toBe(20_000);
  });
});
