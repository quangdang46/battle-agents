import { randomUUID } from 'node:crypto';

import { authenticate, closeDatabasePool, createDatabase, createDatabasePool, DrizzleCredentialStore } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import { createMcpServer } from '@battle-agents/mcp-server';
import type { McpServer } from '@battle-agents/mcp-server';

import { createMcpRoutes } from './mcp-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { sharedApi } from './routes.js';

/**
 * The MCP surface's wiring, mirroring the event gateway next door.
 *
 * One decision lives here and nowhere else: the Application API is the one
 * `sharedApi()` hands every surface, so MCP cannot drift from the CLI and the
 * HTTP routes. It is literally the same object, which is what makes the parity
 * assertion a tautology rather than a hope.
 *
 * What is deliberately NOT here is a notification sink. `observe` is real — it
 * subscribes to the runtime's bus, scoped to the caller's domain — and the SSE
 * hub is a second, independent subscriber to that same bus. Pushing MCP's
 * notifications into the hub would look like "MCP events reach the stream" and
 * actually deliver every event to every spectator twice, because the hub is
 * already listening. The public stream and an MCP client are two consumers of
 * one bus, not a pipeline. `mcp-parity.test.ts` counts the frames, because a
 * test that stops at "an event arrived" cannot see a duplicate.
 *
 * The consequence is stated rather than hidden: an MCP client's `observe` result
 * is not yet carried back over the Streamable HTTP response. Delivering it needs
 * a per-connection server-to-client channel, which is the piece the bead records
 * as still open.
 */

export interface McpGateway {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly close: () => Promise<void>;
}

/**
 * The scope a credential must hold to reach the MCP surface.
 *
 * This is the only thing the token decides today, and it is a real decision
 * rather than a placeholder: the frozen Extension API has no principal in
 * `RuntimeContext`, so the surface cannot narrow *which actions* a caller may
 * run. Refusing a token that lacks this scope is the one restriction the
 * contract can honestly enforce, and it is enforced here rather than inside the
 * route so the route stays a translator.
 */
const MCP_REQUIRED_SCOPE = 'mcp';

export function createMcpGateway(database: Database): McpGateway {
  const handle = createMcpRoutes({
    // The same authenticator the telemetry plane uses, supplied rather than
    // imported for the reason event-gateway.ts gives: it is the one collaborator
    // here that reaches toward the agent feature's credential shape, and
    // importing it directly would make the removal test have to edit this file.
    // It is the same function, so a token accepted by the event route is
    // accepted here and a token refused there is refused here.
    authenticate: async (request) =>
      authenticate(
        {
          store: new DrizzleCredentialStore(database),
          now: new Date().toISOString(),
          requiredScopes: [MCP_REQUIRED_SCOPE],
        },
        request as never,
      ),
    createServer: (): McpServer => createMcpServer({ api: sharedApi() }),
    newSessionId: randomUUID,
  });
  return { handle, close: () => Promise.resolve() };
}

let cached: { gateway: McpGateway; close: () => Promise<void> } | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` and `sharedEventGateway` are: a
 * database pool is fine once and fatal per request. This is the third pool in
 * the app; consolidating the three is a separate change, and making MCP the
 * first to share one would mean editing two working gateways to land a bead
 * whose subject is the MCP transport.
 */
export function sharedMcpGateway(): McpGateway {
  if (cached !== undefined) {
    return cached.gateway;
  }
  const pool = createDatabasePool();
  const database = createDatabase(pool);
  const gateway = createMcpGateway(database);
  cached = { gateway, close: () => closeDatabasePool(pool) };
  return cached.gateway;
}

/** Releases the pool, for a graceful shutdown rather than per-request cleanup. */
export async function closeSharedMcpGateway(): Promise<void> {
  await cached?.close();
  cached = undefined;
}
