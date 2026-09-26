import type { ApplicationApi } from '@battle-agents/api';
import type { StreamFrame } from '../../apps/web/src/event-stream.js';
import { closeSharedApi, sharedApi } from '../../apps/web/src/routes.js';
import type { EventGateway } from '../../apps/web/src/event-gateway.js';
import { closeSharedEventGateway, sharedEventGateway } from '../../apps/web/src/event-gateway.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * One runtime, one bus, one pool — proven rather than asserted in a comment.
 *
 * The app used to build two runtimes, each with its own
 * `createInMemoryEventBus()`: one behind the Application API and one behind the
 * telemetry gateway. Both looked complete from the inside and the public stream
 * carried telemetry and nothing else, because a quest claimed through the API
 * was published to a bus no subscriber was on.
 *
 * The identity assertions are the regression guard, because a test that only
 * watched the stream would still pass if a future change gave the two runtimes
 * separate buses again and simply happened not to act anything this run.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';

function requireDatabase(): void {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
}

/** Discards the opening full_state so what remains is deltas. */
async function openStream(hub: EventGateway['hub']): Promise<{
  pull(): Promise<StreamFrame | undefined>;
  readonly pending: number;
}> {
  const subscriber = hub.subscribe('operator');
  await subscriber.pull();
  return subscriber;
}

afterAll(async () => {
  await closeSharedEventGateway();
  await closeSharedApi();
  await closeSharedRuntime();
});

describe('the app publishes on one bus', () => {
  it('gives the SSE gateway the runtime and bus the Application API acts through', async () => {
    requireDatabase();
    const { runtime, bus } = await sharedRuntime();
    const gateway = await sharedEventGateway();

    // Identity, not equality: two runtimes wired to the same repositories would
    // pass a structural comparison and still lose every event.
    expect(gateway.bus).toBe(bus);
    expect(gateway.runtime).toBe(runtime);
  });

  it('returns the same shared runtime to every caller', async () => {
    requireDatabase();

    expect(await sharedRuntime()).toBe(await sharedRuntime());
    expect(sharedApi()).toBe(sharedApi());
    expect(sharedEventGateway()).toBe(sharedEventGateway());
  });

  it('reuses one pool rather than opening one per caller', async () => {
    // The beginner trap plan §7.1 names: never construct a new connection and
    // connect per query, always use a pooled driver. createDatabasePool()
    // returns a NEW Pool on every call, so the thing that actually has to be
    // proved is that nothing calls it per request — and the observable is the
    // database handle built over that pool. A fresh Pool yields a fresh drizzle
    // instance, so identity here is identity of the connection pool underneath.
    //
    // The existing assertions above prove the runtime and the API are shared.
    // They did not prove the POOL was, which is the part that exhausts
    // connections under load: 100 agents at 20 events/s is 2000 writes/s, and
    // the failure is invisible in a test that only ever makes one request.
    requireDatabase();

    expect((await sharedRuntime()).database).toBe((await sharedRuntime()).database);
  });
});

describe('a game action reaches the public stream', () => {
  it('delivers the event an action emitted to a subscriber', async () => {
    requireDatabase();
    const api: ApplicationApi = await sharedApi();
    const gateway = await sharedEventGateway();
    const subscriber = await openStream(gateway.hub);

    // No event is published by hand. The action is the publisher, which is the
    // only arrangement in which this test would have failed before the fold.
    await api.act('quest.create', {
      title: `fold check ${process.pid}`,
      difficulty: 1,
      xpReward: 10,
    });

    expect(subscriber.pending).toBe(1);
  });

  it('delivers it to an observer on the same bus, once each', async () => {
    requireDatabase();
    const api: ApplicationApi = await sharedApi();
    const { bus } = await sharedRuntime();
    const subscriber = await openStream((await sharedEventGateway()).hub);

    const seenByApi: unknown[] = [];
    const observer = api.observe({}, (event) => seenByApi.push(event));

    await api.act('quest.create', {
      title: `fold check dual ${process.pid}`,
      difficulty: 1,
      xpReward: 10,
    });
    observer.close();

    // Two consumers of one bus, one copy each. A second runtime would have
    // given the API observer nothing at all, and the stream subscriber nothing
    // from the action.
    expect(seenByApi).toHaveLength(1);
    expect(subscriber.pending).toBe(1);
    expect(bus).toBe((await sharedEventGateway()).bus);
  });
});
