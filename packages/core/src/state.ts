import type { EventBus } from './contracts.js';
import type { GameEvent } from './event.js';

/**
 * A bus that fans out to listeners in the order they subscribed.
 *
 * The listener list is copied before each notify, so a listener that
 * unsubscribes during a dispatch does not shift the list under the loop and
 * cause its neighbour to be skipped.
 */
export function createInMemoryEventBus(): EventBus {
  const listeners = new Set<(event: GameEvent) => void>();
  return {
    publish(event: GameEvent): void {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    subscribe(listener: (event: GameEvent) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
