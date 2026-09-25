import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  installClaudeHooks,
  uninstallClaudeHooks,
  withoutOurHooks,
} from './install-claude.js';

/**
 * The one part of an adapter that touches somebody's editor configuration.
 *
 * Every test writes to a temp file, and the assertions that matter are all
 * about what did NOT change: a developer's model, their permissions, and their
 * own hooks on the same events. An installer that passes "did the hook get
 * written" while quietly resetting three unrelated keys is worse than no
 * installer, because it is discovered later.
 */

const COMMAND = 'agent-battle hook forward';

function settingsPath(contents?: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'claude-settings-')), 'settings.json');
  if (contents !== undefined) {
    writeFileSync(path, contents, 'utf8');
  }
  return path;
}

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('consent', () => {
  it('writes nothing at all when consent is withheld', async () => {
    const path = settingsPath();

    const outcome = await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: false });

    expect(outcome.status).toBe('declined');
    // Not read and not written: a declined install should leave no trace to
    // clean up, and should not fail on a path the person cannot read either.
    expect(existsSync(path)).toBe(false);
  });

  it('refuses an empty command, because a hook with nothing to run is not a hook', async () => {
    const path = settingsPath();

    await expect(
      installClaudeHooks({ command: '   ', settingsPath: path, consent: true }),
    ).rejects.toThrow(/needs a command/);
  });
});

describe('installing', () => {
  it('writes every hook event into a settings file that did not exist', async () => {
    const path = settingsPath();

    const outcome = await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });

    expect(outcome.status).toBe('installed');
    const hooks = read(path).hooks as Record<string, unknown>;
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop']) {
      expect(hooks[event], event).toBeDefined();
    }
  });

  it('leaves every unrelated setting exactly as it was', async () => {
    // The settings file belongs to the person using it. A rewrite destroys the
    // model they chose and the permissions they configured.
    const original = {
      model: 'opus',
      permissions: { allow: ['Bash(ls:*)'] },
      env: { ANTHROPIC_API_KEY: 'kept' },
    };
    const path = settingsPath(JSON.stringify(original, null, 2));

    await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });

    const after = read(path);
    expect(after.model).toBe('opus');
    expect(after.permissions).toEqual({ allow: ['Bash(ls:*)'] });
    expect(after.env).toEqual({ ANTHROPIC_API_KEY: 'kept' });
    expect(after.hooks).toBeDefined();
  });

  it('keeps somebody else\'s hook on the same event', async () => {
    // Two tools hooking PreToolUse is the normal case, not a conflict. The one
    // that must never be deleted is not ours.
    const original = {
      hooks: {
        PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-tool lint' }] }],
      },
    };
    const path = settingsPath(JSON.stringify(original));

    await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });

    const preToolUse = (read(path).hooks as Record<string, unknown>).PreToolUse as unknown[];
    expect(JSON.stringify(preToolUse)).toContain('other-tool lint');
    expect(JSON.stringify(preToolUse)).toContain(COMMAND);
  });

  it('reports already-present rather than writing the same thing twice', async () => {
    const path = settingsPath();
    await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });
    const first = readFileSync(path, 'utf8');

    const outcome = await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });

    expect(outcome.status).toBe('already-present');
    expect(readFileSync(path, 'utf8')).toBe(first);
  });
});

describe('a settings file we cannot parse', () => {
  it('is refused, not replaced', async () => {
    // An installer that "fixes" a config it cannot parse is how somebody loses
    // a day. The only safe action is to refuse and say which file.
    const path = settingsPath('{ this is not json');
    const before = readFileSync(path, 'utf8');

    const outcome = await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });

    expect(outcome.status).toBe('refused-unreadable');
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('is refused on uninstall too, rather than emptied', async () => {
    const path = settingsPath('not json at all');

    const outcome = await uninstallClaudeHooks({ command: COMMAND, settingsPath: path });

    expect(outcome.status).toBe('refused-unreadable');
    expect(readFileSync(path, 'utf8')).toBe('not json at all');
  });
});

describe('uninstalling', () => {
  it('removes only our entries and leaves the person\'s hook alone', async () => {
    const path = settingsPath();
    await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });
    // Somebody adds their own hook after we installed ours.
    const withBoth = read(path);
    (withBoth.hooks as Record<string, unknown>).PreToolUse = [
      ...((withBoth.hooks as Record<string, unknown>).PreToolUse as unknown[]),
      { matcher: '*', hooks: [{ type: 'command', command: 'other-tool lint' }] },
    ];
    writeFileSync(path, JSON.stringify(withBoth, null, 2), 'utf8');

    await uninstallClaudeHooks({ command: COMMAND, settingsPath: path });

    const remaining = JSON.stringify(read(path).hooks);
    expect(remaining).not.toContain(COMMAND);
    expect(remaining).toContain('other-tool lint');
  });

  it('leaves other settings untouched', async () => {
    const path = settingsPath(JSON.stringify({ model: 'opus' }));
    await installClaudeHooks({ command: COMMAND, settingsPath: path, consent: true });

    await uninstallClaudeHooks({ command: COMMAND, settingsPath: path });

    expect(read(path).model).toBe('opus');
  });
});

describe('withoutOurHooks, on its own', () => {
  it('is a no-op on a settings file with no hooks key', () => {
    const settings = { model: 'opus' };

    expect(withoutOurHooks(settings, COMMAND)).toEqual({ model: 'opus' });
  });

  it('does not treat somebody else\'s command as ours', () => {
    // A substring search for the word "command" would report our hook as
    // present when it is the person's, and uninstall would be a no-op they
    // would read as success.
    const settings = {
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-tool' }] }] },
    };

    const result = withoutOurHooks(settings, COMMAND);

    expect(result).toEqual(settings);
  });
});
