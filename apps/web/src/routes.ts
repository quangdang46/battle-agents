import { createApplicationApi, UnknownActionError } from '@battle-agents/api';
import { isRegisteredActionId, type RegisteredActionId } from '@battle-agents/protocol';
import type { ApplicationApi } from '@battle-agents/api';

import { describeHttpFailure } from './http-failure.js';
import { closeSharedRuntime, sharedRuntime } from './shared-runtime.js';

/**
 * The HTTP surface.
 *
 * A route handler does three things: authenticate, translate, translate back.
 * It makes no decisions. The moment one of these branches on what a request
 * means, that decision lives in this file and nowhere the CLI and the MCP
 * adapter can reach — which is how two surfaces end up disagreeing about
 * whether somebody may do something.
 */

export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: { get(name: string): string | null };
  readonly body?: unknown;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  /**
   * Sent when a status is not enough on its own.
   *
   * Present because 413 without `Retry-After` is a refusal with no instruction
   * in it: a client that does not know how long to wait either retries in a
   * tight loop or gives up, and the loop is the one that hurts. `exactOptional`
   * is on, so a response with no headers omits the field rather than carrying
   * an explicit undefined, and the route adapter can spread it without a guard.
   */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface RouteDependencies {
  readonly api: ApplicationApi;
  /**
   * Omitted only where a caller has already authenticated. Present in the app,
   * because an unauthenticated `/api/act` is an open door to every capability
   * the game grows.
   */
  readonly authenticate?: (request: HttpRequest) => Promise<unknown>;
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body };
}

/** The five primitives, reachable over HTTP. */
export function createRoutes(
  dependencies: RouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    try {
      if (dependencies.authenticate !== undefined) {
        await dependencies.authenticate(request);
      }
      return await route(dependencies.api, request);
    } catch (error) {
      // One mapping for every surface, and it used to be four. See the note in
      // `http-failure.ts`: the copies had already drifted, in that only this
      // dispatcher's knew an unknown action was a 404 rather than a 500.
      return describeHttpFailure(error);
    }
  };
}

async function route(api: ApplicationApi, request: HttpRequest): Promise<HttpResponse> {
  const url = new URL(request.url);

  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/discover':
      // Awaited, not wrapped. json() takes a value, and a Promise placed in a
      // body serialises to {} — a response that looks fine and carries nothing.
      return json(200, await api.discover(url.searchParams.get('domain') ?? undefined));
    case 'GET /api/search':
      return json(200, await api.search(searchFrom(url)));
    case 'GET /api/inspect':
      return json(
        200,
        await api.inspect({
          type: url.searchParams.get('type') ?? '',
          id: url.searchParams.get('id') ?? '',
        }),
      );
    case 'POST /api/act':
      return await act(api, request);
    default:
      return json(404, { error: 'not found', path: url.pathname });
  }
}

function searchFrom(url: URL): { type: string; name?: string } {
  const type = url.searchParams.get('type') ?? '';
  const name = url.searchParams.get('name');
  return name === null ? { type } : { type, name };
}

/**
 * The actions this catch-all refuses, and the route that runs them instead.
 *
 * `act()` is reached with a credential on the request and a payload in the body,
 * and the payload is where the caller identity arrives: `quest.claim` and
 * `quest.submit` take an `agentId`, `session.create` an `ownerId`,
 * `session.heartbeat` and `session.end` a `sessionId`. The frozen Extension API
 * puts no principal in `RuntimeContext`, so by the time one of those runs the
 * transport has already thrown away whose token was presented. A caller naming
 * somebody else's agent there is not a bug in the feature — given an `agentId`,
 * the feature records that `agentId`, which is what it is for — it is a caller
 * choosing which identity to wear, and the row it writes names that choice.
 *
 * A RESOURCE ROUTE is what closes it, because a route sees the credential before
 * it discards it: it resolves the session the caller owns and passes the
 * `agentId` THAT session belongs to. The two surfaces are therefore not
 * equivalent for these six ids, and refusing here is what makes the resource
 * route the only door rather than the polite one.
 *
 * `route: null` is not an oversight and is the reason the list is data. It marks
 * an action whose caller identity is NOT derivable from a credential, so there
 * is no route to point at and the honest answer is that nobody may run it over
 * HTTP. `quest.admin.revoke` is the one today: revoking a quest is an
 * administrator's move, and the schema has no column anywhere that says who an
 * administrator is, so a route could not check anything — it could only take an
 * `agentId` from the body and call that the authorization. Until that question
 * is answered the operation has no HTTP door at all, which is a smaller surface
 * than one where any credential-holder can cancel any quest.
 *
 * What this does NOT close, listed because a list of what is closed is a claim
 * about the rest otherwise:
 *
 *   - The in-process MCP surface. `/api/mcp` runs the frozen server, which calls
 *     `context.api.act(input.action, input.input ?? {})` itself, below this
 *     dispatcher. A gate here is the strongest statement the HTTP transport can
 *     make without editing a frozen package, and the MCP limit is recorded
 *     rather than worked around.
 *
 *   - `social.*`. `social.send` and `social.broadcast` take a `fromAgentId` and
 *     are unreachable in practice because nothing provides `guild.can_talk_to`,
 *     so the feature refuses before it stores anything. `social.poke` is NOT in
 *     that position: it never asks the ACL, so it is live today and takes an
 *     `agentId` naming whose inbox to wake, answering with the newest message's
 *     id and sender. Deciding who a social principal IS is open in this
 *     repository, so no principal is resolved for it here and the operation is
 *     left as it stands.
 *
 *   - `bounty.claim`, `bounty.submit`, `bounty.fund`, `battle.create` and
 *     `battle.join`. Each names its caller in the payload and each has a
 *     resource route that resolves it, so the shape is the same as the six
 *     above — and the same hole is open here, because a route is a second
 *     spelling rather than the only one. They are absent because closing them is
 *     a change to the parity contract in `resource-route-parity.test.ts`, which
 *     asserts that a route and `act` reach the same command; that is a decision
 *     about the two surfaces agreeing, not one to make inside a security fix.
 *
 * The CLI is covered by this list, not by the routes: `HttpApiClient` posts to
 * `/api/act`, so a `agent-battle` command that reached one of these ids is
 * refused here exactly as a hand-written request would be.
 */
