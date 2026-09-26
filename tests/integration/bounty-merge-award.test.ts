import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BOUNTY_COMPLETED,
  GITHUB_PULL_REQUEST_MERGED,
  PULL_REQUEST_MERGED_OUTCOME,
} from '@battle-agents/bounty';
import type { BountySummary } from '@battle-agents/bounty';
import { signPayload, WEBHOOK_SECRET_VARIABLE } from '@battle-agents/github';
import { OUTCOMES as PROGRESSION_OUTCOMES } from '@battle-agents/progression';
import { agents as agentsTable, users } from '@battle-agents/db';

import { sharedGithubWebhook } from '../../apps/web/src/webhook-routes.js';
import type { WebhookHttpRequest } from '../../apps/web/src/webhook-routes.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';

/**
 * The double-pay, end to end, on the wiring the app actually runs.
 *
 * The decision ba-feature-bounty-xhk owns: a merged pull request pays at most
 * one award. `bounty.completed` pays 1000, `pr.merged` pays 500, and a merge
 * that completed a bounty produces BOTH events — the first is the award, the
 * second is the fact. The exclusion lives in the price table
 * (features/progression/src/rules.ts: `requires: { completedBounty: false }`),
 * so the total is bounded by the table rather than by the bounty feature
 * remembering to withhold.
 *
 * ## Why this file and not the unit suites
 *
 * The two feature suites each prove half. Bounty's proves it emits both events
 * with the right flags and completes once; progression's proves the table
 * charges once. Neither can prove the two halves are WIRED together, and the
 * wiring is the thing that was armed: a runtime composed without the bounty
 * feature subscribes to nothing, and a bounty feature composed without
 * progression pays nobody — both look complete from the inside.
 *
 * So this drives the same spine the product does: a signed GitHub delivery
 * posted at `POST /api/webhooks/github`, which lands on the shared runtime, and
 * then reads the agent's experience row out of Postgres.
 *
 * ## Why the mutants are named
 *
 * Every guard here was watched failing. Removing `completedBounty: false` from
 * the `pr.merged` row turns the first assertion below red with 1500 instead of
 * 1000. Emitting only `bounty.completed` and never `pr.merged` leaves it green —
 * which is the point: the guarantee is about the TOTAL, and a change that
 * removes an event is a smaller change than one that misprices one.
 */

const SECRET = 'bounty-award-secret-not-real';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const REPO_OWNER = 'battle-agents';
const AGENT_NAME = 'award-solver';

let closed = false;

beforeAll(() => {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  // The webhook reads its secret from the environment on every delivery, by
  // design, so rotating it needs no restart. Which means a test that posts a
  // signed delivery and forgets this line signs with a secret nobody is
  // configured to accept, and the handler refuses it — as it should. The
  // delivery is then acknowledged rather than retried and nothing is emitted, so
  // the failure shows up as an experience total of zero rather than as an error.
  process.env[WEBHOOK_SECRET_VARIABLE] = SECRET;
});

afterAll(async () => {
  delete process.env[WEBHOOK_SECRET_VARIABLE];
  if (closed) {
    return;
  }
  closed = true;
  await closeSharedRuntime();
});

/** A body GitHub would actually send, pretty-printed as it sends it. */
function mergeBody(repository: string, pullRequest: number): string {
  return JSON.stringify(
    {
      action: 'closed',
      repository: { full_name: repository },
      pull_request: {
        number: pullRequest,
        merged: true,
        merged_at: '2026-09-26T12:00:00Z',
        user: { login: 'maintainer-person' },
      },
    },
    null,
    2,
  );
}

