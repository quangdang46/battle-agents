/**
 * The Claude Code adapter.
 *
 * Two planes, because one is not enough. Hooks give structured, timely events
 * and they only fire while the agent cooperates; the session log is what
 * survives a crash, a forced quit, or a hook that never installed. The watcher
 * is where they meet, and the ledger is how they avoid reporting the same tool
 * call twice.
 *
 * The installer is deliberately NOT here. Writing to somebody's
 * `~/.claude/settings.json` is consent-gated and belongs to a command a person
 * runs, not to a module a program imports — an adapter that rewrote a
 * developer's editor configuration on import would be a bug nobody would file,
 * because nobody would expect it.
 */

export { ClaudeHookNormalizer } from './hooks/hook-handler.js';
export type { ClaudeHookContext, NormalizedHook } from './hooks/hook-handler.js';

export {
  createHookLedger,
  isAlreadyReported,
  parseJsonlLine,
  readNewLines,
  recordReported,
  transcriptsDirectory,
} from './parsers/jsonl.js';
export type { HookLedger, ParsedLine } from './parsers/jsonl.js';

export { ClaudeWatcher } from './watcher.js';
export type { BatchSender, ClaudeWatcherOptions } from './watcher.js';
