import { authenticate, DrizzleCredentialStore, DrizzleSessionRepository } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import type { ApplicationApi } from '@battle-agents/api';

import { toAuthenticationFailure } from './event-gateway.js';
import { createQuestRoutes } from './quest-routes.js';
import { sharedApi } from './routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

/**
 * The quest gateway: the composition root for the quest transition surface.
 *
 * Same shape as `bounty-gateway.ts` and `session-gateway.ts`, and for the same
 * reason. The routes in `quest-routes.ts` take their collaborators as arguments
 * so they can be tested with fakes and no database; this file is the one place
 * that says which real ones they are, and it is the only place a credential
 * becomes an installation id and an installation id becomes a session's agent.
 *
 * No feature is imported here, and that is a constraint rather than a style.
 * `scripts/removal-test.sh` strips a feature's import from `composition.ts`
 * along with its workspace dependency and path, then typechecks and tests the
 * tree, so every importer of a feature outside the composition root is a file
 * the removal test cannot clean up after.
 */
export interface QuestGatewayDependencies {
  readonly database: Database;
  /** Defaults to the shared one; a test supplies its own to avoid a pool. */
  readonly api?: ApplicationApi;
}

export interface QuestGateway {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly close: () => Promise<void>;
}

export async function createQuestGateway(
  dependencies: QuestGatewayDependencies,
): Promise<QuestGateway> {
  const { database } = dependencies;
  const sessions = new DrizzleSessionRepository(database);
  const handle = createQuestRoutes({
    api: dependencies.api ?? (await sharedApi()),
    // The same authenticator the telemetry plane uses, supplied rather than
    // imported for the reason event-gateway.ts gives: importing it directly
    // would make the removal test have to edit this file too. It is the same
    // function and the same credential store, so a token the event route
    // accepts is accepted here.
    //
    // No required scope. The token proves which installation is calling and
    // `resolveSession` proves the session belongs to it, which is the whole of
    // what these two routes check. A scope here would be a second, weaker gate
    // in front of a real one, and it would be the one a fixture forgets to grant.
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
  });
  return { handle, close: () => Promise.resolve() };
}

let cached: QuestGateway | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` and `sharedBountyGateway` are:
 * the database pool is fine once and fatal per request.
 */
export async function sharedQuestGateway(): Promise<QuestGateway> {
  if (cached !== undefined) {
    return cached;
  }
  const { database } = await sharedRuntime();
  cached = await createQuestGateway({ database });
  return cached;
}

/** Drops the gateway's cache. The pool belongs to `sharedRuntime`. */
export async function closeSharedQuestGateway(): Promise<void> {
  await cached?.close();
  cached = undefined;
}
