import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import { isRegisteredActionId } from '@battle-agents/protocol';
import { describe, expect, it } from 'vitest';

import {
  createSessionRoutes,
  type OwnedSession,
  type SessionRouteDependencies,
} from './session-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';

const ORIGIN = 'https://agentbattle.test';

/**
 * A credential failure, defined here rather than imported.
 *
 * Same reasoning `routes.test.ts` gives: it keeps this file off the credential
 * package so the assertion is about the HTTP contract, not about one issuer's
 * error class. The runtime reads `reason` off the top level, which is the shape
 * the api package's guard documents.
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
 * A real runtime carrying a stand-in for `session.heartbeat`.
 *
 * A stub extension rather than a fake `ApplicationApi` object, because the id is
 * the thing most likely to rot: the route writes the action id out rather than
 * importing it (see the note in `session-routes.ts`), and a real runtime is the
 * only thing that checks it against both the generated union and the registry.
 * A hand-written api stub would accept anything and prove nothing.
 */
function apiRecording(): { api: ApplicationApi; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const runtime = createRuntime({
    extensions: [
      {
        id: 'agent',
        capabilities: [{ name: 'session.heartbeat', description: 'records that a run is alive' }],
        actionDefs: [
          defineAction({
            id: 'session.heartbeat',
            permissions: ['session.heartbeat'],
            run: async (input: unknown) => {
              calls.push({ id: 'session.heartbeat', input });
              return { sessionId: 'session-1', status: 'active' };
            },
          }),
        ],
      },
    ],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => '2026-09-26T00:00:00.000Z',
  });
  return { api: createApplicationApi(runtime), calls };
}

interface Harness {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly calls: Recorded[];
  readonly resolved: { sessionId: string; installationId: string }[];
  /** How many times authenticate was reached, whichever one is wired. */
  readonly authenticated: number;
}

const OWNED: OwnedSession = { id: 'session-1', agentId: 'agent-1', status: 'active' };

interface HarnessOptions extends Partial<Omit<SessionRouteDependencies, 'resolveSession'>> {
  /**
   * What the ownership query returns. `null` means "not owned", which is a
   * different thing from omitting the option — a default parameter would treat
   * an explicit `undefined` as "use the default" and quietly turn the
   * unowned-session cases into owned ones.
   */
  readonly owned?: OwnedSession | null;
}

function harness(options: HarnessOptions = {}): Harness {
  const { api, calls } = apiRecording();
  const { owned = OWNED, ...overrides } = options;
  const resolved: { sessionId: string; installationId: string }[] = [];
  let authenticated = 0;

  const authenticate = overrides.authenticate ?? (async () => ({ installationId: 'install-1' }));
  const dependencies: SessionRouteDependencies = {
    api,
    ...overrides,
    // Counted around whichever authenticator is wired, so the ordering
    // assertion below holds for a rejecting one too.
    authenticate: async (request) => {
      authenticated += 1;
      return authenticate(request);
    },
    resolveSession: async (sessionId, installationId) => {
      resolved.push({ sessionId, installationId });
      return owned ?? undefined;
    },
  };
  return {
    handle: createSessionRoutes(dependencies),
    calls,
    resolved,
    get authenticated() {
      return authenticated;
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

describe('POST /api/sessions/{id}/heartbeat', () => {
  it('maps 1:1 onto the session.heartbeat action and returns what it answered', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/sessions/session-1/heartbeat' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sessionId: 'session-1', status: 'active' });
    // Exactly once, and with the session id and nothing else. An extra field
    // here would be a second opinion about what a heartbeat is.
    expect(h.calls).toEqual([{ id: 'session.heartbeat', input: { sessionId: 'session-1' } }]);
  });

  it('refuses a request that presents no credential, before anything else happens', async () => {
    const h = harness({
      authenticate: async () => {
        throw new TestAuthFailure('missing');
      },
    });

    const response = await call(h.handle, { path: '/api/sessions/session-1/heartbeat' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: 'credential refused: missing',
      reason: 'missing',
    });
    // Neither the ownership query nor the action ran. A refused credential must
    // not be able to tell the caller whether a session id is real.
    expect(h.resolved).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it('resolves ownership against the CALLER, so a session it does not own is out of reach', async () => {
    // This is the assertion the route exists for. `act()` has no principal, so
    // without the resolveSession call below, ANY agent with a valid credential
    // could keep another installation's run alive forever — which is exactly
    // what the stale-session sweeper exists to end.
    const h = harness({ owned: null });

    const response = await call(h.handle, { path: '/api/sessions/session-1/heartbeat' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no such session' });
    // The installation the credential resolved to, not the session id and not a
    // constant: a route that passed the wrong one here would look scoped and
    // scope nothing.
    expect(h.resolved).toEqual([{ sessionId: 'session-1', installationId: 'install-1' }]);
    expect(h.calls).toEqual([]);
  });

  it('answers an unowned session and a nonexistent one identically', async () => {
    // Indistinguishability is the property, not tidiness: a 403 here would be a
    // session-id oracle.
    const unowned = await call(harness({ owned: null }).handle, {
      path: '/api/sessions/session-1/heartbeat',
    });
    const missing = await call(harness({ owned: null }).handle, {
      path: '/api/sessions/never-existed/heartbeat',
    });

    expect(unowned).toEqual(missing);
    expect(unowned.status).toBe(404);
  });

  it('authenticates before it resolves ownership', async () => {
    const h = harness({
      authenticate: async () => {
        throw new TestAuthFailure('expired');
      },
    });

    await call(h.handle, { path: '/api/sessions/session-1/heartbeat' });

    expect(h.authenticated).toBe(1);
    expect(h.resolved).toEqual([]);
  });

  it('reads the session id out of a percent-encoded segment', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/sessions/a%20b/heartbeat' });

    expect(response.status).toBe(200);
    expect(h.calls).toEqual([{ id: 'session.heartbeat', input: { sessionId: 'a b' } }]);
  });

  it('refuses a segment that is not valid percent-encoding, without acting', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/sessions/%ZZ/heartbeat' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'session id is not a valid URL segment' });
    expect(h.calls).toEqual([]);
  });

  it('404s anything that is not this route', async () => {
    const h = harness();

    for (const request of [
      { path: '/api/sessions/session-1', method: 'GET' as const },
      { path: '/api/sessions/session-1/end', method: 'POST' as const },
      { path: '/api/sessions/heartbeat', method: 'POST' as const },
      { path: '/api/sessions/session-1/heartbeat/extra', method: 'POST' as const },
      { path: '/api/cron/heartbeat', method: 'POST' as const },
    ]) {
      const response = await call(h.handle, request);
      expect(response.status).toBe(404);
    }
    // A wrong method is a 404 rather than a 401, so an uncredentialed probe
    // cannot tell which routes exist.
    expect(h.calls).toEqual([]);
  });
});

describe('the action id this route writes out', () => {
  it('is an id the generated union still carries', () => {
    // The route cannot import SESSION_HEARTBEAT (removal test), so the literal
    // is checked against the union here as well as by `satisfies` at compile
    // time. Renaming the action and regenerating turns both red.
    expect(isRegisteredActionId('session.heartbeat')).toBe(true);
  });
});
