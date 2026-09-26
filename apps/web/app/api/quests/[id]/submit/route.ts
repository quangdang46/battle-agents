import { sharedQuestGateway } from '@/quest-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `POST /api/quests/[id]/submit` — the Next.js adapter.
 *
 * The path is rebuilt from the route segment rather than read off `request.url`,
 * for the reason the bounty claim adapter gives: the segment is the one Next.js
 * has already matched, and re-parsing it would decide a question the router has
 * an answer to. The `encodeURIComponent`/`decodeURIComponent` pair is a round
 * trip, so the handler sees exactly the id Next.js put in `params` — whether
 * Next hands that over decoded or raw, the two ends cancel out. The segment is
 * never interpolated into a bare string, so a `..` or a slash in it cannot walk
 * the URL somewhere else.
 *
 * The agent is not named here, and that is the reason this route exists: whoever
 * is calling is the agent, and the body gets no say.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await context.params;
  const url = new URL(request.url);
  url.pathname = `/api/quests/${encodeURIComponent(id)}/submit`;

  const body: unknown = await request.json().catch(() => undefined);
  const httpRequest: HttpRequest = {
    method: request.method,
    url: url.toString(),
    headers: { get: (name: string) => request.headers.get(name) },
    ...(body === undefined ? {} : { body }),
  };

  const response: HttpResponse = await (await sharedQuestGateway()).handle(httpRequest);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
};
