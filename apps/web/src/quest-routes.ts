import type { ApplicationApi } from '@battle-agents/api';
import type { RegisteredActionId } from '@battle-agents/protocol';

import { describeHttpFailure } from './http-failure.js';
import type { HttpRequest, HttpResponse } from './routes.js';

/**
 * The quest transition routes, as pure functions.
 *
 * Two of them, and the pair is not a subset chosen for convenience: these are the
 * two quest actions whose payload carries a CALLER. `quest.claim` and
 * `quest.submit` both take an `agentId`, and `act()` cannot tell them apart from
 * one the caller made up — the frozen Extension API puts no principal in
 * `RuntimeContext`, so by the time the command runs the transport has discarded
 * whose token was on the request. So the identity is resolved here, where the
 * credential is still in scope, and the command is handed an `agentId` nobody
 * chose.
 *
 * `quest.create` and `quest.list` get no route. Neither names a caller, so
 * `/api/act` runs both correctly, and a route that added a step to reach them
 * would be a second spelling of a command that is not ambiguous.
 *
 * ── Why the field is RESOLVED rather than CHECKED ──────────────────────────
 *
 * `bounty.fund` refuses a body naming somebody else and `POST /api/sessions`
 * refuses one too, and this file does neither. The difference is what the field
 * is. A sponsor is a `users` row named by an id the client kept somewhere else,
 * so a client may legitimately have it and disagreeing with the credential is
 * worth telling it about. A `sessionId` is a HANDLE to a run, and the only
 * question worth asking is whether this run owns it — so the caller names a
 * session, the route asks the ownership query, and a session that is not the
 * caller's is `undefined`, the same answer as one that does not exist. That is
 * the same shape as `bounty.claim`, and it means a client whose session belongs
 * to it works whether or not it also sends the matching `agentId`.
 *
 * ── What has no route, and why ─────────────────────────────────────────────
 *
 * `quest.admin.revoke` is absent, and its absence is the point rather than an
 * oversight. Revoking a quest is an administrator's move, so the interesting
 * question is not "which agentId" but "may this caller revoke at all", and the
 * schema has no column anywhere that answers the second one. A route could only
 * have taken the `agentId` from the body and called that the authorization,
 * which is the hole with a file in front of it. `POST /api/act` refuses the
 * action too (see `CALLER_SCOPED_ACTIONS` in `routes.ts`), so over HTTP the
 * operation has no door at all until somebody writes down who an administrator
 * is. Until then the smaller surface is the honest one.
 */

/** The installation a presented Bearer token resolved to. */
export interface QuestCaller {
  readonly installationId: string;
}

/** A session the caller's installation owns, as the ownership query returns it. */
export interface OwnedSession {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
}

export interface QuestRouteDependencies {
  readonly api: ApplicationApi;
  /**
   * Resolves the Bearer token to an installation. Throws an authentication
   * failure (an `Error` carrying a `reason`) when the token is absent, unknown,
   * revoked, expired or in a URL.
   *
   * REQUIRED rather than optional, for the reason
   * `BountyRouteDependencies.authenticate` is: nothing authenticates a request
   * before it reaches this tree, so an absent authenticator here can only mean
   * "nobody decided", and the right answer to that is a wiring that does not
   * compile.
   */
  readonly authenticate: (request: HttpRequest) => Promise<QuestCaller>;
  /**
   * Finds a session ONLY if the named installation owns it.
   *
   * Ownership lives in the query rather than in a comparison this route could
   * forget: a session belonging to somebody else is `undefined`, the same answer
   * as one that does not exist, so this surface cannot be used to discover which
   * session ids are real either.
   */
  readonly resolveSession: (
    sessionId: string,
    installationId: string,
  ) => Promise<OwnedSession | undefined>;
}

/**
 * The two commands this file reaches, written out rather than imported.
 *
 * `packages/features/quest` exports all five, and this app is not allowed to
 * import a feature outside the composition root: `scripts/removal-test.sh`
 * strips a feature's import from `composition.ts` along with its workspace
 * dependency and path, then typechecks and tests the tree, so a second importer
 * turns "remove a feature" into "edit three files". The `satisfies` is what
 * stops these literals from rotting — the union is generated from every
 * feature's manifest, so a renamed id upstream turns each of these lines into a
 * compile error rather than a route that quietly 404s for everybody.
 */
