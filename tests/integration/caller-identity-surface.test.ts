import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { agentFeature, issueCredential } from '@battle-agents/agent';
import { questFeature } from '@battle-agents/quest';
import {
  agents,
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleCredentialStore,
  DrizzleQuestRepository,
  DrizzleSessionRepository,
  DrizzleStateStore,
  eventLog,
  installations,
  quests,
  sessions,
  users,
  type Database,
} from '@battle-agents/db';
import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createQuestGateway, type QuestGateway } from '../../apps/web/src/quest-gateway.js';
import { createRoutes, type HttpRequest, type HttpResponse } from '../../apps/web/src/routes.js';
import { createSessionGateway, type SessionGateway } from '../../apps/web/src/session-gateway.js';

/**
 * The caller-identity surface, over a wire and against real Postgres.
 *
 * ## What is under test
 *
 * Six actions take a CALLER IDENTITY in their payload: `quest.claim`,
 * `quest.submit` and `quest.admin.revoke` (an `agentId`), `session.create` (an
 * `ownerId`), `session.heartbeat` and `session.end` (a `sessionId`). The frozen
 * Extension API puts no principal in `RuntimeContext`, so by the time one of
 * those commands runs the transport has already discarded whose token was on the
 * request. A caller naming somebody else there is not a feature bug — given an
 * `agentId`, the feature records that `agentId` — it is a choice of identity made
 * at the door.
 *
 * ## Why `/api/act` is the half that matters
 *
 * A resource route does not close a hole by existing. `/api/act` reaches the same
 * commands with the same payload, so until it REFUSES these six ids the routes
 * are the polite door and the catch-all is the open one. `POST /api/act` is also
 * the CLI's only way to run an action, since `HttpApiClient` posts there, so this
 * is what covers `agent-battle` too.
 *
 * ## The fakes this file deliberately does not use
 *
 * The real gateways, the real authenticator, the real credential store, the real
 * installation→user query and the real repositories. A fake ownership query that
 * returns whatever the test tells it to will happily pass a route that asks it
 * the wrong question, and a hand-written quest row will pass a route whose id
 * never resolved. Every assertion that could be satisfied by a route doing
 * nothing reads the TABLE afterwards, because a response body can be right while
 * the row it describes is wrong.
 *
 * ## What is deliberately NOT asserted
 *
 * `/api/mcp` reaches the same six actions in process, from the frozen
 * `packages/mcp-server`, which calls `context.api.act(input.action, input.input ?? {})`
 * itself, below this dispatcher. That path is NOT closed and cannot be without a
 * frozen edit; the limit is recorded in `routes.ts` beside the gate rather than
 * worked around here. A test pinning it open would fail the day somebody fixes it
 * and reads to a reviewer as blessing it.
 */

const ORIGIN = 'https://agentbattle.test';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';

let pool: Pool;
let database: Database;
let questGateway: QuestGateway;
let sessionGateway: SessionGateway;
let actRoutes: (request: HttpRequest) => Promise<HttpResponse>;
let api: ApplicationApi;

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

  // The real features on the real stores. Only the ApplicationApi is injected,
  // because `sharedApi()` would build the process-wide composition and the
  // property under test is about the ROUTES rather than about which features
  // happen to be installed.
  api = createApplicationApi(
    createRuntime({
      extensions: [
        agentFeature({
          repository: new DrizzleAgentRepository(database),
          sessionRepository: new DrizzleSessionRepository(database),
        }),
        questFeature({ repository: new DrizzleQuestRepository(database) }),
      ],
      store: new DrizzleStateStore(database),
      bus: createInMemoryEventBus(),
    }),
  );
  questGateway = await createQuestGateway({ database, api });
  sessionGateway = await createSessionGateway({ database, api });
  // The catch-all, unauthenticated ON PURPOSE. The gate this file is about sits
  // behind authentication, and the unit suite proves that ordering with a
  // rejecting authenticator; what is left to prove here is the gate itself, and
  // an authenticator would only add a way for the assertion to pass for the
  // wrong reason.
  actRoutes = createRoutes({ api });
});

afterAll(async () => {
  await questGateway?.close();
  await sessionGateway?.close();
  await closeDatabasePool(pool);
});

/** A human, an installation, a character and a bearer token: an identity. */
interface Identity {
  readonly userId: string;
  readonly login: string;
  readonly installationId: string;
  readonly token: string;
  readonly agentId: string;
  readonly agentName: string;
}

