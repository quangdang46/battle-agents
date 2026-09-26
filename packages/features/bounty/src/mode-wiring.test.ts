import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  BOUNTY_CLAIM,
  BOUNTY_CREATE,
  BOUNTY_FUND,
  bountyFeature,
  DEFAULT_BOUNTY_MODE,
} from './index.js';
import type {
  BountyRepository,
  BountySummary,
  NewStoredBounty,
  PayoutIntent,
  PayoutIntentStore,
  StoredBounty,
  StoredFund,
} from './index.js';
import { BOUNTY_MODES } from './modes.js';

/**
 * The mode, through the feature, rather than through the taxonomy.
 *
 * modes.test.ts proves the rules are what modes.ts says they are. It cannot
 * prove that a bounty CREATED with an unplayable mode is refused at the CLAIM,
 * because that is a property of two other files: a value this build knows and
 * cannot keep has to be refused there, and a value it does not know has to keep
 * the older exclusive reading instead. Both are silent unless a caller drives
 * the feature, so both are driven here.
 *
 * A separate file from feature.test.ts on purpose. That file is the lifecycle's
 * own suite; adding to it would put these assertions behind whatever else is
 * failing in it, and a test you cannot run is a test you have not written.
 */

const NOW = '2026-09-26T12:00:00.000Z';
const AGENT = 'agent-solver';
const REPO_OWNER = 'battle-agents';
const REPO_NAME = 'local-dojo';
const ISSUE = 42;

/** A row the minimum-funding floor is satisfied by, so the claim reaches the mode. */
const FUNDED = 25_000;

class Store implements BountyRepository {
  readonly rows = new Map<string, StoredBounty>();
  readonly funding = new Map<string, StoredFund[]>();
  #nextId = 1;

  async create(bounty: NewStoredBounty): Promise<StoredBounty> {
    const id = `bounty-${this.#nextId}`;
    this.#nextId += 1;
    const row: StoredBounty = {
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
    this.rows.set(id, row);
    this.funding.set(id, []);
    return row;
  }

  async list(): Promise<readonly StoredBounty[]> {
    return [...this.rows.values()];
  }

  async findById(bountyId: string): Promise<StoredBounty | undefined> {
    return this.rows.get(bountyId);
  }

  async findByPrUrl(prUrl: string): Promise<StoredBounty | undefined> {
    return [...this.rows.values()].find((row) => row.prUrl === prUrl);
  }

  async claim(bountyId: string, agentId: string): Promise<StoredBounty | undefined> {
    const row = this.rows.get(bountyId);
    if (row === undefined || row.status !== 'open') return undefined;
    const claimed: StoredBounty = { ...row, status: 'claimed', claimedAgentId: agentId };
    this.rows.set(bountyId, claimed);
    return claimed;
  }

  async submit(): Promise<StoredBounty | undefined> {
    return undefined;
  }

  async complete(): Promise<StoredBounty | undefined> {
    return undefined;
  }

  async expire(): Promise<StoredBounty | undefined> {
    return undefined;
  }

  async fund(
    bountyId: string,
    sponsorUserId: string,
    amountCents: number,
    now: string,
  ): Promise<{ readonly totalCents: number; readonly fundedAt: string }> {
    const row = this.rows.get(bountyId);
    if (row === undefined) throw new Error(`no bounty ${bountyId}`);
    const rows = this.funding.get(bountyId) ?? [];
    rows.push({ sponsorUserId, amountCents, createdAt: now });
    this.funding.set(bountyId, rows);
    const totalCents = rows.reduce((sum, fund) => sum + fund.amountCents, 0);
    // The FIRST funding row's instant, because the claim window runs from when
    // the bounty became available and a late sponsor must not reopen it.
    const fundedAt = rows[0]?.createdAt ?? now;
    this.rows.set(bountyId, { ...row, rewardCents: totalCents, fundedAt });
    return { totalCents, fundedAt };
  }

  async fundsFor(bountyId: string): Promise<readonly StoredFund[]> {
    return this.funding.get(bountyId) ?? [];
  }
}

class Intents implements PayoutIntentStore {
  readonly rows = new Map<string, PayoutIntent>();

