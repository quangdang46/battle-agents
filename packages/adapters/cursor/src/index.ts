/**
 * The Cursor adapter.
 *
 * Cursor has no hook surface, so this is pure transcript watching: a parser for
 * the transcript lines, a cursor that reads incrementally, and a watcher that
 * batches to the limits the ingest endpoint accepts.
 *
 * It is the third log-watching adapter, and it shares no code with the other
 * two. It reaches the same `EventBuffer`, the same tool-map and the same POST
 * client from `@battle-agents/protocol` — and nothing else, because a harness
 * that only works because another harness was built first is the failure the
 * adapter-seam design exists to prevent.
 *
 * What the transcript does NOT contain is as much a part of this as what it
 * does, and is stated in `parsers/transcript.ts` rather than discovered later:
 * no record carries a timestamp, none carries the session id, and no tool result
 * is written at all.
 */

export { cursorProjectsDirectory, listTranscriptFiles } from './paths.js';
export type { TranscriptFile } from './paths.js';

export { parseTranscriptLine, readNewTranscriptLines } from './parsers/transcript.js';
export type { ParsedTranscriptLine, TranscriptContext } from './parsers/transcript.js';

export { CursorWatcher } from './watcher.js';
export type { BatchSender, CursorWatcherOptions } from './watcher.js';
