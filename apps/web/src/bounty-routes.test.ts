import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  createBountyRoutes,
  type BountyRouteDependencies,
  type OwnedSession,
} from './bounty-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';

const ORIGIN = 'https://agentbattle.test';

/**
 * A credential failure, defined here rather than imported.
 *
 * Same reasoning `routes.test.ts` and `session-routes.test.ts` give: it keeps
 * the assertion about the HTTP contract rather than about one issuer's error
 * class. The mapping reads `reason` off the top level, which is the shape the
 * api package's guard documents.
 */
class TestAuthFailure extends Error {
  constructor(readonly reason: string) {
    super(`credential refused: ${reason}`);
  }
}

interface Recorded {
  readonly id: string;
  readonly input: unknown;
}

/**
 * A real runtime carrying stand-ins for the four bounty commands.
 *
 * A stub extension rather than a fake `ApplicationApi` object, because the ids
 * are the thing most likely to rot: the routes write the action ids out rather
 * than importing them (see the note in `bounty-routes.ts`), and a real runtime is
 * the only thing that checks them against both the generated union and the
 * registry. A hand-written api stub would accept any string and prove nothing.
 */
function apiRecording(): { api: ApplicationApi; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const record =
    (id: string) =>
    async (input: unknown): Promise<unknown> => {
      calls.push({ id, input });
      return { id, echo: input };
    };
  const action = (id: string) => defineAction({ id, permissions: [id], run: record(id) });
  const runtime = createRuntime({
    extensions: [
      {
        id: 'bounty',
        capabilities: [
          { name: 'bounty.create', description: 'opens a bounty' },
          { name: 'bounty.list', description: 'lists bounties' },
          { name: 'bounty.claim', description: 'claims a bounty' },
          { name: 'bounty.submit', description: 'submits a pull request' },
        ],
        actionDefs: [
          action('bounty.create'),
          action('bounty.list'),
          action('bounty.claim'),
          action('bounty.submit'),
        ],
      },
    ],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => '2026-09-26T00:00:00.000Z',
  });
  return { api: createApplicationApi(runtime), calls };
}

/**
 * The sessions the fake ownership query knows about, keyed the way the real one
 * is: installation first, then session.
 *
 * `DrizzleSessionRepository.findOwnedByInstallation` is
 * `WHERE id = ? AND installationId = ?`, so a harness that held a flat list of
 * session ids and filtered on nothing would grant the caller every session it
 * knows about. It did, until this test failed: both "refuses a session the
 * caller does not own" and "answers an unowned session as one that does not
 * exist" went red at once, which is what an ownership check that was never
 * being exercised looks like.
 *
 * `installation-theirs` is here for the same reason. A fixture holding only the
 * caller's own sessions cannot tell "not mine" from "not there", so the
 * indistinguishable-404 assertion would pass against a route that leaked.
 */
const OWNED: Readonly<Record<string, Readonly<Record<string, OwnedSession>>>> = {
  'installation-mine': {
    'session-mine': { id: 'session-mine', agentId: 'agent-mine', status: 'active' },
  },
  'installation-theirs': {
    'session-theirs': { id: 'session-theirs', agentId: 'agent-theirs', status: 'active' },
  },
};

interface Harness {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly calls: Recorded[];
  /** Every (sessionId, installationId) pair the ownership query was asked. */
  readonly lookups: { sessionId: string; installationId: string }[];
  readonly authenticated: number;
  readonly installationId: string;
}

function harness(overrides: Partial<BountyRouteDependencies> = {}): Harness {
  const { api, calls } = apiRecording();
  const lookups: { sessionId: string; installationId: string }[] = [];
  let authenticated = 0;
  const installationId = 'installation-mine';
  const dependencies: BountyRouteDependencies = {
    api,
    authenticate: async () => {
      authenticated += 1;
      return { installationId };
    },
    resolveSession: async (sessionId, caller) => {
      lookups.push({ sessionId, installationId: caller });
      return OWNED[caller]?.[sessionId];
    },
    ...overrides,
  };
  return {
    handle: createBountyRoutes(dependencies),
    calls,
    lookups,
    get authenticated() {
      return authenticated;
    },
    installationId,
  };
}

function call(
  handle: (request: HttpRequest) => Promise<HttpResponse>,
  request: { method?: string; path: string; body?: unknown },
): Promise<HttpResponse> {
  return handle({
    method: request.method ?? 'POST',
    url: `${ORIGIN}${request.path}`,
    headers: { get: () => null },
    ...(request.body === undefined ? {} : { body: request.body }),
  });
}

describe('POST /api/bounties', () => {
  it('opens a bounty and answers 201, passing the body through unchanged', async () => {
    const h = harness();
    const draft = { repoOwner: 'acme', repoName: 'widgets', issueNumber: 7 };

    const response = await call(h.handle, { path: '/api/bounties', body: draft });

    expect(response.status).toBe(201);
    expect(h.calls).toEqual([{ id: 'bounty.create', input: draft }]);
  });

  it('refuses a body that is not an object, without opening anything', async () => {
    // An array is the case a `typeof x === 'object'` check waves through, and an
    // array reaching the feature is a 500 from a guard that expects fields.
    const h = harness();

    const response = await call(h.handle, { path: '/api/bounties', body: ['acme'] });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
  });
});

describe('GET /api/bounties', () => {
  it('lists, sending the query parameters that were actually present', async () => {
    const h = harness();

    const response = await call(h.handle, {
      method: 'GET',
      path: '/api/bounties?status=open&repoOwner=acme',
    });

    expect(response.status).toBe(200);
    expect(h.calls).toEqual([{ id: 'bounty.list', input: { status: 'open', repoOwner: 'acme' } }]);
  });

  it('omits an absent filter rather than sending it empty', async () => {
    // `whyListIsRejected` refuses an empty `status`, so `?` or a bare request
    // that produced `{ status: '' }` would turn "no filter" into a 500.
    const h = harness();

    await call(h.handle, { method: 'GET', path: '/api/bounties' });

    expect(h.calls).toEqual([{ id: 'bounty.list', input: {} }]);
  });
});

