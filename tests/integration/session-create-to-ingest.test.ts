import type { ApplicationApi } from '@battle-agents/api';
import { issueCredential } from '@battle-agents/agent';
import { authenticate, DrizzleCredentialStore, installations, users } from '@battle-agents/db';
import { PROTOCOL_VERSION } from '@battle-agents/protocol';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEventGateway, closeSharedEventGateway } from '../../apps/web/src/event-gateway.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';

/**
 * The loop the Codex adapter work found broken, proved end to end.
 *
 * POST /api/events resolves the session and answers 404 when the row is absent.
 * Until `session.create` existed, nothing could create one over a protocol, so
 * every adapter's every batch was refused — a client that had done nothing wrong
 * and could find out why only by reading the server. The unit tests for
 * `session.create` prove the action runs; the ingest tests prove a batch is
 * accepted for a session that exists. Nothing proved the two fit together, and
 * that is the only question a client actually has.
 *
 * This is the M1 precondition in one test: an agent creates a session over the
 * Application API and then posts a batch that the server keeps. The two
 * features are wired through the real composition root and the real Drizzle
 * repositories, not through doubles — a hand-built session row would prove the
 * ingest route accepts rows, which was never in doubt.
 */

const NOW = new Date().toISOString();

let api: ApplicationApi;
let handle: (request: {
  method: string;
  url: string;
  headers: { get(name: string): string | null };
  body?: unknown;
}) => Promise<{ status: number; body: unknown }>;

beforeAll(async () => {
  const { runtime } = await sharedRuntime();
  const { createApplicationApi } = await import('@battle-agents/api');
  api = createApplicationApi(runtime);
  const { database } = await sharedRuntime();
  const gateway = await createEventGateway({
    database,
    // Wired rather than left to the gateway's own fallback, which REFUSES by
    // design — an unauthenticated /api/accept is an open door. Supplying the
    // same authenticator the route adapter supplies is what makes this test
    // about the session rather than about the absence of a credential.
    authenticate: async (request) => {
      const caller = await authenticate(
        { store: new DrizzleCredentialStore(database), now: new Date().toISOString() },
        request as { headers: { get(name: string): string | null }; url: string },
      );
      return { installationId: caller.installationId };
    },
  });
  handle = gateway.handle as typeof handle;
});

afterAll(async () => {
  await closeSharedEventGateway();
  await closeSharedRuntime();
});

/**
 * A credential the gateway will accept, issued the way the store expects.
 *
 * Minted through `issueCredential` and inserted by HASH, because that is the
 * shape `authenticate` looks up and because a test that wrote a plaintext token
 * into the table would be testing a path the system deliberately does not have.
 */
let token = '';
let ownerId = '';
let installationKey = '';

beforeAll(async () => {
  const { database } = await sharedRuntime();
  const store = new DrizzleCredentialStore(database);
  const githubId = `${randomUUID()}-ingest-owner`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  ownerId = owner?.id ?? '';
  // ONE key, generated once. The first version generated it twice — once in the
  // insert and once for the handshake — so `session.create` found no existing
  // installation under the key the credential was issued against, created a
  // second one, and every batch was refused with a 404. The ownership check was
  // working perfectly; the fixture was describing two different machines.
  installationKey = `${randomUUID()}-ingest`;
  const [installation] = await database
    .insert(installations)
    .values({ userId: ownerId, installationKey })
    .returning({ id: installations.id });

  const issued = issueCredential(NOW);
  token = issued.token;
  await store.insert({
    id: randomUUID(),
    tokenHash: issued.hash,
    installationId: installation?.id ?? '',
    agentId: null,
    scopes: ['events:write'],
    expiresAt: issued.expiresAt,
  });
});

async function postBatch(sessionId: string): Promise<{ status: number; body: unknown }> {
  return handle({
    method: 'POST',
    url: 'https://agentbattle.test/api/events',
    headers: { get: (name) => (name === 'authorization' ? `Bearer ${token}` : null) },
    body: {
      protocolVersion: PROTOCOL_VERSION,
      events: [
        {
          type: 'session.heartbeat',
          sessionId,
          at: NOW,
        },
      ],
    },
  });
}

describe('a session created over the API is one the ingest route accepts', () => {
  it('creates the session, then keeps a batch addressed to it', async () => {
    // A character has to exist before a handshake can name one, and that is the
    // agent register command rather than something this test should invent.
    // Dispatched, not acted on: `agent.register` is a COMMAND, and act()
    // refusing it by name — "unknown action agent.register" — is the capability
    // registry doing its job rather than a thing to work around. The distinction
    // is the whole of CONTRACT 4 and it is worth the test respecting it.
    const { runtime } = await sharedRuntime();
    const [registeredEvent] = await runtime.dispatch({
      type: 'agent.register',
      issuedAt: NOW,
      issuerId: ownerId,
      payload: { ownerId, name: 'ingest-probe', harness: 'codex' },
    });
    const registered = registeredEvent?.payload as { readonly agentId: string };

    const created = (await api.act('session.create', {
      installationKey,
      ownerId,
      agentName: 'ingest-probe',
      harness: 'codex',
    })) as { readonly sessionId: string; readonly resumed: boolean };

    expect(created.sessionId).toEqual(expect.any(String));
    expect(created.resumed).toBe(false);
    expect(registered.agentId).toEqual(expect.any(String));

    // The whole point: not 404. A 404 here is the bug this test exists for, and
    // it is the answer an adapter got for every batch before session.create.
    const response = await postBatch(created.sessionId);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ accepted: 1 });
  });

  it('still refuses a session that was never created', async () => {
    // The other half. Accepting everything would make the test above pass for
    // the wrong reason, and resolveSession's 404 is a real boundary rather than
    // an incidental status.
    const response = await postBatch(randomUUID());
    expect(response.status).toBe(404);
  });
});
