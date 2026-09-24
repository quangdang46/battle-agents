import type { Command, CommandHandler } from './command.js';
import type { GameEvent } from './event.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT 1 — the Extension API. FROZEN 2026-09-24.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Everything below is what a feature is written against, and every feature
 * touches nothing else in core. If a member here has to change to add a
 * feature, the contract is wrong and the change is a breaking change to every
 * extension, not a convenience.
 *
 * Two rules make that hold:
 *
 *   1. Core contains no game words. There is no XP, level, quest or bounty
 *      here, and a feature that finds itself wanting one wants its own state,
 *      not a new field on a core interface.
 *   2. Extensions are composed explicitly. `createRuntime({ extensions: [...] })`
 *      is the whole loading story. There is no plugin scanner, no remote
 *      loader and no marketplace, and adding one is out of scope on purpose.
 *
 * Per-feature state does not live in this contract. A feature keeps its own
 * state through `StateStore` under its own id, and reads other features'
 * capabilities rather than their data.
 */

/** Where a runtime reports problems it recovered from rather than threw on. */
export interface Logger {
  warn(message: string): void;
  info?(message: string): void;
  error?(message: string, error?: unknown): void;
}

/**
 * The one and only path to durable storage.
 *
 * `append` is a raw write and does NOT decide what is worth keeping: the
 * runtime applies the persistence policy before it gets here, so an
 * implementation never has to reimplement the filter and cannot forget it.
 * A store that filtered on its own would make the policy depend on which
 * adapter happened to be installed.
 */
export interface StateStore {
  append(event: GameEvent): Promise<void>;
  /** The slice one feature owns, or undefined before its first write. */
  load<S>(feature: string): S | undefined;
  save<S>(feature: string, state: S): Promise<void>;
}

/**
 * Transient fan-out to whoever is watching right now — an SSE stream, a
 * WebSocket, a test. Publishing is not persistence; see `StateStore`.
 */
export interface EventBus {
  publish(event: GameEvent): void;
  /** Returns the unsubscribe function. */
  subscribe(listener: (event: GameEvent) => void): () => void;
}

/** Reacts to an event another feature emitted. */
export interface EventHandler {
  readonly on: string;
  handle(event: GameEvent, context: RuntimeContext): Promise<void>;
}

/**
 * Something a feature offers that another feature may need.
 *
 * Capabilities are how two features cooperate without importing each other.
 * A feature declares one; another declares `requires: ['the.capability']` and
 * is degraded, not broken, when it is absent.
 */
export interface Capability {
  readonly name: string;
  readonly description: string;
}

/**
 * One typed operation, reachable as `runAction('quest.claim', input)`.
 *
 * This is the surface the CLI and the MCP adapter call. Features declare typed
 * actions instead of shipping their own tools, so growing the game grows the
 * registry rather than the tool list a model has to read.
 */
export interface ActionDef<I = unknown, O = unknown> {
  /** Dotted and lowercase, at least two segments: "quest.claim". */
  readonly id: string;
  readonly input: I;
  readonly output: O;
  /** What a caller must hold to run this. Never empty. */
  readonly permissions: readonly string[];
  run(input: I, context: RuntimeContext): Promise<O>;
}

/** What a feature is. Core has no other extension shape. */
export interface GameFeature {
  readonly id: string;
  readonly commands?: readonly CommandHandler[];
  readonly eventHandlers?: readonly EventHandler[];
  readonly actionDefs?: readonly ActionDef[];
  readonly capabilities?: readonly Capability[];
  /** Capability names this feature needs. A missing one degrades, never throws. */
  readonly requires?: readonly string[];
  /**
   * Event types this feature emits that are worth keeping forever, e.g. the
   * ones a replay or a dispute is settled from. Everything else a feature
   * emits stays on the bus and is never written.
   */
  readonly persistedEvents?: readonly string[];
}

/** What a handler and an action receive. */
export interface RuntimeContext {
  readonly runtime: Runtime;
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly log?: Logger;
  /** Injectable so tests do not have to assert on the wall clock. */
  now(): string;
}

/** The handle the composition root keeps and everything else is given. */
export interface Runtime {
  /** Capability names currently provided, sorted. */
  capabilities(): string[];
  /** Action ids currently registered, sorted. */
  actions(): string[];
  /** Command types currently handled, sorted. */
  commands(): string[];
  /**
   * Feature id to the capability names it is still missing. A non-empty entry
   * means that feature is running in a reduced mode, which is the designed
   * outcome of removing another feature, not a failure.
   */
  degraded(): ReadonlyMap<string, readonly string[]>;
  install(feature: GameFeature): void;
  uninstall(id: string): void;
  dispatch(command: Command): Promise<GameEvent[]>;
  emit(event: GameEvent): Promise<void>;
  runAction<I, O>(id: string, input: I): Promise<O>;
}
