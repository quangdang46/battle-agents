import { sharedBountyGateway } from '@/bounty-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/bounties/[id]/submit` — the Next.js adapter.
 *
 * The `claim` route next door is this file with a different path and a
 * different method in the URL it rebuilds, and the reason both exist rather than
 * one `[[...rest]]` is written there.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/bounties/${encodeURIComponent(id)}/submit`;

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
