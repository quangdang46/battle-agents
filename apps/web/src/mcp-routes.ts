import { isAuthenticationFailure } from '@battle-agents/api';
import { handleMcpRequest } from '@battle-agents/mcp-server';
import type { McpServer } from '@battle-agents/mcp-server';

import { toAuthenticationFailure } from './event-gateway.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * `POST /api/mcp` — the MCP Streamable HTTP route, as a pure function.
 *
 * Two jobs and no others: prove the caller is an agent, and hand the request to
 * the protocol translator. Everything the MCP specification decides lives in
 * `streamable-http.ts`; everything the platform decides lives in the injected
 * authenticator. A branch here that decided either would be a third answer to a
 * question the CLI and the HTTP surface already answer, which is the drift the
 * whole three-consumer design exists to prevent.
 *
 * The order is authentication first, unconditionally. The event-ingest route
 * gates on size before authenticating because a telemetry flood is the threat it
 * exists to absorb; an MCP call is a control-plane message from a client that
 * already holds a credential, so there is nothing to shed before knowing who is
 * asking.
 */

export interface McpRouteDependencies {
  /**
   * Resolves the Bearer token to an installation. Throws an authentication
   * failure — an `Error` carrying a `reason` — when the token is absent,
   * unknown, revoked, expired, under-scoped, or presented in a URL.
   *
   * The resolved caller is not threaded onward, and that is the frozen
   * contract's decision rather than an omission here: `RuntimeContext`
   * deliberately carries no principal, so there is nowhere to put one. The
   * authenticator is therefore responsible for refusing anything the caller
   * should not reach, which today means holding the scope the route requires.
   */
  readonly authenticate: (request: HttpRequest) => Promise<unknown>;
  /** One server per connection; it owns the observe subscriptions it hands out. */
  readonly createServer: () => McpServer;
  /**
   * Mints the `Mcp-Session-Id`. Required so the host owns the RNG and a test
   * can assert the header without a random value in the expectation.
   */
  readonly newSessionId: () => string;
}

const UNAUTHORIZED = 401;

/**
 * The `reason` is the whole point of a 401 here.
 *
 * A client that presented an expired token and got "unauthorized" retries the
 * same token. A client told the scope is missing, or that the token expired,
 * knows which of the two things to fix. The credential layer already knows which;
 * flattening it at the edge is what makes the difference unfixable.
 */
function refuse(error: unknown): HttpResponse {
  if (isAuthenticationFailure(error)) {
    return {
      status: UNAUTHORIZED,
      // Both halves, because neither substitutes for the other. `reason` is the
      // tag a client branches on; `message` is the only place the missing scope
      // is named, and the bead requires it be named rather than collapsed into
      // "unauthorized". Dropping the message to keep the body tidy is what
      // turns a one-line fix into a support conversation.
      body: { error: 'authentication failed', reason: error.reason, message: error.message },
    };
  }
  // Not an authentication failure: a bug in the authenticator, not a caller who
  // did something wrong. Saying 401 would tell them to fix a good credential.
  return { status: 500, body: { error: 'the authenticator failed', detail: describe(error) } };
}

function describe(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Runs the authenticator and leaves every failure carrying a top-level
 * `reason`.
 *
 * The db's `AuthenticationError` nests its reason under `failure`, while the
 * api's `isAuthenticationFailure` reads it at the top level. Both shapes are
 * known to `toAuthenticationFailure`, which is the one place that knows both —
 * so it is reused here rather than re-decided, because a route that re-decided
 * it would answer 500 to a caller who simply presented a revoked token.
 */
async function authenticateOrThrow(
  dependencies: McpRouteDependencies,
  request: HttpRequest,
): Promise<void> {
  try {
    await dependencies.authenticate(request);
  } catch (error) {
    toAuthenticationFailure(error);
  }
}

export function createMcpRoutes(
  dependencies: McpRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    try {
      await authenticateOrThrow(dependencies, request);
    } catch (error) {
      return refuse(error);
    }

    // The server is per-request, because it owns the subscriptions a `tools/call`
    // opens. Sharing one across requests would let one agent's `observe` outlive
    // the call that started it and keep receiving another agent's events.
    const server = dependencies.createServer();

    const response = await handleMcpRequest(
      server,
      {
        method: request.method,
        headers: request.headers,
        body: request.body,
      },
      { newSessionId: dependencies.newSessionId },
    );

    return {
      status: response.status,
      body: response.body,
      ...(response.headers === undefined ? {} : { headers: response.headers }),
    };
  };
}
