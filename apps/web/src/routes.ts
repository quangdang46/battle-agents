import {
  createApplicationApi,
  isAuthenticationFailure,
  UnknownActionError,
  UnknownDomainError,
} from '@battle-agents/api';
import { isRegisteredActionId } from '@battle-agents/protocol';
import type { ApplicationApi } from '@battle-agents/api';

import { closeSharedRuntime, sharedRuntime } from './shared-runtime.js';

/**
 * The HTTP surface.
 *
 * A route handler does three things: authenticate, translate, translate back.
 * It makes no decisions. The moment one of these branches on what a request
 * means, that decision lives in this file and nowhere the CLI and the MCP
 * adapter can reach — which is how two surfaces end up disagreeing about
 * whether somebody may do something.
 */

export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: { get(name: string): string | null };
  readonly body?: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  /**
   * Sent when a status is not enough on its own.
   *
   * Present because 413 without `Retry-After` is a refusal with no instruction
   * in it: a client that does not know how long to wait either retries in a
   * tight loop or gives up, and the loop is the one that hurts. `exactOptional`
   * is on, so a response with no headers omits the field rather than carrying
   * an explicit undefined, and the route adapter can spread it without a guard.
   */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RouteDependencies {
  readonly api: ApplicationApi;
  /**
   * Omitted only where a caller has already authenticated. Present in the app,
   * because an unauthenticated `/api/act` is an open door to every capability
   * the game grows.
   */
  readonly authenticate?: (request: HttpRequest) => Promise<unknown>;
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body };
}

/** The five primitives, reachable over HTTP. */
export function createRoutes(
  dependencies: RouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    try {
      if (dependencies.authenticate !== undefined) {
        await dependencies.authenticate(request);
      }
      return await route(dependencies.api, request);
    } catch (error) {
      return describeFailure(error);
    }
  };
}

async function route(api: ApplicationApi, request: HttpRequest): Promise<HttpResponse> {
  const url = new URL(request.url);

  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/discover':
      // Awaited, not wrapped. json() takes a value, and a Promise placed in a
      // body serialises to {} — a response that looks fine and carries nothing.
      return json(200, await api.discover(url.searchParams.get('domain') ?? undefined));
    case 'GET /api/search':
      return json(200, await api.search(searchFrom(url)));
    case 'GET /api/inspect':
      return json(
        200,
        await api.inspect({
          type: url.searchParams.get('type') ?? '',
          id: url.searchParams.get('id') ?? '',
        }),
      );
    case 'POST /api/act':
      return await act(api, request);
    default:
      return json(404, { error: 'not found', path: url.pathname });
  }
}

function searchFrom(url: URL): { type: string; name?: string } {
  const type = url.searchParams.get('type') ?? '';
  const name = url.searchParams.get('name');
  return name === null ? { type } : { type, name };
}

async function act(api: ApplicationApi, request: HttpRequest): Promise<HttpResponse> {
  const body = request.body;
  if (typeof body !== 'object' || body === null || !('action' in body)) {
    return json(400, { error: 'body must be { action, input }' });
  }
  const { action, input } = body as { action: unknown; input?: unknown };
  if (typeof action !== 'string') {
    return json(400, { error: '"action" must be a string' });
  }
  if (!isRegisteredActionId(action)) {
    // The API owns this error wording; throwing its class keeps one message
    // rather than a terser second copy that says less to whoever reads it.
    throw new UnknownActionError(action, (await api.discover()).domains ?? []);
  }
  return json(200, await api.act(action, input ?? {}));
}

/**
 * Turns a failure into a status a client can act on.
 *
 * The distinction that matters is 401 versus 404 versus 500. A client that
 * cannot tell "log in again" from "that does not exist" from "the platform is
 * broken" retries the wrong thing, and a dead credential reported as a 500
 * reads as our fault rather than theirs.
 */
function describeFailure(error: unknown): HttpResponse {
  if (isAuthenticationFailure(error)) {
    return json(401, { error: error.message, reason: error.reason });
  }
  if (error instanceof UnknownActionError || error instanceof UnknownDomainError) {
    return json(404, { error: error.message });
  }
  return json(500, { error: error instanceof Error ? error.message : String(error) });
}

/**
 * The Application API, over the process-wide runtime.
 *
 * The runtime, its bus and its pool all come from `await sharedRuntime()` so that an
 * action taken through this API publishes to the same bus the SSE stream is
 * subscribed to. Building a second runtime here is what made game events
 * invisible to spectators: this used to create its own
 * `createInMemoryEventBus()`, which nothing else could see.
 *
 * The API itself is cached on top of the shared runtime rather than rebuilt per
 * request, because it is a thin object over a runtime that is already shared and
 * rebuilding it would allocate five closures per request for no gain.
 */
let cached: ApplicationApi | undefined;

export async function sharedApi(): Promise<ApplicationApi> {
  if (cached === undefined) {
    const { runtime, bus } = await sharedRuntime();
    cached = createApplicationApi(runtime, bus);
  }
  return cached;
}

/** Releases the runtime's pool. For a graceful shutdown, not per request. */
export async function closeSharedApi(): Promise<void> {
  cached = undefined;
  await closeSharedRuntime();
}
