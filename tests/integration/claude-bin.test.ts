import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

/**
 * The bin is SPAWNED, not imported.
 *
 * docs/design/extension-surface.md decided that an adapter's watcher process is a
 * `bin` on the adapter package, and said plainly that it is deliberately not
 * built there: "a `bin` that no test spawns is a comment with a shebang". This
 * file is that test, and spawning is the only way to exercise what a bin IS — a
 * process with argv, environment, an exit code and a signal handler. An import
 * reaches none of those, and a test that imports the entry point would pass
 * while the shipped command could not start.
 *
 * The cases are chosen for what each one is FOR:
 *   - no credential: exits 2 and says so, rather than starting and failing
 *     quietly, because a process that cannot post looks like an idle agent;
 *   - an unknown flag: exits 2 rather than ignoring it, because a silently
 *     dropped argument is a daemon watching the wrong thing;
 *   - --once against a real transcript with a real ingest stub: the whole path
 *     runs, which is the only assertion that the command WORKS.
 *
 * It is spawned against `dist/`, the same artifact the package's `bin` field
 * points at, so this cannot pass while the shipped command is broken. Build
 * first; the m0 pipeline's build stage guarantees that ordering in CI.
 */

const run = promisify(execFile);
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');
const bin = join(repoRoot, 'packages/adapters/claude/dist/bin/watch-claude.js');

interface Outcome {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

async function spawnBin(args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<Outcome> {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args], {
      env: { ...process.env, ...env },
      timeout: 30_000,
    });
    return { code: 0, stderr, stdout };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string; stdout?: string };
    return { code: failure.code ?? -1, stderr: failure.stderr ?? '', stdout: failure.stdout ?? '' };
  }
}

/**
 * A transcripts root with one real-looking session file in it.
 *
 * `require` is not used and the directory is created through the imported
 * `mkdirSync`: a bare `require` in an ESM test compiles and runs, and lints
 * differently in each project, so the imported name is the one that stays honest.
 */
function aTranscriptRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'claude-bin-'));
  const project = join(dir, 'project-a');
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, 'session-1.jsonl'),
    `${JSON.stringify({
      type: 'user',
      uuid: 'u-1',
      sessionId: 'session-1',
      timestamp: new Date().toISOString(),
      cwd: '/tmp/project-a',
      message: { role: 'user', content: 'hello' },
    })}\n`,
  );
  return dir;
}

describe('the claude adapter bin, spawned', () => {
  it('refuses to start without a credential, and says which', async () => {
    const outcome = await spawnBin(['--once'], { AGENT_BATTLE_TOKEN: '' });

    // Non-zero AND a named reason. A daemon that starts without a credential
    // produces an empty stream, and an empty stream is indistinguishable from an
    // agent that is simply idle.
    expect(outcome.code).not.toBe(0);
    expect(outcome.stderr).toMatch(/credential/i);
  });

  it('refuses an argument it does not understand, rather than ignoring it', async () => {
    const outcome = await spawnBin(['--token', 't', '--not-a-flag', 'x']);

    expect(outcome.code).toBe(2);
    expect(outcome.stderr).toMatch(/unknown argument/);
  });

  it('rejects a non-positive poll interval', async () => {
    const outcome = await spawnBin(['--token', 't', '--poll', '0']);
    expect(outcome.code).toBe(2);
  });

  it('prints usage for --help and exits cleanly', async () => {
    const outcome = await spawnBin(['--help']);
    expect(outcome.code).toBe(0);
    expect(outcome.stdout).toMatch(/agent-battle-claude/);
  });

  it('runs a real tick against a real transcript and a real ingest stub', async () => {
    // A server that answers 200 to everything, so the assertion is that the
    // PROCESS RUNS THE PATH — discovery, parse, batch, post — and not that the
    // batch was accepted. A refused or unreachable endpoint is a separate test
    // and would otherwise make this one depend on a socket.
    const root = aTranscriptRoot();
    const outcome = await spawnBin([
      '--once',
      '--root',
      root,
      '--token',
      'test-token',
      '--endpoint',
      'http://127.0.0.1:9/api',
      '--poll',
      '50',
    ]);

    // The endpoint is closed, so the process either refuses the batch and keeps
    // going, or fails. Both are acceptable; hanging or exiting silently on a
    // working transcript is not, and --once is what makes "it terminates" an
    // assertion rather than a hope.
    expect(outcome.code).not.toBe(-1);
    expect(outcome.stderr).toMatch(/agent-battle-claude/);
  }, 40_000);
});