async function anIdentity(label: string): Promise<Identity> {
  const login = `wire-${label}-${randomUUID()}`;
  const agentName = `wire-char-${randomUUID().slice(0, 8)}`;
  const [user] = await database
    .insert(users)
    .values({ githubId: login, login })
    .returning({ id: users.id });
  const [installation] = await database
    .insert(installations)
    .values({ userId: user?.id ?? '', installationKey: `key-${randomUUID()}` })
    .returning({ id: installations.id });
  // Minted with the REAL clock: the gateway's authenticator compares against
  // `new Date()`, so a token issued against a fixture instant is refused as
  // expired before the route runs and the suite goes green for the wrong reason.
  const issued = issueCredential(new Date().toISOString(), { lifetimeMs: 3_600_000 });
  await new DrizzleCredentialStore(database).insert({
    id: randomUUID(),
    tokenHash: issued.hash,
    installationId: installation?.id ?? '',
    agentId: null,
    scopes: [],
    expiresAt: issued.expiresAt,
  });
  const [agent] = await database
    .insert(agents)
    .values({ userId: user?.id ?? '', name: agentName, harness: 'other' })
    .returning({ id: agents.id });
  return {
    userId: user?.id ?? '',
    login,
    installationId: installation?.id ?? '',
    token: issued.token,
    agentId: agent?.id ?? '',
    agentName,
  };
}

function wire(
  handle: (request: HttpRequest) => Promise<HttpResponse>,
  identity: Identity,
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<HttpResponse> {
  return handle({
    method,
    url: `${ORIGIN}${path}`,
    headers: { get: (name) => (name === 'authorization' ? `Bearer ${identity.token}` : null) },
    ...(body === undefined ? {} : { body }),
  });
}

/** `POST /api/act` with this caller's credential and an arbitrary payload. */
function actCall(identity: Identity, action: string, input: unknown): Promise<HttpResponse> {
  return wire(actRoutes, identity, '/api/act', { action, input });
}

/** A quest to act on, opened through the action the gate does not touch. */
async function aQuest(owner: Identity): Promise<string> {
  const created = await actCall(owner, 'quest.create', {
    title: `wire-quest-${randomUUID().slice(0, 8)}`,
    difficulty: 1,
    xpReward: 10,
  });
  expect(created.status, 'could not open a quest to act on').toBe(200);
  return (created.body as { id: string }).id;
}

/** A run for this identity, opened through the handshake. */
async function aSession(identity: Identity): Promise<string> {
  const opened = await wire(sessionGateway.handle, identity, '/api/sessions', {
    agentName: identity.agentName,
    harness: 'other',
  });
  expect(opened.status, `could not open a run for ${identity.login}`).toBe(201);
  return (opened.body as { sessionId: string }).sessionId;
}

/**
 * The agent a quest claim was RECORDED against, read from the event log.
 *
 * The `quests` table holds a status and nothing else — the character is on the
 * `quest.claimed` event — so without this a wire test that claims a quest
 * cannot tell a route that resolved the session from one that trusted the body:
 * both move the row to `in_progress`, and the mutation passes. That gap was real
 * and was found by trying it, which is the only way these are ever found.
 */
async function claimedAgentOf(questId: string): Promise<string> {
  const [row] = await database
    .select({ agentId: sql<string | null>`${eventLog.payload} ->> 'agentId'` })
    .from(eventLog)
    .where(
      and(eq(eventLog.type, 'quest.claimed'), sql`${eventLog.payload} ->> 'questId' = ${questId}`),
    )
    .limit(1);
  return row?.agentId ?? 'none';
}

/** A status read by SQL rather than back through the feature. */
async function statusOf(table: typeof quests | typeof sessions, id: string): Promise<string> {
  const rows = await database
    .select({ status: table.status })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return rows[0]?.status ?? 'absent';
}

async function runsFor(identity: Identity): Promise<readonly { agentId: string }[]> {
  return database
    .select({ agentId: sessions.agentId })
    .from(sessions)
    .where(eq(sessions.installationId, identity.installationId));
}

describe('POST /api/act refuses the actions whose payload names the caller', () => {
  it('refuses all six, names the route that does the job, and runs none of them', async () => {
    // The whole bead in one assertion. Both features are installed in the
    // runtime above, so a 403 is this dispatcher's DECISION and not a build that
    // never heard of the actions — the distinction a stub fixture cannot make,
    // and the one that matters most here.
    const alice = await anIdentity('alice');
    const expected: readonly (readonly [string, string])[] = [
      ['quest.claim', 'POST /api/quests/{id}/claim'],
      ['quest.submit', 'POST /api/quests/{id}/submit'],
      ['quest.admin.revoke', 'no HTTP door'],
      ['session.create', 'POST /api/sessions'],
      ['session.heartbeat', 'POST /api/sessions/{id}/heartbeat'],
      ['session.end', 'POST /api/sessions/{id}/end'],
    ];

    for (const [action, names] of expected) {
      const refused = await actCall(alice, action, {
        questId: 'a-quest',
        agentId: 'agent-theirs',
        ownerId: 'user-theirs',
        sessionId: 'session-theirs',
        installationKey: 'k',
        agentName: 'a',
        harness: 'other',
      });

      expect(refused.status, `${action} was accepted over /api/act`).toBe(403);
      expect(refused.body).toMatchObject({ action });
      expect(String((refused.body as { error: string }).error)).toContain(names);
    }
  });

  it('refuses an administrative revoke, which no route replaces', async () => {
    // Separated because it is the one with no replacement: revoking is an
    // administrator's move, the schema carries no column that says who an
    // administrator is, and a route could only have taken the `agentId` from the
    // body and called that the authorization.
    const mallory = await anIdentity('mallory');
    const questId = await aQuest(mallory);

    const refused = await actCall(mallory, 'quest.admin.revoke', {
      questId,
      agentId: mallory.agentId,
    });

    expect(refused.status).toBe(403);
    // And the quest is still open, read from the table rather than from a
    // response body that could be right while the row is wrong.
    expect(await statusOf(quests, questId), 'an ordinary caller revoked a quest').toBe('open');
  });

  it('still creates and lists, and runs a claim through the route that owns it', async () => {
    // The positive half, and the only kind that can tell a gate from a wall.
    // Without it "refused" could be satisfied by a dispatcher that refuses
    // everything, and a suite watching only for refusals would call that a fix.
    //
    // `quest.claim` is not used for it: it is one of the six, so using it here
    // would be asserting the gate and its opposite in the same breath. What runs
    // instead is an action that names nobody, and then a claim through the route
    // that fills the identity in.
    const alice = await anIdentity('alice');
    const questId = await aQuest(alice);

    const listed = await actCall(alice, 'quest.list', { status: 'open' });
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: questId })]));

    const claimed = await wire(questGateway.handle, alice, `/api/quests/${questId}/claim`, {
      sessionId: await aSession(alice),
    });
    expect(claimed.status).toBe(200);
    expect(await statusOf(quests, questId)).toBe('in_progress');
    expect(await claimedAgentOf(questId)).toBe(alice.agentId);
  });

  it('answers an unknown action as unknown rather than as gated', async () => {
    const alice = await anIdentity('alice');
    const response = await actCall(alice, 'quest.claimx', {});
    expect(response.status).toBe(404);
  });
});

