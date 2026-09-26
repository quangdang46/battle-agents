import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { HttpApiClient, type HttpTransport } from '@battle-agents/cli';
import {
  BOUNTY_CLAIM,
  BOUNTY_CREATE,
  BOUNTY_FUND,
  BOUNTY_FUNDING_REFUSED,
  BOUNTY_LIST,
  BOUNTY_SUBMIT,
  bountyFeature,
  FUNDING_REFUSAL_DISPOSITIONS,
  FUNDING_REFUSALS,
  markPending,
  NO_MONEY_WAS_TAKEN,
  type BountySummary,
} from '@battle-agents/bounty';
import {
  agents as agentsTable,
  bountyFunds,
  closeDatabasePool,
  createDatabase,
  DrizzleActivityLog,
  DrizzleBountyRepository,
  DrizzlePayoutIntentStore,
  DrizzleStateStore,
  users,
  type Database,
} from '@battle-agents/db';
import { createInMemoryEventBus, createRuntime, defineAction } from '@battle-agents/core';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRoutes, type HttpRequest } from '../../apps/web/src/routes.js';

/**
 * Stacking money over the wire, and what a refusal looks like to the person who
 * was refused.
 *
 * ## Why this file exists at all
 *
 * `ba-bounty-open-funding-et1` asks for "a test that funding is reachable
 * identically through the protocol and CLI over the frozen primitives", and for a
 * paid-adjacent flow that is marked honestly. Neither was proven by the tests
 * that were already there: `tests/integration/http-cli-parity.test.ts` proves
 * the two surfaces agree, but over a QUEST FIXTURE rather than over the bounty
 * feature, and `packages/features/bounty/src/feature.test.ts` proves the
 * feature's refusals, but only by calling the action in process where a thrown
 * error is as good as a 409.
 *
 * Those are the two halves that meet here, and the meeting point is the bug this
 * file was written to find: **`describeHttpFailure` mapped every error it did
 * not recognise to 500.** A sponsor whose top-up was refused because the bounty
 * is already payable was told the platform was broken, with a message saying
 * something entirely different in the body. A client that reads 500 as
 * "transient, retry" retries a contribution that can never be accepted.
 *
 * ## The real store, on purpose
 *
 * An earlier draft of this file used a hand-written in-memory
 * `BountyRepository`. That is the wrong shape for an integration suite and
 * `AGENTS.md` says why in the sharpest words available: a WHERE clause
 * reimplemented by hand in a double is a restatement of the intention rather
 * than a check on the code, and `tests/integration/bounty-persistence.test.ts`
 * documents a mutation where deleting `complete()`'s status guard left the whole
 * unit suite green because the double still enforced it. The refusal path does
 * not need a conditional update, but a suite that has to be trusted later is
 * not the place to start trusting a double.
 *
 * So the rows are real and are left behind, tagged with a run-unique github id
 * and never deleted: a bounty row is part of the audit trail of a payment
 * claim, and the same reasoning `tests/m2/bounty-loop.test.ts` gives applies.
 *
 * ## What this does not cover
 *
 * It builds the runtime itself rather than going through
 * `apps/web/src/composition.ts`, so it does not prove the composed host installs
 * the bounty feature. It does not need to: the property is that two surfaces
 * reach the same command with the same effect, and a host without bounty would
 * refuse `bounty.fund` identically on both.
 */

const ORIGIN = 'https://agentbattle.test';
const NOW = '2026-09-26T15:00:00.000Z';
const AFTER_MERGE = '2026-09-26T16:00:00.000Z';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const REPO_OWNER = 'someone-else';
const ISSUE = 4242;
const PULL_REQUEST = 4243;
const ATTEMPTED_CENTS = 7_000;

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
  pool = new Pool({ connectionString, max: 4 });
  database = createDatabase(pool);
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/** A bounty on a repository none of these sponsors owns, on an issue none of them opened. */
function coordinates(): { repoOwner: string; repoName: string; issueNumber: number } {
  return {
    repoOwner: REPO_OWNER,
    repoName: `third-party-${randomUUID().slice(0, 12)}`,
    issueNumber: ISSUE,
  };
}

/** A platform user, which is what a `bounty_funds` row points at. */
async function aSponsor(label: string): Promise<string> {
  const githubId = `wire-funding-${label}-${randomUUID()}`;
  const [sponsor] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  return sponsor?.id ?? '';
}

