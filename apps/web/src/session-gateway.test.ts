import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import type { Database } from '@battle-agents/db';
import { describe, expect, it } from 'vitest';

import { createSessionGateway } from './session-gateway.js';
import type { HttpRequest } from './routes.js';

const ORIGIN = 'https://agentbattle.test';

/**
 * A database that answers nothing.
 *
 * The repositories only hold the handle, and `authenticate` refuses a request
 * with no credential before it reaches the store — so the one path this file
 * exercises never queries. If a change let a refused request past the
 * authenticator, the very next call would blow up on this stub and answer 500
 * where the test expects 401, which is the failure this shape is chosen for.
 */
const UNREADABLE_DATABASE = {} as Database;

function stubApi(): ApplicationApi {
  return createApplicationApi(
    createRuntime({
      extensions: [
        {
          id: 'agent',
          capabilities: [{ name: 'session.heartbeat', description: 'records that a run is alive' }],
          actionDefs: [
            defineAction({
              id: 'session.heartbeat',
              permissions: ['session.heartbeat'],
              run: async () => ({ sessionId: 'session-1', status: 'active' }),
            }),
          ],
        },
      ],
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
    }),
  );
}

function heartbeatRequest(authorization: string | null): HttpRequest {
  return {
    method: 'POST',
    url: `${ORIGIN}/api/sessions/session-1/heartbeat`,
    headers: { get: (name) => (name === 'authorization' ? authorization : null) },
  };
}

describe('the session gateway wiring', () => {
  it('answers a request with no credential as 401 and names the reason', async () => {
    // The reason is the assertion, not the status. `AuthenticationError` carries
    // its reason NESTED under `failure` while the API's guard reads it at the
    // top level, so a gateway that forgot the translation returned 500 — which
    // tells the caller to retry a credential that will never be accepted. The
    // event gateway records having shipped that bug; this is the same edge.
    const { handle } = await createSessionGateway({
      database: UNREADABLE_DATABASE,
      api: stubApi(),
    });

    const response = await handle(heartbeatRequest(null));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ reason: 'missing' });
  });

  it('refuses a token that was put in the URL, on this surface as on the others', async () => {
    const { handle } = await createSessionGateway({
      database: UNREADABLE_DATABASE,
      api: stubApi(),
    });

    const response = await handle({
      ...heartbeatRequest(null),
      url: `${ORIGIN}/api/sessions/session-1/heartbeat?token=leaked`,
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ reason: 'token-in-url' });
  });

  it('refuses a malformed Authorization header', async () => {
    const { handle } = await createSessionGateway({
      database: UNREADABLE_DATABASE,
      api: stubApi(),
    });

    const response = await handle(heartbeatRequest('Basic dXNlcjpwYXNz'));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ reason: 'malformed' });
  });
});
