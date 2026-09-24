import { createApplicationApi, PRIMITIVES } from '@battle-agents/api';
import type { ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';

import { describe, expect, it } from 'vitest';

import { createMcpServer, type NotificationSink } from './server.js';

/** Two domains, so "the tool list did not grow" is observable. */
function apiWith(extensionCount: number): ApplicationApi {
  return createApplicationApi(
    createRuntime({
      // Real domains and real ids, because act() now validates against the
      // ids this build registers. An invented fixture cannot reach act() at all,
      // which is the union working rather than the test being awkward.
      extensions: FIXTURE_DOMAINS.slice(0, extensionCount).map((entry) => ({
        id: entry.domain,
        capabilities: [{ name: `${entry.domain}.read`, description: `reads ${entry.domain}` }],
        actionDefs: [
          defineAction({
            id: `${entry.domain}.${entry.verb}`,
            permissions: [`${entry.domain}.${entry.verb}`],
            run: async (input: { args: string }) => ({ claimed: input.args }),
          }),
        ],
      })),
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => '2026-09-24T12:00:00.000Z',
    }),
  );
}

const FIXTURE_DOMAINS = [
  { domain: 'quest', verb: 'claim' },
  { domain: 'reputation', verb: 'read' },
  { domain: 'progression', verb: 'read' },
] as const;

function serverWith(extensionCount: number, notify?: NotificationSink) {
  return createMcpServer({
    api: apiWith(extensionCount),
    ...(notify === undefined ? {} : { notify }),
  });
}

describe('the tool list is five and stays five', () => {
  it('is exactly the five primitives', () => {
    const server = serverWith(1);

    expect(server.listTools().map((tool) => tool.name)).toEqual([...PRIMITIVES]);
  });

  it('does not grow when features are installed', () => {
    // The bead's success criterion, stated as a test. If somebody adds a sixth
    // tool for one feature, this fails and names the count.
    const before = serverWith(1).listTools().length;
    const after = serverWith(25).listTools().length;

    expect(before).toBe(5);
    expect(after).toBe(5);
  });

  it('names no game domain, so no tool can exist for one', () => {
    const server = serverWith(3);
    const names = server
      .listTools()
      .flatMap((tool) => [tool.name, tool.description])
      .join(' ');
    const reserved = /\b(quest|battle|bounty|guild|agent)\b/i;

    expect(names).not.toMatch(reserved);
  });
});

describe('discovering lazily', () => {
  it('returns domain names only when given no domain', async () => {
    const result = await serverWith(3).callTool('discover', {});

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ domains: ['progression', 'quest', 'reputation'] });
  });

  it('returns one domain in full when asked', async () => {
    const result = await serverWith(2).callTool('discover', { domain: 'reputation' });

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      detail: { actions: [{ id: 'reputation.read', permissions: ['reputation.read'] }] },
    });
  });

  it('declares an output schema for every tool whose result it can describe', () => {
    const server = serverWith(1);

    for (const tool of server.listTools()) {
      if (tool.name === 'act') {
        continue;
      }
      expect(tool.outputSchema, `${tool.name} has no outputSchema`).toBeDefined();
    }
  });

  it('declares NO output schema on act, and says why in the source', () => {
    // The MCP spec makes a declared outputSchema a MUST, not a hint. `act`
    // returns whatever the called action returns, and the set of actions is
    // decided at runtime by independently built packages, so no static schema
    // can be truthful. A permissive {type:'object'} would be worse than none:
    // it would be a promise the spec says callers may rely on, and it would be
    // false for every action returning an array, a string, or null.
    const act = serverWith(1)
      .listTools()
      .find((tool) => tool.name === 'act');

    expect(act?.outputSchema).toBeUndefined();
  });
});

describe('calling a tool', () => {
  it('runs an action from a domain it has no tool for', async () => {
    const result = await serverWith(2).callTool('act', {
      action: 'reputation.read',
      input: { args: 'abc' },
    });

    expect(result).toEqual({ ok: true, value: { claimed: 'abc' } });
  });

  it('searches within a domain', async () => {
    const result = await serverWith(1).callTool('search', { type: 'quest', name: 'clai' });

    expect(result.value).toEqual([{ id: 'quest.claim', name: 'claim' }]);
  });

  it('tells a caller the tools it has, when it asks for one that does not exist', async () => {
    const result = await serverWith(1).callTool('quest.claim', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('unknown-tool');
    expect(result.error?.message).toContain('discover, search, inspect, act, observe');
  });

  it('reports a bad argument against the field that was wrong', async () => {
    const result = await serverWith(1).callTool('inspect', { type: 'quest' });

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('invalid-input');
    expect(result.error?.message).toContain('id');
  });

  it('classifies an unknown action as not-found, so a caller retries rather than reporting a fault', async () => {
    const result = await serverWith(1).callTool('act', { action: 'nope.missing' });

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('not-found');
  });
});

describe('observing', () => {
  it('returns a closable subscription id', async () => {
    const server = serverWith(1);

    const result = await server.callTool('observe', { domain: 'quest' });

    expect(result.ok).toBe(true);
    const { subscriptionId } = result.value as { subscriptionId: string };
    expect(server.openSubscriptions()).toBe(1);
    expect(server.closeObservation(subscriptionId)).toBe(true);
    expect(server.openSubscriptions()).toBe(0);
  });

  it('refuses to close a subscription that is not there', () => {
    expect(serverWith(1).closeObservation('sub-999')).toBe(false);
  });
});
