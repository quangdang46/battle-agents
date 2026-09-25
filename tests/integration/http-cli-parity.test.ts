import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { HttpApiClient, type HttpTransport } from '@battle-agents/cli';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import { createRoutes, type HttpRequest } from '../../apps/web/src/routes.js';

/**
 * The HTTP surface and the CLI, against one Application API.
 *
 * The brief called this "a comparison of two calls into one object", and that
 * framing is out of date: `packages/cli` is an HTTP client now, not an
 * in-process consumer, so parity is a WIRE property and has to be tested over
 * the wire. The bridge below is the test — an `HttpTransport` whose `send`
 * builds the `HttpRequest` a route adapter would build and hands it to
 * `createRoutes`, with no network and no server.
 *
 * The property is not that the two return equal values for equal input, which a
 * test could arrange by making both sides trivial. It is that a caller cannot
 * tell which surface it used: for every primitive, the answer through the
 * bridge is the answer the API gave. If a route dropped a query parameter, or
 * the client spelled a path differently, or either side started reshaping a
 * payload, one of these stops matching.
 *
 * What this does NOT cover, and the reason it is worth saying: the five
 * primitives are not mounted in the Next.js app tree, so a running server still
 * 404s on all four. This proves the two surfaces agree; it does not prove
 * either is reachable. That gap is separate and is recorded as such.
 *
 * It lives here rather than beside `routes.ts` for one reason: it is the only
 * test in the tree that needs `@battle-agents/cli`, and adding that to the web
 * app's dependencies would make the server depend on a client of itself to
 * assert something about itself. The integration stage already resolves every
 * workspace package from source, so the import costs nothing where it is.
 */

const ORIGIN = 'https://agentbattle.test';
const NOW = '2026-09-26T00:00:00.000Z';

const FIXTURE = {
  id: 'quest',
  capabilities: [{ name: 'quest.read', description: 'reads quests' }],
  actionDefs: [
    defineAction({
      id: 'quest.claim',
      permissions: ['quest.claim'],
      run: async (input: { id: string }) => ({ claimed: input.id }),
    }),
    defineAction({
      id: 'quest.list',
      permissions: ['quest.read'],
      run: async () => ({ quests: [] }),
    }),
  ],
};

function fixtureApi(): ApplicationApi {
  return createApplicationApi(
    createRuntime({
      extensions: [FIXTURE],
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => NOW,
    }),
  );
}

/**
 * The bridge. The only thing this file knows how to do is turn a transport
 * request into the pure dispatcher and back, which is the whole translation a
 * real deployment makes.
 */
function bridge(api: ApplicationApi): HttpTransport & { readonly calls: number } {
  const handle = createRoutes({ api });
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async send({ method, path, query, body, token }) {
      state.calls += 1;
      const url = new URL(path);
      for (const [name, value] of Object.entries(query ?? {})) {
        url.searchParams.set(name, value);
      }
      const request: HttpRequest = {
        method,
        url: url.toString(),
        headers: { get: (name) => (name === 'authorization' ? (token ?? null) : null) },
        ...(body === undefined ? {} : { body }),
      };
      const response = await handle(request);
      return { status: response.status, body: response.body };
    },
  };
}

