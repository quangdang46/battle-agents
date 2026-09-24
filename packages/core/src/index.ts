/**
 * `@battle-agents/core` — the primitives every feature is written against.
 *
 * The dependency rule runs one way: a feature may import this package and
 * `@battle-agents/protocol`, and nothing else in the workspace. This package
 * imports neither, which is what lets the layering checker treat a violation
 * as structural rather than as a convention.
 *
 * This barrel is the frozen surface, so it lists what is supported and nothing
 * more. `FeatureRegistry` is deliberately absent: it is the runtime's private
 * bookkeeping, and a consumer holding one could register features without the
 * runtime re-checking requirements, which is exactly the degradation signal the
 * removal test depends on.
 */
export { defineAction } from './actions.js';
export type { Command, CommandHandler } from './command.js';
export type {
  ActionDef,
  Capability,
  EventBus,
  EventHandler,
  GameFeature,
  Logger,
  Runtime,
  RuntimeContext,
  StateStore,
} from './contracts.js';
export type { GameEvent } from './event.js';
export { InMemoryStateStore, isPersistedEventType, PERSISTED_EVENT_TYPES } from './persistence.js';
export { createRuntime, PartialDispatchError } from './runtime.js';
export type { RuntimeOptions } from './runtime.js';
export { createInMemoryEventBus } from './state.js';
