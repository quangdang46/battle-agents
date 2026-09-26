import { sharedBountyGateway } from '@/bounty-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/bounties/[id]/fund` — the Next.js adapter.
 *
 * The path is rebuilt from the route segment rather than read off `request.url`,
 * for the reason the claim adapter gives: the segment is the one Next.js has
 * already matched, and re-parsing it would decide a question the router has an
 * answer to. The `encodeURIComponent`/`decodeURIComponent` pair is a round trip,
 * so the handler sees exactly the id Next.js put in `params`.
 *
 * Everything else is in `bounty-routes.ts`. The sponsor is not named here, and
 * that is the reason this route exists at all: whoever is calling is the sponsor,
 * and neither the segment nor the body gets a say.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/bounties/${encodeURIComponent(id)}/fund`;

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
