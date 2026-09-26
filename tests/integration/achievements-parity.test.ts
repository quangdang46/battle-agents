import { achievementsFeature } from '@battle-agents/achievements';
import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { HttpApiClient, type HttpTransport } from '@battle-agents/cli';
import {
  createInMemoryEventBus,
  createRuntime,
  InMemoryStateStore,
  type GameFeature,
  type Runtime,
  type StateStore,
} from '@battle-agents/core';
import { createMcpServer } from '@battle-agents/mcp-server';
import { describe, expect, it } from 'vitest';

import { createRoutes, type HttpRequest } from '../../apps/web/src/routes.js';
import type {
  AchievementsRepository,
  AwardedAchievement,
  RecordedRow,
} from '../../packages/features/achievements/src/index.js';

/**
 * The award command, through CLI, HTTP and MCP, over the five frozen
 * primitives.
 *
 * The bead asks for parity here and the claim is narrow: a badge is reachable
 * identically from every surface, adding achievements grew the REGISTRY and not
 * the tool list, and there is no sixth primitive. What it does not claim is
 * that the surfaces are mounted in the app tree — the five primitives 404 on a
 * running server, which tests/integration/http-cli-parity.test.ts records as a
 * separate gap and this file inherits.
 *
 * It lives beside that file rather than next to the feature for the same
 * reason: it is the only test in the tree that needs `@battle-agents/cli`, and
 * putting that in the web app's dependencies would make the server depend on a
 * client of itself to assert something about itself. `tests/` is outside the
 * architecture engine's source roots, so a test that reaches across layers here
 * is a test, not a rule violation.
 *
 * The repository is a plain in-memory ledger because this file is about the
 * SURFACE, and the derivation from the log is proven where the log is real:
 * tests/integration/achievements-repository.test.ts and
 * packages/features/achievements/src/feature.test.ts.
 */

const ORIGIN = 'https://agentbattle.test';
const NOW = '2026-09-26T10:00:00.000Z';
const AGENT = '11111111-1111-1111-1111-111111111111';

/** What the catalogue and the sheet answer with, held in memory. */
class Ledger implements AchievementsRepository {
  readonly rows: AwardedAchievement[] = [];
  /**
   * What the feature is meant to read, and NOT a stub returning nothing.
   *
   * The rules derive a badge by counting recorded outcomes, so a history that
   * answers [] can never award one — and the parity test below awards by
   * EMITTING, on the assumption that reaching the feature is the thing under
   * test. With an empty history that emission went nowhere and the test failed
   * on a double that could not represent the store.
   */
  #store: StateStore;
  constructor(store: StateStore) {
    this.#store = store;
  }

