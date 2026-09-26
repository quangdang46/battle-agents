import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { agents as agentsTable, bounties, DrizzleActivityLog, users } from '@battle-agents/db';
import {
  BOUNTY_CLAIMED,
  BOUNTY_COMPLETED,
  BOUNTY_STATUSES,
  BOUNTY_SUBMITTED,
  type BountySummary,
} from '@battle-agents/bounty';
import { signPayload, WEBHOOK_SECRET_VARIABLE } from '@battle-agents/github';
import { OUTCOMES as PROGRESSION_OUTCOMES } from '@battle-agents/progression';

import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';
import { sharedGithubWebhook } from '../../apps/web/src/webhook-routes.js';
import type { WebhookHttpRequest } from '../../apps/web/src/webhook-routes.js';

/**
 * The M2 definition of done, end to end, on a scratch repository.
 *
 * Plan section 27 M2: "create bounty on a real test repo -> claim from agent ->
 * PR -> merge webhook -> payout job + XP/rep + history. DoD: end-to-end on a
 * scratch repo with real money rail stubbed (record intent, no real payout)."
 *
 * ## Why this file and not the suites that already exist
 *
 * `packages/features/bounty/src/feature.test.ts` proves the lifecycle.
 * `tests/integration/bounty-merge-award.test.ts` proves a merge pays one award.
 * Neither proves the sentence above, because the sentence is about the WIRING:
 * bounty emits, progression and reputation react, the durable store writes, and
 * a reader with no session can see the trail afterwards. A runtime composed
 * without bounty pays nobody; a bounty composed without progression completes
 * bounties and awards nothing. Both look complete from the inside.
 *
 * So this drives the spine the product actually runs — the composed runtime in
 * `apps/web/src/shared-runtime.ts` and the real webhook route — and reads the
 * result back out of Postgres.
 *
 * ## What "a scratch repository" means here, precisely
 *
 * Real repository COORDINATES and real `https://github.com/...` URLs, which is
 * what the two URL assertions pin. It does not mean this suite opens a socket to
 * github.com: a pipeline that did would fail when the network is down and pass
 * when the integration is broken. The one call that really does leave the
 * machine, `createIssueLookup`, takes an injectable `HttpFetch` precisely so it
 * can be exercised without one — and the feature's own path-traversal guards
 * are only reachable for coordinates that look like coordinates, so the shape is
 * the part worth gating here.
 *
 * ## Rows left behind
 *
 * Every row is tagged with a run-unique github id and nothing is deleted. A
 * bounty row is part of the audit trail of a payment claim, and a test that
 * deletes its own audit trail teaches the wrong lesson.
 * `tests/e2e/first-login.test.ts` is the suite that proves a run leaves nothing
 * behind, and this one deliberately does not extend that claim to payments.
 */

const SECRET = 'm2-bounty-loop-secret-not-real';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const REPO_OWNER = 'battle-agents';
const REPO_NAME_PREFIX = 'scratch';
const REWARD_CENTS = 20_000;
/** Real issue and PR numbers, because the SHAPE is what the integration rests on. */
const ISSUE_NUMBER = 1187;
const PULL_REQUEST = 1188;
/** The payload key the bounty feature stamps its own durable rows with. */
const BOUNTY_SCOPE_KEY = 'bountyId';

let closed = false;

beforeAll(() => {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m2.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  // The webhook reads its secret from the environment on every delivery, by
  // design, so rotating it needs no restart. Without this line the handler
  // refuses the delivery — correctly — and the failure surfaces much later as an
  // experience total of zero rather than as an error at the point it happened.
  process.env[WEBHOOK_SECRET_VARIABLE] = SECRET;
});

afterAll(async () => {
  delete process.env[WEBHOOK_SECRET_VARIABLE];
  if (closed) return;
  closed = true;
  await closeSharedRuntime();
});

/** A sponsor, and a solver who belongs to that sponsor's account. */
async function aSponsorAndASolver(): Promise<{
  readonly sponsorId: string;
  readonly agentId: string;
}> {
  const { database } = await sharedRuntime();
  const githubId = `m2-sponsor-${randomUUID()}`;
  const [sponsor] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agentsTable)
    .values({
      userId: sponsor?.id ?? '',
      name: `m2-solver-${randomUUID().slice(0, 8)}`,
      harness: 'claude-code',
    })
    .returning({ id: agentsTable.id });
  return { sponsorId: sponsor?.id ?? '', agentId: agent?.id ?? '' };
}

