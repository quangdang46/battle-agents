import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  makeScratchBase,
  provisionWorkspace,
  removeScratchBase,
  environmentFor,
  WorkspaceEscape,
} from './workspace.js';
import { resolveInside } from './workspace-paths.js';
import { DEFAULT_BATTLE_WEIGHTS } from './domain.js';
import { runJudge } from './judge-run.js';

/**
 * Workspace isolation, proved against a real filesystem.
 *
 * The rule this file has to earn is one sentence: A PARTICIPANT'S HANDLE CANNOT
 * BE MADE TO NAME A PATH OUTSIDE ITS OWN ROOT, INCLUDING THROUGH A SYMLINK. Not
 * "usually", and not "for the paths the tests thought of".
 *
 * Every fixture here is a real directory with a real symlink, because the
 * escape that matters cannot be simulated by a string. A `resolve()`-based
 * containment check passes `<root>/peek/secret.txt` — it is inside the root,
 * textually — and then reads the OTHER participant's file, because `peek` is a
 * symlink. The test below creates exactly that symlink and asserts the read is
 * refused; if it ever stops being refused, the guard is gone, not the fixture.
 */

let base: string | null = null;

function scratch(): string {
  base = makeScratchBase('battle-workspace-test-');
  return base;
}

afterEach(() => {
  if (base !== null) {
    removeScratchBase(base);
    base = null;
  }
});

/** Two participants in one battle, which is the only arrangement isolation is about. */
function twoParticipants(): {
  first: ReturnType<typeof provisionWorkspace>;
  second: ReturnType<typeof provisionWorkspace>;
} {
  const root = scratch();
  return {
    first: provisionWorkspace(root, 'battle-1', 'session-a'),
    second: provisionWorkspace(root, 'battle-1', 'session-b'),
  };
}

describe('a handle cannot leave its own workspace', () => {
  it('refuses an absolute path, even one that happens to be inside the root', () => {
    const { first } = twoParticipants();
    first.handle.writeTextFile('notes.txt', 'mine');

    // The same file, named two ways. A guard that reinterprets an absolute path
    // as workspace-relative accepts this and refuses `second.root + "/x"`, so
    // the rule would be "sometimes" and the caller could not predict which.
    expect(first.handle.readTextFile('notes.txt')).toBe('mine');
    expect(() => first.handle.readTextFile(first.handle.root + '/notes.txt')).toThrow(
      WorkspaceEscape,
    );
  });

  it('refuses `..` traversal, and names that as the reason', () => {
    const { first, second } = twoParticipants();
    writeFileSync(join(second.root, 'secret.txt'), 'the other participant');

    let caught: unknown;
    try {
      first.handle.readTextFile('../session-b/secret.txt');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceEscape);
    expect((caught as WorkspaceEscape).reason).toBe('leaves-root');
  });

  it('refuses a path that leaves the root only after a symlink is followed', () => {
    const { first, second } = twoParticipants();
    writeFileSync(join(second.root, 'secret.txt'), 'the other participant');
    // The relative symlink a participant can create inside their own workspace
    // with one command. The literal path is INSIDE the root, which is the whole
    // point: a containment check made on the literal path passes this.
    symlinkSync('../session-b', join(first.root, 'peek'), 'dir');

    let caught: unknown;
    try {
      first.handle.readTextFile('peek/secret.txt');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceEscape);
    expect((caught as WorkspaceEscape).reason).toBe('symlink-leaves-root');
  });

  it('refuses an absolute symlink to a sibling too, which is the same bug with no `..`', () => {
    const { first, second } = twoParticipants();
    writeFileSync(join(second.root, 'secret.txt'), 'the other participant');
    symlinkSync(second.root, join(first.root, 'elsewhere'), 'dir');

    let caught: unknown;
    try {
      first.handle.readTextFile('elsewhere/secret.txt');
    } catch (error) {
      caught = error;
    }
    expect((caught as InstanceType<typeof WorkspaceEscape>).reason).toBe('symlink-leaves-root');
  });

  it('refuses to create a symlink-shaped path by writing through one', () => {
    const { first, second } = twoParticipants();
    writeFileSync(join(second.root, 'secret.txt'), 'the other participant');
    symlinkSync('../session-b', join(first.root, 'peek'), 'dir');

    expect(() => first.handle.writeTextFile('peek/planted.txt', 'mine now')).toThrow(
      WorkspaceEscape,
    );
    expect(readFileSync(join(second.root, 'secret.txt'), 'utf8')).toBe('the other participant');
    expect(existsSync(join(second.root, 'planted.txt'))).toBe(false);
  });

  it('refuses a symlink that points out through a directory that does not exist yet', () => {
    // The destination has not been created, so `realpathSync(target)` throws and
    // a guard that only resolved the final component would skip the check. The
    // nearest-existing-ancestor walk is what makes this refuse.
    const { first, second } = twoParticipants();
    mkdirSync(join(first.root, 'out'), { recursive: true });
    symlinkSync(second.root, join(first.root, 'out', 'link'), 'dir');

    expect(() => resolveInside(first.root, 'out/link/anything.txt')).toThrow(WorkspaceEscape);
  });

  it('still allows a symlink that stays inside, so the guard is containment and not a ban', () => {
    // The half that keeps this from being "refuse everything": a workspace
    // where `node_modules` or a cache is a link must still work, and a guard
    // that refused every symlink would pass the escape test above while making
    // the workspace unusable.
    const { first } = twoParticipants();
    first.handle.writeTextFile('real/target.txt', 'inside');
    symlinkSync(join(first.root, 'real'), join(first.root, 'alias'), 'dir');

    expect(first.handle.readTextFile('alias/target.txt')).toBe('inside');
  });

  it('does not mistake a shared string prefix for containment', () => {
    // `session-a` and `session-ab` are two real directories one character apart,
    // and a startsWith check reports the second as inside the first.
    const root = scratch();
    const first = provisionWorkspace(root, 'battle-1', 'session-a');
    const neighbour = provisionWorkspace(root, 'battle-1', 'session-ab');

    expect(neighbour.root.startsWith(first.root)).toBe(true);
    expect(() => first.handle.readTextFile('../session-ab/anything.txt')).toThrow(WorkspaceEscape);
  });
});

