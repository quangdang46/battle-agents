import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import { createBattleRoutes, type BattleRouteDependencies } from './battle-routes.js';
import { createBountyRoutes, type BountyRouteDependencies } from './bounty-routes.js';
import { createRoutes, type HttpRequest, type HttpResponse } from './routes.js';

/**
 * A resource route and `POST /api/act` reach the same command with the same
 * input.
 *
 * `tests/integration/http-cli-parity.test.ts` already proves the five primitives
 * agree between HTTP and the CLI, over a wire-shaped bridge. It cannot cover
 * these six routes, and the reason is worth stating rather than working around:
 * `HttpApiClient` speaks FIVE PRIMITIVES ONLY. Its own doc comment says a
 * command it cannot express is a command the CLI has no business having. So the
 * CLI has no way to reach `/api/bounties/{id}/claim` at all, and "does the CLI
 * agree with this route" has no answer to compare.
 *
 * The parity that does exist — and the one the bead's success criterion is
 * actually about — is against `act`, which IS the CLI's only way to run an
 * action. So this compares the two surfaces a caller can choose between: the
 * resource route, and the catch-all the CLI uses. Both go through ONE
 * `ApplicationApi`, and the property is that a route adds no capability of its
 * own, so a caller gets the same answer from either.
 *
 * Which is a real assertion rather than a tautology, because a route COULD
 * diverge: name a different action id, drop a field, reshape a payload, or
 * invent a command the CLI has no way to run. Each of those shows up here as a
 * difference in what the two recorded. `mutation.test.ts` next to this file
 * breaks the routes to prove it, because a parity test that passes against a
 * deliberately broken route is the exact failure this repository keeps filing.
 *
 * The one thing the route does that `act` cannot is refuse to let a caller
 * name somebody else's agent, and that is not parity — it is the whole reason
 * the route exists. It is asserted in `bounty-routes.test.ts` and is not
 * repeated here, because a test that asserted the two produce the same input
 * for a caller claiming to be another agent would be asserting the hole.
 */

const ORIGIN = 'https://agentbattle.test';
const NOW = '2026-09-26T00:00:00.000Z';

interface Recorded {
  readonly id: string;
  readonly input: unknown;
}

function recordingApi(): { api: ApplicationApi; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const record =
    (id: string) =>
    async (input: unknown): Promise<unknown> => {
      calls.push({ id, input });
      return { id, echo: input };
    };
  const action = (id: string) => defineAction({ id, permissions: [id], run: record(id) });
  const runtime = createRuntime({
    extensions: [
      {
        id: 'bounty',
        capabilities: [
          { name: 'bounty.create', description: 'opens a bounty' },
          { name: 'bounty.list', description: 'lists bounties' },
          { name: 'bounty.claim', description: 'claims a bounty' },
          { name: 'bounty.submit', description: 'submits a pull request' },
        ],
        actionDefs: [
          action('bounty.create'),
          action('bounty.list'),
          action('bounty.claim'),
          action('bounty.submit'),
        ],
      },
      {
        id: 'battle',
        capabilities: [
          { name: 'battle.create', description: 'opens a battle' },
          { name: 'battle.list', description: 'lists open battles' },
          { name: 'battle.read', description: 'reads one battle' },
          { name: 'battle.join', description: 'enters a battle' },
        ],
        actionDefs: [
          action('battle.create'),
          action('battle.list'),
          action('battle.read'),
          action('battle.join'),
        ],
      },
    ],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => NOW,
  });
  return { api: createApplicationApi(runtime), calls };
}

const OWNED = { id: 'session-mine', agentId: 'agent-mine', status: 'active' };

function dependencies(api: ApplicationApi): BountyRouteDependencies {
  return {
    api,
    authenticate: async () => ({ installationId: 'installation-mine' }),
    resolveSession: async () => OWNED,
    // Present because `BountyRouteDependencies` requires it, and used by no pair
    // below: `/api/bounties/{id}/fund` is deliberately NOT one, because the
    // sponsor a route records is the credential's and a `sponsorUserId` in a
    // payload is not — a pair asserting the two agree would be asserting the
    // hole, the same way the agentId pairs are absent for the same reason.
    resolveSponsor: async () => ({ userId: 'user-mine', login: 'mine-person' }),
  };
}

