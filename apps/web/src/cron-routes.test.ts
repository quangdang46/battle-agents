import { describe, expect, it } from 'vitest';

import { createCronRoutes, type CronRouteDependencies, type SweepOutcome } from './cron-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';

const ORIGIN = 'https://agentbattle.test';

class TestAuthFailure extends Error {
  constructor(readonly reason: string) {
    super(`credential refused: ${reason}`);
  }
}

interface Harness {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  /** One entry per sweep the route triggered. */
  readonly sweeps: number;
}

function harness(
  overrides: Partial<CronRouteDependencies> = {},
  outcome: SweepOutcome = { disconnected: 2, abandoned: 1 },
): Harness {
  let sweeps = 0;
  const dependencies: CronRouteDependencies = {
    sweep: async () => {
      sweeps += 1;
      return outcome;
    },
    ...overrides,
  };
  return {
    handle: createCronRoutes(dependencies),
    get sweeps() {
      return sweeps;
    },
  };
}

function call(
  handle: (request: HttpRequest) => Promise<HttpResponse>,
  request: Partial<HttpRequest> & { path: string },
): Promise<HttpResponse> {
  return handle({
    method: request.method ?? 'POST',
    url: `${ORIGIN}${request.path}`,
    headers: request.headers ?? { get: () => null },
  });
}

const TRIGGER = '/api/cron/heartbeat';

describe('POST /api/cron/heartbeat', () => {
  it('triggers the sweep and reports what it did, as counts', async () => {
    const h = harness({ authenticate: async () => ({}) });

    const response = await call(h.handle, { path: TRIGGER });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ disconnected: 2, abandoned: 1 });
    expect(h.sweeps).toBe(1);
  });

  it('refuses every caller when no authenticator is wired, without sweeping', async () => {
    // The default has to be closed. A scheduler presents no agent credential, so
    // there is nothing upstream that has authenticated anything, and "no
    // authenticator was supplied" can only honestly mean "this surface is not
    // open". If this returned 200, the route would be an unauthenticated
    // state-transition endpoint behind a public route tree.
    const h = harness();

    const response = await call(h.handle, { path: TRIGGER });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'no cron credential is configured for this surface',
      reason: 'cron-closed',
    });
    expect(h.sweeps).toBe(0);
  });

  it('refuses a caller the authenticator rejects, without sweeping', async () => {
    const h = harness({
      authenticate: async () => {
        throw new TestAuthFailure('missing');
      },
    });

    const response = await call(h.handle, { path: TRIGGER });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'credential refused: missing', reason: 'missing' });
    expect(h.sweeps).toBe(0);
  });

  it('decides nothing itself: a wrong method or path never reaches the sweep', async () => {
    const h = harness({ authenticate: async () => ({}) });

    for (const request of [
      { path: TRIGGER, method: 'GET' as const },
      { path: '/api/cron/season', method: 'POST' as const },
      { path: '/api/heartbeat', method: 'POST' as const },
    ]) {
      const response = await call(h.handle, request);
      expect(response.status).toBe(404);
    }
    expect(h.sweeps).toBe(0);
  });

  it('does not deduplicate: one request is one sweep, and the decision is the sweeper’s', async () => {
    // The transition is a state machine in the agent feature, and it is
    // idempotent there. What this asserts is the other half: the TRIGGER keeps
    // no state of its own, so it cannot be the thing that makes a repeat sweep
    // safe or unsafe. A trigger that skipped a second call would look tidy and
    // would silently stop the sessions that went quiet between ticks from ever
    // being reaped.
    const h = harness({ authenticate: async () => ({}) });

    await call(h.handle, { path: TRIGGER });
    await call(h.handle, { path: TRIGGER });

    expect(h.sweeps).toBe(2);
  });

  it('reports counts and not session ids', async () => {
    // A scheduler asked for the sweep to happen, not for a list of which runs
    // died. Reporting the ids would republish the sweeper's answer to a caller
    // that has no standing to see it.
    const h = harness({ authenticate: async () => ({}) });

    const response = await call(h.handle, { path: TRIGGER });

    expect(JSON.stringify(response.body)).not.toContain('session');
  });

  it('reports a failed sweep as a failure rather than as an empty one', async () => {
    const h = harness({
      authenticate: async () => ({}),
      sweep: async () => {
        throw new Error('connection terminated');
      },
    });

    const response = await call(h.handle, { path: TRIGGER });

    // 500, not 200 with zero counts: "nothing was stale" and "the sweep did not
    // run" are different facts and a scheduler retries only one of them.
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'connection terminated' });
  });
});
