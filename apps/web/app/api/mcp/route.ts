import { sharedMcpGateway } from '@/mcp-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/mcp` — the Next.js adapter.
 *
 * Thin for the same reason the event route is: it turns a `Request` into the
 * shape the pure handler takes, and the handler's `HttpResponse` back into a
 * `Response`. Authentication, the JSON-RPC envelope, the `Accept` gate and the
 * session handshake all live behind `sharedMcpGateway()`, where they are
 * reachable from a test without a server.
 *
 * The gateway is reached through a function call rather than a module-scope
 * binding on purpose: a module-scope call would build a database pool while
 * Next.js is still building the app, before anything has asked for one.
 */
export const POST = async (request: Request): Promise<Response> => {
  const body: unknown = await request.json().catch(() => undefined);
  const httpRequest: HttpRequest = {
    method: request.method,
    url: request.url,
    headers: {
      get: (name: string) => request.headers.get(name),
    },
    body,
  };

  const response: HttpResponse = await sharedMcpGateway().handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