describe('what a command inside a workspace can see', () => {
  it('is given an environment with no variable the operator exported', () => {
    const { first, second } = twoParticipants();
    const env = environmentFor(first.root);

    expect(Object.keys(env).sort()).toEqual(
      ['HOME', 'LANG', 'PATH', 'TZ', 'WORKSPACE_ROOT']
        .filter((key) => env[key] !== undefined)
        .sort(),
    );
    expect(env['HOME']).toBe(first.root);
    expect(env['WORKSPACE_ROOT']).toBe(first.root);
    // The one leak this shape of guard cannot close by allowlisting: a
    // participant can name any path it can already see. See the header.
    expect(JSON.stringify(env)).not.toContain(second.root);
  });

  it('points HOME at the workspace, so ~/.ssh is not the operator’s', async () => {
    const { first } = twoParticipants();
    const result = await first.handle.run('echo "$HOME"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(first.root);
  });

  it('runs with the workspace as its working directory', async () => {
    const { first } = twoParticipants();
    const result = await first.handle.run('pwd');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toContain('session-a');
  });
});

describe('the gates are a guard on the process, not a report about it', () => {
  it('never starts a command a gate refused', async () => {
    const { first } = twoParticipants();
    // A sibling directory outside the workspace, so a guard that failed would
    // destroy something real and observable rather than nothing at all.
    const outside = join(first.root, '..', 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'precious.txt'), 'not the participant’s to delete');

    const result = await first.handle.run('rm -rf ../outside && touch planted.txt');

    expect(result.refusedBy).toBe('destructive-warn');
    expect(result.exitCode).toBeNull();
    // The `touch` is the witness. A gate that ran the command and then reported
    // failure would have left this file behind.
    expect(existsSync(join(first.root, 'planted.txt'))).toBe(false);
    expect(readFileSync(join(outside, 'precious.txt'), 'utf8')).toBe(
      'not the participant’s to delete',
    );
  });

  it('lets a participant delete inside their own workspace, which is disposable', async () => {
    // The deliberate divergence from upstream documented in gates.ts. It is
    // here so the escape test above cannot be read as "rm is blocked", and so a
    // future tightening of this rule is a visible change rather than a silent one.
    const { first } = twoParticipants();
    mkdirSync(join(first.root, 'build'), { recursive: true });

    const result = await first.handle.run('rm -rf build');

    expect(result.refusedBy).toBeNull();
    expect(existsSync(join(first.root, 'build'))).toBe(false);
  });

  it('allows a command no gate objects to', async () => {
    const { first } = twoParticipants();
    const result = await first.handle.run('echo hello');
    expect(result.refusedBy).toBeNull();
    expect(result.stdout.trim()).toBe('hello');
  });

  it('kills a command that outlives its timeout rather than letting it hold the match', async () => {
    const { first } = twoParticipants();
    const result = await first.handle.run('sleep 30', { timeoutMs: 150 });
    expect(result.timedOut).toBe(true);
  }, 15_000);

  it('carries the caller’s facts into the gate, and the workspace root wins', async () => {
    const { first } = twoParticipants();

    // The facts only the caller knows reach the gate through the run options.
    const red = await first.handle.run('git commit -m "fix: x"', {
      gateContext: {
        workspaceRoot: '/somewhere/else',
        branch: 'work',
        verification: { ran: true, passed: false },
      },
    });
    expect(red.refusedBy).toBe('test-gate');

    // And a caller cannot widen its own containment by naming another root: the
    // handle's root is the last word, so `rm -rf` outside the REAL workspace is
    // still refused even when the context says otherwise.
    const widened = await first.handle.run('rm -rf ../outside', {
      gateContext: { workspaceRoot: '/', branch: null, verification: null },
    });
    expect(widened.refusedBy).toBe('destructive-warn');
  });

  it('is the same guard the judge run goes through, with no second copy of it', async () => {
    // The end-to-end shape: a real process, a real gate, a real judge step. If
    // the judge had its own idea of what to refuse, this would pass while the
    // two disagreed, and the disagreement would only show up in a match.
    const { first } = twoParticipants();
    const report = await runJudge({
      battleId: 'battle-1',
      sessionId: 'session-a',
      workspace: first.handle,
      weights: DEFAULT_BATTLE_WEIGHTS,
      plan: [
        {
          step: 'install',
          criterion: null,
          required: true,
          timeoutMs: 5_000,
          command: 'rm -rf ../outside',
        },
      ],
    });

    expect(report.events[0]?.outcome).toBe('refused');
    expect(report.forfeit?.step).toBe('install');
  });
});

