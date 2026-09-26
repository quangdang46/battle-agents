import { achievementsFeature } from '@battle-agents/achievements';
import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { HttpApiClient, type HttpTransport } from '@battle-agents/cli';
import {
  createInMemoryEventBus,
  createRuntime,
  InMemoryStateStore,
  type Runtime,
} from '@battle-agents/core';
import { createMcpServer } from '@battle-agents/mcp-server';
import { describe, expect, it } from 'vitest';

import { createRoutes, type HttpRequest } from '../../apps/web/src/routes.js';
import type {
  AchievementsRepository,
  AwardedAchievement,
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

  async history(): Promise<readonly never[]> {
    return [];
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

function runtimeWith(repository: AchievementsRepository): Runtime {
  return createRuntime({
    extensions: [achievementsFeature({ repository })],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => NOW,
  });
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
    const api = createApplicationApi(runtimeWith(new Ledger()));
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
    const api = createApplicationApi(runtimeWith(new Ledger()));
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
    const server = createMcpServer({ api: createApplicationApi(runtimeWith(new Ledger())) });
    expect(
      server
        .listTools()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(['act', 'discover', 'inspect', 'observe', 'search']);
  });

  it('describes an achievement action through inspect, which describes and does not run', async () => {
    const api = createApplicationApi(runtimeWith(new Ledger()));
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
    const repository = new Ledger();
    const api = createApplicationApi(runtimeWith(repository));
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
    const repository = new Ledger();
    const runtime = runtimeWith(repository);
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
    const api = createApplicationApi(runtimeWith(new Ledger()));
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
