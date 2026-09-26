import { authenticate, DrizzleCredentialStore, DrizzleSessionRepository } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import type { ApplicationApi } from '@battle-agents/api';

import { createBattleRoutes } from './battle-routes.js';
import { toAuthenticationFailure } from './event-gateway.js';
import { sharedApi } from './routes.js';
import type { HttpRequest, HttpResponse } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

/**
 * The battle gateway: the composition root for the battle resource surface.
 *
 * `bounty-gateway.ts` is the same file with a different resource, and the
 * comment explaining why no feature is imported here is on that one. What is
 * worth repeating in one line: `scripts/removal-test.sh` deletes a feature by
 * stripping one line of `composition.ts`, so a second importer anywhere in
 * `apps/web` turns "remove a feature" into "edit three files".
 *
 * It is worth naming what this gateway deliberately does NOT do, because the
 * file that could have done it is the one above. A logged-out spectator reading
 * a battle rubric needs no credential, and the feature is built for it — the
 * route is not, because `BattleView` carries session ids and
 * docs/design/public-replay.md rules those never public. When that projection
 * exists, it belongs here, as an option that the read routes take, and the
 * default must stay the authenticated one.
 */

export interface BattleGatewayDependencies {
  readonly database: Database;
  /** Defaults to the shared one; a test supplies its own to avoid a pool. */
  readonly api?: ApplicationApi;
}

export interface BattleGateway {
  readonly handle: (request: HttpRequest) => Promise<HttpResponse>;
  readonly close: () => Promise<void>;
}

export async function createBattleGateway(
  dependencies: BattleGatewayDependencies,
): Promise<BattleGateway> {
  const { database } = dependencies;
  const sessions = new DrizzleSessionRepository(database);
  const handle = createBattleRoutes({
    api: dependencies.api ?? (await sharedApi()),
    // The same authenticator the telemetry plane uses, supplied rather than
    // imported, and with no required scope: the token proves which installation
    // is calling and `resolveSession` proves the session belongs to it.
    authenticate: async (request) => {
      try {
        const caller = await authenticate(
          { store: new DrizzleCredentialStore(database), now: new Date().toISOString() },
          request as never,
        );
        return { installationId: caller.installationId };
      } catch (error) {
        return toAuthenticationFailure(error);
      }
    },
    resolveSession: (sessionId, installationId) =>
      sessions.findOwnedByInstallation(sessionId, installationId),
  });
  return { handle, close: () => Promise.resolve() };
}

let cached: BattleGateway | undefined;

/**
 * The process-wide gateway, built on first use.
 *
 * Module scope for the same reason `sharedApi` and `sharedSessionGateway` are:
 * the database pool is fine once and fatal per request.
 */
export async function sharedBattleGateway(): Promise<BattleGateway> {
  if (cached !== undefined) {
    return cached;
  }
  const { database } = await sharedRuntime();
  cached = await createBattleGateway({ database });
  return cached;
}

/** Drops the gateway's cache. The pool belongs to `sharedRuntime`. */
export async function closeSharedBattleGateway(): Promise<void> {
  await cached?.close();
  cached = undefined;
}
