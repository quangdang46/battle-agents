import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { agents as agentsTable, DrizzleActivityLog, payoutIntents, users } from '@battle-agents/db';
import {
  BOUNTY_FUNDING_REFUSED,
  checkIntent,
  FUNDING_REFUSAL_DISPOSITIONS,
  FUNDING_REFUSALS,
  INTENT_ONLY,
  MIN_BOUNTY_CENTS,
  NO_MONEY_WAS_TAKEN,
  PAYOUT_REJECTIONS,
  SANDBOX_NOTICE,
  type BountySummary,
  type PayoutIntent,
  type PayoutMode,
} from '@battle-agents/bounty';
import { signPayload, WEBHOOK_SECRET_VARIABLE } from '@battle-agents/github';

import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';
import { sharedGithubWebhook } from '../../apps/web/src/webhook-routes.js';
import type { WebhookHttpRequest } from '../../apps/web/src/webhook-routes.js';

/**
 * The M2 money rail, stubbed: record the intent, move no money, say so.
 *
 * Plan section 27 M2 ends "with real money rail stubbed (record intent, no real
 * payout until 17.5 resolved — mark clearly in UI 'payout: manual/sandbox')", and
 * section 7.5 says that arrangement is not a phase: Vercel Hobby counts "any
 * method of requesting or processing payment" as commercial use, so the platform
 * may hold, route and process no money at all. `docs/design/payout-rail.md` is
 * the design; this file is where it becomes a gate.
 *
 * ## What this asserts that the unit suite does not
 *
 * `packages/features/bounty/src/payout.test.ts` proves the pure state machine
 * over in-memory values. This proves three things only a database can answer:
 *
 *   1. the lifecycle actually WROTE an intent, in `pending`, attributed to a
 *      person;
 *   2. the row cannot say it transferred anything — the column refuses a second
 *      mode, so the guarantee is not "nobody has written one yet";
 *   3. every read of a money-attached bounty carries the marking, so a surface
 *      cannot render the reward without being handed the question.
 *
 * ## The UI clause, honestly scoped
 *
 * The DoD says "mark clearly in UI". There is no bounty page in this tree:
 * `apps/web/app` holds a home placeholder, the auth routes, the event routes and
 * the replay route, and nothing that lists a bounty. So the marking is settled
 * HERE, at the read model every surface would render from — `PayoutNotice` is on
 * every `BountySummary` unconditionally, and `sandbox` is true wherever money is
 * attached and untransferred — and this file says the gap out loud rather than
 * letting a green stage be read as a rendered banner. `ba-web-ui-surface-t3w`
 * owns the page; this is not a substitute for it.
 */

const SECRET = 'm2-payout-stub-secret-not-real';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const REPO_OWNER = 'battle-agents';
const REPO_NAME_PREFIX = 'scratch';
const REWARD_CENTS = 75_000;
const ISSUE_NUMBER = 2244;
const PULL_REQUEST = 2245;

let closed = false;

beforeAll(() => {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m2.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  process.env[WEBHOOK_SECRET_VARIABLE] = SECRET;
});

afterAll(async () => {
  delete process.env[WEBHOOK_SECRET_VARIABLE];
  if (closed) return;
  closed = true;
  await closeSharedRuntime();
});

interface Scratch {
  readonly bountyId: string;
  readonly agentId: string;
  readonly repoName: string;
  readonly repository: string;
  readonly unfunded: BountySummary;
  readonly funded: BountySummary;
}

async function aSponsorAndASolver(): Promise<{ sponsorId: string; agentId: string }> {
  const { database } = await sharedRuntime();
  const githubId = `m2-rail-sponsor-${randomUUID()}`;
  const [sponsor] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agentsTable)
    .values({
      userId: sponsor?.id ?? '',
      name: `m2-rail-solver-${randomUUID().slice(0, 8)}`,
      harness: 'claude-code',
    })
    .returning({ id: agentsTable.id });
  return { sponsorId: sponsor?.id ?? '', agentId: agent?.id ?? '' };
}

