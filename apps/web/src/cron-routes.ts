import { isAuthenticationFailure } from '@battle-agents/api';

import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The scheduled-surface routes, as pure functions.
 *
 * One route, and it is a trigger rather than a sweeper: the decision about
 * which sessions went quiet, and in what order they are given up, belongs to
 * `sweepStaleSessions` in the agent feature, and a cron that reimplemented that
 * arithmetic would eventually disagree with the HELLO handshake about what
 * "resumable" means. So the sweep arrives here as a port and this file calls it.
 *
 * Why a port and not the function. Two reasons, and the second is load-bearing.
 * The obvious one is that a pure route is testable with a fake. The real one is
 * that the sweeper is a feature export, and this app is not allowed to import a
 * feature outside the composition root — `scripts/removal-test.sh` strips a
 * feature's import from `composition.ts` along with its workspace dependency and
 * path and then typechecks the tree, so a second importer turns "remove a
 * feature" into "edit three files". The sweep is therefore bound where the
 * composition root is, which is the same place every other feature is bound and
 * the only place that may decide a feature exists.
 *
 * That binding is NOT in this tree, so the route is not mounted either. It is
 * here, tested and ready, because the part that is missing is a policy decision
 * rather than code — see the note on `authenticate`.
 */

/** What one sweep did, counted. Ids are not reported; see the route. */
export interface SweepOutcome {
  readonly disconnected: number;
  readonly abandoned: number;
}

export interface CronRouteDependencies {
  /**
   * Proves the caller is the scheduler. Throws an authentication failure (an
   * `Error` carrying a `reason`) when it is not.
   *
   * OPTIONAL, and absent means every request is refused. That is the opposite of
   * the rule `routes.ts` states for its own `authenticate` — there, absent means
   * the caller authenticated earlier, and an unauthenticated `/api/act` is an
   * open door. Here there is no earlier caller: a scheduler is not an agent, so
   * nothing upstream has authenticated anything, and the only honest reading of
   * "no authenticator was supplied" is "this surface is not open".
   *
   * It is still an open policy, and the code does not pretend otherwise. Nothing
   * in the tree says what a scheduler may present: reusing the installation
   * Bearer token would let any token-holder drive session transitions at will,
   * and a shared secret or a platform cron signature is a decision about
   * deployment that has not been written down. Failing closed leaves the
   * decision open instead of closing it the wrong way.
   */
  readonly authenticate?: (request: HttpRequest) => Promise<unknown>;
  /** One pass of the stale-session sweep. Decides nothing here. */
  readonly sweep: () => Promise<SweepOutcome>;
}

export function createCronRoutes(
  dependencies: CronRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    const url = new URL(request.url);
    try {
      if (`${request.method} ${url.pathname}` !== 'POST /api/cron/heartbeat') {
        return { status: 404, body: { error: 'not found', path: url.pathname } };
      }
      if (dependencies.authenticate === undefined) {
        return refuseUnauthenticated();
      }
      // A failed authenticate throws, and the dispatcher's describeFailure turns
      // it into a 401 by the same rule the other three surfaces use, so a
      // rejected credential reads the same way wherever it was presented.
      await dependencies.authenticate(request);
      const swept = await dependencies.sweep();
      // Counts, not ids. A trigger's caller asked for the sweep to happen, not
      // for a list of which runs died, and the ids are the sweeper's answer to
      // give rather than this route's to re-publish.
      return {
        status: 200,
        body: { disconnected: swept.disconnected, abandoned: swept.abandoned },
      };
    } catch (error) {
      return describeFailure(error);
    }
  };
}

function refuseUnauthenticated(): HttpResponse {
  return {
    status: 401,
    body: { error: 'no cron credential is configured for this surface', reason: 'cron-closed' },
  };
}

/**
 * The same mapping the other surfaces use; see `session-routes.ts` for why it is
 * copied rather than shared, and what would go wrong if the copies diverged.
 */
function describeFailure(error: unknown): HttpResponse {
  if (isAuthenticationFailure(error)) {
    return { status: 401, body: { error: error.message, reason: error.reason } };
  }
  return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } };
}
