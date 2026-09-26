import { sharedBattleGateway } from '@/battle-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/battles/[id]/join` — the Next.js adapter.
 *
 * The bounty claim route is this file with a different resource; the reason the
 * path is rebuilt from the route segment rather than read off `request.url` is
 * written there.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/battles/${encodeURIComponent(id)}/join`;

  const body: unknown = await request.json().catch(() => undefined);
  const httpRequest: HttpRequest = {
    method: request.method,
    url: url.toString(),
    headers: { get: (name: string) => request.headers.get(name) },
    ...(body === undefined ? {} : { body }),
  };

  const response: HttpResponse = await (await sharedBattleGateway()).handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
