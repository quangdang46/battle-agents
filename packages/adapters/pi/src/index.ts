/**
 * The Pi adapter.
 *
 * Pi has no hook surface, so this is pure session-log watching: a parser for the
 * JSONL records, a cursor that reads incrementally, and a watcher that keeps one
 * buffer per session file and posts to the limits the ingest endpoint accepts.
 *
 * Pi is the second log-watching adapter, and the point of shipping it is the
 * same as the point of shipping Codex: if two unrelated CLIs both produce valid
 * `AgentEvent`s against the same union, then the union is the contract rather
 * than a wrapper around one CLI's extension points. What is NOT shared between
 * them is any code — a file watcher that another adapter can reach into is how
 * one harness ends up depending on another having been built first.
 */

export { listSessionFiles, piSessionsDirectory } from './paths.js';

export { createLogState, parseSessionLine, readNewSessionLines } from './parsers/session.js';
export type { ParsedPiLine, PiLogState } from './parsers/session.js';

export { PiWatcher } from './watcher.js';
export type { BatchSender, PiWatcherOptions } from './watcher.js';
