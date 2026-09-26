import { authenticate, DrizzleCredentialStore, DrizzleSessionRepository } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import type { ApplicationApi } from '@battle-agents/api';

import { toAuthenticationFailure } from './event-gateway.js';
import { createSessionRoutes } from './session-routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { sharedApi } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

/**
 * The session gateway: the composition root for the session resource surface.
 *
 * Same shape as `mcp-gateway.ts` next door, and for the same reason. The routes
 * in `session-routes.ts` take their collaborators as arguments so they can be
 * tested with fakes and no database; this file is the one place that says which
 * real ones they are, and it is the only place a credential turns into an
 * installation id.
 *
 * No feature is imported here, and that is a constraint rather than a style.
 * `scripts/removal-test.sh` strips a feature's import from `composition.ts`
 * along with its workspace dependency and path, then typechecks and tests the
 * tree — so every importer of a feature outside the composition root is a file
 * the removal test cannot clean up after. `composition.ts` is the only place in
 * `apps/web` that names a feature today. Keeping it that way is what keeps
 * "removing a feature is deleting a line" true.
 *
 * The Application API is `sharedApi()`, the same object the CLI-facing routes
 * and the MCP gateway act through, so this surface cannot answer a question the
 * others answer differently.
 */

export interface SessionGatewayDependencies {
  readonly database: Database;
  /**
   * The Application API this surface acts through.
   *
   * Defaults to the shared one, which is the point: in the app this is literally
   * the same object the five primitives and the MCP gateway act through, so a
   * question cannot be answered one way over HTTP and another way over MCP. A
   * test supplies its own so it can drive the wiring without a pool.
   */
  readonly api?: ApplicationApi;
}

export interface SessionGateway {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly close: () => Promise<void>;
}

export async function createSessionGateway(
  dependencies: SessionGatewayDependencies,
): Promise<SessionGateway> {
  const { database } = dependencies;
  const sessions = new DrizzleSessionRepository(database);
  const handle = createSessionRoutes({
    api: dependencies.api ?? (await sharedApi()),
    // The same authenticator the telemetry plane uses, supplied rather than
    // imported for the reason event-gateway.ts gives: importing it directly
    // would make the removal test have to edit this file too. It is the same
    // function and the same credential store, so a token the event route
    // accepts is accepted here.
    //
    // No required scope. The token proves which installation is calling and
    // `resolveSession` proves the session belongs to it, which is the whole of
    // what this route checks. A scope here would be a second, weaker gate in
    // front of a real one, and it would be the one a fixture forgets to grant.
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
        // for the same reason it is one on the event route — not a 500, which
        // tells the caller to retry a credential that will never be accepted.
        return toAuthenticationFailure(error);
      }
    },
    resolveSession: (sessionId, installationId) =>
      sessions.findOwnedByInstallation(sessionId, installationId),
  });
  return { handle, close: () => Promise.resolve() };
}

let cached: { gateway: SessionGateway; close: () => Promise<void> } | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` and `sharedMcpGateway` are: the
 * database pool is fine once and fatal per request. The credential store shares
 * the shared runtime's pool rather than opening a third one.
 */
export async function sharedSessionGateway(): Promise<SessionGateway> {
  if (cached !== undefined) {
    return cached.gateway;
  }
  const { database } = await sharedRuntime();
  const gateway = await createSessionGateway({ database });
  cached = { gateway, close: () => Promise.resolve() };
  return gateway;
}

/** Drops the gateway's cache. The pool belongs to `sharedRuntime`. */
export async function closeSharedSessionGateway(): Promise<void> {
  cached?.close();
  cached = undefined;
}
