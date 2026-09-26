import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { issueCredential } from '@battle-agents/agent';
import { bountyFeature, type BountySummary } from '@battle-agents/bounty';
import {
  bountyFunds,
  closeDatabasePool,
  createDatabase,
  DrizzleBountyRepository,
  DrizzleCredentialStore,
  DrizzleInstallationRepository,
  DrizzlePayoutIntentStore,
  DrizzleStateStore,
  installations,
  users,
  type Database,
} from '@battle-agents/db';
import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createBountyGateway, type BountyGateway } from '../../apps/web/src/bounty-gateway.js';
import type { HttpRequest, HttpResponse } from '../../apps/web/src/routes.js';

/**
 * Two identities, one ledger, over the wire.
 *
 * ## Why this file exists
 *
 * `bounty.fund` took a `sponsorUserId` from the action PAYLOAD, and the frozen
 * Extension API puts no caller in `RuntimeContext`, so by the time a command
 * ran the transport had already thrown away whose token was on the request. Any
 * authenticated caller could therefore write a funding row against any `users`
 * row, and `bounty_funds.sponsor_user_id` is not a label: it is what a refund is
 * paid against and what a dispute over a payout is settled by. A successful
 * top-up was attributed to whoever the caller said.
 *
 * ## Why a unit test could not have found it
 *
 * Every test that existed for this called `act()` in process with a hand-written
 * payload, and in process the feature is CORRECT: given a sponsor it records that
 * sponsor, which is exactly what a funding command is for. The boundary was
 * never inside the feature. It was in the route, in a file no bounty test
 * covered, and it had no test of its own — which is the shape of boundary that
 * survives a green suite, and the reason this one is written the way it is.
 *
 * So: the REAL gateway, the REAL authenticator, the REAL credential store, the
 * REAL installation→user query, and the REAL bounty repository over a live
 * Postgres. Two real humans, two real installations, two real bearer tokens. The
 * assertion is on `bounty_funds` read by SQL, because a summary that agreed with
 * itself while the ledger said something else is precisely the drift the column
 * is forbidden from having.
 *
 * ## What this does not cover
 *
 * `POST /api/act` reaches the same action with a payload, and the primitive
 * authenticates without learning WHO. The same hole is open there for
 * `bounty.fund`, `bounty.claim` and `bounty.submit`, and closing it needs a
 * principal channel that only a frozen package can add — see the report on
 * ba-owv. Nothing here asserts that hole, deliberately: a test pinning it open
 * would be a test that fails the day somebody fixes it, and reads to a reviewer
 * as blessing it.
 */

const ORIGIN = 'https://agentbattle.test';
const NOW = '2026-09-26T18:00:00.000Z';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const REPO_OWNER = 'someone-else';
const ALICE_CENTS = 20_000;
const BOB_CENTS = 5_000;

let pool: Pool;
let database: Database;
let gateway: BountyGateway;

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

  // The real feature on the real stores, and the real gateway around it. The
  // only thing injected is the ApplicationApi, because `sharedApi()` would build
  // the process-wide runtime and the whole composition — and the property under
  // test is about the ROUTE, not about which features happen to be installed.
  const api: ApplicationApi = createApplicationApi(
    createRuntime({
      extensions: [
        bountyFeature({
          repository: new DrizzleBountyRepository(database),
          payouts: new DrizzlePayoutIntentStore(database),
        }),
      ],
      store: new DrizzleStateStore(database),
      bus: createInMemoryEventBus(),
      now: () => NOW,
    }),
  );
  gateway = await createBountyGateway({ database, api });
});

afterAll(async () => {
  await gateway?.close();
  await closeDatabasePool(pool);
});

/** A human with an installation and a bearer token, which is a real identity. */
interface Identity {
  readonly userId: string;
  readonly login: string;
  readonly installationId: string;
  readonly token: string;
}

async function anIdentity(label: string): Promise<Identity> {
  const login = `wire-${label}-${randomUUID()}`;
  const [user] = await database
    .insert(users)
    .values({ githubId: login, login })
    .returning({ id: users.id });
  const [installation] = await database
    .insert(installations)
    .values({ userId: user?.id ?? '', installationKey: `key-${randomUUID()}` })
    .returning({ id: installations.id });
  // Minted with the REAL clock, because the gateway's authenticator compares
  // against `new Date()` rather than a fixture's `now`. A token issued against a
  // fixed past instant would be refused as expired before the route ran, and the
  // suite would be green for the wrong reason.
  const issued = issueCredential(new Date().toISOString(), { lifetimeMs: 3_600_000 });
  await new DrizzleCredentialStore(database).insert({
    id: randomUUID(),
    tokenHash: issued.hash,
    installationId: installation?.id ?? '',
    agentId: null,
    scopes: [],
    expiresAt: issued.expiresAt,
  });
  return {
    userId: user?.id ?? '',
    login,
    installationId: installation?.id ?? '',
    token: issued.token,
  };
}

