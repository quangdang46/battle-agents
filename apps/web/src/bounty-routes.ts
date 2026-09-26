import type { ApplicationApi } from '@battle-agents/api';
import type { RegisteredActionId } from '@battle-agents/protocol';

import { describeHttpFailure } from './http-failure.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The bounty resource routes, as pure functions.
 *
 * Four of them, and every one is a translator. The lifecycle — claim windows,
 * the funding floor, a merge completing a bounty, the payout rail — belongs to
 * `packages/features/bounty`, and this file decides none of it. What it does is
 * put an id from the path into the place the application command wants it, and
 * put the command's answer into an `HttpResponse`. `POST /api/act` already
 * reaches all four commands with the same effect, so this is a convenience
 * surface and deliberately not a capability: the moment one of these branches on
 * what a bounty MEANS, there is a second answer to a question the CLI and the
 * MCP adapter cannot see, and that is how two surfaces start disagreeing about
 * whether somebody may claim something.
 *
 * The one thing `act()` structurally cannot do is decide whose agent is acting,
 * and that is what the claim and submit routes are for. See `resolveSession`
 * below — it is the reason those two routes are worth existing at all.
 */

/** The installation a presented Bearer token resolved to. */
export interface BountyCaller {
  readonly installationId: string;
}

/** A session the caller's installation owns, as the ownership query returns it. */
export interface OwnedSession {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
}

export interface BountyRouteDependencies {
  readonly api: ApplicationApi;
  /**
   * Resolves the Bearer token to an installation. Throws an authentication
   * failure (an `Error` carrying a `reason`) when the token is absent, unknown,
   * revoked, expired or in a URL.
   *
   * REQUIRED rather than optional, which is stricter than `RouteDependencies`
   * in `routes.ts`. That one is optional because a caller may have authenticated
   * earlier; nothing authenticates a request before it reaches this tree, so
   * "absent" here can only mean "nobody decided", and the right answer to that
   * is a wiring that does not compile.
   */
  readonly authenticate: (request: HttpRequest) => Promise<BountyCaller>;
  /**
   * Finds a session ONLY if the named installation owns it.
   *
   * `bounty.claim` and `bounty.submit` take an `agentId`, and `act()` has no
   * principal to supply it from: the frozen Extension API puts no caller in
   * `RuntimeContext`, so by the time a command runs the transport has already
   * thrown away whose token was on the request. A route that passed the body's
   * `agentId` straight through would therefore let any agent holding a valid
   * credential claim a bounty AS somebody else — taking the exclusive claim,
   * and then handing in the pull request under a name that is not theirs. The
   * counter is what makes a solve exclusive, so this is the difference between a
   * board and an open door.
   *
   * So the caller names a SESSION, the route resolves it, and the `agentId` the
   * command receives is the one that session belongs to. Ownership lives in the
   * query rather than in a comparison a route could forget: a session belonging
   * to somebody else is `undefined`, the same answer as one that does not exist,
   * so this route cannot be used to discover real session ids either.
   */
  readonly resolveSession: (
    sessionId: string,
    installationId: string,
  ) => Promise<OwnedSession | undefined>;
}

/**
 * The commands this file reaches, written out rather than imported.
 *
 * `packages/features/bounty` exports all four, and this app is not allowed to
 * import a feature outside the composition root: `scripts/removal-test.sh`
 * strips a feature's import from `composition.ts` along with its workspace
 * dependency and path, then typechecks and tests, so a second importer turns
 * "remove a feature" into "edit three files". The `satisfies` is what stops these
 * literals from rotting — the union is generated from every feature's manifest,
 * so a renamed id upstream turns each of these lines into a compile error rather
 * than a route that quietly 404s for everybody.
 */
const BOUNTY_CREATE = 'bounty.create' satisfies RegisteredActionId;
const BOUNTY_LIST = 'bounty.list' satisfies RegisteredActionId;
const BOUNTY_CLAIM = 'bounty.claim' satisfies RegisteredActionId;
const BOUNTY_SUBMIT = 'bounty.submit' satisfies RegisteredActionId;

/** One `{id}`-addressed transition: claim, then submit, in that order. */
type Transition = (
  dependencies: BountyRouteDependencies,
  request: HttpRequest,
  caller: BountyCaller,
  bountyId: string,
) => Promise<HttpResponse>;

/** `{id}` is the whole addressable part of a bounty, so one segment matches. */
const TRANSITIONS: readonly (readonly [RegExp, Transition])[] = [
  [/^\/api\/bounties\/([^/]+)\/claim$/, claim],
  [/^\/api\/bounties\/([^/]+)\/submit$/, submit],
];

