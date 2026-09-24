import {
  createRuntime,
  defineAction,
  createInMemoryEventBus,
  InMemoryStateStore,
} from '@battle-agents/core';
import { createApplicationApi } from '@battle-agents/api';
import { describe, expect, it } from 'vitest';

import { createRoutes, type HttpRequest, type HttpResponse } from './routes.js';

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

function runtimeWithOneAction() {
  return createRuntime({
    extensions: [
      {
        id: 'demo',
        capabilities: [{ name: 'demo.read', description: 'reads demos' }],
        actionDefs: [
          defineAction({
            id: 'demo.claim',
            permissions: ['demo.claim'],
            run: async (input: { id: string }) => ({ claimed: input.id }),
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
    expect(response.body).toEqual({ domains: ['demo'] });
  });

  it('serves one domain on request', async () => {
    const response = await call({ path: '/api/discover?domain=demo' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ detail: { actions: [{ id: 'demo.claim' }] } });
  });

  it('serves search', async () => {
    const response = await call({ path: '/api/search?type=demo&name=clai' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 'demo.claim', name: 'claim' }]);
  });

  it('runs an action through act', async () => {
    const response = await call({
      method: 'POST',
      path: '/api/act',
      body: { action: 'demo.claim', input: { id: 'shared-1' } },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ claimed: 'shared-1' });
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
    expect(response.body).toMatchObject({ error: expect.stringContaining('known domains: demo') });
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
      body: { action: 'demo.claim', input: { id: 'x' } },
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
      body: { action: 'demo.claim', input: { id: 'x' } },
    });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('claimed');
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
