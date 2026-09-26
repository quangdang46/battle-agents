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
  type OwnedOwner,
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
 * A real runtime carrying stand-ins for the three session commands.
 *
 * A stub extension rather than a fake `ApplicationApi` object, because the ids
 * are the thing most likely to rot: the routes write the action ids out rather
 * than importing them (see the note in `session-routes.ts`), and a real runtime
 * is the only thing that checks them against both the generated union and the
 * registry. A hand-written api stub would accept anything and prove nothing.
 */
function apiRecording(): { api: ApplicationApi; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const record =
    (id: string, answer: (input: unknown) => unknown) =>
    async (input: unknown): Promise<unknown> => {
      calls.push({ id, input });
      return answer(input);
    };
  const action = (id: string, answer: (input: unknown) => unknown = () => ({})) =>
    defineAction({ id, permissions: [id], run: record(id, answer) });
  const runtime = createRuntime({
    extensions: [
      {
        id: 'agent',
        capabilities: [
          { name: 'session.create', description: 'starts a run' },
          { name: 'session.heartbeat', description: 'records that a run is alive' },
          { name: 'session.end', description: 'records that a run is over' },
        ],
        actionDefs: [
          action('session.create', (input) => ({ ...(input as object), resumed: false })),
          action('session.heartbeat', () => ({ sessionId: 'session-1', status: 'active' })),
          action('session.end', () => ({ sessionId: 'session-1', status: 'completed' })),
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
  /** Every installation the owner query was asked about. */
  readonly ownerLookups: string[];
  /** How many times authenticate was reached, whichever one is wired. */
  readonly authenticated: number;
}

const OWNED: OwnedSession = { id: 'session-1', agentId: 'agent-1', status: 'active' };

/**
 * The humans behind each installation, keyed by installation.
 *
 * Two, for the reason `bounty-routes.test.ts` records: a fixture holding only
 * the caller's own owner cannot tell "resolved to somebody" from "resolved to
 * nobody", and the assertions that matter here are the ones where a second
 * identity's own owner is what the command receives.
 */
const OWNERS: Readonly<Record<string, OwnedOwner>> = {
  'install-1': { userId: 'user-1', installationKey: 'machine-1' },
  'install-2': { userId: 'user-2', installationKey: 'machine-2' },
};

interface HarnessOptions extends Partial<Omit<SessionRouteDependencies, 'resolveSession'>> {
  /**
   * What the ownership query returns. `null` means "not owned", which is a
   * different thing from omitting the option — a default parameter would treat
   * an explicit `undefined` as "use the default" and quietly turn the
   * unowned-session cases into owned ones.
   */
  readonly owned?: OwnedSession | null;
  /** The installation the default authenticator resolves to. */
  readonly installationId?: string;
}

function harness(options: HarnessOptions = {}): Harness {
  const { api, calls } = apiRecording();
  const { owned = OWNED, installationId = 'install-1', ...overrides } = options;
  const resolved: { sessionId: string; installationId: string }[] = [];
  const ownerLookups: string[] = [];
  let authenticated = 0;

  const authenticate = overrides.authenticate ?? (async () => ({ installationId: installationId }));
  // Captured before the spread below, so a test that supplies its own owner
  // resolver is not silently overwritten by the default. It was overwritten once
  // already, and the test that caught it — the "installation has no owner" case
  // — went green for the wrong reason by answering 201.
  const resolveOwner = overrides.resolveOwner;
  const dependencies: SessionRouteDependencies = {
    api,
    ...overrides,
    // Counted around whichever authenticator is wired, so the ordering
    // assertion below holds for a rejecting one too.
    authenticate: async (request) => {
      authenticated += 1;
      return authenticate(request);
    },
    resolveSession: async (sessionId, owner) => {
      resolved.push({ sessionId, installationId: owner });
      return owned ?? undefined;
    },
    resolveOwner:
      resolveOwner ??
      (async (caller) => {
        ownerLookups.push(caller);
        return OWNERS[caller];
      }),
  };
  return {
    handle: createSessionRoutes(dependencies),
    calls,
    resolved,
    ownerLookups,
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
    ...(request.body === undefined ? {} : { body: request.body }),
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
      { path: '/api/sessions/heartbeat', method: 'POST' as const },
      { path: '/api/sessions/session-1/heartbeat/extra', method: 'POST' as const },
      { path: '/api/sessions/', method: 'GET' as const },
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

describe('POST /api/sessions', () => {
  // No `installationKey`: the route fills it from the credential. See the note
  // on `OwnedOwner` — a key the client supplies is one it has to be told, and
  // nothing over HTTP tells it.
  const handshake = { agentName: 'scout', harness: 'claude' };

  it('starts the run as the owner the credential resolves to', async () => {
    // The load-bearing assertion. `session.create` takes an `ownerId` and the
    // handshake resolves the installation AND the character by it, so an
    // `ownerId` read out of the body is an account any credential-holder
    // chooses — and the answer is a live session id, which is the join key to
    // every other surface.
    const h = harness();

    const response = await call(h.handle, { path: '/api/sessions', body: handshake });

    expect(response.status).toBe(201);
    expect(h.ownerLookups).toEqual(['install-1']);
    expect(h.calls).toEqual([
      {
        id: 'session.create',
        input: { ...handshake, ownerId: 'user-1', installationKey: 'machine-1' },
      },
    ]);
  });

  it('refuses a body naming somebody else, and starts nothing', async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/sessions',
      body: { ...handshake, ownerId: 'user-2' },
    });

    expect(response.status).toBe(403);
    expect(h.calls).toEqual([]);
  });

  it("answers the second identity's name exactly as it answers an invented one", async () => {
    // The 403 is only safe because it carries nothing. A refusal that named
    // which half was wrong would be a user-id oracle on the path that starts
    // every run.
    const real = await call(harness().handle, {
      path: '/api/sessions',
      body: { ...handshake, ownerId: 'user-2' },
    });
    const invented = await call(harness().handle, {
      path: '/api/sessions',
      body: { ...handshake, ownerId: 'nobody-has-this-id' },
    });

    expect(real.status).toBe(403);
    expect(invented).toEqual(real);
  });

  it('refuses a handshake naming another machine, and starts nothing', async () => {
    // The second identity field, and the one with the quieter failure. A wrong
    // `installationKey` is not an error inside the feature: the lookup is unique
    // on (owner, key), so it creates a SECOND installation and the session lands
    // on it — owned by an installation the presented credential cannot prove, so
    // every other route refuses the run the caller believes it just opened.
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/sessions',
      body: { ...handshake, installationKey: 'machine-2' },
    });

    expect(response.status).toBe(403);
    expect(h.calls).toEqual([]);
  });

  it("accepts the caller's own machine key in the body, as it does its own name", async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/sessions',
      body: { ...handshake, installationKey: 'machine-1' },
    });

    expect(response.status).toBe(201);
    expect(h.calls[0]?.input).toMatchObject({ installationKey: 'machine-1' });
  });

  it("accepts the caller's own name in the body, so a client may say who it is", async () => {
    // Not generosity. A client that reads its own id from somewhere and sends it
    // must not be punished, or the fix teaches clients to stop sending the field
    // rather than to send the right one.
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/sessions',
      body: { ...handshake, ownerId: 'user-1' },
    });

    expect(response.status).toBe(201);
    expect(h.calls[0]?.input).toMatchObject({ ownerId: 'user-1' });
  });

  it('records the second identity as itself, so the check is not hard-coded', async () => {
    // The positive half for a second installation. Without it, "refused" could
    // be satisfied by a route that refuses every handshake.
    const h = harness({ installationId: 'install-2' });

    const response = await call(h.handle, { path: '/api/sessions', body: handshake });

    expect(response.status).toBe(201);
    expect(h.ownerLookups).toEqual(['install-2']);
    expect(h.calls[0]?.input).toMatchObject({ ownerId: 'user-2' });
  });

  it('refuses a handshake whose installation has no owner, without starting one', async () => {
    // Fail-closed against a broken invariant rather than an everyday case; the
    // real store cannot produce it, because `installations.user_id` is NOT NULL
    // and a credential whose installation is deleted cascades away with it.
    const h = harness({ resolveOwner: async () => undefined });

    const response = await call(h.handle, { path: '/api/sessions', body: handshake });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('refuses a handshake missing what the command needs, before asking who owns it', async () => {
    for (const body of [
      {},
      { ...handshake, agentName: '' },
      { ...handshake, harness: null },
      { ...handshake, projectKey: 7 },
      { ...handshake, projectKey: '   ' },
      ['not', 'an', 'object'],
    ]) {
      const h = harness();

      const response = await call(h.handle, { path: '/api/sessions', body });

      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(h.calls).toEqual([]);
      // A request that named nothing usable must not reach the query at all.
      expect(h.ownerLookups).toEqual([]);
    }
  });

  it('carries a project key through when there is one, and omits it when there is not', async () => {
    const with_ = await call(harness().handle, {
      path: '/api/sessions',
      body: { ...handshake, projectKey: 'widgets' },
    });
    expect(with_.status).toBe(201);

    const h = harness();
    await call(h.handle, { path: '/api/sessions', body: handshake });
    // Omitted rather than sent as null, because `projectKey: null` is not the
    // same as absent to the guard in the feature.
    expect(h.calls[0]?.input).not.toHaveProperty('projectKey');
  });

  it('refuses a request that presents no credential, before reading the body', async () => {
    const h = harness({
      authenticate: async () => {
        throw new TestAuthFailure('missing');
      },
    });

    const response = await call(h.handle, { path: '/api/sessions', body: handshake });

    expect(response.status).toBe(401);
    expect(h.ownerLookups).toEqual([]);
    expect(h.calls).toEqual([]);
  });
});