interface Scratch {
  readonly bountyId: string;
  readonly agentId: string;
  readonly repoName: string;
  readonly repository: string;
  /** The summary as it stands AFTER submit, which is the one with a prUrl. */
  readonly summary: BountySummary;
}

/**
 * create -> fund -> claim -> submit, through the shared runtime's own actions.
 *
 * The scratch repository is named after this run, so a red report names which one
 * it was about. Two suites that both used a fixed `dojo` name would leave every
 * failure ambiguous about which bounty it was talking about.
 *
 * The summary returned is the one from `bounty.submit`, not from `bounty.create`.
 * The create-time summary is `open` with no pull request, so a test that kept it
 * would assert the pre-claim state while believing it was asserting the loop.
 */
async function aSubmittedScratch(): Promise<Scratch> {
  const { runtime } = await sharedRuntime();
  const { sponsorId, agentId } = await aSponsorAndASolver();
  const repoName = `${REPO_NAME_PREFIX}-${randomUUID().slice(0, 12)}`;
  const repository = `${REPO_OWNER}/${repoName}`;

  const created = (await runtime.runAction('bounty.create', {
    repoOwner: REPO_OWNER,
    repoName,
    issueNumber: ISSUE_NUMBER,
  })) as BountySummary;
  await runtime.runAction('bounty.fund', {
    bountyId: created.id,
    amountCents: REWARD_CENTS,
    sponsorUserId: sponsorId,
    reportedBy: 'm2-sponsor-person',
  });
  await runtime.runAction('bounty.claim', { bountyId: created.id, agentId });
  const summary = (await runtime.runAction('bounty.submit', {
    bountyId: created.id,
    agentId,
    prUrl: `https://github.com/${repository}/pull/${PULL_REQUEST}`,
  })) as BountySummary;
  return { bountyId: created.id, agentId, repoName, repository, summary };
}

/** A body GitHub would actually send, pretty-printed as it sends it. */
function mergeBody(repository: string): string {
  return JSON.stringify(
    {
      action: 'closed',
      repository: { full_name: repository },
      pull_request: {
        number: PULL_REQUEST,
        merged: true,
        merged_at: '2026-09-26T12:00:00Z',
        user: { login: 'm2-maintainer' },
      },
    },
    null,
    2,
  );
}

function delivery(body: string, deliveryId: string, secret: string): WebhookHttpRequest {
  return {
    method: 'POST',
    url: 'https://game.example/api/webhooks/github',
    headers: {
      get: (name: string): string | null => {
        switch (name.toLowerCase()) {
          case 'x-hub-signature-256':
            return signPayload(secret, body);
          case 'x-github-delivery':
            return deliveryId;
          case 'x-github-event':
            return 'pull_request';
          default:
            return null;
        }
      },
    },
    rawBody: body,
  };
}

/** A signed merge for this scratch repo, exactly once. */
async function postMerge(
  repository: string,
  deliveryLabel: string,
  secret = SECRET,
): Promise<number> {
  const response = await (
    await sharedGithubWebhook()
  )(delivery(mergeBody(repository), `m2-${deliveryLabel}-${randomUUID()}`, secret));
  return response.status;
}

async function xpOf(agentId: string): Promise<number> {
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({ xp: agentsTable.xp })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return row?.xp ?? 0;
}

async function storedBounty(bountyId: string): Promise<{ status: string; prUrl: string | null }> {
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({ status: bounties.status, prUrl: bounties.prUrl })
    .from(bounties)
    .where(eq(bounties.id, bountyId))
    .limit(1);
  return { status: row?.status ?? '', prUrl: row?.prUrl ?? null };
}

/**
 * The durable trail for one bounty, in the order the log recorded it.
 *
 * Through the activity port rather than hand-written SQL, because the tag key is
 * the bounty feature's own choice and this is the read the replay uses. Two
 * queries for "the history of this bounty" free to disagree is the problem that
 * shape exists to prevent. `scopedTimeline` orders by the log's own id, so the
 * order asserted below is the order the rows were written in.
 */
async function trailTypesFor(bountyId: string): Promise<readonly string[]> {
  const { database } = await sharedRuntime();
  const entries = await new DrizzleActivityLog(database).scopedTimeline({
    tagged: { key: BOUNTY_SCOPE_KEY, value: bountyId },
  });
  return entries.map((entry) => entry.type);
}