const QUEST_CLAIM = 'quest.claim' satisfies RegisteredActionId;
const QUEST_SUBMIT = 'quest.submit' satisfies RegisteredActionId;

/** `{id}` is the whole addressable part of a quest, so one segment matches. */
const TRANSITIONS: readonly (readonly [RegExp, 'claim' | 'submit'])[] = [
  [/^\/api\/quests\/([^/]+)\/claim$/, 'claim'],
  [/^\/api\/quests\/([^/]+)\/submit$/, 'submit'],
];

export function createQuestRoutes(
  dependencies: QuestRouteDependencies,
): (request: HttpRequest) => Promise<HttpResponse> {
  return async (request: HttpRequest) => {
    const url = new URL(request.url);
    try {
      // Authenticate first, before the path is even looked at, so a request
      // for a quest route with no token is a 401 rather than a 404 that reads
      // like "this surface is not here".
      const caller = await dependencies.authenticate(request);

      if (request.method === 'POST') {
        for (const [pattern, step] of TRANSITIONS) {
          // The match and the decode are told apart, because they are two
          // different refusals: a path this surface does not address is a 404,
          // and a `%` that is not valid percent-encoding in a path that IS
          // addressed is a 400. Collapsing them would answer a client that built
          // its URL wrong with "not found", which is a different mistake.
          const segment = pattern.exec(url.pathname)?.[1];
          if (segment === undefined) {
            continue;
          }
          const questId = decodeSegment(segment);
          if (questId === undefined) {
            return { status: 400, body: { error: 'quest id is not a valid URL segment' } };
          }
          // Awaited, not returned bare: a promise returned from inside a `try` is
          // awaited by the CALLER, outside this block, so a rejection from the
          // command would escape `describeHttpFailure` and reach Next.js as an
          // unhandled rejection — a 500 with no body.
          return await transition(dependencies, request, caller, questId, step);
        }
      }
      return { status: 404, body: { error: 'not found', path: url.pathname } };
    } catch (error) {
      return describeHttpFailure(error);
    }
  };
}

/**
 * `POST /api/quests/{id}/claim` and `.../submit` — the same shape, twice.
 *
 * The order is the contract, and it is the order `bounty-routes.ts` uses:
 * authenticate, resolve ownership, act. What the command receives is the quest
 * id from the PATH and the agent from the OWNED SESSION, never an `agentId` the
 * caller wrote in the body. The two are the same function because the two
 * actions are the same operation with a different verb, and a second copy is a
 * second place for the identity check to be left out of.
 *
 * A submit carries nothing else. There is no evidence field on this feature, so
 * a route that grew one would be inventing vocabulary the game has not agreed
 * on.
 */
async function transition(
  dependencies: QuestRouteDependencies,
  request: HttpRequest,
  caller: QuestCaller,
  questId: string,
  step: 'claim' | 'submit',
): Promise<HttpResponse> {
  const actor = await ownedSession(dependencies, request, caller);
  if ('error' in actor) {
    return actor.error;
  }
  return {
    status: 200,
    body: await dependencies.api.act(step === 'claim' ? QUEST_CLAIM : QUEST_SUBMIT, {
      questId,
      agentId: actor.session.agentId,
    }),
  };
}

/**
 * The caller's own agent, or the refusal that replaces it.
 *
 * A body with no usable `sessionId` is a 400 — a client that built the request
 * wrong, not a server fault — and it is answered before the store is asked
 * anything, so a malformed request costs no query. A session that is not the
 * caller's is a 404, and deliberately the SAME 404 a session that does not exist
 * gets, so this route cannot be used to tell a real session id from an invented
 * one.
 */
async function ownedSession(
  dependencies: QuestRouteDependencies,
  request: HttpRequest,
  caller: QuestCaller,
): Promise<{ session: OwnedSession } | { error: HttpResponse }> {
  const sessionId = stringField(request.body, 'sessionId');
  if (sessionId === undefined) {
    return { error: { status: 400, body: { error: 'body must carry a sessionId string' } } };
  }
  const session = await dependencies.resolveSession(sessionId, caller.installationId);
  return session === undefined
    ? { error: { status: 404, body: { error: 'no such session' } } }
    : { session };
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
 * `undefined` for a segment that is not valid percent-encoding, which the caller
 * turns into a 400 rather than a thrown `URIError` that reads as a 500 and tells
 * the client the platform is broken when it built the URL wrong.
 */
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}
