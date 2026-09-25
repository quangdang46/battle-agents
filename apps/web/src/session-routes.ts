import { isAuthenticationFailure } from '@battle-agents/api';
import type { ApplicationApi } from '@battle-agents/api';
import type { RegisteredActionId } from '@battle-agents/protocol';

import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The session resource routes, as pure functions.
 *
 * Split out from `routes.ts` for the reason `event-routes.ts` gives its own
 * split: the five primitives never look at a request body and neither looks at
 * the path beyond an exact match, while a resource route is addressed BY its
 * path. `createRoutes` switches on `` `${method} ${pathname}` ``, which has
 * exactly one spelling per route; a session id is a value, not a spelling.
 *
 * One route lives here, and it is worth being honest about why. `session
 * .heartbeat` is a registered action and `/api/act` already reaches it, so this
 * route adds no capability. What it adds is the one thing `act()` structurally
 * cannot: see the note on `resolveSession` below. The ownership question has to
 * be answered by whoever exposes an action over HTTP, and this is that place.
 */

/** The installation a presented Bearer token resolved to. */
export interface SessionCaller {
  readonly installationId: string;
}

/** A session the caller's installation owns, as the ownership query returns it. */
export interface OwnedSession {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
}

export interface SessionRouteDependencies {
  readonly api: ApplicationApi;
  /**
   * Resolves the Bearer token to an installation. Throws an authentication
   * failure (an `Error` carrying a `reason`) when the token is absent, unknown,
   * revoked, expired or in a URL.
   */
  readonly authenticate: (request: HttpRequest) => Promise<SessionCaller>;
  /**
   * Finds a session ONLY if the named installation owns it.
   *
   * This is the reason the route exists, so it is worth stating plainly:
   * `ApplicationApi.act` has no principal. The frozen Extension API puts no
   * caller in `RuntimeContext`, so an action cannot ask whose token is on the
   * request — the transport has already thrown that away by the time the
   * command runs. A heartbeat that skipped this check would let any agent with
   * a valid credential keep another installation's session `active` indefinitely,
   * which is not a nuisance: it is exactly what the stale-session sweeper
   * exists to end. An unauthenticated-feeling write path that is in fact
   * authenticated-and-unscoped is the failure this port closes.
   *
   * Ownership lives in the query, not in a comparison a route could forget: a
   * session belonging to somebody else is `undefined`, the same answer as one
   * that does not exist.
   */
  readonly resolveSession: (
    sessionId: string,
    installationId: string,
  ) => Promise<OwnedSession | undefined>;
}

/**
 * The action this route reaches, written out rather than imported.
 *
 * `SESSION_HEARTBEAT` is exported by the agent feature, and this app is not
 * allowed to import a feature outside the composition root: `scripts/
 * removal-test.sh` strips the feature's import from `composition.ts` and its
 * dependency and path from the workspace, then typechecks the tree, so a second
 * importer turns "remove a feature" into "edit three files". `composition.ts` is
 * currently the only place in `apps/web` that names a feature, and that is a
 * property the gate depends on, not a coincidence.
 *
 * The `satisfies` is what stops the literal from rotting. The union is
 * generated from every feature's manifest, so renaming the id upstream and
 * regenerating turns this line into a compile error rather than a route that
 * quietly 404s for everybody.
 */
const SESSION_HEARTBEAT = 'session.heartbeat' satisfies RegisteredActionId;

/** `{id}` is the whole addressable part of a session, so one segment matches. */
const HEARTBEAT_PATH = /^\/api\/sessions\/([^/]+)\/heartbeat$/;

export function createSessionRoutes(
  dependencies: SessionRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    const url = new URL(request.url);
    try {
      const match = request.method === 'POST' ? HEARTBEAT_PATH.exec(url.pathname) : null;
      const segment = match?.[1];
      if (segment === undefined) {
        return { status: 404, body: { error: 'not found', path: url.pathname } };
      }
      const sessionId = decodeSegment(segment);
      if (sessionId === undefined) {
        return { status: 400, body: { error: 'session id is not a valid URL segment' } };
      }
      return await heartbeat(dependencies, request, sessionId);
    } catch (error) {
      return describeFailure(error);
    }
  };
}

/**
 * `POST /api/sessions/{id}/heartbeat` — "this run is still alive".
 *
 * The order is the contract. Authenticate, so nothing else happens to an
 * unpresented token. Resolve ownership, so a caller cannot keep somebody else's
 * run alive. Then act.
 *
 * What comes back is whatever the action returned, and nothing here interprets
 * it. In particular this route does not check whether the session is still
 * `active` before heartbeating it: that question is answered by the repository
 * the action calls, which refuses anything but a live session, and a second
 * opinion up here would be one more place to keep in step.
 */
async function heartbeat(
  dependencies: SessionRouteDependencies,
  request: HttpRequest,
  sessionId: string,
): Promise<HttpResponse> {
  const caller = await dependencies.authenticate(request);
  const session = await dependencies.resolveSession(sessionId, caller.installationId);
  if (session === undefined) {
    return { status: 404, body: { error: 'no such session' } };
  }
  return {
    status: 200,
    body: await dependencies.api.act(SESSION_HEARTBEAT, { sessionId }),
  };
}

/**
 * A path segment back to the value it stood for.
 *
 * `undefined` for a segment that is not valid percent-encoding, which is a
 * client that built the URL wrong rather than a server fault — hence 400 from
 * the caller rather than a thrown `URIError` that would read as a 500.
 */
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/**
 * The same mapping the other surfaces use.
 *
 * This is the third copy, and the drift risk is real — it is the failure the
 * api package already documents for `isAuthenticationFailure`: a caller who
 * cannot tell "log in again" from "that does not exist" from "the platform is
 * broken" retries the wrong thing. Collapsing them into one helper means editing
 * `routes.ts` and `event-routes.ts`, which belongs with whoever next touches
 * those two rather than folded into a route bead.
 *
 * A session that is not running reaches here as a plain `Error` and becomes a
 * 500. Classifying it would mean the route recognising a failure the action
 * defined, which is the game-logic-in-a-handler rule this file exists to
 * respect; it belongs to `packages/api`, which owns the vocabulary every
 * surface is allowed to share.
 */
function describeFailure(error: unknown): HttpResponse {
  if (isAuthenticationFailure(error)) {
    return { status: 401, body: { error: error.message, reason: error.reason } };
  }
  return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } };
}
