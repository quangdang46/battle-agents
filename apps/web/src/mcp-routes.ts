import { isAuthenticationFailure } from '@battle-agents/api';
import { handleMcpRequest } from '@battle-agents/mcp-server';

import { toAuthenticationFailure } from './event-gateway.js';
import type { McpSession, McpSessionStore } from './mcp-sessions.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The MCP Streamable HTTP routes, as pure functions.
 *
 * Three jobs and no others: prove the caller is an agent, find the session the
 * request belongs to, and translate. Everything the MCP specification decides
 * lives in `streamable-http.ts`; everything about credentials lives in the
 * injected authenticator. A branch here that decided either would be a third
 * answer to a question the CLI and the HTTP surface already answer, which is the
 * drift the three-consumer design exists to prevent.
 *
 * The order is authentication first, unconditionally. The event-ingest route
 * gates on size before authenticating because a telemetry flood is the threat
 * it exists to absorb; an MCP call is a control-plane message from a client
 * that already holds a credential, so there is nothing to shed before knowing
 * who is asking.
 *
 * A session is keyed by the `Mcp-Session-Id` the client was given, not by the
 * request. That is what makes `observe` mean anything: the subscription an MCP
 * call opens has to outlive the call that opened it, and the notification it
 * produces travels down the GET stream for the same id.
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
  /** Where sessions live. One store for the process, like the pool and the bus. */
  readonly sessions: McpSessionStore;
  /**
   * Mints the value handed back as `Mcp-Session-Id`, and the key the session is
   * stored under. Required so the host owns the RNG and a test can assert the
   * header without a random value in the expectation.
   */
  readonly newSessionId: () => string;
  /** How long a silent stream waits before emitting a keepalive, in ms. */
  readonly keepAliveMs?: number;
}

const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const NO_CONTENT = 204;
const STREAM_OPEN = 200;

const SESSION_HEADER = 'mcp-session-id';
const DEFAULT_KEEP_ALIVE_MS = 15_000;

/** The headers an SSE body needs, or a proxy will buffer it and defeat it. */
const STREAM_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const KEEPALIVE_FRAME = ': keepalive\n\n';

/**
 * The `reason` is the point of a 401, and so is the message.
 *
 * A client that presented an expired token and got "unauthorized" retries the
 * same token. A client told the scope is missing, or that the token expired,
 * knows which of the two things to fix. The credential layer already knows
 * which; flattening it at the edge is what makes the difference unfixable.
 */
function refuse(error: unknown): HttpResponse {
  if (isAuthenticationFailure(error)) {
    return {
      status: UNAUTHORIZED,
      body: {
        error: 'authentication failed',
        reason: error.reason,
        // Both halves, because neither substitutes for the other: `reason` is
        // the tag a client branches on, and `message` is the only place the
        // missing scope is named.
        message: error.message,
      },
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

/**
 * A JSON-RPC message as one SSE event.
 *
 * Both the `event:` and the `data:` line are written, for the same reason the
 * public stream writes both: a client that reads one and a browser EventSource
 * that dispatches on the other are both correct.
 */
function encodeNotification(method: string, params: unknown): string {
  const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
  return `event: message\ndata: ${payload}\n\n`;
}

/**
 * Drains the session's queue into a stream, ending when the session closes.
 *
 * The loop is the backpressure policy: it waits for something to be queued
 * rather than polling, and writes everything queued in one go, so a burst
 * arrives as a burst instead of one frame per timer tick. `wait` also returns on
 * its own timeout, which is what makes the keepalive possible.
 */
function openNotificationStream(session: McpSession, keepAliveMs: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (!session.closed) {
          const queued = session.drain();
          if (queued.length === 0) {
            await session.wait(keepAliveMs);
            controller.enqueue(encoder.encode(KEEPALIVE_FRAME));
            continue;
          }
          for (const notification of queued) {
            controller.enqueue(encoder.encode(encodeNotification(notification.method, notification.params)));
          }
        }
        controller.close();
      } catch (thrown) {
        // A stream that throws mid-write has already told the client it is over;
        // rethrowing here would surface as an unhandled rejection in the route
        // with nobody left to read it.
        controller.error(thrown);
      }
    },
  });
}

export function createMcpRoutes(
  dependencies: McpRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  const keepAliveMs = dependencies.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS;

  return async (request: HttpRequest) => {
    try {
      await authenticateOrThrow(dependencies, request);
    } catch (error) {
      return refuse(error);
    }

    const presented = request.headers.get(SESSION_HEADER);

    if (request.method === 'GET') {
      if (presented === null) {
        return { status: NOT_FOUND, body: { error: 'no session to stream' } };
      }
      const session = dependencies.sessions.find(presented);
      if (session === undefined) {
        return { status: NOT_FOUND, body: { error: 'unknown session' } };
      }
      return {
        status: STREAM_OPEN,
        headers: { ...STREAM_HEADERS, [SESSION_HEADER]: presented },
        body: openNotificationStream(session, keepAliveMs),
      };
    }

    if (request.method === 'DELETE') {
      if (presented === null) {
        return { status: NOT_FOUND, body: { error: 'no session to close' } };
      }
      dependencies.sessions.close(presented);
      return { status: NO_CONTENT, body: null };
    }

    if (request.method !== 'POST') {
      return { status: 405, body: { error: 'use POST, GET or DELETE' }, headers: { allow: 'POST, GET, DELETE' } };
    }

    // A client that presents an id gets its own session back. A client that
    // presents none gets a fresh one, and the id it is told is the same key the
    // session is stored under, so the initialize response and the later GET
    // agree without the route having to know which method is running.
    const sessionId = presented ?? dependencies.newSessionId();
    const session = dependencies.sessions.open(sessionId);

    const response = await handleMcpRequest(
      session.server,
      { method: request.method, headers: request.headers, body: request.body },
      { newSessionId: () => sessionId },
    );

    // A request that neither presented an id nor was told one is stateless, and
    // its session is unreachable. Closing it here is what keeps a client that
    // never calls initialize from accumulating sessions nobody can ever stream.
    if (presented === null && response.headers?.[SESSION_HEADER] === undefined) {
      dependencies.sessions.close(sessionId);
    }

    return {
      status: response.status,
      body: response.body,
      ...(response.headers === undefined ? {} : { headers: response.headers }),
    };
  };
}
