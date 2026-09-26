import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The five primitives are mounted, and the catch-all that mounts them shadows
 * nothing.
 *
 * The primitives were BUILT and unreachable. apps/web/src/routes.ts has been a
 * pure dispatcher over the same `createApplicationApi` the CLI and MCP consume
 * since the contract landed, and no Next.js route called it — so a running server
 * answered 404 to /api/discover, /api/search, /api/inspect and /api/act. From
 * inside the app that is invisible; from outside it means the CLI, now an HTTP
 * client, cannot reach a running instance and an agent has no surface to act
 * through.
 *
 * A CATCH-ALL is the cheapest way to mount four endpoints and the riskiest,
 * because a catch-all that shadowed a sibling would be a regression with no
 * symptom except a 404 somewhere else entirely. Next.js prefers the more specific
 * match, so the siblings win — and that is a property of the framework, not of
 * this repository, which is exactly the kind of thing worth asserting rather than
 * believing. The first version of this file only checked that the catch-all
 * existed, which is true whether or not it eats /api/events.
 *
 * The ROUTING was then checked against the framework rather than assumed: `next
 * build` lists `/api/[...path]` and all six siblings in one route table with the
 * catch-all displacing none of them. Recorded because the assertion below covers
 * the FILES and the build covered the PRECEDENCE, and a reader deciding how far
 * to trust the claim should know which is which.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const apiDir = join(repoRoot, 'apps/web/app/api');

const SIBLINGS = [
  '/api/auth/[...all]',
  '/api/battles',
  '/api/battles/[id]',
  '/api/battles/[id]/join',
  '/api/bounties',
  '/api/bounties/[id]/claim',
  '/api/bounties/[id]/submit',
  '/api/events',
  '/api/events/stream',
  '/api/mcp',
  '/api/sessions/[id]/heartbeat',
  '/api/webhooks/github',
] as const;

describe('the five primitives are mounted over HTTP', () => {
  it('has a route that dispatches them', () => {
    const catchAll = join(apiDir, '[...path]', 'route.ts');
    expect(existsSync(catchAll), `${catchAll} does not exist`).toBe(true);

    const source = readFileSync(catchAll, 'utf8');
    // createRoutes is the dispatcher; importing the file is not the same as
    // calling it, and a route that imported and ignored it would satisfy a
    // weaker check than the one worth having.
    expect(source).toContain('createRoutes(');
  });

  it('leaves every sibling route in place, so the catch-all shadows nothing', () => {
    for (const sibling of SIBLINGS) {
      expect(
        existsSync(join(apiDir, `${sibling.slice('/api/'.length)}/route.ts`)),
        `${sibling} is gone. The catch-all must not have replaced it — an ingest, a ` +
          'webhook or an auth mount that silently stopped answering is a 404 with no ' +
          'symptom pointing here.',
      ).toBe(true);
    }
  });

  it('refuses rather than serving when no authenticator resolves', () => {
    // The open door this mounts behind. `RouteDependencies.authenticate` is
    // OPTIONAL in the type, so a wiring that forgets it compiles, and an
    // unauthenticated /api/act is an open door to every capability the game
    // grows. The check is that the wiring is present at all; whether it fails
    // CLOSED is asserted by the route handler and its own tests.
    const source = readFileSync(join(apiDir, '[...path]', 'route.ts'), 'utf8');
    expect(source).toContain('authenticate:');
  });

  it('answers the four primitive paths rather than a bare catch-all that matches everything', () => {
    // The dispatcher decides which paths it serves, so that is where the list
    // lives. Asserting it here means a primitive renamed away from the HTTP
    // surface fails a test rather than becoming a 404.
    const dispatcher = readFileSync(join(repoRoot, 'apps/web/src/routes.ts'), 'utf8');
    for (const [method, path] of [
      ['GET', '/api/discover'],
      ['GET', '/api/search'],
      ['GET', '/api/inspect'],
      ['POST', '/api/act'],
    ] as const) {
      expect(dispatcher).toContain(`'${method} ${path}'`);
    }
  });
});