describe('POST /api/quests/{id}/claim and /submit', () => {
  it("refuses the second identity claiming with the first identity's session", async () => {
    // The impersonation, over the wire. The payload names BOTH the victim's
    // session and the victim's agent, so a route that trusted either one would
    // answer 200 here.
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const questId = await aQuest(alice);
    const alicesSession = await aSession(alice);

    const attempt = await wire(questGateway.handle, bob, `/api/quests/${questId}/claim`, {
      sessionId: alicesSession,
      agentId: alice.agentId,
    });

    expect(attempt.status, "a stranger claimed with somebody else's session").toBe(404);
    expect(await statusOf(quests, questId)).toBe('open');
  });

  it('claims as the owner of the session it presents, whatever the body says', async () => {
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const questId = await aQuest(alice);
    const bobsSession = await aSession(bob);

    const response = await wire(questGateway.handle, bob, `/api/quests/${questId}/claim`, {
      sessionId: bobsSession,
      agentId: alice.agentId,
    });

    expect(response.status).toBe(200);
    expect(await statusOf(quests, questId)).toBe('in_progress');
    // The part the other test cannot see: the claim was recorded against BOB's
    // character, and the body asked for Alice's. A route that resolved the
    // session and a route that trusted the payload both answer 200 here, and
    // both move the row — so the status assertion alone is not a witness.
    expect(await claimedAgentOf(questId), 'the claim was recorded against the body').toBe(
      bob.agentId,
    );
  });

  it('refuses to submit a quest with a session the caller does not own', async () => {
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const questId = await aQuest(alice);
    const alicesSession = await aSession(alice);

    const attempt = await wire(questGateway.handle, bob, `/api/quests/${questId}/submit`, {
      sessionId: alicesSession,
    });

    expect(attempt.status).toBe(404);
    expect(await statusOf(quests, questId)).toBe('open');
  });

  it('refuses every quest route without a credential, before reading the body', async () => {
    for (const path of ['/api/quests/q-1/claim', '/api/quests/q-1/submit']) {
      const response = await questGateway.handle({
        method: 'POST',
        url: `${ORIGIN}${path}`,
        headers: { get: () => null },
        body: { sessionId: 'session-theirs' },
      });

      expect(response.status, path).toBe(401);
    }
  });
});