interface CallerScopedAction {
  readonly id: RegisteredActionId;
  /** The route that runs it with the caller's identity resolved, or null. */
  readonly route: string | null;
}

const CALLER_SCOPED_ACTIONS: readonly CallerScopedAction[] = [
  { id: 'quest.claim' satisfies RegisteredActionId, route: 'POST /api/quests/{id}/claim' },
  { id: 'quest.submit' satisfies RegisteredActionId, route: 'POST /api/quests/{id}/submit' },
  { id: 'quest.admin.revoke' satisfies RegisteredActionId, route: null },
  { id: 'session.create' satisfies RegisteredActionId, route: 'POST /api/sessions' },
  {
    id: 'session.heartbeat' satisfies RegisteredActionId,
    route: 'POST /api/sessions/{id}/heartbeat',
  },
  { id: 'session.end' satisfies RegisteredActionId, route: 'POST /api/sessions/{id}/end' },
  // The four the resource routes already resolve. These were absent because
  // closing them changes the parity contract in `resource-route-parity.test.ts`
  // — that test asserts a route and `/api/act` reach the same command with the
  // same input, and for an action whose identity comes from the credential,
  // `/api/act` reaching it with the body's version is precisely the defect.
  //
  // The parity test already carries the escape hatch this needs: `routeStatus`
  // is written per pair precisely because the two surfaces are NOT expected to
  // answer alike. It is extended the same way here — the pair keeps asserting
  // that both surfaces reach the same COMMAND, which is the part that matters,
  // and drops the assertion that they agree on the caller's identity, which is
  // the part that was the bug.
  { id: 'bounty.fund' satisfies RegisteredActionId, route: 'POST /api/bounties/{id}/fund' },
  { id: 'battle.create' satisfies RegisteredActionId, route: 'POST /api/battles' },
  { id: 'battle.join' satisfies RegisteredActionId, route: 'POST /api/battles/{id}/join' },
];

/** What `/api/act` says about an action that names its caller, or undefined. */
export function callerScopedRefusal(action: string): string | undefined {
  const entry = CALLER_SCOPED_ACTIONS.find((candidate) => candidate.id === action);
  if (entry === undefined) {
    return undefined;
  }
  return entry.route === null
    ? `${action} has no HTTP door: who may run it is a question this repository has not answered.`
    : `${action} takes its caller from the credential, not from the body. Use ${entry.route}.`;
}

async function act(api: ApplicationApi, request: HttpRequest): Promise<HttpResponse> {
  const body = request.body;
  if (typeof body !== 'object' || body === null || !('action' in body)) {
    return json(400, { error: 'body must be { action, input }' });
  }
  const { action, input } = body as { action: unknown; input?: unknown };
  if (typeof action !== 'string') {
    return json(400, { error: '"action" must be a string' });
  }
  if (!isRegisteredActionId(action)) {
    // The API owns this error wording; throwing its class keeps one message
    // rather than a terser second copy that says less to whoever reads it.
    throw new UnknownActionError(action, (await api.discover()).domains ?? []);
  }
  // After the unknown-action check, so a client that misspelled an id is told
  // that rather than told it needs a route. 403 rather than 404: the action
  // exists, this surface will not run it, and a client that reads a 404 as "no
  // such action" would go looking for a spelling that works.
  const refusal = callerScopedRefusal(action);
  if (refusal !== undefined) {
    return json(403, { error: refusal, action });
  }
  return json(200, await api.act(action, input ?? {}));
}

/**
 * The Application API, over the process-wide runtime.
 *
 * The runtime, its bus and its pool all come from `await sharedRuntime()` so that an
 * action taken through this API publishes to the same bus the SSE stream is
 * subscribed to. Building a second runtime here is what made game events
 * invisible to spectators: this used to create its own
 * `createInMemoryEventBus()`, which nothing else could see.
 *
 * The API itself is cached on top of the shared runtime rather than rebuilt per
 * request, because it is a thin object over a runtime that is already shared and
 * rebuilding it would allocate five closures per request for no gain.
 */
let cached: ApplicationApi | undefined;

export async function sharedApi(): Promise<ApplicationApi> {
  if (cached === undefined) {
    const { runtime, bus } = await sharedRuntime();
    cached = createApplicationApi(runtime, bus);
  }
  return cached;
}

/** Releases the runtime's pool. For a graceful shutdown, not per request. */
export async function closeSharedApi(): Promise<void> {
  cached = undefined;
  await closeSharedRuntime();
}
