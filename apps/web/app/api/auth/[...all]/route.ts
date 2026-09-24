import { toNextJsHandler } from 'better-auth/next-js';

import { sharedAuth } from '@/auth/server.js';

/**
 * Better Auth's mount point.
 *
 * Every path under /api/auth is handled by the library: sign-in, the GitHub
 * callback, sign-out. The web app adds nothing beside it and reads nothing
 * from it, because who is logged in is the library's question and nothing else
 * in this repository has an opinion about it.
 */
export const { GET, POST } = toNextJsHandler(sharedAuth().handler);