  /**
   * A PROJECTION READER over the state store, not a listener.
   *
   * The first version of this double observed the bus, which is one step too
   * late and can never work: `emit` runs handlers BEFORE it publishes, and the
   * rules read this port while the handler is running. A bus-observing double is
   * therefore always empty at the moment it is asked, and the badge is never
   * awarded. The feature's own suite hit the same wall and answered it with a
   * store-backed reader.
   */
  async history(agentId: string, eventTypes: readonly string[]): Promise<readonly RecordedRow[]> {
    return (this.#store as InMemoryStateStore)
      .recorded()
      .filter((event) => eventTypes.includes(event.type))
      .filter((event) => namedAgentIdOf(event) === agentId)
      .map((event, index) => ({
        sequence: index + 1,
        type: event.type,
        sessionId: null,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        payload: (event.payload ?? {}) as Readonly<Record<string, unknown>>,
      }));
  }

  async list(agentId: string): Promise<readonly AwardedAchievement[]> {
    return this.rows.filter((row) => row.agentId === agentId);
  }

  async award(agentId: string, code: AwardedAchievement['code'], now: string): Promise<boolean> {
    if (this.rows.some((row) => row.agentId === agentId && row.code === code)) return false;
    this.rows.push({ agentId, code, awardedAt: now });
    return true;
  }
}

function runtimeWith(repository: AchievementsRepository, store: InMemoryStateStore): Runtime {
  return createRuntime({
    // The widening feature is what makes this test possible at all, and its
    // absence is the second half of why the badge was missing. `bounty.completed`
    // belongs to the bounty feature, so achievements cannot declare it, and the
    // registry allows one owner per persisted type. Without something widening
    // the filter the event is never PERSISTED, and a reader that reads the store
    // has nothing to read. This is a real constraint of the real system, not a
    // test artefact — which is why the feature's own suite carries the same
    // shape.
    extensions: [achievementsFeature({ repository }), widenPersistedTypes()],
    store,
    bus: createInMemoryEventBus(),
    now: () => NOW,
  });
}

/**
 * A runtime with nothing awarded yet, for the tests that only ask whether a
 * surface can FIND the capability.
 *
 * The store is created once and handed to both the repository and the runtime,
 * because two stores is a test that cannot see the event it emitted — which is
 * the failure this shape replaces.
 */
function bareRuntime(): Runtime {
  const store = new InMemoryStateStore();
  return runtimeWith(new Ledger(store), store);
}

/**
 * Stands in for the bounty feature, which owns `bounty.completed` in the real
 * build. Reacting to an event is not owning it, and this one only declares the
 * persisted type so the row survives to be read.
 */
function widenPersistedTypes(): GameFeature {
  return { id: 'widen-bounty-completed', persistedEvents: ['bounty.completed'] };
}

function namedAgentIdOf(event: { readonly payload?: unknown }): string | undefined {
  const payload = event.payload as Readonly<Record<string, unknown>> | undefined;
  const named = payload?.['agentId'];
  return typeof named === 'string' ? named : undefined;
}

/** The same bridge http-cli-parity.test.ts uses: no network, no server. */
function bridge(api: ApplicationApi): HttpTransport {
  const handle = createRoutes({ api });
  return {
    async send({ method, path, query, body, token }) {
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

describe('achievements grows the registry, not the surface', () => {
  it('is found by search on every surface, as the bead says it should be', async () => {
    // "`achievements list` becomes a search over the achievements domain" is the
    // CLI verb arriving through `search` rather than as a tool of its own, so
    // the search has to find it. Search is a name lookup over the catalogue and
    // never reaches a store, which is why this works before anything is awarded.
    const api = createApplicationApi(bareRuntime());
    const found = await api.search({ type: 'achievements' });
    expect(found.map((entry) => entry.id).sort()).toEqual([
      'achievements.catalogue',
      'achievements.list',
      'achievements.project',
    ]);
    expect(await api.search({ type: 'achievements', name: 'list' })).toEqual([
      { id: 'achievements.list', name: 'list' },
    ]);
  });

  it('describes the domain without naming a sixth primitive', async () => {
    const api = createApplicationApi(bareRuntime());
    const detail = await api.discover('achievements');
    expect(detail.detail?.capabilities.map((entry) => entry.name).sort()).toEqual([
      'achievements.catalogue',
      'achievements.read',
    ]);
    expect(detail.detail?.actions.map((entry) => entry.id)).toContain('achievements.list');
    // The top-level catalogue grew by one domain and lost nothing.
    expect((await api.discover()).domains).toEqual(['achievements']);
  });

  it('exposes exactly the five primitives over MCP, with no tool per achievement', async () => {
    // A tool per badge, or a tool per feature, is the failure the registry was
    // built to prevent: the tool list is what a model has to read at connect
    // time, and it grows with the game otherwise.
    const server = createMcpServer({ api: createApplicationApi(bareRuntime()) });
    expect(
      server
        .listTools()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(['act', 'discover', 'inspect', 'observe', 'search']);
  });

  it('describes an achievement action through inspect, which describes and does not run', async () => {
    const api = createApplicationApi(bareRuntime());
    const described = (await api.inspect({ type: 'achievements', id: 'list' })) as {
      found: boolean;
      permissions: readonly string[];
    };
    expect(described.found).toBe(true);
    expect(described.permissions).toEqual(['achievements.read']);
  });
});

describe('the same award command on all three surfaces', () => {
  it('reaches one implementation from the API, the CLI over HTTP, and MCP', async () => {
    const store = new InMemoryStateStore();
    const repository = new Ledger(store);
    const api = createApplicationApi(runtimeWith(repository, store));
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });
    const server = createMcpServer({ api });

    const direct = await api.act('achievements.list', { agentId: AGENT });
    const overHttp = await cli.act('achievements.list', { agentId: AGENT });
    const overMcp = await server.callTool('act', {
      action: 'achievements.list',
      input: { agentId: AGENT },
    });

    expect(overMcp.ok).toBe(true);
    expect(overHttp).toEqual(direct);
    expect(overMcp.value).toEqual(direct);
  });

  it('reports the same badges after an award, whichever surface asked', async () => {
    // The read above is trivially equal for an agent holding nothing. This one
    // awards first, so a route that dropped the body, a client that spelled the
    // path differently, or a projection that only ran on one of the three would
    // show up as a different answer rather than as three identical empty ones.
    const store = new InMemoryStateStore();
    const repository = new Ledger(store);
    const runtime = runtimeWith(repository, store);
    await runtime.emit({
      type: 'bounty.completed',
      occurredAt: NOW,
      actorId: 'bounty',
      payload: { agentId: AGENT, bountyId: 'b-1' },
    });

    const api = createApplicationApi(runtime);
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });
    const server = createMcpServer({ api });

    const direct = (await api.act('achievements.list', { agentId: AGENT })) as {
      badges: readonly { code: string; title: string | null }[];
    };
    expect(direct.badges.map((badge) => badge.code)).toEqual(['first-bounty.v1']);
    // The wording is looked up on the way out rather than read off the row, and
    // it is the same sentence on every surface.
    expect(direct.badges[0]?.title).toBe('First Bounty');

    expect(await cli.act('achievements.list', { agentId: AGENT })).toEqual(direct);
    const overMcp = await server.callTool('act', {
      action: 'achievements.list',
      input: { agentId: AGENT },
    });
    expect(overMcp.ok).toBe(true);
    expect(overMcp.value).toEqual(direct);
  });

  it('refuses a malformed award the same way on all three', async () => {
    const api = createApplicationApi(bareRuntime());
    const cli = new HttpApiClient({ baseUrl: ORIGIN, transport: bridge(api) });
    const server = createMcpServer({ api });

    const direct = await api.act('achievements.list', {}).catch((error: unknown) => error);
    const overHttp = await cli.act('achievements.list', {}).catch((error: unknown) => error);
    const overMcp = await server.callTool('act', { action: 'achievements.list', input: {} });

    expect(direct).toBeInstanceOf(Error);
    expect(overHttp).toBeInstanceOf(Error);
    expect(overMcp.ok).toBe(false);
    // The API's own wording survives both translations, because that is the
    // sentence that tells a caller which field to fix.
    expect((overHttp as Error).message).toContain((direct as Error).message);
    expect(JSON.stringify(overMcp)).toContain('agent-id-not-a-string');
  });
});
