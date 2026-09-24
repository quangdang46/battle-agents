import type { RuntimeContext } from './contracts.js';
import type { GameEvent } from './event.js';

/**
 * A request for something to change, addressed to whoever handles it.
 *
 * A command is an intention and produces events; it is never applied directly.
 * That split is what lets the same command be issued from the CLI, the MCP
 * adapter or a web request and produce an identical event trail.
 */
export interface Command<P = unknown> {
  readonly type: string;
  /** ISO 8601 instant. */
  readonly issuedAt: string;
  /** Who is asking. */
  readonly issuerId: string;
  readonly payload: P;
}

/**
 * Turns one command into the events describing what changed. Handlers return
 * events rather than mutating state, so the events themselves are the record
 * of what happened; applying them is the runtime's job.
 */
export interface CommandHandler<T = unknown> {
  readonly type: string;
  handle(command: Command<T>, context: RuntimeContext): Promise<GameEvent[]>;
}
