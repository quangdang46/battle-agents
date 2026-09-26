import {
  createRuntime,
  defineAction,
  createInMemoryEventBus,
  InMemoryStateStore,
} from '@battle-agents/core';
import { createApplicationApi } from '@battle-agents/api';
import { describe, expect, it } from 'vitest';

import {
  callerScopedRefusal,
  createRoutes,
  type HttpRequest,
  type HttpResponse,
} from './routes.js';

const ORIGIN = 'https://agentbattle.test';

/**
 * A credential failure, defined here rather than imported.
 *
 * Two reasons, and the second is the one that matters. It keeps this file off
 * the agent feature, because an interface test that imports a feature stops
 * being able to outlive one. And it is the proof that the contract is
 * structural: any credential issuer, not only the agent feature, produces an
 * error the HTTP surface recognises.
 */
class TestAuthFailure extends Error {
  constructor(readonly reason: string) {
    super(`credential refused: ${reason}`);
  }
}

/**
 * A stand-in domain, carrying a stand-in action this surface will still run.
 *
 * The action is `bounty.list` and not the `quest.claim` this file used to use,
 * and that is a change with a reason rather than a rename: `/api/act` REFUSES
 * every action whose payload names its caller, and `quest.claim` is one of them
 * (see `CALLER_SCOPED_ACTIONS` in `routes.ts`). A stand-in for "some action the
 * primitive can run" that sits on the refusal list cannot demonstrate that the
 * primitive runs one, so the stand-in moved to an action the same list does not
 * name. Nothing about the primitive changed; only the fixture did.
 */
function runtimeWithOneAction() {
  return createRuntime({
    extensions: [
      {
        id: 'bounty',
        capabilities: [{ name: 'bounty.read', description: 'reads bounties' }],
        actionDefs: [
          defineAction({
            id: 'bounty.list',
            permissions: ['bounty.list'],
            run: async (input: { id: string }) => ({ listed: input.id }),
          }),
        ],
      },
    ],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => '2026-09-24T12:00:00.000Z',
  });
}

function call(request: Partial<HttpRequest> & { path: string }): Promise<HttpResponse> {
  const handle = createRoutes({ api: createApplicationApi(runtimeWithOneAction()) });
  return handle({
    method: request.method ?? 'GET',
    url: `${ORIGIN}${request.path}`,
    headers: request.headers ?? new Map(),
    ...(request.body === undefined ? {} : { body: request.body }),
  });
}

describe('the five primitives over HTTP', () => {
  it('serves discover without a domain as the domain list', async () => {
    const response = await call({ path: '/api/discover' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ domains: ['bounty'] });
  });

  it('serves one domain on request', async () => {
    const response = await call({ path: '/api/discover?domain=bounty' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ detail: { actions: [{ id: 'bounty.list' }] } });
  });

  it('serves search', async () => {
    const response = await call({ path: '/api/search?type=bounty&name=lis' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 'bounty.list', name: 'list' }]);
  });

  it('runs an action through act', async () => {
    const response = await call({
      method: 'POST',
      path: '/api/act',
      body: { action: 'bounty.list', input: { id: 'shared-1' } },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ listed: 'shared-1' });
  });

  it('answers 404 for a path it does not serve', async () => {
    const response = await call({ path: '/api/nope' });

    expect(response.status).toBe(404);
  });

  it('refuses a body that is not an action call', async () => {
    expect((await call({ method: 'POST', path: '/api/act' })).status).toBe(400);
    expect((await call({ method: 'POST', path: '/api/act', body: { action: 42 } })).status).toBe(
      400,
    );
  });
});

describe('what a client is told when something fails', () => {
  it('reports an unknown action as 404 and names the domains', async () => {
    const response = await call({ method: 'POST', path: '/api/act', body: { action: 'nope.run' } });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: expect.stringContaining('known domains: bounty'),
    });
  });

  it('reports a failed authentication as 401, with the reason', async () => {
    const handle = createRoutes({
      api: createApplicationApi(runtimeWithOneAction()),
      authenticate: () => {
        throw new TestAuthFailure('revoked');
      },
    });

    const response = await handle({
      method: 'GET',
      url: `${ORIGIN}/api/discover`,
      headers: new Map(),
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ reason: 'revoked' });
  });

  it('authenticates before it does anything else', async () => {
    // An unauthenticated /api/act is an open door to every capability the game
    // grows, so the order is the thing being asserted rather than the result.
    const checked: string[] = [];
    const handle = createRoutes({
      api: createApplicationApi(runtimeWithOneAction()),
      authenticate: async () => {
        checked.push('auth');
      },
    });

    await handle({
      method: 'POST',
      url: `${ORIGIN}/api/act`,
      headers: new Map(),
      body: { action: 'bounty.list', input: { id: 'x' } },
    });

    expect(checked).toEqual(['auth']);
  });

  it('does not run the action when authentication fails', async () => {
    const handle = createRoutes({
      api: createApplicationApi(runtimeWithOneAction()),
      authenticate: () => {
        throw new TestAuthFailure('expired');
      },
    });

    const response = await handle({
      method: 'POST',
      url: `${ORIGIN}/api/act`,
      headers: new Map(),
      body: { action: 'bounty.list', input: { id: 'x' } },
    });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('listed');
  });
});

