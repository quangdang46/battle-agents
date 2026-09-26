import { sharedBattleGateway } from '@/battle-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `GET /api/battles/[id]` — the Next.js adapter, for `battle.read`.
 *
 * It authenticates like every other route on this surface even though the
 * feature would serve the rubric to anyone, and `battle-routes.ts` says why in
 * full: `BattleView` carries session ids, and
 * docs/design/public-replay.md rules those never public. The narrowing is
 * deliberate and the comment above the dispatcher is where to argue with it.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/battles/${encodeURIComponent(id)}`;

  const httpRequest: HttpRequest = {
    method: request.method,
    url: url.toString(),
    headers: { get: (name: string) => request.headers.get(name) },
  };

  const response: HttpResponse = await (await sharedBattleGateway()).handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
