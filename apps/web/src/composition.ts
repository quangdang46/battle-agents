import { createRuntime } from '@battle-agents/core';
import type { EventBus, GameEvent, Logger, Runtime, StateStore } from '@battle-agents/core';
import { HANDLER_FAILED, isolateHandlers } from '@battle-agents/api';
import type { HandlerFailure } from '@battle-agents/api';

/**
 * The composition root: the one place that decides which features exist and
 * what they are wired to.
 *
 * ## What this file is now
 *
 * It composes an empty extension list. Every feature package was removed from
 * this repository, so there is nothing to mount, and the seam they were mounted
 * into is what survives: `createRuntime` still resolves, the handler-isolation
 * boundary still wraps whatever a future extension declares, and the store and
 * bus are still wired once and shared by every surface.
 *
 * The boundary was kept rather than deleted with the features because it is not
 * the features' code. `packages/core/src/runtime.ts` awaits handlers in order
 * and does not catch, so one handler that throws unwinds the loop, every
 * consumer registered after it never runs, and the bus never sees the event at
 * all. That is a property of the runtime, and the first extension added back
 * hits it on the first unhandled rejection it raises.
 */

/** What the host supplies. Core takes no position on where these come from. */
export interface GameRuntimeDependencies {
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly log?: Logger;
}

export function createGameRuntime(dependencies: GameRuntimeDependencies): Runtime {
  /**
   * What a handler that threw costs the host: a log line and a durable row.
   *
   * The failure is written through `store.append` rather than through `emit`,
   * deliberately: `emit` runs the feature's handlers again, so a feature that
   * throws on one event would throw on its own failure report — a loop that
   * cannot terminate.
   *
   * The store write is fire-and-forget and its rejection is dropped. A log line
   * is still written first, so a store that is down does not take the one signal
   * with it.
   */
  const recordFailure = (failure: HandlerFailure): void => {
    const message = failure.cause instanceof Error ? failure.cause.message : String(failure.cause);
    dependencies.log?.warn(
      `[composition] handler of ${failure.featureId} threw on ${failure.eventType}: ${message}`,
    );
    const fault: GameEvent = {
      type: HANDLER_FAILED,
      occurredAt: new Date().toISOString(),
      actorId: 'system',
      payload: { featureId: failure.featureId, eventType: failure.eventType, message },
    };
    void dependencies.store.append(fault).catch(() => undefined);
    dependencies.bus.publish(fault);
  };

  return createRuntime({
    extensions: [].map((feature) => isolateHandlers(feature, recordFailure)),
    store: dependencies.store,
    bus: dependencies.bus,
    ...(dependencies.log === undefined ? {} : { log: dependencies.log }),
  });
}