/**
 * An agent to hold a claim, owned by a throwaway user.
 *
 * `agents.user_id` is NOT NULL, so this cannot be created anonymously, and the
 * owner is deliberately one of the funders: a bounty claimed by the sponsor's
 * own agent is the ordinary case and keeps the fixture free of a second
 * identity.
 */
async function anAgentFor(userId: string): Promise<string> {
  const [agent] = await database
    .insert(agentsTable)
    .values({
      userId,
      name: `wire-solver-${randomUUID().slice(0, 8)}`,
      harness: 'claude-code',
    })
    .returning({ id: agentsTable.id });
  return agent?.id ?? '';
}

/**
 * The bridge. One turn of the translation a real deployment makes, and nothing
 * more — no network, no server, no auth.
 */
function bridge(api: ApplicationApi): HttpTransport & { readonly calls: number } {
  const handle = createRoutes({ api });
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async send({ method, path, query, body, token }) {
      state.calls += 1;
      const url = new URL(path);
      for (const [name, value] of Object.entries(query ?? {})) {
        url.searchParams.set(name, value);
      }
      const request: HttpRequest = {
        method,
        url: url.toString(),
        headers: { get: (name) => (name === 'authorization' ? (token ?? null) : null) },
        ...(body === undefined ? {} : { body }),
      };
      const response = await handle(request);
      return { status: response.status, body: response.body };
    },
  };
}

function fixture(): {
  readonly api: ApplicationApi;
  readonly cli: HttpApiClient;
  readonly transport: HttpTransport & { readonly calls: number };
  readonly payouts: DrizzlePayoutIntentStore;
} {
  const payouts = new DrizzlePayoutIntentStore(database);
  const api = createApplicationApi(
    createRuntime({
      extensions: [
        bountyFeature({ repository: new DrizzleBountyRepository(database), payouts }),
        // A second feature, so "the runtime holds more than one thing" is the
        // ordinary case here rather than something the first other feature has
        // to discover.
        {
          id: 'probe',
          capabilities: [{ name: 'probe.read', description: 'probes' }],
          actionDefs: [
            defineAction({
              id: 'probe.ping',
              permissions: ['probe.read'],
              run: async () => ({ pong: true }),
            }),
          ],
        },
      ],
      store: new DrizzleStateStore(database),
      bus: createInMemoryEventBus(),
      now: () => NOW,
    }),
  );
  const transport = bridge(api);
  return { api, cli: new HttpApiClient({ baseUrl: ORIGIN, transport }), transport, payouts };
}

/**
 * A bounty two strangers have already stacked money on, whose payout is now
 * `pending` — a merge has happened, so the reward is owed to a solver.
 *
 * `pending` is put on the store directly rather than driven through a webhook,
 * because the merge is not what this file is about and a signed-delivery
 * fixture would make a red run ambiguous about which of the two broke.
 */
async function aPayableStack(
  api: ApplicationApi,
  payouts: DrizzlePayoutIntentStore,
): Promise<{ readonly bountyId: string; readonly repoName: string }> {
  const where = coordinates();
  const created = (await api.act(BOUNTY_CREATE, where)) as BountySummary;
  for (const [label, amountCents] of [
    ['alice', 20_000],
    ['bob', 5_000],
  ] as const) {
    await api.act(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents,
      sponsorUserId: await aSponsor(label),
      reportedBy: `${label}-person`,
    });
  }
  await payouts.record(
    markPending({
      bountyId: created.id,
      amountCents: 25_000,
      reportedBy: 'maintainer-person',
      now: AFTER_MERGE,
    }),
  );
  return { bountyId: created.id, repoName: where.repoName };
}

