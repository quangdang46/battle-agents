/**
 * The Aider adapter.
 *
 * Aider has no hook surface and no structured session log, so this is pure
 * transcript watching: a parser for the transcript's line grammar, a cursor that
 * reads incrementally by BYTE offset, and a watcher that batches to the limits
 * the ingest endpoint accepts.
 *
 * It is the seventh log-watching adapter, and it shares no code with the other
 * six. It reaches the same `EventBuffer`, the same tool map and the same zone
 * fallback from `@battle-agents/protocol` — and nothing else, because a harness
 * that only works because another harness was built first is the failure the
 * adapter-seam design exists to prevent.
 *
 * WHICH FILE THIS READS is the finding worth reading, and it is not the one the
 * bead that asked for this adapter expected. Aider writes its transcript into the
 * PROJECT at `<git-root>/.aider.chat.history.md`, not into `~/.aider/`, and it
 * writes no conversation directory at all. The full inventory of every file Aider
 * writes, what each is for, and what this format therefore cannot supply — no
 * per-line timestamp, no session id, no tool result, and no tool CALLS, because
 * Aider's shipped coders parse edits out of model prose rather than calling
 * tools — is in `parsers/transcript.ts`. Read that before changing the grammar.
 */

export { AIDER_CHAT_HISTORY_BASENAME, listTranscriptFiles } from './paths.js';
export type { TranscriptFile } from './paths.js';

export {
  AIDER_ACTIVITIES,
  activityZone,
  parseRunBoundary,
  parseTranscriptLine,
  promptLineText,
  promptText,
  readNewTranscriptLines,
  type AiderActivity,
  type ParsedTranscriptLine,
  type SessionMarker,
  type TranscriptContext,
} from './parsers/transcript.js';

export { AiderWatcher, type AiderWatcherOptions, type BatchSender } from './watcher.js';