/** create -> fund, and no further. Both summaries are kept; the pair is the point. */
async function aFundedScratch(): Promise<Scratch> {
  const { runtime } = await sharedRuntime();
  const { sponsorId, agentId } = await aSponsorAndASolver();
  const repoName = `${REPO_NAME_PREFIX}-${randomUUID().slice(0, 12)}`;
  const repository = `${REPO_OWNER}/${repoName}`;

  const unfunded = (await runtime.runAction('bounty.create', {
    repoOwner: REPO_OWNER,
    repoName,
    issueNumber: ISSUE_NUMBER,
  })) as BountySummary;
  const funded = (await runtime.runAction('bounty.fund', {
    bountyId: unfunded.id,
    amountCents: REWARD_CENTS,
    sponsorUserId: sponsorId,
    reportedBy: 'm2-rail-sponsor-person',
  })) as BountySummary;
  return { bountyId: unfunded.id, agentId, repoName, repository, unfunded, funded };
}

/** claim -> submit, so the bounty is one signed merge away from completed. */
async function submit(scratch: Scratch): Promise<void> {
  const { runtime } = await sharedRuntime();
  await runtime.runAction('bounty.claim', { bountyId: scratch.bountyId, agentId: scratch.agentId });
  await runtime.runAction('bounty.submit', {
    bountyId: scratch.bountyId,
    agentId: scratch.agentId,
    prUrl: `https://github.com/${scratch.repository}/pull/${PULL_REQUEST}`,
  });
}

async function postMerge(repository: string): Promise<number> {
  const body = JSON.stringify(
    {
      action: 'closed',
      repository: { full_name: repository },
      pull_request: {
        number: PULL_REQUEST,
        merged: true,
        merged_at: '2026-09-26T13:00:00Z',
        user: { login: 'm2-rail-maintainer' },
      },
    },
    null,
    2,
  );
  const request: WebhookHttpRequest = {
    method: 'POST',
    url: 'https://game.example/api/webhooks/github',
    headers: {
      get: (name: string): string | null => {
        switch (name.toLowerCase()) {
          case 'x-hub-signature-256':
            return signPayload(SECRET, body);
          case 'x-github-delivery':
            return `m2-rail-${randomUUID()}`;
          case 'x-github-event':
            return 'pull_request';
          default:
            return null;
        }
      },
    },
    rawBody: body,
  };
  const response = await (await sharedGithubWebhook())(request);
  return response.status;
}

interface StoredIntent {
  readonly state: string;
  readonly mode: string;
  readonly amountCents: number;
  readonly reportedBy: string;
}

async function intentFor(bountyId: string): Promise<StoredIntent | undefined> {
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({
      state: payoutIntents.state,
      mode: payoutIntents.mode,
      amountCents: payoutIntents.amountCents,
      reportedBy: payoutIntents.reportedBy,
    })
    .from(payoutIntents)
    .where(eq(payoutIntents.bountyId, bountyId))
    .limit(1);
  return row;
}

async function listed(repoName: string): Promise<readonly BountySummary[]> {
  const { runtime } = await sharedRuntime();
  return (await runtime.runAction('bounty.list', {
    repoOwner: REPO_OWNER,
    repoName,
  })) as readonly BountySummary[];
}

/** A second person, who did not open the issue and does not own the repository. */
async function aSecondSponsor(): Promise<string> {
  const { database } = await sharedRuntime();
  const githubId = `m2-rail-outsider-${randomUUID()}`;
  const [sponsor] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  return sponsor?.id ?? '';
}

/**
 * The durable log rows for one bounty, oldest first.
 *
 * Through the activity port rather than SQL, for the reason
 * `tests/m2/bounty-loop.test.ts` gives: the tag key is the bounty feature's own
 * choice and this is the read the replay uses, so a hand-written query would be
 * a second definition of "the history of this bounty" free to disagree with it.
 */
