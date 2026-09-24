import { createRuntime } from '@battle-agents/core';
import type { EventBus, Logger, Runtime, StateStore } from '@battle-agents/core';

/**
 * The composition root: the one place that decides which features exist.
 *
 * It lives here rather than in `packages/core` because core is forbidden from
 * importing a feature — that rule is what stops the runtime from growing a
 * dependency on the game it hosts — and because the web app is the only layer
 * allowed to depend on features directly.
 *
 * Adding a feature is exactly two lines in this file, plus a dependency entry
 * in package.json. Nothing else changes, which is the property the removal
 * test checks.
 */

/** What the host supplies. Core takes no position on where these come from. */
export interface GameRuntimeDependencies {
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly log?: Logger;
}

export function createGameRuntime(dependencies: GameRuntimeDependencies): Runtime {
  return createRuntime({
    // One feature per line, each line the whole call. scripts/removal-test.sh
    // deletes a feature by stripping the line that constructs it, so folding
    // two onto one line, or wrapping a call across lines, would leave a
    // reference behind and fail the removal test for the wrong reason.
    extensions: [
      // Each feature contributes a factory call on its own line here, e.g.
      //   agentFeature(),
    ],
    store: dependencies.store,
    bus: dependencies.bus,
    ...(dependencies.log === undefined ? {} : { log: dependencies.log }),
  });
}