  async currentFor(bountyId: string): Promise<PayoutIntent | undefined> {
    return this.rows.get(bountyId);
  }

  async record(intent: PayoutIntent): Promise<void> {
    this.rows.set(intent.bountyId, intent);
  }
}

async function harness(): Promise<{
  readonly runtime: Runtime;
  readonly store: Store;
}> {
  const store = new Store();
  const runtime = createRuntime({
    extensions: [bountyFeature({ repository: store, payouts: new Intents() })],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => NOW,
  });
  return { runtime, store };
}

/** `runAction` under the name this file uses, typed at the one call site shape. */
function actor(runtime: Runtime): <T>(id: string, input: unknown) => Promise<T> {
  return <T>(id: string, input: unknown) => runtime.runAction(id, input) as Promise<T>;
}

/** A created, funded bounty, which is the state a claim is allowed to start from. */
async function fundedBounty(runtime: Runtime, mode?: string): Promise<BountySummary> {
  const act = actor(runtime);
  const created = await act<BountySummary>(BOUNTY_CREATE, {
    repoOwner: REPO_OWNER,
    repoName: REPO_NAME,
    issueNumber: ISSUE,
    ...(mode === undefined ? {} : { mode }),
  });
  // Funded through the action rather than by writing to the double, so the row
  // the claim reads is a row the real feature produced.
  await act<BountySummary>(BOUNTY_FUND, {
    bountyId: created.id,
    amountCents: FUNDED,
    sponsorUserId: 'user-sponsor',
    reportedBy: 'a-person',
  });
  return created;
}

describe('creating a bounty with a mode', () => {
  it('refuses a mode this build has never heard of', async () => {
    const { runtime } = await harness();
    // A battle mode is the exact mistake: it is a real word, it is a real mode
    // of something, and accepting it here is how a bounty ends up governed by a
    // rule written for a match.
    await expect(
      actor(runtime)(BOUNTY_CREATE, {
        repoOwner: REPO_OWNER,
        repoName: REPO_NAME,
        issueNumber: ISSUE,
        mode: 'speed',
      }),
    ).rejects.toMatchObject({
      code: 'malformed-input',
      reason: { reason: 'mode-not-a-known-bounty-mode' },
    });
  });

  it('refuses a mode this build renamed, rather than accepting it as an alias', async () => {
    const { runtime } = await harness();
    // The four names §11.3 used. Accepting them would keep the collision with
    // the battle taxonomy alive while appearing to have fixed it.
    for (const legacy of ['race', 'open', 'tournament', 'team']) {
      await expect(
        actor(runtime)(BOUNTY_CREATE, {
          repoOwner: REPO_OWNER,
          repoName: REPO_NAME,
          issueNumber: ISSUE,
          mode: legacy,
        }),
      ).rejects.toMatchObject({ reason: { reason: 'mode-not-a-known-bounty-mode' } });
    }
  });

  it('refuses a mode that is not a string at all', async () => {
    const { runtime } = await harness();
    await expect(
      actor(runtime)(BOUNTY_CREATE, {
        repoOwner: REPO_OWNER,
        repoName: REPO_NAME,
        issueNumber: ISSUE,
        mode: { name: 'first-valid' },
      }),
    ).rejects.toMatchObject({ reason: { reason: 'mode-not-a-known-bounty-mode' } });
  });

  it('stores each mode it accepts, and defaults the ones that are absent', async () => {
    const { runtime, store } = await harness();
    for (const mode of BOUNTY_MODES) {
      const created = await actor(runtime)<BountySummary>(BOUNTY_CREATE, {
        repoOwner: REPO_OWNER,
        repoName: REPO_NAME,
        issueNumber: ISSUE,
        mode,
      });
      expect(created.mode).toBe(mode);
    }
    const unlabelled = await actor(runtime)<BountySummary>(BOUNTY_CREATE, {
      repoOwner: REPO_OWNER,
      repoName: REPO_NAME,
      issueNumber: ISSUE,
    });
    expect(unlabelled.mode).toBe(DEFAULT_BOUNTY_MODE);
    expect(store.rows.get(unlabelled.id)?.mode).toBe(DEFAULT_BOUNTY_MODE);
  });
});

describe('claiming a bounty whose mode this build cannot keep', () => {
  it('refuses, and says which rule it cannot honour', async () => {
    const { runtime } = await harness();
    const bounty = await fundedBounty(runtime, 'maintainer-picks');

    await expect(
      actor(runtime)(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT }),
    ).rejects.toMatchObject({ code: 'bounty-mode-not-playable' });

    // The refusal has to NAME the rule, or an agent that reads it cannot tell
    // whether the sponsor's terms are impossible or the platform is broken.
    await expect(
      actor(runtime)(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT }),
    ).rejects.toThrow(/maintainer/);
  });

