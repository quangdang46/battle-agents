import { randomUUID } from 'node:crypto';

import { authenticate, DrizzleCredentialStore } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';

import { createMcpRoutes } from './mcp-routes.js';
import { createMcpSessionStore, serverFactoryFor } from './mcp-sessions.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { sharedApi } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

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
  const sessions = createMcpSessionStore({ createServer: serverFactoryFor(sharedApi()) });
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
    sessions,
    newSessionId: randomUUID,
  });
  return { handle, close: () => Promise.resolve() };
}

let cached: { gateway: McpGateway; close: () => Promise<void> } | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` and `sharedEventGateway` are: the
 * database pool is fine once and fatal per request. The credential store shares
 * the shared runtime's pool rather than opening a third one.
 */
export function sharedMcpGateway(): McpGateway {
  if (cached !== undefined) {
    return cached.gateway;
  }
  const { database } = sharedRuntime();
  const gateway = createMcpGateway(database);
  cached = { gateway, close: () => Promise.resolve() };
  return cached.gateway;
}

/** Drops the gateway's cache. The pool belongs to `sharedRuntime`. */
export async function closeSharedMcpGateway(): Promise<void> {
  cached?.close();
  cached = undefined;
}
