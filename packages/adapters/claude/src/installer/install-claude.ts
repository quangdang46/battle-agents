import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Installing the hook plane into somebody's Claude Code settings.
 *
 * This is the one part of an adapter that touches a developer's editor
 * configuration, so everything here is about not being surprising.
 *
 * It is consent-gated. There is no default-yes path and no silent retry: the
 * caller has to pass a decision, and the decision is recorded on what actually
 * happened rather than on what was intended.
 *
 * It merges. `~/.claude/settings.json` belongs to the person using it — it holds
 * their model, their permissions, their other hooks. A rewrite would destroy
 * all of that, so the read-modify-write below touches one key and leaves every
 * other byte alone. A file that is not valid JSON is refused rather than
 * replaced: an installer that "fixes" a config it cannot parse is how somebody
 * loses a day.
 *
 * Uninstall removes only the entries whose command is ours. Someone else's hook
 * on the same event is not ours to delete.
 *
 * The bead's "session-file fallback when hooks are unavailable" is NOT here.
 * That fallback is the JSONL tail, and it is always on — the watcher does not
 * need this file to exist. What this file gates is the timely plane, not
 * whether the agent is visible at all.
 */

const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop'] as const;
type HookEvent = (typeof HOOK_EVENTS)[number];

const HOOKS_KEY = 'hooks';
const MATCHER_ALL = '*';

export interface InstallOptions {
  /** The command Claude runs for each hook. Usually our CLI's `hook` verb. */
  readonly command: string;
  /** Where Claude keeps its settings. Overridable so a test is not a real one. */
  readonly settingsPath?: string;
  /**
   * Whether the person agreed to this change.
   *
   * Required and not defaulted, because the whole point of the gate is that
   * there is no path which writes the file without somebody deciding to.
   */
  readonly consent: boolean;
}

export type InstallOutcome =
  /** The hooks were written. */
  | { readonly status: 'installed'; readonly settingsPath: string; readonly events: readonly HookEvent[] }
  /** Consent was withheld. Nothing was read and nothing was written. */
  | { readonly status: 'declined' }
  /** The file exists and is not JSON we can merge into. Nothing was written. */
  | { readonly status: 'refused-unreadable'; readonly settingsPath: string; readonly reason: string }
  /** A hook of ours was already there, and the command is the same. */
  | { readonly status: 'already-present'; readonly settingsPath: string };

export function defaultSettingsPath(home = homedir()): string {
  return join(home, '.claude', 'settings.json');
}

/**
 * One matcher per event, in the shape Claude Code reads.
 *
 * A single matcher, NOT an array of one. The caller appends it to whatever is
 * already there, and returning the array here would nest it — `[[matcher]]` —
 * which is not a shape Claude reads. It also failed silently: the shape-aware
 * presence check could not see its own entry through the extra layer, so a
 * second install reported "installed" and appended again.
 */
