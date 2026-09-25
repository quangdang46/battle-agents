/**
 * The Gemini adapter.
 *
 * Gemini has no hook surface, so this is pure chat-store watching: parsers for
 * the two record shapes Gemini writes, readers for the two files it writes them
 * into, and a watcher that keeps one buffer per session and posts to the limits
 * the ingest endpoint accepts.
 *
 * It shares no code with the Codex, Cursor or Pi adapters. It reaches the same
 * `EventBuffer`, the same tool-map and the same POST client from
 * `@battle-agents/protocol` — and nothing else, because a harness that only
 * works because another harness was built first is the failure the adapter-seam
 * design exists to prevent.
 *
 * The store is two formats, not one, and `paths.ts` is where that is established
 * rather than assumed: the append-only `.jsonl` and the whole-document `.json`
 * have different readers because a byte offset into a rewritten file is not a
 * cursor.
 */

export { geminiInstallationId, geminiProjectsDirectory, listChatFiles } from './paths.js';
export type { GeminiChatFile } from './paths.js';

export {
  createChatState,
  parseChatLine,
  parseChatMessage,
  readChatDocument,
  readChatDocumentFile,
  readNewChatLines,
} from './parsers/chats.js';
export type { ChatDocument, ChatState, ParsedChatLine } from './parsers/chats.js';

export { GeminiWatcher } from './watcher.js';
export type { BatchSender, GeminiWatcherOptions } from './watcher.js';
