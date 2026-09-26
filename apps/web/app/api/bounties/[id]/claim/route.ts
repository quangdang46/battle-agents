import { sharedBountyGateway } from '@/bounty-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/bounties/[id]/claim` — the Next.js adapter.
 *
 * The path is rebuilt from the route segment rather than read off `request.url`,
 * because the segment is the one Next.js has already matched: reading the URL
 * back would re-parse a path the router has an answer for.
 * `encodeURIComponent` here and `decodeURIComponent` in the handler are a round
 * trip, so the handler sees exactly the id Next.js put in `params` — whether
 * Next hands that over decoded or raw, the two ends cancel out. The segment is
 * never interpolated into a bare string, so a `..` or a slash in it cannot walk
 * the URL somewhere else.
 *
 * Everything else is in `bounty-routes.ts`, where it can be tested without a
 * server.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/bounties/${encodeURIComponent(id)}/claim`;

  const body: unknown = await request.json().catch(() => undefined);
  const httpRequest: HttpRequest = {
    method: request.method,
    url: url.toString(),
    headers: { get: (name: string) => request.headers.get(name) },
    ...(body === undefined ? {} : { body }),
  };

  const response: HttpResponse = await (await sharedBountyGateway()).handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