describe('HTTP and the CLI, over one Application API', () => {
  it('answers discover the same either way, with and without a domain', async () => {
    const api = fixtureApi();
    const transport = bridge(api);
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport });

    expect(await cli.discover()).toEqual(await api.discover());
    expect(await cli.discover('quest')).toEqual(await api.discover('quest'));
    // Two calls reached the dispatcher. Asserted because "both sides returned
    // the same value" is also true of a bridge that answered from a cache and
    // never asked.
    expect(transport.calls).toBe(2);
  });

  it('answers search the same either way, with and without a name filter', async () => {
    const api = fixtureApi();
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });

    expect(await cli.search({ type: 'quest' })).toEqual(await api.search({ type: 'quest' }));
    expect(await cli.search({ type: 'quest', name: 'claim' })).toEqual(
      await api.search({ type: 'quest', name: 'claim' }),
    );
    expect(await cli.search({ type: 'quest', name: 'nothing-matches-this' })).toEqual(
      await api.search({ type: 'quest', name: 'nothing-matches-this' }),
    );
  });

  it('answers inspect the same either way', async () => {
    const api = fixtureApi();
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });

    expect(await cli.inspect({ type: 'quest', id: 'claim' })).toEqual(
      await api.inspect({ type: 'quest', id: 'claim' }),
    );
    // An action that is not there, because inspect describes and does not run.
    expect(await cli.inspect({ type: 'quest', id: 'nope' })).toEqual(
      await api.inspect({ type: 'quest', id: 'nope' }),
    );
  });

  it('has act reach the same command on both sides, and run it once', async () => {
    const runs: unknown[] = [];
    const api = createApplicationApi(
      createRuntime({
        extensions: [
          {
            id: 'quest',
            capabilities: [{ name: 'quest.read', description: 'reads quests' }],
            actionDefs: [
              defineAction({
                id: 'quest.claim',
                permissions: ['quest.claim'],
                run: async (input: { id: string }) => {
                  runs.push(input);
                  return { claimed: input.id };
                },
              }),
            ],
          },
        ],
        store: new InMemoryStateStore(),
        bus: createInMemoryEventBus(),
        now: () => NOW,
      }),
    );
    const transport = bridge(api);
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport });

    const overHttp = await cli.act('quest.claim', { id: 'quest-1' });
    const direct = await api.act('quest.claim', { id: 'quest-1' });

    expect(overHttp).toEqual(direct);
    // Two acts, two runs, same payload. A route that reshaped the input — a
    // wrapper, a renamed field, an input dropped on the floor — shows up here
    // and in almost nowhere else.
    expect(runs).toEqual([{ id: 'quest-1' }, { id: 'quest-1' }]);
    expect(transport.calls).toBe(1);
  });

  it('refuses an unknown action the same way on both surfaces', async () => {
    const api = fixtureApi();
    const transport = bridge(api);
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport });

    // The API throws UnknownActionError; the route turns that into a 404; the
    // client turns a 404 back into an ApiError carrying the same status. Asserted
    // as a class and a status because a caller that gets a 500 here would retry
    // a spelling mistake forever.
    // Cast, because the point of the case is an id the union does not carry —
    // which is exactly what a caller gets from a typo, and the only way to hand
    // one to a signature that is supposed to forbid it.
    const TYPO = 'quest.tpyo' as Parameters<ApplicationApi['act']>[0];
    const overHttp = await cli.act(TYPO, {}).catch((error: unknown) => error);
    const direct = await api.act(TYPO, {}).catch((error: unknown) => error);

    expect(overHttp).toBeInstanceOf(Error);
    expect(direct).toBeInstanceOf(Error);
    expect((overHttp as { status: number }).status).toBe(404);
    // The client prefixes its own status and path, so equality would be the
    // wrong assertion; what has to survive is the API's own wording, because
    // that is the sentence that tells the caller which spelling to fix.
    expect((overHttp as Error).message).toContain((direct as Error).message);
  });

  it('turns a rejected credential into a 401 the client can act on', async () => {
    // The route's own refusal is covered in routes.test.ts; what is asserted
    // here is the half only this test can see — that the 401 survives the
    // client boundary with its status and its reason attached. A client that
    // reported it as a 500 would send a command into a retry loop against a
    // credential that will never be accepted.
    const handle = createRoutes({
      api: fixtureApi(),
      authenticate: async () => {
        throw Object.assign(new Error('credential refused: expired'), { reason: 'expired' });
      },
    });
    const cli = new HttpApiClient({
      baseUrl: ORIGIN,
      transport: {
        send: async ({ method, path, body }) => {
          const response = await handle({
            method,
            url: `${ORIGIN}${path}`,
            headers: { get: () => null },
            ...(body === undefined ? {} : { body }),
          });
          return { status: response.status, body: response.body };
        },
      },
    });

    const error = await cli.discover().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as { status: number }).status).toBe(401);
    expect((error as Error).message).toContain('expired');
  });
});

describe('the bridge itself', () => {
  it('passes a query parameter through to the answer rather than dropping it', async () => {
    // A bridge that ignored `query` would make the search and inspect parity
    // assertions above pass vacuously — both sides would be asked the
    // unfiltered question and still agree. The filter has to reach the API for
    // them to mean anything.
    const api = fixtureApi();
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });

    const filtered = await cli.search({ type: 'quest', name: 'claim' });
    const unfiltered = await cli.search({ type: 'quest' });

    expect(filtered).toHaveLength(1);
    expect(unfiltered).toHaveLength(2);
  });

  it('carries a request body, because a POST that dropped it would answer from nothing', async () => {
    // Two different ids, two different answers. A bridge that dropped the body
    // would reach the action with `{}`, and the action would answer for an
    // undefined id — the same value both times.
    const api = fixtureApi();
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });

    expect(await cli.act('quest.claim', { id: 'quest-1' })).toEqual({ claimed: 'quest-1' });
    expect(await cli.act('quest.claim', { id: 'quest-2' })).toEqual({ claimed: 'quest-2' });
  });
});
