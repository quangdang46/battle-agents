/**
 * The Goose adapter.
 *
 * Goose has no hook surface this repo drives, so this is session-log watching:
 * a reader that owns a byte cursor, a parser for the JSONL records, and a
 * watcher that keeps one buffer per session file and posts to the limits the
 * ingest endpoint accepts.
 *
 * **Read `parser.ts` before extending it.** Goose was not installed on the
 * machine this was written on, so the record format was established by reading
 * Goose's own source and its own test fixtures rather than by capturing a live
 * session, and two findings from that reading contradict the brief this was
 * built from:
 *
 *   1. Current Goose writes **SQLite** (`sessions.db`), not JSONL. The JSONL
 *      files are the format it READS, for back-compat, via `session/legacy.rs`.
 *   2. The data directory is not `~/.local/share/goose/sessions` on macOS —
 *      `etcetera` resolves it to `~/Library/Application Support/Block/goose`.
 *
 * Both are stated at the top of the file that depends on them, so the next
 * person finds them before they add a field rather than after.
 */

export { gooseSessionRoots, listSessionFiles, SESSION_LOG_SUFFIX } from './paths.js';

export { readNewLines, type ReadAt, type ReadResult } from './reader.js';

export { createLogState, parseSessionLine, type GooseLogState, type ParsedGooseLine } from './parser.js';

export { GooseWatcher, type BatchSender, type GooseWatcherOptions } from './watcher.js';