describe('POST /api/bounties/{id}/claim', () => {
  it("takes the agent from the caller's own session, not from the body", async () => {
    // The load-bearing assertion. `bounty.claim` is exclusive, and `act()` has
    // no principal, so an `agentId` read out of the body is an identity any
    // credential-holder chooses. The body here claims as `session-theirs` AND
    // asks for `agent-theirs` directly; the command must still be reached as
    // `agent-mine`, because that is the only session the caller owns.
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/bounties/b-1/claim',
      body: { sessionId: 'session-mine', agentId: 'agent-theirs' },
    });

    expect(response.status).toBe(200);
    expect(h.lookups).toEqual([{ sessionId: 'session-mine', installationId: 'installation-mine' }]);
    expect(h.calls).toEqual([
      { id: 'bounty.claim', input: { bountyId: 'b-1', agentId: 'agent-mine' } },
    ]);
  });

  it('takes the bounty id from the path, not from the body', async () => {
    // Otherwise a client could POST to one bounty and act on another, and the
    // URL an operator reads in a log would not be the one that ran.
    const h = harness();

    await call(h.handle, {
      path: '/api/bounties/b-from-path/claim',
      body: { sessionId: 'session-mine', bountyId: 'b-from-body' },
    });

    expect(h.calls[0]?.input).toEqual({ bountyId: 'b-from-path', agentId: 'agent-mine' });
  });

  it("refuses a session the caller's installation does not own, without claiming", async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/bounties/b-1/claim',
      body: { sessionId: 'session-theirs' },
    });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('answers an unowned session exactly as it answers one that does not exist', async () => {
    // Two 404s that are byte-identical, because a distinguishable pair is an
    // oracle for "does this session id exist".
    const h = harness();

    const unowned = await call(h.handle, {
      path: '/api/bounties/b-1/claim',
      body: { sessionId: 'session-theirs' },
    });
    const missing = await call(h.handle, {
      path: '/api/bounties/b-1/claim',
      body: { sessionId: 'session-nowhere' },
    });

    expect(unowned.status).toBe(404);
    expect(unowned.body).toEqual(missing.body);
  });

  it('refuses a body with no session id, before asking who owns anything', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/bounties/b-1/claim', body: {} });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
    // The lookup list is empty too: a request that named no session must not
    // reach the query at all.
    expect(h.lookups).toEqual([]);
  });

  it('refuses a malformed bounty id as a 400 rather than a 500', async () => {
    // A `%` that is not valid percent-encoding would throw URIError out of
    // decodeURIComponent, and an uncaught throw is a 500 — telling the client
    // the platform is broken when it built the URL wrong.
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/bounties/%E0%A4%A/claim',
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
  });
});

describe('POST /api/bounties/{id}/submit', () => {
  it('sends the pull request through and the agent from the owned session', async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/bounties/b-1/submit',
      body: { sessionId: 'session-mine', prUrl: 'https://github.com/acme/widgets/pull/9' },
    });

    expect(response.status).toBe(200);
    expect(h.calls).toEqual([
      {
        id: 'bounty.submit',
        input: {
          bountyId: 'b-1',
          agentId: 'agent-mine',
          prUrl: 'https://github.com/acme/widgets/pull/9',
        },
      },
    ]);
  });

  it('does not check the pull request URL itself', async () => {
    // Which repository the pull request is in, and whether it is one at all, is
    // a question the feature answers. A route that pre-judged it would be a
    // second copy of that rule, and the copy is the one that drifts.
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/bounties/b-1/submit',
      body: { sessionId: 'session-mine', prUrl: 'not a url at all' },
    });

    expect(response.status).toBe(200);
    expect(h.calls[0]?.input).toMatchObject({ prUrl: 'not a url at all' });
  });

  it('refuses a submit with no pull request', async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/bounties/b-1/submit',
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
  });
});

describe('the credential', () => {
  it('refuses every route on the surface, including the list', async () => {
    const paths = [
      { method: 'POST', path: '/api/bounties', body: { repoOwner: 'a', repoName: 'b' } },
      { method: 'GET', path: '/api/bounties' },
      { method: 'POST', path: '/api/bounties/b-1/claim', body: { sessionId: 'session-mine' } },
      { method: 'POST', path: '/api/bounties/b-1/submit', body: { sessionId: 'session-mine' } },
    ];
    for (const request of paths) {
      const h = harness({
        authenticate: async () => {
          throw new TestAuthFailure('unknown');
        },
      });

      const response = await call(h.handle, request);

      expect(response.status, `${request.method} ${request.path}`).toBe(401);
      expect(response.body).toMatchObject({ reason: 'unknown' });
      expect(h.calls).toEqual([]);
    }
  });

  it('answers 404 for a path that is not on this surface', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/bounties/b-1/merge' });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('answers 500 for a failure the feature raised, which is not this route to classify', async () => {
    // A bounty that is already claimed reaches the route as a plain Error.
    // Turning that into a 409 would mean the route recognising a failure the
    // FEATURE defined, which is the game-logic-in-a-handler rule; it belongs to
    // packages/api, which owns the vocabulary every surface may share.
    const h = harness({
      api: {
        act: async () => {
          throw new Error('bounty b-1 was claimed by somebody else first.');
        },
      } as unknown as ApplicationApi,
    });

    const response = await call(h.handle, {
      path: '/api/bounties/b-1/claim',
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(500);
  });
});
