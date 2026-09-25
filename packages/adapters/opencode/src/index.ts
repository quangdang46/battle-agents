/**
 * The OpenCode adapter.
 *
 * OpenCode has no hook surface and no append-only log either. It keeps a
 * SQLite database and rewrites rows in it as a session runs, so this adapter is
 * a reader rather than a tailer: a schema probe and a pair of incremental
 * queries (`parsers/sqlite.ts`), and a poll loop whose interval is a function of
 * what the last poll found (`watcher.ts`).
 *
 * It is the third adapter and the one that proves something the other two do
 * not. Claude has hooks, Codex and Pi have JSONL, and both of those are
 * append-only files where a byte cursor is the whole problem. Here the source
 * is a database someone else is writing, which brings the two requirements the
 * plan singles out for this harness: read it read-only, and never poll it hot.
 * If those two hold and the stream still validates against the same frozen
 * union, the union is a contract over harnesses rather than over file formats.
 */

export {
  OPEN_CODE_HARNESS,
  OpenCodeStore,
  openCodeDatabasePath,
} from './parsers/sqlite.js';
export type { OpenCodePollResult, OpenCodeSchema, OpenCodeStoreOptions } from './parsers/sqlite.js';

export { OpenCodeWatcher } from './watcher.js';
export type {
  BatchSender,
  OpenCodeWatcherOptions,
  OpenCodeWatcherStatus,
  PollCancel,
  PollSchedule,
} from './watcher.js';