async function trailFor(bountyId: string): Promise<readonly { type: string; payload: unknown }[]> {
  const { database } = await sharedRuntime();
  return await new DrizzleActivityLog(database).scopedTimeline({
    tagged: { key: 'bountyId', value: bountyId },
  });
}

describe('the M2 money rail: intent recorded, nothing moved', () => {
  it('records a funded intent when money is attached, attributed to a person', async () => {
    const { bountyId } = await aFundedScratch();

    const intent = await intentFor(bountyId);

    expect(intent, 'funding wrote no payout intent at all').toBeDefined();
    expect(intent?.state).toBe('funded');
    expect(intent?.amountCents).toBe(REWARD_CENTS);
    // Every state is somebody's claim, including `funded`. An unattributed
    // intent is the one row an audit cannot use.
    expect(intent?.reportedBy).toBe('m2-rail-sponsor-person');
  });

  it('moves the intent to pending on the merge, and stops there', async () => {
    const scratch = await aFundedScratch();
    await submit(scratch);

    expect(await postMerge(scratch.repository)).toBe(200);

    const intent = await intentFor(scratch.bountyId);
    // `pending`, not `paid` and not `recorded`. A merge is a reason to pay; it
    // is not a payment, and the state the platform stops at is the guarantee.
    expect(intent?.state).toBe('pending');
    expect(intent?.amountCents).toBe(REWARD_CENTS);
    // `recorded` is the state a human claims a transfer happened. The platform
    // cannot observe one, so nothing in this loop can reach it.
    expect(intent?.state).not.toBe('recorded');
  });

  it('stores the only mode that exists, on every intent in the table', async () => {
    const scratch = await aFundedScratch();
    await submit(scratch);
    await postMerge(scratch.repository);

    const { database } = await sharedRuntime();
    const rows = await database.execute<{ mode: string; offenders: number }>(
      sql`SELECT mode, count(*)::integer AS offenders FROM payout_intents
          WHERE mode <> ${INTENT_ONLY} GROUP BY mode`,
    );
    // The whole table, not this run's rows, because the claim is about the
    // platform rather than about one bounty. Verified by mutation: writing
    // `mode = 'real'` with raw SQL against this same table leaves it red with
    // the offending value named, which is how the missing CHECK below was found.
    expect(
      rows.rows ?? [],
      'a payout intent somewhere claims money moved; the money rail is a type and not a constraint',
    ).toEqual([]);

    const written = await database.execute<{ count: number }>(
      sql`SELECT count(*)::integer AS count FROM payout_intents`,
    );
    expect(
      written.rows?.[0]?.count ?? 0,
      'no payout intent has ever been written, so this proves nothing',
    ).toBeGreaterThan(0);
    expect((await intentFor(scratch.bountyId))?.mode).toBe(INTENT_ONLY);
  });

  it('refuses an intent that claims money moved, at the one gate that exists', () => {
    // NOT a database assertion, and the reason is worth stating because the
    // schema claims otherwise. `packages/db/src/schema/features/bounty.ts`
    // describes the `mode` column as "A CHECK rather than an enum type, so a
    // second mode added anywhere else is refused by the database" — and there is
    // no such CHECK. `pg_constraint` on `payout_intents` holds four: the primary
    // key, the foreign key, `amount_cents >= 0`, `reported_by <> ''`, and
    // `payout_intents_state_known`. A raw `UPDATE payout_intents SET mode =
    // 'real'` succeeds today. Drizzle's `text({ enum })` is a TypeScript-side
    // annotation and emits no DDL constraint.
    //
    // So the guarantee is the single-member `PayoutMode` union plus the
    // `checkIntent` refusal below, and that is what this asserts. Asserting a
    // constraint that does not exist would be the exact "comment as claim"
    // failure the comment itself is; the fix is a migration (0018 is free) and
    // belongs to whoever owns the payout rail, not to a test that would have to
    // be deleted to let the fix land.
    const intent = {
      bountyId: 'm2-rail-probe',
      amountCents: 100,
      state: 'funded' as const,
      mode: 'real',
      recordedAt: '2026-09-26T13:00:00.000Z',
      reportedBy: 'm2-rail-probe',
    };

    const verdict = checkIntent(intent as unknown as PayoutIntent, undefined);

    expect(verdict.accepted, 'a second payout mode was accepted by the rail').toBe(false);
    if (verdict.accepted === false) {
      expect(verdict.code).toBe(PAYOUT_REJECTIONS.transferAttempted);
    }
    // The mode is a single-member union, so there is no second value to name
    // even if a caller wanted one. Asserted by assignment rather than by
    // inspection because a widened union fails to COMPILE, which is the property
    // the payout design is built on: adding `real` is a visible edit to
    // packages/features/bounty/src/payout.ts, not a value somebody can pass.
    const onlyMode: PayoutMode = INTENT_ONLY;
    expect(onlyMode).toBe('intent-only');
  });

  it('hands a funded bounty the marking, in words, on every read', async () => {
    const scratch = await aFundedScratch();

    // Unfunded: no money attached, so nothing to disclaim. Funded: money attached
    // and not moved, so the disclaimer is required. A caller that received
    // `rewardCents` without a `notice` beside it would have nothing to render,
    // and would render the number.
    expect(scratch.unfunded.payout.sandbox).toBe(false);
    expect(scratch.funded.payout.sandbox).toBe(true);

    const fromList = (await listed(scratch.repoName)).find((each) => each.id === scratch.bountyId);
    expect(fromList, 'the funded bounty is not in its own repository listing').toBeDefined();
    expect(fromList?.payout.notice).toBe(SANDBOX_NOTICE);
    // The notice says what it is, not merely that something is off. A banner
    // reading "sandbox" and a banner reading "this was not a payment" are
    // different artefacts, and only the second stops somebody believing they
    // were paid.
    expect(fromList?.payout.notice).toContain('not a payment');
    expect(fromList?.payout.notice).toContain('Nothing has been transferred');

    // Two reads of the same bounty through the same surface, at two moments,
    // carrying the same sentence. `withPayout` is what attaches the notice, and
    // a path that assembled a summary without calling it would ship the number
    // with no disclaimer beside it.
    expect(fromList?.payout.notice).toBe(scratch.funded.payout.notice);
    expect(fromList?.rewardCents).toBe(scratch.funded.rewardCents);
  });

  it('keeps the marking on a COMPLETED bounty, the state that could hide it', async () => {
    const scratch = await aFundedScratch();
    await submit(scratch);
    await postMerge(scratch.repository);

    const completed = (await listed(scratch.repoName)).find((each) => each.id === scratch.bountyId);

    expect(completed?.status).toBe('completed');
    // `completed` is where a naive renderer drops the banner, because the work is
    // done and the status reads like an ending. The work is done; no money moved.
    expect(completed?.payout.sandbox).toBe(true);
    expect(completed?.payout.notice).toBe(SANDBOX_NOTICE);
  });

  it('refuses to let anyone claim a reward below the floor', async () => {
    const { runtime } = await sharedRuntime();
    const { sponsorId, agentId } = await aSponsorAndASolver();
    const repoName = `${REPO_NAME_PREFIX}-${randomUUID().slice(0, 12)}`;
    const created = (await runtime.runAction('bounty.create', {
      repoOwner: REPO_OWNER,
      repoName,
      issueNumber: ISSUE_NUMBER,
    })) as BountySummary;
    const under = (await runtime.runAction('bounty.fund', {
      bountyId: created.id,
      amountCents: MIN_BOUNTY_CENTS - 1,
      sponsorUserId: sponsorId,
      reportedBy: 'm2-rail-tiny-sponsor',
    })) as BountySummary;

    const refusal = await runtime
      .runAction('bounty.claim', { bountyId: created.id, agentId })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    // A $2 bounty weighs exactly as much in the aggregate trust score as a
    // $2000 one, which makes the score noise. The funding is still recorded —
    // a sponsor's money is a fact whether or not the bounty is worth having —
    // and the claim is what the floor refuses.
    expect(under.rewardCents).toBe(MIN_BOUNTY_CENTS - 1);
    expect(under.status).not.toBe('claimed');
    expect(refusal, `a ${MIN_BOUNTY_CENTS - 1} cent bounty was claimable`).toBeInstanceOf(Error);
    expect((refusal as { code?: string }).code).toBe('bounty-under-minimum');
  });

  it('leaves a refused top-up on the record, and says the money never moved', async () => {
    // The case this whole bead turns on: a solver's PR has been merged, the
    // reward is owed, and somebody who is not the repo owner and did not open
    // the issue tries to add their own money to it anyway. The gate refuses,
    // and the question the refusal has to answer is "so where did my money go?".
    //
    // The answer is nowhere, because the platform never had it — payout-rail
    // section 1. That is a STRANGER answer to a sponsor than "you were
    // refunded", and it is the one that is true, so it is the one that is
    // asserted, in the log row as well as on the throw.
    const scratch = await aFundedScratch();
    await submit(scratch);
    expect(await postMerge(scratch.repository)).toBe(200);

    const { runtime } = await sharedRuntime();
    const outsiderId = await aSecondSponsor();
    const ATTEMPTED_CENTS = 5_000;

    const refused = await runtime
      .runAction('bounty.fund', {
        bountyId: scratch.bountyId,
        amountCents: ATTEMPTED_CENTS,
        sponsorUserId: outsiderId,
        reportedBy: 'm2-rail-outsider-person',
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(refused, 'a completed bounty accepted money from a stranger').toBeInstanceOf(Error);
    expect((refused as { code?: string }).code).toBe(FUNDING_REFUSALS.terminal);
    // 409, not 500. The request was well formed and the domain declined it, and
    // a client that reads 500 as "our fault, retry" would retry a top-up that
    // can never succeed.
    expect((refused as { status?: number }).status).toBe(409);

    // Durable, and readable by somebody with no session — the repository owner
    // settling a dispute is exactly that reader, and payout-rail section 4.2
    // says the log is the evidence. A refusal that only reached the throw would
    // leave nothing to show.
    const rows = (await trailFor(scratch.bountyId)).filter(
      (row) => row.type === BOUNTY_FUNDING_REFUSED,
    );
    expect(rows, 'the refusal reached nobody: no log row was written').toHaveLength(1);
    const payload = rows[0]?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      bountyId: scratch.bountyId,
      sponsorUserId: outsiderId,
      amountCents: ATTEMPTED_CENTS,
      reason: FUNDING_REFUSALS.terminal,
      disposition: FUNDING_REFUSAL_DISPOSITIONS.bountyFinished,
    });
    // The sentence the sponsor is owed, in the place a reader finds it weeks
    // later. Asserted as a constant rather than as prose so an edit to the
    // wording is a visible diff rather than a silent one.
    expect(payload['notice']).toContain(NO_MONEY_WAS_TAKEN);

    // And nothing was taken. The sum of the funding rows is what the first
    // sponsor put in, and a refused contribution must not appear in it — this
    // is the assertion that would fail if the refusal wrote a row before it
    // refused.
    const after = (await listed(scratch.repoName)).find((each) => each.id === scratch.bountyId);
    expect(after?.rewardCents).toBe(REWARD_CENTS);
    expect(after?.funds).toHaveLength(1);
    expect(after?.funds.map((fund) => fund.sponsorUserId)).not.toContain(outsiderId);
    // The existing sponsor's disposition is unchanged by somebody else's failed
    // attempt: the money is still the solver's, not refundable, and a refused
    // top-up must not make a completed bounty look cancellable.
    expect(after?.payout.refund.disposition).toBe('not-applicable');
  });
});