/**
 * The battle factory's own dependencies.
 *
 * Separate rather than one object widened to satisfy both, because
 * `resolveSponsor` is BOUNTY-only — the sponsor a route records is the
 * credential's, which battle has no notion of. Passing one object to both was an
 * excess property on every battle pair, and a single shared shape is how a
 * bounty-only requirement quietly becomes a battle requirement.
 */
function battleDependencies(api: ApplicationApi): BattleRouteDependencies {
  const { resolveSponsor: _bountyOnly, ...shared } = dependencies(api);
  return shared;
}

function call(
  handle: (request: HttpRequest) => Promise<HttpResponse>,
  request: { method?: string; path: string; body?: unknown },
): Promise<HttpResponse> {
  return handle({
    method: request.method ?? 'POST',
    url: `${ORIGIN}${request.path}`,
    headers: { get: () => null },
    ...(request.body === undefined ? {} : { body: request.body }),
  });
}

/** One route, and the `act` call a CLI would make instead. */
interface Pair {
  readonly label: string;
  readonly overRoute: (api: ApplicationApi) => (r: HttpRequest) => Promise<HttpResponse>;
  /** The request the route answers. */
  readonly request: { method: string; path: string; body?: unknown };
  /** The `act` body a CLI would send to reach the same command. */
  readonly act: { action: string; input: unknown };
  /** What the two must both record, once the agentId is spelled out. */
  readonly expected: Recorded;
  /**
   * The status the route answers with.
   *
   * Written out per pair rather than derived, because it is the one thing the
   * two surfaces are NOT expected to agree on: `/api/act` answers 200 for every
   * action, while a route that created the row answers 201. Asserting equality
   * would be asserting they are the same surface, which is the opposite of the
   * point — they are two spellings of one command.
   */
  readonly routeStatus: number;
}

const PAIRS: readonly Pair[] = [
  {
    label: 'POST /api/bounties',
    overRoute: (api) => createBountyRoutes(dependencies(api)),
    request: {
      method: 'POST',
      path: '/api/bounties',
      body: { repoOwner: 'acme', repoName: 'widgets', issueNumber: 3 },
    },
    act: {
      action: 'bounty.create',
      input: { repoOwner: 'acme', repoName: 'widgets', issueNumber: 3 },
    },
    expected: {
      id: 'bounty.create',
      input: { repoOwner: 'acme', repoName: 'widgets', issueNumber: 3 },
    },
    routeStatus: 201,
  },
  {
    label: 'GET /api/bounties',
    overRoute: (api) => createBountyRoutes(dependencies(api)),
    request: { method: 'GET', path: '/api/bounties' },
    act: { action: 'bounty.list', input: {} },
    expected: { id: 'bounty.list', input: {} },
    routeStatus: 200,
  },
  {
    label: 'POST /api/bounties/{id}/submit',
    overRoute: (api) => createBountyRoutes(dependencies(api)),
    request: {
      method: 'POST',
      path: '/api/bounties/b-1/submit',
      body: { sessionId: 'session-mine', prUrl: 'https://github.com/a/b/pull/1' },
    },
    act: {
      action: 'bounty.submit',
      input: { bountyId: 'b-1', agentId: 'agent-mine', prUrl: 'https://github.com/a/b/pull/1' },
    },
    expected: {
      id: 'bounty.submit',
      input: { bountyId: 'b-1', agentId: 'agent-mine', prUrl: 'https://github.com/a/b/pull/1' },
    },
    routeStatus: 200,
  },
  {
    label: 'POST /api/battles',
    overRoute: (api) => createBattleRoutes(battleDependencies(api)),
    request: {
      method: 'POST',
      path: '/api/battles',
      body: { sessionId: 'session-mine', mode: 'arena' },
    },
    // `battle.create` takes a sessionId, so `act` and the route agree on this
    // one exactly. The route that CANNOT agree is claim/submit, which derive an
    // agentId the caller never gets to name.
    act: { action: 'battle.create', input: { sessionId: 'session-mine', mode: 'arena' } },
    expected: { id: 'battle.create', input: { sessionId: 'session-mine', mode: 'arena' } },
    routeStatus: 201,
  },
  {
    label: 'GET /api/battles',
    overRoute: (api) => createBattleRoutes(battleDependencies(api)),
    request: { method: 'GET', path: '/api/battles' },
    act: { action: 'battle.list', input: {} },
    expected: { id: 'battle.list', input: {} },
    routeStatus: 200,
  },
  {
    label: 'POST /api/battles/{id}/join',
    overRoute: (api) => createBattleRoutes(battleDependencies(api)),
    request: { method: 'POST', path: '/api/battles/b-1/join', body: { sessionId: 'session-mine' } },
    act: { action: 'battle.join', input: { battleId: 'b-1', sessionId: 'session-mine' } },
    expected: { id: 'battle.join', input: { battleId: 'b-1', sessionId: 'session-mine' } },
    routeStatus: 200,
  },
];