describe('POST /api/sessions/{id}/end', () => {
  it('ends the run once the caller is shown to own it', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/sessions/session-1/end' });

    expect(response.status).toBe(200);
    expect(h.resolved).toEqual([{ sessionId: 'session-1', installationId: 'install-1' }]);
    expect(h.calls).toEqual([{ id: 'session.end', input: { sessionId: 'session-1' } }]);
  });

  it('refuses to end a run the caller does not own, which is the hole this route closes', async () => {
    // Without the resolveSession call, any credential-holder who learned a
    // session id could stop an agent mid-task and release its resume window to
    // whoever claimed it next. `/api/act` used to be that door, and
    // `CALLER_SCOPED_ACTIONS` in routes.ts is what closes it.
    const h = harness({ owned: null });

    const response = await call(h.handle, { path: '/api/sessions/session-1/end' });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('answers an unowned run and a nonexistent one identically', async () => {
    const unowned = await call(harness({ owned: null }).handle, {
      path: '/api/sessions/session-1/end',
    });
    const missing = await call(harness({ owned: null }).handle, {
      path: '/api/sessions/never-existed/end',
    });

    expect(unowned).toEqual(missing);
    expect(unowned.status).toBe(404);
  });

  it('passes a reason through, and omits it when the body names none', async () => {
    const h = harness();
    const named = await call(h.handle, {
      path: '/api/sessions/session-1/end',
      body: { reason: 'completed' },
    });
    expect(named.status).toBe(200);
    expect(h.calls[0]?.input).toEqual({ sessionId: 'session-1', reason: 'completed' });

    const blank = harness();
    await call(blank.handle, { path: '/api/sessions/session-1/end', body: { reason: '  ' } });
    expect(blank.calls[0]?.input).toEqual({ sessionId: 'session-1' });
  });

  it('refuses a segment that is not valid percent-encoding, without acting', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/sessions/%ZZ/end' });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
  });
});

describe('the action ids this route writes out', () => {
  it('are ids the generated union still carries', () => {
    // The route cannot import SESSION_HEARTBEAT (removal test), so each literal
    // is checked against the union here as well as by `satisfies` at compile
    // time. Renaming an action and regenerating turns both red.
    for (const id of ['session.create', 'session.heartbeat', 'session.end']) {
      expect(isRegisteredActionId(id), id).toBe(true);
    }
  });
});
