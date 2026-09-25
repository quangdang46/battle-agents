/**
 * The Codex adapter, and deliberately the smallest one.
 *
 * Codex has no hook surface, so this is pure session-log watching: a parser for
 * the rollout lines, a cursor that reads incrementally, and a watcher that
 * batches to the limits the ingest endpoint accepts.
 *
 * It is the second reference implementation and the proof the telemetry plane is
 * harness-agnostic. If a hook-based adapter and this one both produce valid
 * `AgentEvent`s against the same union, then the union is the contract and not a
 * wrapper around one CLI's extension points.
 */

export {
  codexSessionsDirectory,
  listRolloutFiles,
  parseRolloutLine,
  readNewRolloutLines,
} from './parsers/rollout.js';
export type { ParsedRolloutLine, RolloutFile } from './parsers/rollout.js';

export { CodexWatcher } from './watcher.js';
export type { BatchSender, CodexWatcherOptions } from './watcher.js';

export { createIngestSender, IngestRefusedError } from './ingest.js';
export type { FetchLike, HttpResponseLike, IngestOptions } from './ingest.js';