function delivery(body: string, deliveryId: string): WebhookHttpRequest {
  return {
    method: 'POST',
    url: 'https://game.example/api/webhooks/github',
    headers: {
      get: (name: string): string | null => {
        switch (name.toLowerCase()) {
          case 'x-hub-signature-256':
            return signPayload(SECRET, body);
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

async function xpOf(agentId: string): Promise<number> {
  const { database } = sharedRuntime();
  const [row] = await database
    .select({ xp: agentsTable.xp })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return row?.xp ?? 0;
}

/** create -> fund -> claim -> submit, through the shared runtime's own actions. */
async function submittedBounty(): Promise<{
  readonly agentId: string;
  readonly repository: string;
  readonly pullRequest: number;
}> {
  const { database, runtime } = sharedRuntime();
  const githubId = `${randomUUID()}-award-sponsor`;
  const [user] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agentsTable)
    .values({
      userId: user?.id ?? '',
      name: `${AGENT_NAME}-${randomUUID().slice(0, 8)}`,
      harness: 'claude-code',
    })
    .returning({ id: agentsTable.id });

  const repoName = `dojo-${randomUUID().slice(0, 8)}`;
  const repository = `${REPO_OWNER}/${repoName}`;
  const pullRequest = 43;

  const created = (await runtime.runAction('bounty.create', {
    repoOwner: REPO_OWNER,
    repoName,
    issueNumber: 42,
  })) as BountySummary;
  await runtime.runAction('bounty.fund', {
    bountyId: created.id,
    amountCents: 20_000,
    sponsorUserId: user?.id ?? '',
    reportedBy: 'sponsor-person',
  });
  await runtime.runAction('bounty.claim', { bountyId: created.id, agentId: agent?.id ?? '' });
  await runtime.runAction('bounty.submit', {
    bountyId: created.id,
    agentId: agent?.id ?? '',
    prUrl: `https://github.com/${repository}/pull/${pullRequest}`,
  });

  return { agentId: agent?.id ?? '', repository, pullRequest };
}

describe('one merged pull request pays one award', () => {
  it('pays the bounty award, not the sum of the two rows', async () => {
    const { agentId, repository, pullRequest } = await submittedBounty();
    const body = mergeBody(repository, pullRequest);

    await sharedGithubWebhook()(delivery(body, `award-${randomUUID()}`));

    // 1000, not 1500. The assertion is the sum of the two rows in the price
    // table, so a retune of either is a retune of this number rather than a
    // number that quietly stopped matching the table.
    expect(await xpOf(agentId)).toBe(PROGRESSION_OUTCOMES['bounty.completed'].xp);
    expect(await xpOf(agentId)).not.toBe(
      PROGRESSION_OUTCOMES['bounty.completed'].xp + PROGRESSION_OUTCOMES['pr.merged'].xp,
    );
  });

  it('pays the same when the delivery is repeated with a fresh delivery id', async () => {
    const { agentId, repository, pullRequest } = await submittedBounty();
    const body = mergeBody(repository, pullRequest);

    // Three deliveries, three ids, one merge. GitHub is at-least-once and
    // reissues ids, so this is the pair that pays three times if the guard is
    // anything but the status transition.
    for (const _attempt of [1, 2, 3]) {
      await sharedGithubWebhook()(delivery(body, `repeat-${randomUUID()}`));
    }

    expect(await xpOf(agentId)).toBe(PROGRESSION_OUTCOMES['bounty.completed'].xp);
  });

  it('pays nothing for a merge that completed no bounty', async () => {
    const { database } = sharedRuntime();
    const githubId = `${randomUUID()}-bystander`;
    const [user] = await database
      .insert(users)
      .values({ githubId, login: githubId })
      .returning({ id: users.id });
    const [agent] = await database
      .insert(agentsTable)
      .values({
        userId: user?.id ?? '',
        name: `${AGENT_NAME}-${randomUUID().slice(0, 8)}`,
        harness: 'claude-code',
      })
      .returning({ id: agentsTable.id });
    await database
      .update(agentsTable)
      .set({ xp: 0 })
      .where(eq(agentsTable.id, agent?.id ?? ''));

    const body = mergeBody(`${REPO_OWNER}/nothing-here`, 7);
    await sharedGithubWebhook()(delivery(body, `nobounty-${randomUUID()}`));

    // The merge reached the game as a fact and paid nobody. There is no claim,
    // so there is no agent to attribute it to, and inventing one is the identity
    // bug the whole correlation design is built to avoid.
    expect(await xpOf(agent?.id ?? '')).toBe(0);
  });

  it('is decided by the price table, not by which events the bounty emits', () => {
    // The structural half, asserted where both sides are in scope. This is the
    // only file in the repository that can hold the integration's event name and
    // progression's price table at once: a feature may not import the GitHub
    // package (architecture-rules.cjs forbids a feature importing any outer
    // layer), and a test inside progression cannot import it either.
    expect(PROGRESSION_OUTCOMES['pr.merged'].requires).toEqual({
      field: 'completedBounty',
      equals: false,
    });
    expect(Object.keys(PROGRESSION_OUTCOMES) as string[]).not.toContain(GITHUB_PULL_REQUEST_MERGED);
    // The two names are distinct events and both are emitted for a bounty
    // merge, so the distinctness is what the gate rests on.
    expect(BOUNTY_COMPLETED).not.toBe(PULL_REQUEST_MERGED_OUTCOME);
    // Neither name is the integration's. The edge reports what it observed and
    // the game decides what it means, and that separation is the only reason
    // this decision could be made deliberately rather than by accident.
    expect(BOUNTY_COMPLETED).not.toBe(GITHUB_PULL_REQUEST_MERGED);
    expect(PULL_REQUEST_MERGED_OUTCOME).not.toBe(GITHUB_PULL_REQUEST_MERGED);
  });
});
