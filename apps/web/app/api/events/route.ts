import { sharedEventGateway } from '@/event-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/events` — the Next.js adapter.
 *
 * Thin on purpose: it turns a `Request` into the shape the pure handler takes
 * and the handler's `HttpResponse` back into a `Response`. Every decision —
 * authentication, the size gate, the protocol check, session ownership — lives
 * in `event-routes.ts`, where it can be tested without a server. All this file
 * does is the transport, including spreading the `Retry-After` header a 413
 * carries; a backpressure refusal that lost its header here would be a refusal
 * the client could only guess at.
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

  const response: HttpResponse = await (await sharedEventGateway()).handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
