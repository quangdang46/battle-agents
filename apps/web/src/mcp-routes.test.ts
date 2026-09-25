import { AuthenticationError } from '@battle-agents/db';
import type { McpServer } from '@battle-agents/mcp-server';

import { describe, expect, it } from 'vitest';

import { createMcpRoutes } from './mcp-routes.js';
import type { HttpRequest } from './routes.js';

/**
 * The authentication the MCP route performs before it touches the protocol.
 *
 * The split this pins is 401 against 500. A caller who presented an expired,
 * revoked or under-scoped token did something wrong and is told which of those
 * it was. An authenticator that threw for a reason of its own is the server's
 * fault, and answering 401 would tell the caller to fix a credential that was
 * always fine — the failure mode the event gateway's comment already records.
 */

const SESSION_ID = 'session-under-test';

function request(body: unknown, url = 'https://host/api/mcp'): HttpRequest {
  const headers = new Map([
    ['accept', 'application/json, text/event-stream'],
    ['content-type', 'application/json'],
    ['authorization', 'Bearer agent_battle_a_valid_token'],
  ]);
  return { method: 'POST', url, headers: { get: (name) => headers.get(name) ?? null }, body };
}

/** A server that records what it was asked, so a test can prove it was reached. */
function recordingServer(calls: string[]): McpServer {
  return {
    listTools: () => [],
    async callTool(name) {
      calls.push(name);
      return { ok: true, value: { reached: true } };
    },
    closeObservation: () => false,
    openSubscriptions: () => 0,
  };
}

function routesWith(
  authenticate: (req: HttpRequest) => Promise<unknown>,
  calls: string[] = [],
) {
  return createMcpRoutes({
    authenticate,
    createServer: () => recordingServer(calls),
    newSessionId: () => SESSION_ID,
  });
}

function toolsCall(id: number, name: string) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } };
}

describe('a refused credential', () => {
  it('answers 401 and names the reason, for each refusal the credential layer can make', async () => {
    // Each reason is asserted rather than lumped into one case, because the
    // reason is the only thing that tells a caller which of the two things to
    // fix. A single "401 for all of them" test would pass against a route that
    // had lost the reason entirely.
    for (const reason of ['missing', 'token-in-url', 'expired', 'revoked', 'unknown'] as const) {
      const routes = routesWith(async () => {
        throw new AuthenticationError({ reason });
      });

      const response = await routes(request(toolsCall(1, 'act')));

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'authentication failed', reason });
    }
  });

  it('names the missing scope, so the caller knows to issue a wider credential', async () => {
    // `explain` puts the required scope in the message and nowhere else, so a
    // 401 that carried only the reason tag would say "unauthorized" and send
    // the caller to renew a credential that would be refused identically.
    const routes = routesWith(async () => {
      throw new AuthenticationError({ reason: 'scope-missing', required: 'mcp' });
    });

    const response = await routes(request(toolsCall(1, 'act')));

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ reason: 'scope-missing' });
    expect((response.body as { message: string }).message).toContain('"mcp"');
  });

  it('never reaches the server', async () => {
    const calls: string[] = [];
    const routes = routesWith(async () => {
      throw new AuthenticationError({ reason: 'expired' });
    }, calls);

    await routes(request(toolsCall(1, 'act')));

    expect(calls).toEqual([]);
  });
});

describe('an authenticator that is itself broken', () => {
  it('answers 500, because the credential was never the problem', async () => {
    const routes = routesWith(async () => {
      throw new Error('connection pool exhausted');
    });

    const response = await routes(request(toolsCall(1, 'act')));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'the authenticator failed', detail: 'connection pool exhausted' });
  });
});

describe('an accepted credential', () => {
  it('reaches the server and carries the session id back on initialize', async () => {
    // The session id is minted by initialize and by nothing else: a tools/call
    // that invented one would hand a client a handle for a session the server
    // never opened.
    const calls: string[] = [];
    const routes = routesWith(async () => ({ installationId: 'inst-1' }), calls);

    const response = await routes(
      request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers?.['mcp-session-id']).toBe(SESSION_ID);
  });

  it('mints no session id for a call that did not initialize', async () => {
    const calls: string[] = [];
    const routes = routesWith(async () => ({ installationId: 'inst-1' }), calls);

    const response = await routes(request(toolsCall(1, 'act')));

    expect(calls).toEqual(['act']);
    expect(response.status).toBe(200);
    expect(response.headers).toBeUndefined();
  });

  it('builds a fresh server per request, so a subscription cannot outlive its call', async () => {
    // One shared server would let an `observe` started by one request keep
    // receiving events after that request returned, which is a cross-agent leak
    // wearing a caching optimisation.
    const built: number[] = [];
    const routes = createMcpRoutes({
      authenticate: async () => ({ installationId: 'inst-1' }),
      createServer: () => {
        built.push(built.length);
        return recordingServer([]);
      },
      newSessionId: () => SESSION_ID,
    });

    await routes(request(toolsCall(1, 'act')));
    await routes(request(toolsCall(2, 'act')));

    expect(built).toHaveLength(2);
  });
});