describe('M2: issue -> bounty -> claim -> PR -> merge -> reward -> history', () => {
  it('puts the bounty on a real GitHub issue, in real GitHub coordinates', async () => {
    const { summary, repository } = await aSubmittedScratch();

    // The SHAPE, not the liveness. A pipeline that minted
    // `https://example.invalid/...` would let a broken GitHub integration pass,
    // and the feature's own path-traversal guards in domain.ts are only reachable
    // for coordinates that look like coordinates.
    expect(summary.issueUrl).toBe(`https://github.com/${repository}/issues/${ISSUE_NUMBER}`);
    expect(summary.prUrl).toBe(`https://github.com/${repository}/pull/${PULL_REQUEST}`);
    expect(summary.repository.repoOwner).toBe(REPO_OWNER);
    expect(summary.repository.repoName).toMatch(new RegExp(`^${REPO_NAME_PREFIX}-`));
    expect(summary.status).toBe('submitted');
  });

  it('leaves the bounty where it was until a signed merge arrives', async () => {
    const { bountyId, agentId, summary } = await aSubmittedScratch();

    // Before the merge. This is the half a pipeline can pass without noticing: a
    // bounty that sits `submitted` forever looks identical to one that
    // completed, to anything that only reads the assertions after it.
    expect(summary.status).toBe('submitted');
    expect((await storedBounty(bountyId)).status).toBe('submitted');
    expect(await xpOf(agentId)).toBe(0);
  });

  it('completes the bounty on the merge, and awards XP and reputation', async () => {
    const { bountyId, agentId, repository } = await aSubmittedScratch();

    expect(await postMerge(repository, 'merge')).toBe(200);
    expect((await storedBounty(bountyId)).status).toBe('completed');

    // 1000, read from the price table rather than written out, so a retune of
    // the table retunes this assertion instead of leaving a number here that
    // quietly stopped describing the award.
    expect(await xpOf(agentId)).toBe(PROGRESSION_OUTCOMES['bounty.completed'].xp);

    // Read through reputation's OWN action rather than through a table. A runtime
    // composed without the reputation feature answers a fresh record from memory
    // and one without the store answers zero; neither is a completed bounty, and
    // a direct table read would not have told the two apart.
    const { runtime } = await sharedRuntime();
    const reputation = (await runtime.runAction('reputation.read', { agentId })) as {
      completed: number;
      earnedCents: number;
    };
    expect(reputation.completed).toBe(1);
    expect(reputation.earnedCents).toBe(REWARD_CENTS);
  });

  it('leaves the trail in the log, in order, for a reader with no session', async () => {
    const scratch = await aSubmittedScratch();
    expect(await postMerge(scratch.repository, 'trail')).toBe(200);

    const types = await trailTypesFor(scratch.bountyId);

    for (const expected of [BOUNTY_CLAIMED, BOUNTY_SUBMITTED, BOUNTY_COMPLETED]) {
      expect(types, `the trail is missing ${expected}`).toContain(expected);
    }
    // Order, because a history that lists the completion before the claim reads
    // as a plausible story and is not one.
    expect(types.indexOf(BOUNTY_CLAIMED)).toBeLessThan(types.indexOf(BOUNTY_SUBMITTED));
    expect(types.indexOf(BOUNTY_SUBMITTED)).toBeLessThan(types.indexOf(BOUNTY_COMPLETED));
  });

  it('refuses a delivery nobody signed, and changes nothing', async () => {
    const { bountyId, agentId, repository } = await aSubmittedScratch();

    const status = await postMerge(repository, 'forged', 'a-different-secret');

    expect(status).toBe(401);
    expect((await storedBounty(bountyId)).status).toBe('submitted');
    expect(await xpOf(agentId)).toBe(0);
  });

  it('reports a status the feature actually has a case for', () => {
    // The loop above asserts on the strings 'submitted' and 'completed'. If the
    // status vocabulary changed, those assertions would keep compiling and keep
    // asserting — against names nothing produces. This is the one place the
    // DoD's prose and the feature's own table are both in scope.
    expect(BOUNTY_STATUSES).toContain('submitted');
    expect(BOUNTY_STATUSES).toContain('completed');
  });
});