export function createBountyRoutes(
  dependencies: BountyRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    const url = new URL(request.url);
    try {
      // Every route on this surface authenticates first, including the list.
      // The list is not public for the same reason the event stream is not: a
      // bounty names a repository and an issue number, and
      // docs/design/public-replay.md rules that publishing a repository is
      // "publishing a place to look".
      const caller = await dependencies.authenticate(request);

      switch (`${request.method} ${url.pathname}`) {
        case 'POST /api/bounties':
          return await create(dependencies, request);
        case 'GET /api/bounties':
          return json(200, await dependencies.api.act(BOUNTY_LIST, listInput(url)));
        default:
          break;
      }

      if (request.method === 'POST') {
        for (const [pattern, run] of TRANSITIONS) {
          const match = pattern.exec(url.pathname);
          const segment = match?.[1];
          if (segment === undefined) {
            continue;
          }
          const bountyId = decodeSegment(segment);
          return bountyId === undefined
            ? json(400, { error: 'bounty id is not a valid URL segment' })
            : // Awaited, not returned bare. A promise returned from inside a
              // `try` is awaited by the CALLER, outside this block, so a
              // rejection from the command would escape `describeHttpFailure`
              // entirely and reach Next.js as an unhandled rejection — a 500
              // with no body, and a refused credential that never became a 401.
              await run(dependencies, request, caller, bountyId);
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

/** `POST /api/bounties` — the body is the command's input, unchanged. */
async function create(
  dependencies: BountyRouteDependencies,
  request: HttpRequest,
): Promise<HttpResponse> {
  const body = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(400, { error: 'body must be a bounty' });
  }
  // 201, unlike the transitions below. A claim and a submit change an existing
  // row; this one is the request that made it, and a client creating a bounty
  // should be able to tell the two apart without comparing bodies.
  return json(201, await dependencies.api.act(BOUNTY_CREATE, body));
}

/**
 * `GET /api/bounties?status=&repoOwner=&repoName=` — a browse, as the query
 * string spells it.
 *
 * An absent parameter is OMITTED rather than sent as an empty string, because
 * `whyListIsRejected` refuses an empty `status` and would turn "no filter" into
 * a 500. `exactOptionalPropertyTypes` is on, so a filtered list is built by
 * assignment against a declared optional rather than by spreading `{...undefined}`.
 */
function listInput(url: URL): { status?: string; repoOwner?: string; repoName?: string } {
  const input: { status?: string; repoOwner?: string; repoName?: string } = {};
  for (const name of ['status', 'repoOwner', 'repoName'] as const) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      input[name] = value;
    }
  }
  return input;
}

/**
 * `POST /api/bounties/{id}/claim` — "this run is taking this bounty".
 *
 * The order is the contract, and it is the order the session heartbeat route
 * uses: authenticate, resolve ownership, act. What the command receives is the
 * id from the PATH and the agent from the OWNED SESSION, never an `agentId` the
 * caller wrote in the body.
 */
async function claim(
  dependencies: BountyRouteDependencies,
  request: HttpRequest,
  caller: BountyCaller,
  bountyId: string,
): Promise<HttpResponse> {
  const actor = await ownedSession(dependencies, request, caller);
  if ('error' in actor) {
    return actor.error;
  }
  return json(
    200,
    await dependencies.api.act(BOUNTY_CLAIM, { bountyId, agentId: actor.session.agentId }),
  );
}

/**
 * `POST /api/bounties/{id}/submit` — "this run's pull request is up".
 *
 * `prUrl` reaches the command untouched. Whether it is a pull request, and in
 * which repository, is a question `packages/features/bounty` answers and is the
 * only place that answers: a submit pointing at another repository would let a
 * merge there complete a bounty here. A route that checked it would be a second
 * copy of that rule, and the copy is the one that would drift.
 */
async function submit(
  dependencies: BountyRouteDependencies,
  request: HttpRequest,
  caller: BountyCaller,
  bountyId: string,
): Promise<HttpResponse> {
  const actor = await ownedSession(dependencies, request, caller);
  if ('error' in actor) {
    return actor.error;
  }
  const prUrl = stringField(request.body, 'prUrl');
  if (prUrl === undefined) {
    return json(400, { error: 'body must carry a prUrl string' });
  }
  return json(
    200,
    await dependencies.api.act(BOUNTY_SUBMIT, {
      bountyId,
      agentId: actor.session.agentId,
      prUrl,
    }),
  );
}

/**
 * The caller's own agent, or the refusal that replaces it.
 *
 * A body with no usable `sessionId` is a 400 — a client that built the request
 * wrong, not a server fault. A session that is not the caller's is a 404, and
 * deliberately the SAME 404 a session that does not exist gets, so the route
 * cannot be used to tell a real session id from an invented one.
 */
async function ownedSession(
  dependencies: BountyRouteDependencies,
  request: HttpRequest,
  caller: BountyCaller,
): Promise<{ session: OwnedSession } | { error: HttpResponse }> {
  const sessionId = stringField(request.body, 'sessionId');
  if (sessionId === undefined) {
    return { error: json(400, { error: 'body must carry a sessionId string' }) };
  }
  const session = await dependencies.resolveSession(sessionId, caller.installationId);
  return session === undefined ? { error: json(404, { error: 'no such session' }) } : { session };
}

function stringField(body: unknown, name: string): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * A path segment back to the value it stood for.
 *
 * `undefined` for a segment that is not valid percent-encoding, which the
 * caller turns into a 400 rather than a thrown `URIError` that reads as a 500.
 */
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
