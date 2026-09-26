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
  createQuestRoutes,
  type OwnedSession,
  type QuestRouteDependencies,
} from './quest-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';

const ORIGIN = 'https://agentbattle.test';

/**
 * A credential failure, defined here rather than imported.
 *
 * Same reasoning `session-routes.test.ts` gives: it keeps this file off the
 * credential package so the assertion is about the HTTP contract rather than
 * about one issuer's error class.
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
 * A real runtime carrying stand-ins for the two quest transitions.
 *
 * A stub extension rather than a fake `ApplicationApi`, because the ids are the
 * thing most likely to rot: the route writes them out rather than importing them
 * (see the note in `quest-routes.ts`), and a real runtime is the only thing that
 * checks them against both the generated union and the registry. A hand-written
 * stub would accept any string and prove nothing.
 *
 * `quest.admin.revoke` is registered on purpose even though no route reaches it.
 * It is what makes the `/api/act` refusal testable here rather than only in
 * `routes.test.ts`, and a fixture that omitted it could not tell "refused" from
 * "not installed".
 */
function apiRecording(): { api: ApplicationApi; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const action = (id: string) =>
    defineAction({
      id,
      permissions: [id],
      run: async (input: unknown) => {
        calls.push({ id, input });
        return { id, echo: input };
      },
    });
  const runtime = createRuntime({
    extensions: [
      {
        id: 'quest',
        capabilities: [
          { name: 'quest.claim', description: 'takes a quest' },
          { name: 'quest.submit', description: 'hands a quest in' },
          { name: 'quest.admin.revoke', description: 'cancels a quest' },
        ],
        actionDefs: [action('quest.claim'), action('quest.submit'), action('quest.admin.revoke')],
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
 * `install-theirs` is here for the reason `bounty-routes.test.ts` records. A
 * fixture holding only the caller's own sessions cannot tell "not mine" from
 * "not there", so the indistinguishable-404 assertion would pass against a route
 * that leaked.
 */
const OWNED: Readonly<Record<string, Readonly<Record<string, OwnedSession>>>> = {
  'install-mine': {
    'session-mine': { id: 'session-mine', agentId: 'agent-mine', status: 'active' },
  },
  'install-theirs': {
    'session-theirs': { id: 'session-theirs', agentId: 'agent-theirs', status: 'active' },
  },
};

interface Harness {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly calls: Recorded[];
  readonly lookups: { sessionId: string; installationId: string }[];
  readonly authenticated: number;
}

function harness(overrides: Partial<QuestRouteDependencies> = {}): Harness {
  const { api, calls } = apiRecording();
  const lookups: { sessionId: string; installationId: string }[] = [];
  let authenticated = 0;
  const dependencies: QuestRouteDependencies = {
    api,
    authenticate: async () => {
      authenticated += 1;
      return { installationId: 'install-mine' };
    },
    resolveSession: async (sessionId, installationId) => {
      lookups.push({ sessionId, installationId });
      return OWNED[installationId]?.[sessionId];
    },
    ...overrides,
  };
  return {
    handle: createQuestRoutes(dependencies),
    calls,
    lookups,
    get authenticated() {
      return authenticated;
    },
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

describe.each([
  { step: 'claim', action: 'quest.claim' },
  { step: 'submit', action: 'quest.submit' },
])('POST /api/quests/{id}/$step', ({ step, action }) => {
  it('takes the agent from the caller own session, not from the body', async () => {
    // The load-bearing assertion, and the reason this route exists. The body
    // claims as somebody else's session AND asks for that agent directly; the
    // command must still be reached as `agent-mine`, because that is the only
    // session the caller owns. An `agentId` read out of the body is an identity
    // any credential-holder chooses, and the row it writes names that choice.
    const h = harness();

    const response = await call(h.handle, {
      path: `/api/quests/q-1/${step}`,
      body: { sessionId: 'session-mine', agentId: 'agent-theirs' },
    });

    expect(response.status).toBe(200);
    expect(h.lookups).toEqual([{ sessionId: 'session-mine', installationId: 'install-mine' }]);
    expect(h.calls).toEqual([{ id: action, input: { questId: 'q-1', agentId: 'agent-mine' } }]);
  });

  it('takes the quest id from the path, not from the body', async () => {
    // Otherwise a client could POST to one quest and act on another, and the URL
    // an operator reads in a log would not be the one that ran.
    const h = harness();

    await call(h.handle, {
      path: `/api/quests/q-from-path/${step}`,
      body: { sessionId: 'session-mine', questId: 'q-from-body' },
    });

    expect(h.calls[0]?.input).toEqual({ questId: 'q-from-path', agentId: 'agent-mine' });
  });

  it("refuses a session the caller's installation does not own, without acting", async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: `/api/quests/q-1/${step}`,
      body: { sessionId: 'session-theirs' },
    });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('answers an unowned session exactly as it answers one that does not exist', async () => {
    // Two 404s that are byte-identical, because a distinguishable pair is an
    // oracle for "does this session id exist".
    const unowned = await call(harness().handle, {
      path: `/api/quests/q-1/${step}`,
      body: { sessionId: 'session-theirs' },
    });
    const missing = await call(harness().handle, {
      path: `/api/quests/q-1/${step}`,
      body: { sessionId: 'session-nowhere' },
    });

    expect(unowned.status).toBe(404);
    expect(unowned.body).toEqual(missing.body);
  });

  it('refuses a body with no session id, before asking who owns anything', async () => {
    const h = harness();

    const response = await call(h.handle, { path: `/api/quests/q-1/${step}`, body: {} });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
    expect(h.lookups).toEqual([]);
  });

  it('reads the quest id out of a percent-encoded segment', async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: `/api/quests/a%20b/${step}`,
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(200);
    expect(h.calls[0]?.input).toMatchObject({ questId: 'a b' });
  });

  it('refuses a malformed quest id as a 400 rather than a 500', async () => {
    // A `%` that is not valid percent-encoding throws URIError out of
    // decodeURIComponent, and an uncaught throw is a 500 — telling the client
    // the platform is broken when it built the URL wrong.
    const h = harness();

    const response = await call(h.handle, {
      path: `/api/quests/%E0%A4%A/${step}`,
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
  });
});

describe('the surface around the two transitions', () => {
  it('resolves ownership against the CALLER, so a constant installation is not a scoping', async () => {
    // This one exists because the mutation it stands for was a NO-OP the first
    // time it was tried. Every other case in this file authenticates as
    // `install-mine`, so replacing `caller.installationId` with the literal
    // `"install-mine"` changed nothing and the suite stayed green — a gate that
    // could not fail, which is the failure this repository keeps filing.
    //
    // The second caller is what makes it fail: a route that hard-codes an
    // installation answers for `session-theirs` exactly as it does for
    // `session-mine`, and that is the impersonation, wearing a green test.
    const h = harness({ authenticate: async () => ({ installationId: 'install-theirs' }) });

    const response = await call(h.handle, {
      path: '/api/quests/q-1/claim',
      body: { sessionId: 'session-theirs', agentId: 'agent-mine' },
    });

    expect(response.status).toBe(200);
    expect(h.lookups).toEqual([{ sessionId: 'session-theirs', installationId: 'install-theirs' }]);
    // And the agent is the one THAT session belongs to, not the one the body
    // asked for.
    expect(h.calls).toEqual([
      { id: 'quest.claim', input: { questId: 'q-1', agentId: 'agent-theirs' } },
    ]);
  });

  it('refuses the other installation session to a caller that owns none of it', async () => {
    const h = harness({ authenticate: async () => ({ installationId: 'install-mine' }) });

    const response = await call(h.handle, {
      path: '/api/quests/q-1/claim',
      body: { sessionId: 'session-theirs' },
    });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('has no route for quest.admin.revoke, and answers 404 for one', async () => {
    // The absence is the design, and this is what holds it in place. A revoke is
    // an administrator's move, the schema has no column that says who an
    // administrator is, and a route could only have taken the `agentId` from
    // the body and called that the authorization.
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/quests/q-1/revoke',
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
    // The revoke is registered in the fixture, so the 404 is this surface's
    // answer rather than a runtime that never heard of the action.
    expect(isRegisteredActionId('quest.admin.revoke')).toBe(true);
  });

  it('refuses every route on the surface without a credential, before reading the body', async () => {
    for (const path of [
      '/api/quests/q-1/claim',
      '/api/quests/q-1/submit',
      '/api/quests/q-1/revoke',
    ]) {
      const h = harness({
        authenticate: async () => {
          throw new TestAuthFailure('unknown');
        },
      });

      const response = await call(h.handle, { path, body: { sessionId: 'session-mine' } });

      expect(response.status, path).toBe(401);
      expect(response.body).toMatchObject({ reason: 'unknown' });
      expect(h.calls).toEqual([]);
      expect(h.lookups).toEqual([]);
    }
  });

  it('404s a path that is not on this surface', async () => {
    const h = harness();

    for (const path of ['/api/quests/q-1', '/api/quests', '/api/quests/q-1/claim/extra']) {
      const response = await call(h.handle, { path, body: { sessionId: 'session-mine' } });
      expect(response.status, path).toBe(404);
    }
    expect(h.calls).toEqual([]);
  });

  it('answers 500 for a failure the feature raised, which is not this route to classify', async () => {
    // A quest that is already claimed reaches the route as a plain Error.
    // Turning that into a 409 would mean the route recognising a failure the
    // FEATURE defined, which is the game-logic-in-a-handler rule.
    const h = harness({
      api: {
        act: async () => {
          throw new Error('quest q-1 cannot be claimed from claimed');
        },
      } as unknown as ApplicationApi,
    });

    const response = await call(h.handle, {
      path: '/api/quests/q-1/claim',
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(500);
  });

  it('writes action ids out that the generated union still carries', () => {
    // The route cannot import them (removal test), so each literal is checked
    // against the union here as well as by `satisfies` at compile time.
    for (const id of ['quest.claim', 'quest.submit']) {
      expect(isRegisteredActionId(id), id).toBe(true);
    }
  });
});
