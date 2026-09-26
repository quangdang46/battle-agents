import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  createBattleRoutes,
  type BattleRouteDependencies,
  type OwnedSession,
} from './battle-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';

const ORIGIN = 'https://agentbattle.test';

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
 * A real runtime carrying stand-ins for the four battle commands.
 *
 * A stub extension rather than a fake `ApplicationApi`, for the reason
 * `bounty-routes.test.ts` gives: the route writes the action ids out rather than
 * importing them, and only a real runtime checks them against the generated
 * union and the registry.
 *
 * `battle.list` is guarded in the feature against anything but an empty object,
 * so its stand-in RECORDS rather than accepts — a stub that tolerated a
 * populated input would hide a route that forwarded a query string it should
 * have dropped.
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
        id: 'battle',
        capabilities: [
          { name: 'battle.create', description: 'opens a battle' },
          { name: 'battle.list', description: 'lists open battles' },
          { name: 'battle.read', description: 'reads one battle' },
          { name: 'battle.join', description: 'enters a battle' },
        ],
        actionDefs: [
          action('battle.create'),
          action('battle.list'),
          action('battle.read'),
          action('battle.join'),
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
 * Keyed installation-first, because that is what
 * `DrizzleSessionRepository.findOwnedByInstallation` is:
 * `WHERE id = ? AND installationId = ?`. See `bounty-routes.test.ts` for what
 * happened the first time this was a flat list.
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
  readonly authenticated: number;
  readonly installationId: string;
}

function harness(overrides: Partial<BattleRouteDependencies> = {}): Harness {
  const { api, calls } = apiRecording();
  let authenticated = 0;
  const installationId = 'installation-mine';
  const dependencies: BattleRouteDependencies = {
    api,
    authenticate: async () => {
      authenticated += 1;
      return { installationId };
    },
    resolveSession: async (sessionId, caller) => OWNED[caller]?.[sessionId],
    ...overrides,
  };
  return {
    handle: createBattleRoutes(dependencies),
    calls,
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

describe('the reads are authenticated', () => {
  it('refuses both of them without a credential', async () => {
    // The narrowing, asserted rather than left to a comment. `battle.read` and
    // `battle.list` take a battle id and nothing else and the feature wants the
    // rubric public, but `BattleView` carries `participants[].sessionId` and
    // `winnerSessionIds`, and docs/design/public-replay.md rules a session id
    // never public. So both are behind the Bearer credential here, exactly as
    // `POST /api/act` already is, and this test is what goes red if somebody
    // "fixes" that by deleting the authenticate call.
    const h = harness({
      authenticate: async () => {
        throw new TestAuthFailure('unknown');
      },
    });

    const list = await call(h.handle, { method: 'GET', path: '/api/battles' });
    const read = await call(h.handle, { method: 'GET', path: '/api/battles/b-1' });

    expect(list.status).toBe(401);
    expect(list.body).toMatchObject({ reason: 'unknown' });
    expect(read.status).toBe(401);
    expect(h.calls).toEqual([]);
  });

  it('lists the joinable battles with an empty payload, not the query string', async () => {
    const h = harness();

    const response = await call(h.handle, { method: 'GET', path: '/api/battles?noise=1' });

    expect(response.status).toBe(200);
    expect(h.calls).toEqual([{ id: 'battle.list', input: {} }]);
  });

  it('reads one battle by the id in the path', async () => {
    const h = harness();

    const response = await call(h.handle, { method: 'GET', path: '/api/battles/b-1' });

    expect(response.status).toBe(200);
    expect(h.calls).toEqual([{ id: 'battle.read', input: { battleId: 'b-1' } }]);
  });

  it('answers 404 for a path that is not a battle id, rather than reading one', async () => {
    // A malformed segment and an unmatched path produce the same answer. A
    // stranger gets the same 404 either way, so the route is not a way to find
    // out which battle ids are real.
    const h = harness();

    const response = await call(h.handle, { method: 'GET', path: '/api/battles/%E0%A4%A' });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });
});

describe('POST /api/battles', () => {
  it('opens a battle and answers 201, sending the session it resolved', async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/battles',
      body: { sessionId: 'session-mine', mode: 'arena' },
    });

    expect(response.status).toBe(201);
    expect(h.calls).toEqual([
      { id: 'battle.create', input: { sessionId: 'session-mine', mode: 'arena' } },
    ]);
  });

  it("refuses a session the caller's installation does not own, without opening one", async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/battles',
      body: { sessionId: 'session-theirs' },
    });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('refuses a body that is not an object', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/battles', body: 'nope' });

    expect(response.status).toBe(400);
    expect(h.calls).toEqual([]);
  });
});

describe('POST /api/battles/{id}/join', () => {
  it('joins with the battle id from the path and the session from the body', async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/battles/b-1/join',
      body: { sessionId: 'session-mine' },
    });

    expect(response.status).toBe(200);
    expect(h.calls).toEqual([
      { id: 'battle.join', input: { battleId: 'b-1', sessionId: 'session-mine' } },
    ]);
  });

  it('takes the battle id from the path, not from the body', async () => {
    // Otherwise a client could POST to one battle and enter another, and the URL
    // an operator reads in a log would not be the one that ran.
    const h = harness();

    await call(h.handle, {
      path: '/api/battles/b-from-path/join',
      body: { sessionId: 'session-mine', battleId: 'b-from-body' },
    });

    expect(h.calls[0]?.input).toEqual({ battleId: 'b-from-path', sessionId: 'session-mine' });
  });

  it("refuses a session the caller's installation does not own, without joining", async () => {
    const h = harness();

    const response = await call(h.handle, {
      path: '/api/battles/b-1/join',
      body: { sessionId: 'session-theirs' },
    });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });

  it('answers an unowned session exactly as it answers one that does not exist', async () => {
    const h = harness();

    const unowned = await call(h.handle, {
      path: '/api/battles/b-1/join',
      body: { sessionId: 'session-theirs' },
    });
    const missing = await call(h.handle, {
      path: '/api/battles/b-1/join',
      body: { sessionId: 'session-nowhere' },
    });

    expect(unowned.status).toBe(404);
    expect(unowned.body).toEqual(missing.body);
  });
});

describe('a failure inside a command', () => {
  it('is mapped to a status rather than escaping the dispatcher', async () => {
    // A promise RETURNED from inside the `try` — rather than awaited — is
    // awaited by the caller, outside the block, so its rejection never reaches
    // the shared failure mapping. It escapes as an unhandled rejection, which is
    // a 500 with no body and, worse, a refused credential that never became a
    // 401. This went red once already, on the bounty side, and the fix is one
    // `await`; this is the test that says so out loud.
    const thrown = new TestAuthFailure('expired');
    const h = harness({
      api: {
        act: async () => {
          throw thrown;
        },
      } as unknown as ApplicationApi,
    });

    const created = await call(h.handle, {
      path: '/api/battles',
      body: { sessionId: 'session-mine' },
    });
    const joined = await call(h.handle, {
      path: '/api/battles/b-1/join',
      body: { sessionId: 'session-mine' },
    });
    const read = await call(h.handle, { method: 'GET', path: '/api/battles/b-1' });

    for (const response of [created, joined, read]) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ reason: 'expired' });
    }
  });

  it('answers 404 for a path that is not on this surface', async () => {
    const h = harness();

    const response = await call(h.handle, { path: '/api/battles/b-1/finish' });

    expect(response.status).toBe(404);
    expect(h.calls).toEqual([]);
  });
});