  it('leaves the bounty claimable by nobody rather than handing it out as a race', async () => {
    const { runtime, store } = await harness();
    const bounty = await fundedBounty(runtime, 'best-validated');
    await expect(
      actor(runtime)(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT }),
    ).rejects.toMatchObject({ code: 'bounty-mode-not-playable' });
    // The store was never asked. A refusal that had already claimed and then
    // un-claimed would leave a claim row for a bounty nobody may work on.
    expect(store.rows.get(bounty.id)?.status).toBe('open');
    expect(store.rows.get(bounty.id)?.claimedAgentId).toBeNull();
  });

  it('refuses every unplayable mode, not just one', async () => {
    const { runtime } = await harness();
    for (const mode of ['maintainer-picks', 'best-validated', 'single-pr']) {
      const bounty = await fundedBounty(runtime, mode);
      await expect(
        actor(runtime)(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT }),
        `${mode} was claimable`,
      ).rejects.toMatchObject({ code: 'bounty-mode-not-playable' });
    }
  });

  it('still honours the one mode it can keep', async () => {
    const { runtime } = await harness();
    const bounty = await fundedBounty(runtime);
    const claimed = await actor(runtime)<BountySummary>(BOUNTY_CLAIM, {
      bountyId: bounty.id,
      agentId: AGENT,
    });
    expect(claimed.status).toBe('claimed');
    expect(claimed.claimedAgentId).toBe(AGENT);
  });
});

describe('a mode this build does not know', () => {
  it('keeps the older exclusive reading rather than being refused', async () => {
    const { runtime, store } = await harness();
    const bounty = await fundedBounty(runtime);
    // A row written before the taxonomy existed, or by an older build. The
    // handoff from ba-feature-bounty-xhk asked for this reading to be PRESERVED
    // rather than replaced, and the reason holds: an unrecognised value carries
    // no promise to keep, so the safe claim policy is the exclusive one. What it
    // must not do is resolve as a mode, which is why the refusal above is
    // narrowed to modes this build can name.
    await store.rows.set(bounty.id, { ...store.rows.get(bounty.id)!, mode: 'a-mode-from-2031' });
    const claimed = await actor(runtime)<BountySummary>(BOUNTY_CLAIM, {
      bountyId: bounty.id,
      agentId: AGENT,
    });
    expect(claimed.status).toBe('claimed');
  });

  it('is still exclusive under it', async () => {
    const { runtime, store } = await harness();
    const bounty = await fundedBounty(runtime);
    await store.rows.set(bounty.id, { ...store.rows.get(bounty.id)!, mode: 'a-mode-from-2031' });
    await actor(runtime)(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: AGENT });
    await expect(
      actor(runtime)(BOUNTY_CLAIM, { bountyId: bounty.id, agentId: 'agent-second' }),
    ).rejects.toMatchObject({ code: 'bounty-already-claimed' });
  });
});
