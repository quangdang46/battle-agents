import { AgentEventSchema } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import { argv0Of, deriveCallEvents, deriveOutcomeEvents, looksLikeTestCommand } from './derive.js';

/**
 * What a tool call MEANS, which is the half the protocol has types for and the
 * adapter had no consumer for.
 *
 * Two of these assertions are about a game mechanic: `test.passed` is worth 100
 * experience in `features/progression`. A false one does not merely mislabel a
 * line in an activity feed — it pays an agent for work that never happened and
 * builds the character as a tester. So every test below is written from the
 * side that could produce that: a command that did not run, a command that ran
 * and was blocked, a runner the recogniser does not know, and a non-runner that
 * looks like one.
 *
 * Every derived event goes through `AgentEventSchema`, the schema the ingest
 * endpoint validates with, so "this event is well-formed" is never a claim
 * about a local copy of the contract.
 */

const BASE = { sessionId: 'claude-session-abc', at: '2026-09-25T09:00:00.000Z' };

function types(events: readonly AgentEvent[]): readonly string[] {
  for (const event of events) {
    const parsed = AgentEventSchema.safeParse(event);
    expect(parsed.success, `${event.type}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
  return events.map((event) => event.type);
}

describe('a tool call becomes the file activity it describes', () => {
  it('reads a file for the tools the protocol calls readers', () => {
    for (const tool of ['Read', 'Glob', 'Grep']) {
      const events = deriveCallEvents(tool, { file_path: 'src/index.ts' }, BASE);
      // Glob and Grep carry a pattern rather than a path, so they are asked
      // with a path here to prove the classification, not the shape.
      expect(types(events)).toContain('file.read');
    }
  });

  it('writes a file for the tools the protocol calls writers', () => {
    for (const tool of ['Edit', 'Write', 'NotebookEdit']) {
      const events = deriveCallEvents(tool, { file_path: 'src/index.ts' }, BASE);
      expect(events).toEqual([
        { type: 'file.write', sessionId: BASE.sessionId, at: BASE.at, path: 'src/index.ts' },
      ]);
    }
  });

  it('reports no file activity for a search, which has no file to name', () => {
    // `file.read` has one required field and it has to be a path. A Grep names
    // a PATTERN, and reporting a search as a read is a claim the activity feed
    // would render as one.
    expect(deriveCallEvents('Grep', { pattern: 'TODO' }, BASE)).toEqual([]);
    expect(deriveCallEvents('Glob', { pattern: '**/*.ts' }, BASE)).toEqual([]);
  });

  it('reports nothing for a tool that is neither, and for a missing path', () => {
    expect(deriveCallEvents('Bash', { command: 'ls' }, BASE)).toEqual([]);
    expect(deriveCallEvents('Read', {}, BASE)).toEqual([]);
    expect(deriveCallEvents('Read', { file_path: '' }, BASE)).toEqual([]);
  });
});

describe('a command reports the program it ran', () => {
  it('names argv0, and the exit code when the harness reported one', () => {
    const events = deriveOutcomeEvents(
      'Bash',
      { command: 'git status --short' },
      { is_error: false, content: ' M src/index.ts' },
      BASE,
    );

    expect(events).toEqual([
      { type: 'command.run', sessionId: BASE.sessionId, at: BASE.at, argv0: 'git' },
    ]);
  });

  it('reads the exit code the wrapper wrote at the head of a failure', () => {
    // This is the common shape: `Exit code N` at the top of the output.
    const events = deriveOutcomeEvents(
      'Bash',
      { command: 'make build' },
      { is_error: true, content: 'Exit code 2\nmake: *** [build] Error 2' },
      BASE,
    );

    expect(events[0]).toMatchObject({ type: 'command.run', argv0: 'make', exitCode: 2 });
  });

  it('reads the exit code the wrapper wrote at the tail, because both exist', () => {
    // The other shape this harness writes, and the one a prefix-only reader
    // misses entirely — which would leave `command.run` with no exit code at all
    // for a command that plainly failed.
    const events = deriveOutcomeEvents(
      'Bash',
      { command: 'make build' },
      {
        is_error: true,
        content: 'cc: error: no input\n\nWall time: 0.01 seconds\n\nCommand exited with code 2',
      },
      BASE,
    );

    expect(events[0]).toMatchObject({ type: 'command.run', exitCode: 2 });
  });

  it('omits the exit code rather than inventing a zero', () => {
    // A `command.run` with a made-up 0 is a success claim nobody made.
    const events = deriveOutcomeEvents('Bash', { command: 'ls' }, { content: 'a\nb' }, BASE);

    expect(events[0]).not.toHaveProperty('exitCode');
  });

  it('reports nothing for a tool that is not a command', () => {
    expect(deriveOutcomeEvents('Read', { file_path: 'a.ts' }, { content: 'x' }, BASE)).toEqual([]);
    expect(deriveOutcomeEvents('Bash', {}, { content: 'x' }, BASE)).toEqual([]);
  });
});

describe('recognising a test run', () => {
  it('takes a runner invoked by name', () => {
    for (const command of ['jest', 'vitest run', 'pytest -q', 'rspec', 'phpunit']) {
      expect(looksLikeTestCommand(command), command).toBe(true);
    }
  });

  it('takes a runner behind a sub-command', () => {
    for (const command of ['go test ./...', 'cargo test', 'pnpm test', 'yarn test', 'npm test']) {
      expect(looksLikeTestCommand(command), command).toBe(true);
    }
  });

  it('takes a runner reached through an interpreter or a launcher', () => {
    expect(looksLikeTestCommand('python -m pytest')).toBe(true);
    expect(looksLikeTestCommand('python3 -m pytest')).toBe(true);
    expect(looksLikeTestCommand('npx vitest run')).toBe(true);
    expect(looksLikeTestCommand('bunx jest')).toBe(true);
  });

  it('takes a test sub-command under a runner that is also a launcher', () => {
    // `bun` is in both the launcher set and the sub-command set, so the order
    // the two are checked in decides whether `bun test` is ever reached. It is
    // the only spelling in this list that a launcher-first read gets wrong.
    expect(looksLikeTestCommand('bun test')).toBe(true);
  });

  it('reads through an environment prefix', () => {
    expect(looksLikeTestCommand('FOO=bar cargo test')).toBe(true);
    expect(looksLikeTestCommand('env NODE_ENV=test vitest')).toBe(true);
    expect(looksLikeTestCommand('env NODE_ENV=test pnpm test')).toBe(true);
  });

  it('does NOT take a dev server, which is what `run` means to three of them', () => {
    // `npm run dev`, `pnpm run dev` and `bun run dev` all start a server. Calling
    // that a test suite is the specific false positive this heuristic cannot
    // afford, which is why the sub-command list is exactly `test` and `t`.
    for (const command of ['npm run dev', 'pnpm run build', 'bun run start', 'npm run test:unit']) {
      expect(looksLikeTestCommand(command), command).toBe(false);
    }
  });

  it('does NOT take an ordinary command, however much it looks like work', () => {
    for (const command of ['ls', 'git commit', 'cargo build', 'go vet ./...', '', 'npx serve']) {
      expect(looksLikeTestCommand(command), command).toBe(false);
    }
  });

  it('does NOT take a script whose name merely contains "test"', () => {
    // `latest` and `contest` are not runners, and matching on a substring is
    // how an adapter starts reporting test activity for a project that has none.
    expect(looksLikeTestCommand('latest')).toBe(false);
    expect(looksLikeTestCommand('contest ./run')).toBe(false);
  });
});

describe('what a test run reports', () => {
  const run = (command: string, result: unknown): readonly string[] =>
    types(deriveOutcomeEvents('Bash', { command }, result, BASE));

  it('reports a pass for a run that succeeded', () => {
    expect(run('pnpm test', { is_error: false, content: '51 passed' })).toEqual([
      'command.run',
      'test.passed',
    ]);
  });

  it('reports a failure for a run that exited non-zero', () => {
    expect(run('pnpm test', { is_error: true, content: 'Exit code 1\n 3 failed' })).toEqual([
      'command.run',
      'test.failed',
    ]);
  });

  it('reports NOTHING for a run the harness refused to make', () => {
    // The failure this guards is worse than a wrong answer: a command blocked
    // before it ran is not a red test suite, it is no test suite at all, and
    // reporting it as failed invents a result nobody observed.
    const blocked = {
      is_error: true,
      content: '<tool_use_error>Blocked: sleep 60 followed by: pnpm test',
    };
    expect(run('pnpm test', blocked)).toEqual(['command.run']);
  });

  it('reports NOTHING for a command that is not a test run', () => {
    // A failing build is a command.run with an exit code, and nothing else.
    expect(run('pnpm build', { is_error: true, content: 'Exit code 1' })).toEqual(['command.run']);
  });

  it('reports NOTHING when the outcome is unreadable', () => {
    // A harness that says nothing either way produces no claim. The alternative
    // is a pass for a run this adapter cannot see, which is the whole risk.
    expect(run('pnpm test', { content: 'still going' })).toEqual(['command.run']);
  });
});

describe('naming the program a command runs', () => {
  it('skips the shell features that are not argv', () => {
    expect(argv0Of('git commit -m x')).toBe('git');
    expect(argv0Of('FOO=bar RUST_LOG=1 cargo test')).toBe('cargo');
    expect(argv0Of('env NODE_ENV=test vitest')).toBe('vitest');
  });

  it('keeps a resolved path whole, because that is what ran', () => {
    expect(argv0Of('/usr/bin/git status')).toBe('/usr/bin/git');
  });

  it('has no name for an empty command', () => {
    expect(argv0Of('   ')).toBeUndefined();
  });
});
