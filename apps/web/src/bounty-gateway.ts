import {
  authenticate,
  DrizzleCredentialStore,
  DrizzleInstallationRepository,
  DrizzleSessionRepository,
} from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import type { ApplicationApi } from '@battle-agents/api';

import { createBountyRoutes } from './bounty-routes.js';
import { toAuthenticationFailure } from './event-gateway.js';
import { sharedApi } from './routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

/**
 * The bounty gateway: the composition root for the bounty resource surface.
 *
 * Same shape as `session-gateway.ts` and `mcp-gateway.ts` next door, and for the
 * same reason. The routes in `bounty-routes.ts` take their collaborators as
 * arguments so they can be tested with fakes and no database; this file is the
 * one place that says which real ones they are, and it is the only place a
 * credential becomes an installation id.
 *
 * No feature is imported here, and that is a constraint rather than a style.
 * `scripts/removal-test.sh` strips a feature's import from `composition.ts`
 * along with its workspace dependency and path, then typechecks and tests the
 * tree, so every importer of a feature outside the composition root is a file
 * the removal test cannot clean up after. `composition.ts` is the only place in
 * `apps/web` that names a feature today, and keeping it that way is what keeps
 * "removing a feature is deleting a line" true.
 *
 * The Application API is `sharedApi()`, the same object the five primitives and
 * the MCP gateway act through, so this surface cannot answer a question the
 * others answer differently.
 */

export interface BountyGatewayDependencies {
  readonly database: Database;
  /** Defaults to the shared one; a test supplies its own to avoid a pool. */
  readonly api?: ApplicationApi;
}

export interface BountyGateway {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly close: () => Promise<void>;
}

export async function createBountyGateway(
  dependencies: BountyGatewayDependencies,
): Promise<BountyGateway> {
  const { database } = dependencies;
  const sessions = new DrizzleSessionRepository(database);
  const ownership = new DrizzleInstallationRepository(database);
  const handle = createBountyRoutes({
    api: dependencies.api ?? (await sharedApi()),
    // The same authenticator the telemetry plane uses, supplied rather than
    // imported for the reason event-gateway.ts gives: importing it directly
    // would make the removal test have to edit this file too.
    //
    // No required scope. The token proves which installation is calling, and
    // `resolveSession` proves the session belongs to it, which is the whole of
    // what the two transition routes check. A scope here would be a second,
    // weaker gate in front of a real one, and it would be the one a fixture
    // forgets to grant.
    authenticate: async (request) => {
      try {
        const caller = await authenticate(
          { store: new DrizzleCredentialStore(database), now: new Date().toISOString() },
          request as never,
        );
        return { installationId: caller.installationId };
      } catch (error) {
        // The credential store carries its reason nested under `failure` while
        // the API's guard reads it at the top level. Both shapes are translated
        // in the one function that knows both, so a rejected token is a 401 here
        // for the same reason it is one on the event route.
        return toAuthenticationFailure(error);
      }
    },
    resolveSession: (sessionId, installationId) =>
      sessions.findOwnedByInstallation(sessionId, installationId),
    // The one query that turns a presented token into a human. It is here and
    // not in the route for the same reason `resolveSession` is: the route must
    // stay a translator that can be tested with no database, and this file is
    // the only place a credential becomes an identity.
    resolveSponsor: (installationId) => ownership.findOwner(installationId),
  });
  return { handle, close: () => Promise.resolve() };
}

let cached: BountyGateway | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` and `sharedSessionGateway` are:
 * the database pool is fine once and fatal per request.
 */
export async function sharedBountyGateway(): Promise<BountyGateway> {
  if (cached !== undefined) {
    return cached;
  }
  const { database } = await sharedRuntime();
  cached = await createBountyGateway({ database });
  return cached;
}

/** Drops the gateway's cache. The pool belongs to `sharedRuntime`. */
export async function closeSharedBountyGateway(): Promise<void> {
  await cached?.close();
  cached = undefined;
}
