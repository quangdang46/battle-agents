import { sharedSessionGateway } from '@/session-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/sessions/[id]/heartbeat` — the Next.js adapter.
 *
 * Thin for the same reason the event route is: it turns a `Request` into the
 * shape the pure handler takes and the handler's `HttpResponse` back into a
 * `Response`. Authentication, the ownership check and the translation into
 * `session.heartbeat` all live behind `sharedSessionGateway()`, where they are
 * reachable from a test without a server.
 *
 * The path is rebuilt from the route segment rather than read off `request.url`,
 * because the segment is the one Next.js has already matched: reading the URL
 * back would re-parse a path the router has an answer for. `encodeURIComponent`
 * and the handler's `decodeURIComponent` are a round trip, so the handler sees
 * exactly the id Next.js put in `params` — whether Next hands that over decoded
 * or raw, the two ends cancel out. The segment is never interpolated into a
 * bare string, so a `..` or a slash in it cannot walk the URL somewhere else.
 */
export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/sessions/${encodeURIComponent(id)}/heartbeat`;

  const httpRequest: HttpRequest = {
    method: request.method,
    url: url.toString(),
    headers: {
      get: (name: string) => request.headers.get(name),
    },
  };

  const response: HttpResponse = await sharedSessionGateway().handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
