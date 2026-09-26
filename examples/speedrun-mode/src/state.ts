import type { StateStore } from '@battle-agents/core';

/**
 * One speedrun's record, kept by this feature and nobody else.
 *
 * Per-feature state does not live in the `GameFeature` contract; it lives in the
 * store under the feature's own id. That is why this file takes a `StateStore`
 * rather than reaching for a repository: an external package has no
 * `packages/db`, no drizzle schema and no migration, and if it needed one it
 * would have to edit this repository to get it.
 *
 * Nothing here is imported from another package. The one coupling this feature
 * has to the platform is the capability name in `requires`, which is a string.
 */

/** The feature id, which is also this feature's key in the state store. */
export const SPEEDRUN_FEATURE_ID = 'speedrun';

/** A challenge somebody can attempt, in wall-clock terms. */
export interface SpeedrunRun {
  readonly runId: string;
  readonly challengerId: string;
  /** ISO 8601 instant the clock started. */
  readonly startedAt: string;
  /** ISO 8601 instant it finished, absent while the run is live. */
  readonly finishedAt?: string;
}

/** Every run this feature has recorded. A fresh feature reads empty, not undefined. */
export function readRuns(store: StateStore): readonly SpeedrunRun[] {
  return store.load<readonly SpeedrunRun[]>(SPEEDRUN_FEATURE_ID) ?? [];
}

export async function recordRun(store: StateStore, run: SpeedrunRun): Promise<void> {
  await store.save<readonly SpeedrunRun[]>(SPEEDRUN_FEATURE_ID, [...readRuns(store), run]);
}
