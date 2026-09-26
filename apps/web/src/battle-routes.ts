import type { ApplicationApi } from '@battle-agents/api';
import type { RegisteredActionId } from '@battle-agents/protocol';

import { describeHttpFailure } from './http-failure.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The battle resource routes, as pure functions.
 *
 * Four of them, and like the bounty routes every one is a translator: the id
 * from the path goes into the application command's input, and the command's
 * answer comes back as an `HttpResponse`. Nothing here decides whether a battle
 * can be entered, who is allowed to win, or what a rubric is worth — the last of
 * those is the judge's, in `packages/features/battle`.
 *
 * TWO OF THESE ARE AUTHENTICATED AND TWO ARE NOT, and that is not an
 * inconsistency: it is the one place on this surface where the route makes a
 * decision, and it makes it against a written one.
 *
 * `GET /api/battles` and `GET /api/battles/{id}` reach `battle.list` and
 * `battle.read`, whose declared input is a battle id and nothing else — no
 * agentId, no sessionId, no credential. `packages/features/battle` documents
 * that as a fairness property: the rubric a battle is judged by has to be
 * readable while the battle is still running, or a caller deciding whether to
 * enter is deciding blind.
 *
 * Their OUTPUT is another matter, and this is the finding the routes exist to
 * record. `BattleView` carries `participants[].sessionId`, `agentId` and
 * `winnerSessionIds`, and docs/design/public-replay.md rules under "What is
 * never public" that a session id is never public — not because it is secret,
 * but because a shared link is permanent while that handle is the join key to
 * every authenticated surface. So mounting these two routes with no credential
 * would publish internal handles over a route tree, on the strength of a feature
 * input guard that says something about the INPUT and nothing about the answer.
 *
 * Both are therefore authenticated here, which makes them exactly as public as
 * `POST /api/act` already is and adds no new boundary. Publishing the rubric to
 * a logged-out viewer needs a PROJECTION that labels fighters the way the replay
 * does, and a projection is a decision about the read model, not a route's. It
 * is not taken here, and it should not be taken by whoever next sees the word
 * "public" in the manifest.
 */

/** The installation a presented Bearer token resolved to. */
export interface BattleCaller {
  readonly installationId: string;
}

/** A session the caller's installation owns, as the ownership query returns it. */
export interface OwnedSession {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
}

export interface BattleRouteDependencies {
  readonly api: ApplicationApi;
  /**
   * Resolves the Bearer token to an installation. Throws an authentication
   * failure (an `Error` carrying a `reason`) when the token is absent, unknown,
   * revoked, expired or in a URL.
   *
   * REQUIRED, for the reason `BountyRouteDependencies.authenticate` is: nothing
   * authenticates a request before it reaches this tree, so an optional
   * authenticator here would be a wiring nobody decided on.
   */
  readonly authenticate: (request: HttpRequest) => Promise<BattleCaller>;
  /**
   * Finds a session ONLY if the named installation owns it.
   *
   * `battle.create` and `battle.join` are named by SESSION rather than by
   * agent, so the indirection is smaller than it is for a bounty: the caller
   * hands over a session id and a session id is what the command receives. What
   * the route still has to answer is whether that session is the caller's.
   * Without this check a caller joins as any session whose id it has, and since
   * battle ids and session ids are both short strings a caller can guess, the
   * check is the only thing between a join and an impersonation.
   *
   * See `BountyRouteDependencies.resolveSession` for why this is a query and not
   * a comparison: a session belonging to somebody else is `undefined`, the same
   * answer as one that does not exist.
   */
  readonly resolveSession: (
    sessionId: string,
    installationId: string,
  ) => Promise<OwnedSession | undefined>;
}

/**
 * The commands this file reaches, written out rather than imported.
 *
 * `packages/features/battle` exports all four, and this app is not allowed to
 * import a feature outside the composition root — see
 * `BountyRouteDependencies.authenticate` for what the removal test does to a
 * second importer. The `satisfies` keeps these literals honest against the
 * generated union.
 */
const BATTLE_CREATE = 'battle.create' satisfies RegisteredActionId;
const BATTLE_LIST = 'battle.list' satisfies RegisteredActionId;
const BATTLE_READ = 'battle.read' satisfies RegisteredActionId;
const BATTLE_JOIN = 'battle.join' satisfies RegisteredActionId;

