import { sharedEventGateway } from '@/event-gateway.js';
import type { HttpRequest } from '@/routes.js';

/**
 * `GET /api/events/stream` — the Next.js adapter for the SSE fan-out.
 *
 * As thin as the POST adapter: it hands the pure handler a `Request`-shaped
 * object and wraps the `ReadableStream` the handler returns in a `Response` with
 * the stream headers the handler decided on. The first frame is `full_state` and
 * every later frame is a delta — a property of the hub, established and tested
 * there, and deliberately not re-decided in a transport file.
 *
 * The `runtime`/`dynamic` hints keep Next.js from statically optimising a
 * long-lived stream at build time and from caching it at the edge: this response
 * is per-connection and never cacheable.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (request: Request): Promise<Response> => {
  const httpRequest: HttpRequest = {
    method: request.method,
    url: request.url,
    headers: {
      get: (name: string) => request.headers.get(name),
    },
  };

  const response = await (await sharedEventGateway()).handle(httpRequest);
  // The first argument to `new Response` is its body; `ResponseInit` (the second)
  // has no `body` field. Derived from the constructor rather than naming
  // `BodyInit`, which is not a global in this project (no DOM lib, and @types/node
  // does not export it globally).
  return new Response(response.body as ConstructorParameters<typeof Response>[0], {
    status: response.status,
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