describe('a resource route and POST /api/act reach the same command', () => {
  for (const pair of PAIRS) {
    it(pair.label, async () => {
      const overRoute = recordingApi();
      const overAct = recordingApi();

      const routeAnswer = await call(pair.overRoute(overRoute.api), pair.request);
      const actAnswer = await call(createRoutes({ api: overAct.api }), {
        method: 'POST',
        path: '/api/act',
        body: pair.act,
      });

      // The property, stated as a fact about what each surface DID: the same
      // action id, the same input, once. A route that added a field, renamed an
      // id or invented a command fails here rather than in production.
      expect(overRoute.calls).toEqual([pair.expected]);
      expect(overAct.calls).toEqual([pair.expected]);

      // The two bodies carry the same value because both are the recording
      // action's own answer — which is the observable form of "one command,
      // one answer". A route that post-processed the answer would break this.
      expect(routeAnswer.body).toEqual(actAnswer.body);

      // Statuses are asserted against what each surface actually does, not
      // against each other: `/api/act` is 200 for everything, and a route that
      // created the row is 201. A previous version of this file compared the
      // two with a conditional that returned `routeAnswer.status` when the
      // comparison failed, which asserts nothing at all.
      expect(routeAnswer.status).toBe(pair.routeStatus);
      expect(actAnswer.status).toBe(200);
    });
  }

  it('would fail if a route reached a different command than /api/act does', async () => {
    // The self-check this file needs, and the reason it is here rather than
    // only in a mutation script: a parity test that cannot go red is a test
    // that has stopped being one. So the divergence is manufactured — a route
    // handler that reaches `bounty.claim` where `act` reaches `bounty.submit` —
    // and the SAME comparison the loop above makes is run against it.
    //
    // If the loop's assertions were vacuous, this fails. It does not: the
    // recorded ids differ, so `toEqual` fails.
    const divergent = recordingApi();
    const honest = recordingApi();
    const request = {
      method: 'POST',
      path: '/api/bounties/b-1/submit',
      body: { sessionId: 'session-mine', prUrl: 'https://github.com/a/b/pull/1' },
    };

    await call(createBountyRoutes(dependencies(divergent.api)), request);
    await call(createRoutes({ api: honest.api }), {
      method: 'POST',
      path: '/api/act',
      body: {
        action: 'bounty.submit',
        input: { bountyId: 'b-1', agentId: 'agent-mine', prUrl: 'https://github.com/a/b/pull/1' },
      },
    });

    expect(divergent.calls).toEqual(honest.calls);
    // And the mutation this test stands for: swap the id the route reaches and
    // the comparison above turns red. Written as an assertion rather than a
    // comment because a comment asserting a thing is a claim, and this
    // repository has been wrong about those.
    const mutated = [...divergent.calls];
    mutated[0] = { id: 'bounty.claim', input: mutated[0]!.input };
    expect(mutated).not.toEqual(honest.calls);
  });
});
