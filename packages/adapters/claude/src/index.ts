/**
 * The Claude Code adapter.
 *
 * Two planes, because one is not enough. Hooks give structured, timely events
 * and they only fire while the agent cooperates; the session log is what
 * survives a crash, a forced quit, or a hook that never installed. The watcher
 * is where they meet, and the ledger is how they avoid reporting the same tool
 * call twice.
 *
 * The installer is exported but is not run on import. Writing to somebody's
 * `~/.claude/settings.json` is consent-gated and belongs to a command a person
 * runs; a module that rewrote a developer's editor configuration as a side
 * effect of being imported would be a bug nobody would file, because nobody
 * would expect it.
 */

export { ClaudeHookNormalizer } from './hooks/hook-handler.js';
export type { ClaudeHookContext, NormalizedHook } from './hooks/hook-handler.js';

export {
  createHookLedger,
  parseJsonlLine,
  readNewLines,
  recordObservation,
  transcriptsDirectory,
  unreported,
} from './parsers/jsonl.js';
export type { HookLedger, Observation, ParsedLine } from './parsers/jsonl.js';

export { argv0Of, deriveCallEvents, deriveOutcomeEvents, looksLikeTestCommand } from './derive.js';
export type { EventBase } from './derive.js';

export { discoverTranscripts, SessionCursors } from './transcript.js';
export type { DiscoveredTranscript } from './transcript.js';

export { ClaudeWatcher } from './watcher.js';
export type { BatchSender, ClaudeWatcherOptions } from './watcher.js';

export {
  consentDisclosure,
  defaultSettingsPath,
  installClaudeHooks,
  uninstallClaudeHooks,
  withoutOurHooks,
} from './installer/install-claude.js';
export type {
  ConsentDisclosure,
  InstallOptions,
  InstallOutcome,
} from './installer/install-claude.js';