function matchersFor(command: string): Record<string, unknown> {
  const matchers: Partial<Record<HookEvent, unknown>> = {};
  for (const event of HOOK_EVENTS) {
    matchers[event] = { matcher: MATCHER_ALL, hooks: [{ type: 'command', command }] };
  }
  return matchers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether this exact command is already installed for the event.
 *
 * Shape-aware rather than a substring search: the settings file also holds the
 * person's own hooks, and matching on the word "command" would report ours as
 * present when it is somebody else's.
 */
function hasCommandFor(event: unknown, command: string): boolean {
  if (!Array.isArray(event)) {
    return false;
  }
  return event.some((matcher) => {
    if (!isRecord(matcher) || !Array.isArray(matcher.hooks)) {
      return false;
    }
    return matcher.hooks.some(
      (hook) => isRecord(hook) && hook.type === 'command' && hook.command === command,
    );
  });
}

/** Whether ANY of our events already carries this command. */
function isAlreadyInstalled(hooks: Record<string, unknown>, command: string): boolean {
  return HOOK_EVENTS.some((event) => hasCommandFor(hooks[event], command));
}

/**
 * Removes only our entries, leaving the person's own hooks on the same event.
 *
 * An event left with an empty matcher list is deleted rather than kept as `[]`,
 * because Claude treats an empty list as "something is configured" and a file
 * that keeps growing empty keys is a file nobody trusts.
 */
export function withoutOurHooks(settings: Record<string, unknown>, command: string): Record<string, unknown> {
  if (!isRecord(settings[HOOKS_KEY])) {
    return settings;
  }
  const hooks = settings[HOOKS_KEY] as Record<string, unknown>;
  const next: Record<string, unknown> = { ...hooks };

  for (const event of HOOK_EVENTS) {
    const existing = hooks[event];
    if (!Array.isArray(existing)) {
      continue;
    }
    const kept = existing.filter(
      (matcher) =>
        !(
          isRecord(matcher) &&
          Array.isArray(matcher.hooks) &&
          matcher.hooks.every((hook) => isRecord(hook) && hook.command === command)
        ),
    );
    if (kept.length === 0) {
      delete next[event];
    } else if (kept.length !== existing.length) {
      next[event] = kept;
    }
  }

  return { ...settings, [HOOKS_KEY]: next };
}

async function readSettings(path: string): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  if (text.trim() === '') {
    return {};
  }
  // Thrown rather than returned, because a file we cannot parse is a refusal
  // and not an empty settings object: the difference is somebody's config.
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Writes the hook entries, or explains why it did not.
 *
 * Consent is checked before the file is read, so declining leaves no trace at
 * all — not even a read that could fail on somebody else's permissions.
 */
export async function installClaudeHooks(options: InstallOptions): Promise<InstallOutcome> {
  const settingsPath = options.settingsPath ?? defaultSettingsPath();
  if (!options.consent) {
    return { status: 'declined' };
  }
  if (options.command.trim() === '') {
    throw new Error('a hook needs a command to run');
  }

  let existing: Record<string, unknown>;
  try {
    existing = (await readSettings(settingsPath)) ?? {};
  } catch (error) {
    return {
      status: 'refused-unreadable',
      settingsPath,
      reason: `${settingsPath} is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }

  const hooks = isRecord(existing[HOOKS_KEY]) ? (existing[HOOKS_KEY] as Record<string, unknown>) : {};
  if (isAlreadyInstalled(hooks, options.command)) {
    return { status: 'already-present', settingsPath };
  }

  // Merged per event, not spread over the whole hooks object. Spreading
  // `{ ...hooks, ...ourEvents }` replaces each event's array outright, so a
  // person who already had a PreToolUse hook — a linter, a formatter, anything
  // — had it silently deleted by installing ours. Two tools hooking the same
  // event is the normal case, not a conflict.
  const nextHooks: Record<string, unknown> = { ...hooks };
  for (const [event, matcher] of Object.entries(matchersFor(options.command))) {
    const already = nextHooks[event];
    nextHooks[event] = Array.isArray(already) ? [...already, matcher] : [matcher];
  }

  const merged: Record<string, unknown> = { ...existing, [HOOKS_KEY]: nextHooks };
  await writeFile(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

  return { status: 'installed', settingsPath, events: HOOK_EVENTS };
}

/** Removes our entries. Consent is not asked for: removing is the safe direction. */
export async function uninstallClaudeHooks(
  options: Pick<InstallOptions, 'command' | 'settingsPath'>,
): Promise<InstallOutcome> {
  const settingsPath = options.settingsPath ?? defaultSettingsPath();
  let existing: Record<string, unknown>;
  try {
    existing = (await readSettings(settingsPath)) ?? {};
  } catch (error) {
    return {
      status: 'refused-unreadable',
      settingsPath,
      reason: `${settingsPath} is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }

  await writeFile(
    settingsPath,
    `${JSON.stringify(withoutOurHooks(existing, options.command), null, 2)}\n`,
    'utf8',
  );
  return { status: 'installed', settingsPath, events: HOOK_EVENTS };
}
