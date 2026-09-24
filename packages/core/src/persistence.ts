import type { StateStore } from './contracts.js';
import type { GameEvent } from './event.js';

/**
 * Event types the platform itself always records.
 *
 * This is the whole persistence policy, and it exists because the storage
 * bill is not: a busy agent emits tool and file events constantly, and writing
 * every one of them fills a small database and turns a replay into a table
 * scan. Only the events a replay, a dispute or a progression rule is settled
 * from are worth keeping.
 *
 * A feature adds its own by declaring them in `GameFeature.persistedEvents`,
 * so the list grows without editing this file. That is deliberate: under the
 * layering rules, a feature that has to modify core to record its own key
 * events is a feature that cannot be added.
 *
 * Everything not named here is published to the bus and never written.
 */
export const PERSISTED_EVENT_TYPES: readonly string[] = [
  'session.started',
  'session.ended',
  'session.resumed',
  'test.passed',
  'test.failed',
];

/**
 * Whether an event type is worth a row.
 *
 * Takes the feature-declared types as an argument rather than reading module
 * state, so the policy is a pure function of what is installed and two runtimes
 * in one process cannot contaminate each other.
 */
export function isPersistedEventType(
  type: string,
  featureEventTypes: ReadonlySet<string> = new Set(),
): boolean {
  return PERSISTED_EVENT_TYPES.includes(type) || featureEventTypes.has(type);
}

/**
 * A store that keeps everything in memory, for tests, local development and as
 * the reference for what a real store has to do.
 *
 * The runtime applies the persistence policy before calling `append`, so this
 * appends whatever it is handed. Filtering again here would make the policy
 * depend on which adapter is installed, which is how a filter gets bypassed
 * by swapping the database driver.
 */
export class InMemoryStateStore implements StateStore {
  readonly #log: GameEvent[] = [];
  readonly #slices = new Map<string, unknown>();

  async append(event: GameEvent): Promise<void> {
    this.#log.push(event);
  }

  load<S>(feature: string): S | undefined {
    return this.#slices.get(feature) as S | undefined;
  }

  async save<S>(feature: string, state: S): Promise<void> {
    this.#slices.set(feature, state);
  }

  /** Everything appended so far, oldest first. */
  recorded(): readonly GameEvent[] {
    return [...this.#log];
  }
}
