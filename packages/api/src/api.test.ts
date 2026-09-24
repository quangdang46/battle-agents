import {
  createRuntime,
  defineAction,
  InMemoryStateStore,
  createInMemoryEventBus,
} from '@battle-agents/core';
import type { Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  createApplicationApi,
  PRIMITIVES,
  UnknownActionError,
  UnknownDomainError,
  type ApplicationApi,
} from './api.js';

const AT = '2026-09-24T12:00:00.000Z';

/** A feature with two domains, so "the surface did not grow" is measurable. */
function runtimeWith(extensionCount: number): Runtime {
  return createRuntime({
    extensions: Array.from({ length: extensionCount }, (_, index) => ({
      id: `feature-${index}`,
      capabilities: [{ name: `feature${index}.read`, description: `reads feature ${index}` }],
      actionDefs: [
        defineAction({
          id: `feature${index}.claim`,
          permissions: [`feature${index}.claim`],
          run: async (input: { id: string }) => ({ claimed: input.id, by: index }),
        }),
      ],
    })),
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => AT,
  });
}

function harness(extensionCount = 2): { runtime: Runtime; api: ApplicationApi } {
  const runtime = runtimeWith(extensionCount);
  return { runtime, api: createApplicationApi(runtime) };
}

describe('the application API', () => {
  it('exposes exactly five primitives, and that is the whole surface', () => {
    // The number is the point. A sixth primitive is how "cover every
    // capability, expose few" quietly becomes "expose every capability", and
    // the count is the only place that change would be visible.
    expect([...PRIMITIVES]).toEqual(['discover', 'search', 'inspect', 'act', 'observe']);
    // Exactly, not merely containing: an api object with a sixth key is the
    // failure this whole primitive exists to prevent.
    expect(Object.keys(createApplicationApi(runtimeWith(1))).sort()).toEqual(
      [...PRIMITIVES].sort(),
    );
  });

  it('grows the registry when a feature is added, without growing the surface', () => {
    const before = Object.keys(createApplicationApi(runtimeWith(2)));
    const after = Object.keys(createApplicationApi(runtimeWith(9)));

    expect(after.sort()).toEqual(before.sort());
    expect(createApplicationApi(runtimeWith(9)).discover().domains).toHaveLength(9);
    expect(createApplicationApi(runtimeWith(2)).discover().domains).toHaveLength(2);
  });

  it('hands a connecting client the domains, not the whole catalog', () => {
    const { api } = harness(3);

    expect(api.discover()).toEqual({ domains: ['feature0', 'feature1', 'feature2'] });
  });

  it('fetches one domain on request', () => {
    const { api } = harness(2);

    const detail = api.discover('feature1').detail;

    expect(detail?.capabilities.map((each) => each.name)).toEqual(['feature1.read']);
    expect(detail?.actions.map((each) => each.id)).toEqual(['feature1.claim']);
  });

  it('refuses a domain it does not have, and names the ones it does', () => {
    const { api } = harness(2);

    expect(() => api.discover('guild')).toThrow(UnknownDomainError);
    expect(() => api.discover('guild')).toThrow(/feature0, feature1/);
  });

  it('searches within a domain by name fragment', () => {
    const { api } = harness(2);

    expect(api.search({ type: 'feature1' })).toEqual([{ id: 'feature1.claim', name: 'claim' }]);
    expect(api.search({ type: 'feature1', name: 'clai' })).toEqual([
      { id: 'feature1.claim', name: 'claim' },
    ]);
    expect(api.search({ type: 'feature1', name: 'nothing' })).toEqual([]);
  });

  it('runs an action through act()', async () => {
    const { api } = harness(2);

    await expect(api.act('feature1.claim', { id: 'q1' })).resolves.toEqual({
      claimed: 'q1',
      by: 1,
    });
  });

  it('names the domains when an action does not exist, rather than dumping every id', async () => {
    const { api } = harness(2);

    await expect(api.act('quest.claim', {})).rejects.toBeInstanceOf(UnknownActionError);
    await expect(api.act('quest.claim', {})).rejects.toThrow(/known domains: feature0, feature1/);
  });

  it('returns a closable observer even with no transport attached', () => {
    const { api } = harness(1);
    const observer = api.observe({}, () => {});

    expect(typeof observer.close).toBe('function');
    // Closing twice is a thing surfaces do on teardown paths.
    expect(() => {
      observer.close();
      observer.close();
    }).not.toThrow();
  });
});

/**
 * The three surfaces, each written the way it would actually be written, all
 * reaching the same action. This is the parity the plan asks for: a feature
 * reachable from the CLI, HTTP and MCP because all three reach the same place,
 * not because somebody remembered to add it to each.
 */
describe('parity across surfaces', () => {
  const input = { id: 'shared-1' };
  const expected = { claimed: 'shared-1', by: 0 };

  it('reaches the same action from a CLI-shaped caller', async () => {
    // `agent-battle feature0 claim shared-1` — a verb and an argument.
    const { api } = harness(1);
    const [domain, operation, ...rest] = ['feature0', 'claim', 'shared-1'];

    await expect(api.act(`${domain}.${operation}`, { id: rest.join(' ') })).resolves.toEqual(
      expected,
    );
  });

  it('reaches the same action from an HTTP-shaped caller', async () => {
    // POST /act { action, input } with the body parsed and nothing else done.
    const { api } = harness(1);
    const body: { action: string; input: typeof input } = {
      action: 'feature0.claim',
      input,
    };

    await expect(api.act(body.action, body.input)).resolves.toEqual(expected);
  });

  it('reaches the same action from an MCP-shaped caller', async () => {
    // act({ action, input }) — the same pair, as the MCP tool receives it.
    const { api } = harness(1);
    const toolCall: { action: string; input: typeof input } = {
      action: 'feature0.claim',
      input,
    };

    await expect(api.act(toolCall.action, toolCall.input)).resolves.toEqual(expected);
  });

  it('fails the same way whichever surface asked', async () => {
    const { api } = harness(1);
    const wrong = 'nonsense.operation';

    await expect(api.act(wrong, input)).rejects.toBeInstanceOf(UnknownActionError);
  });
});