function call(
  identity: Identity,
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<HttpResponse> {
  const request: HttpRequest = {
    method,
    url: `${ORIGIN}${path}`,
    headers: { get: (name) => (name === 'authorization' ? `Bearer ${identity.token}` : null) },
    ...(body === undefined ? {} : { body }),
  };
  return gateway.handle(request);
}

/** The ledger, read by SQL rather than back through the feature. */
async function ledger(
  bountyId: string,
): Promise<readonly { sponsorUserId: string; amountCents: number }[]> {
  return database
    .select({ sponsorUserId: bountyFunds.sponsorUserId, amountCents: bountyFunds.amountCents })
    .from(bountyFunds)
    .where(eq(bountyFunds.bountyId, bountyId));
}

/**
 * Funding rows keyed and sorted by sponsor, which is the only order the table
 * has. See the note on the assertion that uses it.
 */
function bySponsor(
  rows: readonly { sponsorUserId: string; amountCents: number }[],
): { sponsorUserId: string; amountCents: number }[] {
  return [...rows].sort((left, right) => left.sponsorUserId.localeCompare(right.sponsorUserId));
}

async function openABounty(): Promise<string> {
  const created = await call(await anIdentity('opener'), '/api/bounties', {
    repoOwner: REPO_OWNER,
    repoName: `wire-fund-${randomUUID().slice(0, 12)}`,
    issueNumber: 91,
  });
  expect(created.status).toBe(201);
  return (created.body as BountySummary).id;
}

describe('a top-up over the wire', () => {
  it('refuses the second identity spending the first identity’s name', async () => {
    // The whole bead, in one test. Bob presents a valid credential — this is not
    // an unauthenticated caller, and `bounty.claim`'s equivalent hole was never
    // open to one — and names Alice in the body.
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const bountyId = await openABounty();

    const attempt = await call(bob, `/api/bounties/${bountyId}/fund`, {
      amountCents: BOB_CENTS,
      sponsorUserId: alice.userId,
      reportedBy: alice.login,
    });

    expect(attempt.status, 'a stranger was allowed to name the sponsor').toBe(403);
    // And the row that would have been the damage. Read from the table, because
    // a response body can be right while the ledger is wrong.
    expect(await ledger(bountyId), 'the ledger took money for somebody else').toEqual([]);
  });

  it('records each sponsor as the credential that paid, and nobody else', async () => {
    // The positive half. Without it, "refused" could be satisfied by a route
    // that refuses every top-up, and a test that only watched for the refusal
    // would call that a fix.
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const bountyId = await openABounty();

    const alicesOwn = await call(alice, `/api/bounties/${bountyId}/fund`, {
      amountCents: ALICE_CENTS,
    });
    expect(alicesOwn.status).toBe(200);
    // Alice naming HERSELF must work too, or the fix teaches clients to stop
    // sending the field instead of to send the right one.
    const bobsOwn = await call(bob, `/api/bounties/${bountyId}/fund`, {
      amountCents: BOB_CENTS,
      sponsorUserId: bob.userId,
    });
    expect(bobsOwn.status).toBe(200);

    // Sorted, not compared in order. `bounty_funds` has no `ORDER BY` and no
    // column that would give one a meaning — `created_at` is a defaultNow() the
    // two writes share to the microsecond often enough to be a tie — and the
    // first version of this assertion compared the array positionally. It passed
    // twice and failed on the third run, which is the whole argument for not
    // asserting an order the schema does not have: a flaky assertion is worse
    // than a missing one, because it trains a reader to re-run instead of read.
    expect(bySponsor(await ledger(bountyId))).toEqual(
      bySponsor([
        { sponsorUserId: alice.userId, amountCents: ALICE_CENTS },
        { sponsorUserId: bob.userId, amountCents: BOB_CENTS },
      ]),
    );
    // The response the caller is handed names the same sponsors the ledger does.
    // A route that resolved correctly and then answered from the body would
    // satisfy the row assertion and fail this one.
    const summary = bobsOwn.body as BountySummary;
    expect([...summary.funds.map((fund) => fund.sponsorUserId)].sort()).toEqual(
      [alice.userId, bob.userId].sort(),
    );
    expect(summary.rewardCents).toBe(ALICE_CENTS + BOB_CENTS);
  });

  it('attributes a top-up to the credential even when the body names nobody', async () => {
    // The substitution case, on its own, because it is the one a "just refuse
    // mismatches" reading of the fix would leave broken — and because it is what
    // an ordinary client sends.
    const carol = await anIdentity('carol');
    const bountyId = await openABounty();

    const response = await call(carol, `/api/bounties/${bountyId}/fund`, {
      amountCents: 1_000,
    });

    expect(response.status).toBe(200);
    expect(await ledger(bountyId)).toEqual([{ sponsorUserId: carol.userId, amountCents: 1_000 }]);
  });

  it('cannot be built into a credential with no owner, and does not pretend otherwise', async () => {
    // An earlier draft of this file asserted a 404 here, for "a credential whose
    // installation belongs to nobody". It went red, and the reason is the useful
    // part: `agent_credentials.installation_id` is NOT NULL with ON DELETE
    // CASCADE, and `installations.user_id` is NOT NULL, so deleting an
    // installation takes its credentials with it and there is no state in which
    // an authenticated caller has no owner. The route's `undefined` branch is
    // therefore unreachable through this store — it is fail-closed against a
    // broken invariant, not an everyday case, and `bounty-routes.test.ts` is
    // where it is driven.
    //
    // What IS reachable is the consequence, and it is the better assertion: a
    // token whose installation is gone cannot authenticate at all.
    const dora = await anIdentity('dora');
    const bountyId = await openABounty();
    await database.delete(installations).where(eq(installations.id, dora.installationId));

    const response = await call(dora, `/api/bounties/${bountyId}/fund`, { amountCents: 1_000 });

    expect(response.status).toBe(401);
    expect(await ledger(bountyId)).toEqual([]);
  });

  it('answers the same for a real user id and an invented one', async () => {
    // The 403 is only safe because it carries no information: a route that said
    // "no such user" for one of these would be a user-id oracle sitting on the
    // funding path, which is worse than the hole it closed.
    const bob = await anIdentity('bob');
    const bountyId = await openABounty();

    const real = await call(bob, `/api/bounties/${bountyId}/fund`, {
      amountCents: 1,
      sponsorUserId: (await anIdentity('stranger')).userId,
    });
    const invented = await call(bob, `/api/bounties/${bountyId}/fund`, {
      amountCents: 1,
      sponsorUserId: randomUUID(),
    });

    expect(real.status).toBe(403);
    expect(invented).toEqual(real);
    expect(await ledger(bountyId)).toEqual([]);
  });

  it('refuses an unauthenticated top-up, and one whose token was revoked', async () => {
    // The credential gate, over the same wire, because a route that resolved the
    // sponsor BEFORE authenticating would resolve it from `undefined` — and
    // `undefined` is not an installation, so the failure would be a 404 that
    // reads like "no such sponsor" rather than a 401.
    const alice = await anIdentity('alice');
    const bountyId = await openABounty();

    const anonymous = await gateway.handle({
      method: 'POST',
      url: `${ORIGIN}/api/bounties/${bountyId}/fund`,
      headers: { get: () => null },
      body: { amountCents: 1_000 },
    });
    expect(anonymous.status).toBe(401);

    const store = new DrizzleCredentialStore(database);
    const [record] = await store.listForInstallation(alice.installationId);
    await store.revoke(record?.id ?? '', NOW);
    const revoked = await call(alice, `/api/bounties/${bountyId}/fund`, { amountCents: 1_000 });
    expect(revoked.status).toBe(401);

    expect(await ledger(bountyId)).toEqual([]);
  });
});

describe('the installation ownership query itself', () => {
  it('answers the owner of an installation and nothing for an id that is not one', async () => {
    // Underneath the route, so a failure here is distinguishable from a failure
    // in the route's use of it. The route's own tests use a fake for this
    // collaborator, which is correct — and a fake cannot tell a query that
    // returns the wrong COLUMN from one that returns the right one.
    const identity = await anIdentity('owner');
    const repository = new DrizzleInstallationRepository(database);

    expect(await repository.findOwner(identity.installationId)).toEqual({
      userId: identity.userId,
      login: identity.login,
    });
    expect(await repository.findOwner(randomUUID())).toBeUndefined();
  });
});
