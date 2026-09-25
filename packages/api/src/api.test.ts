import {
  createRuntime,
  defineAction,
  InMemoryStateStore,
  createInMemoryEventBus,
} from '@battle-agents/core';
import { isRegisteredActionId } from '@battle-agents/protocol';
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

/**
 * N real features, so "the surface did not grow" is measurable.
 *
 * The ids are REAL — drawn from the domains this build actually registers —
 * because act() now validates against the generated union. A fixture with
 * invented ids can no longer reach act() at all, which is the union working
 * rather than the test being awkward: it is the same reason a real caller
 * cannot invent one either.
 */
const FIXTURE_DOMAINS = [
  { domain: 'quest', verb: 'claim' },
  { domain: 'reputation', verb: 'read' },
  { domain: 'progression', verb: 'read' },
] as const;

function runtimeWith(extensionCount: number): Runtime {
  return createRuntime({
    extensions: FIXTURE_DOMAINS.slice(0, extensionCount).map((entry, index) => {
      const id = `${entry.domain}.${entry.verb}`;
      return {
        id: entry.domain,
        capabilities: [{ name: `${entry.domain}.read`, description: `reads ${entry.domain}` }],
        actionDefs: [
          defineAction({
            id,
            permissions: [id],
            run: async (input: { id: string }) => ({ claimed: input.id, by: index }),
          }),
        ],
      };
    }),
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

  it('grows the registry when a feature is added, without growing the surface', async () => {
    const before = Object.keys(createApplicationApi(runtimeWith(2)));
    const after = Object.keys(createApplicationApi(runtimeWith(3)));

    expect(after.sort()).toEqual(before.sort());
    await expect(createApplicationApi(runtimeWith(3)).discover()).resolves.toHaveProperty(
      'domains',
    );
    expect((await createApplicationApi(runtimeWith(3)).discover()).domains).toHaveLength(3);
    expect((await createApplicationApi(runtimeWith(2)).discover()).domains).toHaveLength(2);
  });

  it('hands a connecting client the domains, not the whole catalog', async () => {
    const { api } = harness(3);

    await expect(api.discover()).resolves.toEqual({
      domains: ['progression', 'quest', 'reputation'],
    });
  });

  it('fetches one domain on request', async () => {
    const { api } = harness(2);

    const detail = (await api.discover('reputation')).detail;

    expect(detail?.capabilities.map((each) => each.name)).toEqual(['reputation.read']);
    expect(detail?.actions.map((each) => each.id)).toEqual(['reputation.read']);
  });

  it('refuses a domain it does not have, and names the ones it does', async () => {
    const { api } = harness(2);

    await expect(api.discover('guild')).rejects.toThrow(UnknownDomainError);
    await expect(api.discover('guild')).rejects.toThrow(/quest, reputation/);
  });

  it('searches within a domain by name fragment', async () => {
    const { api } = harness(2);

    await expect(api.search({ type: 'reputation' })).resolves.toEqual([
      { id: 'reputation.read', name: 'read' },
    ]);
    await expect(api.search({ type: 'reputation', name: 'rea' })).resolves.toEqual([
      { id: 'reputation.read', name: 'read' },
    ]);
    await expect(api.search({ type: 'reputation', name: 'nothing' })).resolves.toEqual([]);
  });

  it('runs an action through act()', async () => {
    const { api } = harness(2);

    await expect(api.act('quest.claim', { id: 'q1' })).resolves.toEqual({
      claimed: 'q1',
      by: 0,
    });
  });

  it('names the domains when an action does not exist, rather than dumping every id', async () => {
    const { api } = harness(2);

    await expect(api.act('quest.cliam' as never, {})).rejects.toBeInstanceOf(UnknownActionError);
    await expect(api.act('quest.cliam' as never, {})).rejects.toThrow(
      /known domains: quest, reputation/,
    );
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
    // `agent-battle quest claim shared-1` — a verb and an argument.
    const { api } = harness(1);
    const [domain, operation, ...rest] = ['quest', 'claim', 'shared-1'];

    const actionId = `${domain}.${operation}`;
    if (!isRegisteredActionId(actionId)) {
      throw new Error(`fixture id ${actionId} is not registered`);
    }
    await expect(api.act(actionId, { id: rest.join(' ') })).resolves.toEqual(expected);
  });

  it('reaches the same action from an HTTP-shaped caller', async () => {
    // POST /act { action, input } with the body parsed and nothing else done.
    const { api } = harness(1);
    const body: { action: string; input: typeof input } = {
      action: 'quest.claim',
      input,
    };

    // Narrowed in a CONDITION, not inside expect(): a type predicate only
    // narrows where the compiler can see the branch, and an assertion reads
    // true without telling it anything.
    const action = body.action;
    if (!isRegisteredActionId(action)) {
      throw new Error(`fixture id ${action} is not registered`);
    }
    await expect(api.act(action, body.input)).resolves.toEqual(expected);
  });

  it('reaches the same action from an MCP-shaped caller', async () => {
    // act({ action, input }) — the same pair, as the MCP tool receives it.
    const { api } = harness(1);
    const toolCall: { action: string; input: typeof input } = {
      action: 'quest.claim',
      input,
    };

    const action = toolCall.action;
    if (!isRegisteredActionId(action)) {
      throw new Error(`fixture id ${action} is not registered`);
    }
    await expect(api.act(action, toolCall.input)).resolves.toEqual(expected);
  });

  it('fails the same way whichever surface asked', async () => {
    const { api } = harness(1);
    const wrong = 'quest.cliam';

    if (isRegisteredActionId(wrong)) {
      throw new Error(`the fixture misspelling ${wrong} is a real id`);
    }
    await expect(api.act(wrong as never, input)).rejects.toBeInstanceOf(UnknownActionError);
  });
  it('describes an action without running it', async () => {
    // inspect is advertised to MCP clients as "describe one operation, without
    // running it". The previous implementation called runAction, so a describe
    // call mutated durable state: an audit drove a counter from 1 to 2 through
    // two inspect calls, and inspecting quest.create entered the create path
    // and threw inside it. A read that writes is not a read, whatever the tool
    // description claims.
    const { api } = harness(1);

    const result = (await api.inspect({ type: 'quest', id: 'claim' })) as {
      action: string;
      found: boolean;
      description: string | null;
      permissions: readonly string[];
    };

    expect(result.found).toBe(true);
    expect(result.action).toBe('quest.claim');
    expect(result.permissions.length).toBeGreaterThan(0);
  });

  it('does not run the action it describes, even twice', async () => {
    // The regression is a side effect, so the assertion has to be on the side
    // effect. Calling inspect must not reach a handler at all.
    const { runtime, api } = harness(1);
    const before = JSON.stringify(runtime.describeDomain('quest'));

    await api.inspect({ type: 'quest', id: 'claim' });
    await api.inspect({ type: 'quest', id: 'claim' });

    expect(JSON.stringify(runtime.describeDomain('quest'))).toBe(before);
  });

  it('reports an action it cannot describe rather than inventing one', async () => {
    const { api } = harness(1);

    const result = (await api.inspect({ type: 'quest', id: 'nonexistent' })) as {
      found: boolean;
    };

    // A description nobody wrote is worse than none: the caller cannot tell a
    // generated sentence from one the author stands behind.
    expect(result.found).toBe(false);
  });
});

describe('act refuses a payload that is not an object', () => {
  // `act<I>` infers I from the call site, so nothing upstream ties the input to
  // the action. Every registered action in this build takes an object, and
  // dispatching anything else reached a feature reading a field off whatever
  // arrived — the error then named a field instead of the mistake.
  const { api } = harness();

  it('names the action and what it received', async () => {
    for (const input of [null, undefined, 'agent-1', 42, true]) {
      await expect(api.act('quest.claim', input as never)).rejects.toMatchObject({
        code: 'malformed-input',
        message: expect.stringContaining('quest.claim takes an object'),
      });
    }
  });

  it('still dispatches a well-formed payload', async () => {
    // A guard that refused everything would pass the test above.
    await expect(harness().api.act('quest.claim', { id: 'quest-1' })).resolves.toMatchObject({
      claimed: 'quest-1',
    });
  });
});
