import { sharedBattleGateway } from '@/battle-gateway.js';
import type { HttpRequest, HttpResponse } from '@/routes.js';

/**
 * `GET /api/battles` and `POST /api/battles` — the Next.js adapter.
 *
 * The bounty adapter is this file with a different resource, including the
 * method-driven body read: a GET carries no body, and parsing one anyway is the
 * kind of thing that works until a client sends an empty one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function toHttpRequest(request: Request): Promise<HttpRequest> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.json().catch(() => undefined) : undefined;
  return {
    method: request.method,
    url: request.url,
    headers: { get: (name: string) => request.headers.get(name) },
    ...(body === undefined ? {} : { body }),
  };
}

function toResponse(response: HttpResponse): Response {
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    // exactOptionalPropertyTypes: a response with no headers omits the field
    // rather than carrying an explicit undefined, so the spread needs no guard.
    ...(response.headers === undefined ? {} : { headers: response.headers }),
  });
}

const handle = async (request: Request): Promise<Response> =>
  toResponse(await (await sharedBattleGateway()).handle(await toHttpRequest(request)));

export const GET = handle;
export const POST = handle;