describe('provisioning', () => {
  it('gives two participants of one battle two different roots', () => {
    const { first, second } = twoParticipants();
    expect(first.root).not.toBe(second.root);
    expect(first.handle.battleId).toBe('battle-1');
    expect(first.handle.sessionId).toBe('session-a');
  });

  it('refuses an id that would place one workspace inside another', () => {
    const root = scratch();
    // A sessionId is a path segment here, so an id containing a separator is
    // not a malformed name — it is a way to choose which directory you land in.
    expect(() => provisionWorkspace(root, 'battle-1', '../escape')).toThrow(/single path segment/);
    expect(() => provisionWorkspace(root, 'battle-1', 'a/b')).toThrow(/single path segment/);
    expect(() => provisionWorkspace(root, '..', 'session-a')).toThrow(/single path segment/);
    expect(() => provisionWorkspace(root, 'battle-1', '')).toThrow(/single path segment/);
  });

  it('lists the participant’s files without walking out of the root', () => {
    const { first, second } = twoParticipants();
    first.handle.writeTextFile('src/a.ts', 'a');
    first.handle.writeTextFile('src/nested/b.ts', 'b');
    writeFileSync(join(second.root, 'theirs.ts'), 'not mine');

    expect(first.handle.files()).toEqual(['src/a.ts', 'src/nested/b.ts']);
  });
});