/** `{id}` is the whole addressable part of a battle, so one segment matches. */
const BATTLE_ID_PATH = /^\/api\/battles\/([^/]+)$/;
const JOIN_PATH = /^\/api\/battles\/([^/]+)\/join$/;

export function createBattleRoutes(
  dependencies: BattleRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    const url = new URL(request.url);
    try {
      // Authenticate up front, INCLUDING the two reads. That is a deliberate
      // narrowing of what the manifest implies, and the reason is at the top of
      // this file: a public read would publish session ids.
      const caller = await dependencies.authenticate(request);

      switch (`${request.method} ${url.pathname}`) {
        case 'GET /api/battles':
          // `battle.list` is guarded against anything but an empty object, so
          // it is sent exactly that rather than the query string, which is
          // ignored.
          return json(200, await dependencies.api.act(BATTLE_LIST, {}));
        case 'POST /api/battles':
          return await create(dependencies, request, caller);
        default:
          break;
      }

      if (request.method === 'GET') {
        const battleId = decodeSegment(BATTLE_ID_PATH.exec(url.pathname)?.[1]);
        if (battleId !== undefined) {
          return json(200, await dependencies.api.act(BATTLE_READ, { battleId }));
        }
      }
      if (request.method === 'POST') {
        const battleId = decodeSegment(JOIN_PATH.exec(url.pathname)?.[1]);
        if (battleId !== undefined) {
          return await join(dependencies, request, caller, battleId);
        }
      }
      return json(404, { error: 'not found', path: url.pathname });
    } catch (error) {
      return describeHttpFailure(error);
    }
  };
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body };
}

/**
 * `POST /api/battles` — the body is the command's input, unchanged.
 *
 * 201 for the same reason `POST /api/bounties` is: this is the request that
 * made the row, and a client should not have to compare bodies to tell a
 * creation from a transition.
 */
async function create(
  dependencies: BattleRouteDependencies,
  request: HttpRequest,
  caller: BattleCaller,
): Promise<HttpResponse> {
  const body = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(400, { error: 'body must be a battle' });
  }
  const owned = await ownSession(dependencies, body, caller);
  if ('error' in owned) {
    return owned.error;
  }
  return json(
    201,
    await dependencies.api.act(BATTLE_CREATE, { ...body, sessionId: owned.session.id }),
  );
}

/**
 * `POST /api/battles/{id}/join` — "this run is entering this battle".
 *
 * The battle id is the one in the path, never one from the body, so a body that
 * disagrees with the URL it was sent to cannot act on the other one.
 */
async function join(
  dependencies: BattleRouteDependencies,
  request: HttpRequest,
  caller: BattleCaller,
  battleId: string,
): Promise<HttpResponse> {
  const body = request.body;
  const owned = await ownSession(dependencies, body, caller);
  if ('error' in owned) {
    return owned.error;
  }
  return json(
    200,
    await dependencies.api.act(BATTLE_JOIN, { battleId, sessionId: owned.session.id }),
  );
}

/**
 * The caller's own session, or the refusal that replaces it.
 *
 * A body with no usable `sessionId` is a 400 — a client that built the request
 * wrong, not a server fault. A session that is not the caller's is a 404, and
 * deliberately the SAME 404 a session that does not exist gets.
 */
async function ownSession(
  dependencies: BattleRouteDependencies,
  body: unknown,
  caller: BattleCaller,
): Promise<{ session: OwnedSession } | { error: HttpResponse }> {
  if (typeof body !== 'object' || body === null) {
    return { error: json(400, { error: 'body must carry a sessionId string' }) };
  }
  const sessionId = (body as Record<string, unknown>)['sessionId'];
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return { error: json(400, { error: 'body must carry a sessionId string' }) };
  }
  const session = await dependencies.resolveSession(sessionId, caller.installationId);
  return session === undefined ? { error: json(404, { error: 'no such session' }) } : { session };
}

/**
 * A path segment back to the value it stood for.
 *
 * `undefined` for a segment that is not valid percent-encoding AND for a path
 * the pattern did not match, which is why the caller checks the result against
 * a 404 rather than a 400: the two cases are not told apart here on purpose, so
 * a malformed segment and an unmatched path produce the same answer a stranger
 * gets for a route that does not exist.
 */
function decodeSegment(segment: string | undefined): string | undefined {
  if (segment === undefined) {
    return undefined;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