describe('funding reaches the bounty feature identically over every surface', () => {
  it('takes three strangers money, and the stack is the sum of the rows', async () => {
    const { api, cli, transport } = fixture();
    const overWire = coordinates();
    const direct = coordinates();
    // Two bounties, so the two surfaces can be given the SAME input without the
    // second call being a second top-up on the first one's ledger. Comparing the
    // result of one call with the result of a different call is how a parity
    // test ends up asserting that funding is not additive.
    const onWire = (await cli.act(BOUNTY_CREATE, overWire)) as BountySummary;
    const directApi = (await api.act(BOUNTY_CREATE, direct)) as BountySummary;
    const sponsors = [await aSponsor('alice'), await aSponsor('bob'), await aSponsor('carol')];

    // Nobody here owns the repository or opened the issue. That is the whole
    // point of the bead, and the only way it could have become a fork is if one
    // surface checked ownership and the other did not — so the same three
    // contributions go through both surfaces and have to agree.
    const amounts = [20_000, 5_000, 10_000];
    let wireTotal = 0;
    let directTotal = 0;
    for (const [index, sponsorUserId] of sponsors.entries()) {
      const amountCents = amounts[index] ?? 0;
      wireTotal = (
        (await cli.act(BOUNTY_FUND, {
          bountyId: onWire.id,
          amountCents,
          sponsorUserId,
          reportedBy: `sponsor-${index}-person`,
        })) as BountySummary
      ).rewardCents;
      directTotal = (
        (await api.act(BOUNTY_FUND, {
          bountyId: directApi.id,
          amountCents,
          sponsorUserId,
          reportedBy: `sponsor-${index}-person`,
        })) as BountySummary
      ).rewardCents;
      // A running total after every contribution, not only at the end. A
      // surface that showed the final number correctly while a middle step was
      // wrong would slip past an end-only assertion.
      expect(wireTotal, `the wire disagreed after contribution ${index + 1}`).toBe(directTotal);
    }

    expect(wireTotal).toBe(35_000);
    // The ledger, read straight out of the table rather than back through the
    // feature: a summary that agreed with itself while the rows said something
    // else is exactly the drift this column is forbidden from having.
    for (const bountyId of [onWire.id, directApi.id]) {
      const rows = await database
        .select({ amountCents: bountyFunds.amountCents, sponsorUserId: bountyFunds.sponsorUserId })
        .from(bountyFunds)
        .where(eq(bountyFunds.bountyId, bountyId));
      expect(rows, `the funding rows for ${bountyId} do not match its total`).toHaveLength(3);
      expect(rows.map((row) => row.sponsorUserId).sort()).toEqual([...sponsors].sort());
      expect(rows.reduce((total, row) => total + row.amountCents, 0)).toBe(35_000);
    }
    // Four acts reached the dispatcher — the create and the three contributions
    // over the wire — while the other three contributions went straight to the
    // API. Asserted because "both surfaces agreed" is also true of a route that
    // answered from a cache and never asked.
    expect(transport.calls).toBe(4);
  });

  it('tells a refused sponsor it is a conflict, and never that money was taken', async () => {
    const { api, cli, payouts } = fixture();
    const { bountyId, repoName } = await aPayableStack(api, payouts);
    const carol = await aSponsor('carol');

    const refused = await cli
      .act(BOUNTY_FUND, {
        bountyId,
        amountCents: ATTEMPTED_CENTS,
        sponsorUserId: carol,
        reportedBy: 'carol-person',
      })
      .catch((error: unknown) => error);

    // The CLI client throws on a non-2xx, so the status has to be read off the
    // error it threw. Asserting on a returned response here would pass for a
    // client that swallowed the refusal and answered `undefined` instead.
    expect(refused).toBeInstanceOf(Error);
    const status = (refused as { status?: unknown }).status;
    expect(status, 'a refused top-up reads as a server fault').toBe(409);
    expect(status).not.toBe(500);

    const body = (refused as { body?: unknown }).body as {
      error: string;
      refusal?: { disposition: string; notice: string };
    };
    expect(body.refusal?.disposition).toBe(FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable);
    // The sentence that answers the question a sponsor actually has. Asserted
    // against the constant rather than a hand-copied phrase, so rewording it is
    // a visible diff here instead of a silent one.
    expect(body.refusal?.notice).toContain(NO_MONEY_WAS_TAKEN);
    // And in the message too, so a caller reading only `error` — which is all a
    // plain HTTP client has — is not left with a status and no reason.
    expect(body.error).toContain(NO_MONEY_WAS_TAKEN);

    // The SAME refusal on both surfaces, code for code. A client that retries
    // through the API directly and one that goes through the CLI get the same
    // answer, or a caller has two answers to one question.
    const direct = await api
      .act(BOUNTY_FUND, {
        bountyId,
        amountCents: ATTEMPTED_CENTS,
        sponsorUserId: carol,
        reportedBy: 'carol-person',
      })
      .catch((error: unknown) => error);
    expect(direct).toMatchObject({
      code: FUNDING_REFUSALS.payable,
      status: 409,
      refusal: { disposition: FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable },
    });

    // Nothing was taken by either attempt, which is the assertion that fails if
    // the funding row is written before the gate refuses. Read back through
    // `bounty.list` rather than by funding again: a third contribution would be
    // refused by the same rule, which would make this test pass for the wrong
    // reason.
    const after = (
      (await api.act(BOUNTY_LIST, { repoOwner: REPO_OWNER, repoName })) as readonly BountySummary[]
    ).find((each) => each.id === bountyId);
    expect(after, 'the bounty vanished from its own repository listing').toBeDefined();
    expect(after?.rewardCents).toBe(25_000);
    expect(after?.funds.map((fund) => fund.sponsorUserId)).not.toContain(carol);
    expect(after?.funds).toHaveLength(2);
  });

  it('records the refusal in the durable log, not only in the response', async () => {
    // "A queue nobody reads" is the failure the brief names, and a response is
    // not a log: the sponsor who closes the tab has the 409 and nothing else,
    // and the repository owner settling a dispute later has only the log. The
    // same row read through the ACTIVITY PORT rather than by SQL is the read a
    // real reader uses, so that is what is asserted.
    const { api, payouts } = fixture();
    const { bountyId } = await aPayableStack(api, payouts);
    const carol = await aSponsor('carol');

    await api
      .act(BOUNTY_FUND, {
        bountyId,
        amountCents: ATTEMPTED_CENTS,
        sponsorUserId: carol,
        reportedBy: 'carol-person',
      })
      .catch(() => undefined);

    const trail = await new DrizzleActivityLog(database).scopedTimeline({
      tagged: { key: 'bountyId', value: bountyId },
    });
    const rows = trail.filter((entry) => entry.type === BOUNTY_FUNDING_REFUSED);
    expect(rows, 'the refusal reached nobody: no log row was written').toHaveLength(1);
    expect(rows[0]?.payload).toMatchObject({
      bountyId,
      sponsorUserId: carol,
      amountCents: ATTEMPTED_CENTS,
      reason: FUNDING_REFUSALS.payable,
      disposition: FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable,
      // The status says nothing terminal; the payout is what makes it payable,
      // and a reader has to be able to tell which rule did the refusing.
      payoutState: 'pending',
    });
    expect(String(rows[0]?.payload['notice'])).toContain(NO_MONEY_WAS_TAKEN);
  });

  it('still refuses a top-up to a claimed and submitted bounty, over the wire', async () => {
    // The other half of the decision in payout-rail section 7: a sponsor may
    // stack on a bounty a solver has already started, and the boundary is the
    // merge rather than the claim. Asserted through the wire because that is
    // where a "fund only unclaimed bounties" convenience would be added — and it
    // would be added to a route, not to the feature, which is why the feature's
    // own test is not enough to catch it.
    const { api, cli } = fixture();
    const where = coordinates();
    const created = (await api.act(BOUNTY_CREATE, where)) as BountySummary;
    const alice = await aSponsor('alice');
    await api.act(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: 20_000,
      sponsorUserId: alice,
      reportedBy: 'alice-person',
    });
    const agentId = await anAgentFor(alice);
    await api.act(BOUNTY_CLAIM, { bountyId: created.id, agentId });

    const afterClaim = (await cli.act(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: 5_000,
      sponsorUserId: await aSponsor('bob'),
      reportedBy: 'bob-person',
    })) as BountySummary;
    expect(afterClaim.status).toBe('claimed');
    expect(afterClaim.rewardCents).toBe(25_000);

    await api.act(BOUNTY_SUBMIT, {
      bountyId: created.id,
      agentId,
      prUrl: `https://github.com/${REPO_OWNER}/${where.repoName}/pull/${PULL_REQUEST}`,
    });
    const afterSubmit = (await cli.act(BOUNTY_FUND, {
      bountyId: created.id,
      amountCents: 10_000,
      sponsorUserId: await aSponsor('carol'),
      reportedBy: 'carol-person',
    })) as BountySummary;

    expect(afterSubmit.status).toBe('submitted');
    expect(afterSubmit.rewardCents).toBe(35_000);
    expect(afterSubmit.funds).toHaveLength(3);
    // Nobody who funded after the claim is lost when the work is done.
    expect(afterSubmit.payout.refund.totalCents).toBe(0);
    // The stack topped a bounty whose intent is still `funded`, so nothing about
    // the payout moved.
    expect(afterSubmit.payout.state).toBe('funded');
  });
});