describe('POST /api/sessions', () => {
  it('refuses a handshake that names somebody else, and opens nothing', async () => {
    // The most consequential of the six. The handshake resolves the
    // installation AND the character by `ownerId`, so a caller naming somebody
    // else gets a live session id on their account — and a session id is the
    // join key to every other surface.
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');

    const attempt = await wire(sessionGateway.handle, bob, '/api/sessions', {
      agentName: alice.agentName,
      harness: 'other',
      ownerId: alice.userId,
    });

    expect(attempt.status).toBe(403);
    // No run appeared under Alice, and none under Bob either: the refusal is
    // not a redirect onto the caller's own account.
    expect(await runsFor(alice)).toEqual([]);
    expect(await runsFor(bob)).toEqual([]);
  });

  it('answers a real user id and an invented one identically', async () => {
    // The 403 is only safe because it carries nothing. A refusal that named
    // which half was wrong would be a user-id oracle on the path that starts
    // every run.
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const handshake = { agentName: bob.agentName, harness: 'other' };

    const real = await wire(sessionGateway.handle, bob, '/api/sessions', {
      ...handshake,
      ownerId: alice.userId,
    });
    const invented = await wire(sessionGateway.handle, bob, '/api/sessions', {
      ...handshake,
      ownerId: randomUUID(),
    });

    expect(real.status).toBe(403);
    expect(invented).toEqual(real);
    expect(await runsFor(bob)).toEqual([]);
  });

  it('opens a run for each identity as itself', async () => {
    // The positive half, and the one a route hard-coding an installation would
    // fail: Bob's run must belong to Bob's installation and his character.
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');

    for (const identity of [alice, bob]) {
      const opened = await wire(sessionGateway.handle, identity, '/api/sessions', {
        agentName: identity.agentName,
        harness: 'other',
      });

      expect(opened.status, identity.login).toBe(201);
      const rows = await runsFor(identity);
      expect(rows.length, identity.login).toBe(1);
      expect(rows[0]?.agentId, identity.login).toBe(identity.agentId);
    }
  });

  it('refuses a handshake with no credential at all', async () => {
    const response = await sessionGateway.handle({
      method: 'POST',
      url: `${ORIGIN}/api/sessions`,
      headers: { get: () => null },
      body: { installationKey: 'k', agentName: 'a', harness: 'other' },
    });

    expect(response.status).toBe(401);
  });
});

describe('POST /api/sessions/{id}/end', () => {
  it("refuses to end the second identity's run", async () => {
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const alicesSession = await aSession(alice);

    const attempt = await wire(sessionGateway.handle, bob, `/api/sessions/${alicesSession}/end`, {
      reason: 'completed',
    });

    expect(attempt.status, "a stranger ended somebody else's run").toBe(404);
    expect(await statusOf(sessions, alicesSession), 'the run was ended anyway').toBe('active');
  });

  it('answers an unowned run and a nonexistent one identically', async () => {
    const bob = await anIdentity('bob');

    // A uuid, because that is what a session id IS. A non-uuid is refused too,
    // but as a 500 from Postgres casting the column — a pre-existing property of
    // `findOwnedByInstallation` that the heartbeat and bounty routes share, and
    // not the identity question this file is about.
    const unowned = await wire(sessionGateway.handle, bob, `/api/sessions/${randomUUID()}/end`, {});
    const missing = await wire(sessionGateway.handle, bob, `/api/sessions/${randomUUID()}/end`, {});

    expect(unowned.status).toBe(404);
    expect(missing).toEqual(unowned);
  });

  it('ends the caller own run, and leaves the other one running', async () => {
    const alice = await anIdentity('alice');
    const bob = await anIdentity('bob');
    const alicesSession = await aSession(alice);
    const bobsSession = await aSession(bob);

    const ended = await wire(sessionGateway.handle, alice, `/api/sessions/${alicesSession}/end`, {
      reason: 'completed',
    });

    expect(ended.status).toBe(200);
    // `ended` is the STATUS and `completed` is the REASON: a run that finished
    // and a run that crashed are both over, and the column that says which is a
    // different one. Asserting the wrong pair here would have gone green on a
    // route that refused to end anything.
    expect(ended.body).toMatchObject({ status: 'ended', reason: 'completed' });
    expect(await statusOf(sessions, alicesSession)).toBe('ended');
    expect(await statusOf(sessions, bobsSession)).toBe('active');
  });
});
