import { toNextJsHandler } from 'better-auth/next-js';

import { sharedAuth } from '@/auth/server.js';

/**
 * Better Auth's mount point.
 *
 * Every path under /api/auth is handled by the library: sign-in, the GitHub
 * callback, sign-out. The web app adds nothing beside it and reads nothing
 * from it, because who is logged in is the library's question and nothing else
 * in this repository has an opinion about it.
 *
 * The handler is built on the first request rather than at module load. The
 * previous `export const { GET, POST } = toNextJsHandler(sharedAuth().handler)`
 * read the environment while the module was being imported, which meant a build
 * with no OAuth keys in it failed to compile — the build imports the route to
 * collect page data, and collecting page data does not need an OAuth app. The
 * error named four missing variables and pointed at nothing, because the throw
 * happened during import rather than during a request.
 */
function handler(method: 'GET' | 'POST'): (request: Request) => Promise<Response> {
  return toNextJsHandler(sharedAuth().handler)[method];
}

export async function GET(request: Request): Promise<Response> {
  return await handler('GET')(request);
}

export async function POST(request: Request): Promise<Response> {
  return await handler('POST')(request);
}