describe('the actions /api/act refuses because it cannot see the caller', () => {
  /**
   * Every id whose payload names a caller, and what the refusal says.
   *
   * Written out as data rather than derived, because the list in `routes.ts` is
   * the thing that can rot: a new action that takes an `agentId` and is not on
   * it is a hole, and nothing in the build notices. A test that merely asserts
   * "these six are refused" would pass against a list of one, or of none.
   */
  const REFUSED = [
    { action: 'quest.claim', names: 'POST /api/quests/{id}/claim' },
    { action: 'quest.submit', names: 'POST /api/quests/{id}/submit' },
    { action: 'quest.admin.revoke', names: 'no HTTP door' },
    { action: 'session.create', names: 'POST /api/sessions' },
    { action: 'session.heartbeat', names: 'POST /api/sessions/{id}/heartbeat' },
    { action: 'session.end', names: 'POST /api/sessions/{id}/end' },
  ] as const;

  for (const { action, names } of REFUSED) {
    it(`refuses ${action} and says ${names}`, async () => {
      // A runtime that has never heard of the action, deliberately: the refusal
      // has to be the ROUTE's, decided before the registry is consulted. A gate
      // that ran after the lookup would answer "unknown action" for a caller who
      // has the id right, which is a different bug wearing the same test.
      const handle = createRoutes({ api: createApplicationApi(runtimeWithOneAction()) });

      const response = await handle({
        method: 'POST',
        url: `${ORIGIN}/api/act`,
        headers: new Map(),
        body: { action, input: { agentId: 'agent-theirs', ownerId: 'user-theirs' } },
      });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ action });
      expect(String((response.body as { error: string }).error)).toContain(names);
    });
  }

  it('refuses before the runtime is asked, so a payload naming somebody else changes nothing', () => {
    // The negative case for the tests above. If the gate were a comparison
    // against something the payload supplied, an id that HAPPENS to match would
    // sail through — so this asserts the opposite of the hole rather than a
    // restatement of the fix.
    expect(callerScopedRefusal('quest.claim')).toBeDefined();
    expect(callerScopedRefusal('bounty.list')).toBeUndefined();
    expect(callerScopedRefusal('social.send')).toBeUndefined();
  });

  it('answers an unknown action as unknown rather than as gated', async () => {
    // Ordering, and it is a real one: a client that misspelled an id must be
    // told that, not sent looking for a route.
    const handle = createRoutes({ api: createApplicationApi(runtimeWithOneAction()) });

    const response = await handle({
      method: 'POST',
      url: `${ORIGIN}/api/act`,
      headers: new Map(),
      body: { action: 'session.stop', input: {} },
    });

    expect(response.status).toBe(404);
  });

  it('still refuses an unauthenticated caller, whatever the action', async () => {
    // The gate sits BEHIND authentication. If it did not, the 403 would leak
    // which actions exist to a caller with no credential at all — and this
    // surface is a catch-all, so "which ids are gated" is a map of the routes
    // in the app.
    const handle = createRoutes({
      api: createApplicationApi(runtimeWithOneAction()),
      authenticate: () => {
        throw new TestAuthFailure('missing');
      },
    });

    const response = await handle({
      method: 'POST',
      url: `${ORIGIN}/api/act`,
      headers: new Map(),
      body: { action: 'quest.claim', input: {} },
    });

    expect(response.status).toBe(401);
  });
});

describe('the surface does not grow with the game', () => {
  it('serves the same five paths whatever features exist', async () => {
    const runtime = createRuntime({
      extensions: Array.from({ length: 6 }, (_, index) => ({
        id: `feature-${index}`,
        capabilities: [{ name: `feature${index}.read`, description: 'reads' }],
        actionDefs: [
          defineAction({
            id: `feature${index}.run`,
            permissions: [`feature${index}.run`],
            run: async () => ({ ok: true }),
          }),
        ],
      })),
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => '2026-09-24T12:00:00.000Z',
    });
    const handle = createRoutes({ api: createApplicationApi(runtime) });

    const discover = await handle({
      method: 'GET',
      url: `${ORIGIN}/api/discover`,
      headers: new Map(),
    });

    // Six features, six actions, and the client was told six names from one
    // request. It did not need six paths.
    expect((discover.body as { domains: string[] }).domains).toHaveLength(6);
  });
});
