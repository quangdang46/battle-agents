import { AgentEventSchema, normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import { ClaudeHookNormalizer, type ClaudeHookContext } from './hook-handler.js';

/**
 * The hook plane, asserted against the protocol schema rather than a local copy.
 *
 * An event this adapter emits is validated at the door by `AgentEventSchema` and
 * refused with a 400 if it does not describe. A test that compared against a
 * hand-written expectation here would pass while the real thing bounced, which
 * is the same failure the bead warns about: a local copy of the contract drifts
 * and nothing says so.
 */

const AT = '2026-09-25T09:00:00.000Z';

const CONTEXT: ClaudeHookContext = {
  agentId: 'agent-1',
  installationId: 'inst-1',
  projectId: 'project-1',
  at: AT,
};

const SESSION = 'claude-session-abc';

/**
 * Normalizes and proves every event survives the schema every surface uses.
 *
 * A LIST because one payload is more than one fact: a PreToolUse on Edit is a
 * `tool.started` AND a `file.write`, and a test that only ever looked at the
 * first would report the adapter passing while the derived file event was
 * silently absent.
 */
function normalize(
  normalizer: ClaudeHookNormalizer,
  payload: Record<string, unknown>,
  context: ClaudeHookContext = CONTEXT,
): readonly AgentEvent[] {
  const { events, skipped } = normalizer.normalize({ session_id: SESSION, ...payload }, context);
  if (events.length === 0) {
    expect(skipped, 'a payload that produced no event should say why').toBeDefined();
    return [];
  }
  for (const event of events) {
    const parsed = AgentEventSchema.safeParse(event);
    expect(parsed.success, `${event.type}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
  }
  return events;
}

/** The one event a payload is expected to produce, asserted to be exactly one. */
function only(events: readonly AgentEvent[]): AgentEvent {
  expect(events).toHaveLength(1);
  return events[0] as AgentEvent;
}

describe('session lifecycle', () => {
  it("turns SessionStart into session.started with OUR identity, not the payload's", () => {
    const event = only(normalize(new ClaudeHookNormalizer(), { hook_event_name: 'SessionStart' }));

    expect(event).toMatchObject({
      type: 'session.started',
      sessionId: SESSION,
      agentId: 'agent-1',
      installationId: 'inst-1',
      projectId: 'project-1',
      harness: 'claude',
    });
  });

  it('turns Stop into session.ended, completed', () => {
    const event = only(normalize(new ClaudeHookNormalizer(), { hook_event_name: 'Stop' }));

    expect(event).toMatchObject({ type: 'session.ended', reason: 'completed' });
  });

  it('turns UserPromptSubmit into prompt.submitted, and omits an empty prompt rather than inventing one', () => {
    const withPrompt = only(
      normalize(new ClaudeHookNormalizer(), {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'fix the build',
      }),
    );
    const withoutPrompt = only(
      normalize(new ClaudeHookNormalizer(), {
        hook_event_name: 'UserPromptSubmit',
        prompt: '',
      }),
    );

    expect(withPrompt).toMatchObject({ type: 'prompt.submitted', prompt: 'fix the build' });
    expect(withoutPrompt).toMatchObject({ type: 'prompt.submitted' });
    expect(withoutPrompt).not.toHaveProperty('prompt');
  });
});

describe('tools', () => {
  it('normalises the tool name, so Read and its aliases are one activity', () => {
    const events = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    });

    expect(events[0]).toMatchObject({
      type: 'tool.started',
      tool: normalizeToolName('Read'),
      input: normalizeToolInput({ file_path: 'src/index.ts' }),
    });
    // The file event the success criteria names, derived from the same call.
    expect(events[1]).toMatchObject({ type: 'file.read', path: 'src/index.ts' });
  });

  it('normalises input keys to snake_case, because a consumer reads one shape', () => {
    const [event] = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { filePath: 'src/index.ts', oldString: 'a', newString: 'b', replaceAll: false },
    });

    expect(event).toMatchObject({
      input: { file_path: 'src/index.ts', old_string: 'a', new_string: 'b', replace_all: false },
    });
  });

  it('reports a duration by remembering the start, because a completion carries none', () => {
    const normalizer = new ClaudeHookNormalizer();
    normalize(
      normalizer,
      { hook_event_name: 'PreToolUse', tool_name: 'Bash' },
      { ...CONTEXT, at: AT },
    );
    const completed = only(
      normalize(
        normalizer,
        { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'ok' } },
        { ...CONTEXT, at: '2026-09-25T09:00:02.500Z' },
      ),
    );

    expect(completed).toMatchObject({ type: 'tool.completed', ok: true, durationMs: 2500 });
  });

  it('reports zero rather than a fabricated duration when the start was not seen', () => {
    // A restart mid-tool loses the start. Inventing an elapsed time is worse
    // than saying zero, because a game reading the number cannot tell them apart.
    const event = only(
      normalize(new ClaudeHookNormalizer(), {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_response: { stdout: 'ok' },
      }),
    );

    expect(event).toMatchObject({ type: 'tool.completed', durationMs: 0 });
  });

  it('reports an errored tool as tool.failed, not as a successful completion', () => {
    // The protocol has a separate event for this, and the comment on it is the
    // reason: a reader treats a failure differently from a tool that returned
    // false, and an adapter deciding between them at one exit path is exactly
    // where the distinction is lost.
    const errored = only(
      normalize(new ClaudeHookNormalizer(), {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_response: { is_error: true, error: 'permission denied' },
      }),
    );
    const messageOnly = only(
      normalize(new ClaudeHookNormalizer(), {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_response: { error: { message: 'exit 1' } },
      }),
    );

    expect(errored).toMatchObject({ type: 'tool.failed', reason: 'permission denied' });
    expect(messageOnly).toMatchObject({ type: 'tool.failed', reason: 'exit 1' });
  });

  it('reports a permission request as its own event', () => {
    const event = only(
      normalize(new ClaudeHookNormalizer(), {
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
      }),
    );

    expect(event).toMatchObject({ type: 'permission.requested', tool: normalizeToolName('Bash') });
  });

  it('emits nothing for a tool payload with no tool name, rather than an empty one', () => {
    const normalizer = new ClaudeHookNormalizer();

    expect(normalize(normalizer, { hook_event_name: 'PreToolUse' })).toEqual([]);
    expect(normalizer.skippedCount).toBe(1);
  });
});

/**
 * What a command turned out to be.
 *
 * These are the two families only this plane can produce: the tail reads the
 * tool_use line and never the result, so a session whose hooks were down reports
 * which files it touched and never which commands it ran. They are also the two
 * the bead's success criteria name, and until these assertions existed nothing
 * in the package proved the derivation was WIRED rather than merely correct —
 * deleting the `deriveOutcomeEvents` call from PostToolUse left all 94 tests
 * green, because the only tests naming a command called the function directly.
 */
describe('a completed command', () => {
  /**
   * One `pnpm test` from the two payloads Claude actually sends for it.
   *
   * The input is remembered rather than echoed, because that is the shape the
   * normalizer was built to survive: PostToolUse carries the result, and the
   * command is only known because PreToolUse said so. A suite that always
   * echoed the input back would pass whether or not the input is remembered.
   */
  function ran(
    response: unknown,
    options: { readonly command?: string; readonly echoInput?: boolean } = {},
  ): readonly AgentEvent[] {
    const normalizer = new ClaudeHookNormalizer();
    const command = options.command ?? 'pnpm test';
    normalize(normalizer, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    });
    return normalize(
      normalizer,
      {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        ...(options.echoInput === true ? { tool_input: { command } } : {}),
        tool_response: response,
      },
      { ...CONTEXT, at: '2026-09-25T09:00:02.500Z' },
    );
  }

  const types = (events: readonly AgentEvent[]): readonly string[] =>
    events.map((event) => event.type);

  it('names the program it ran, and that the tests passed', () => {
    const events = ran({ is_error: false, content: 'Test Files 2 passed\n Tests 51 passed' });

    expect(types(events)).toEqual(['tool.completed', 'command.run', 'test.passed']);
    expect(events[1]).toMatchObject({ type: 'command.run', argv0: 'pnpm' });
  });

  it('carries the exit code, because a red run is the fact worth having', () => {
    const events = ran({ is_error: true, content: 'Exit code 2\n 3 failed' });

    expect(events[1]).toMatchObject({ type: 'command.run', argv0: 'pnpm', exitCode: 2 });
  });

  it('reaches the same answer when the harness echoes the input back', () => {
    // Both spellings exist in the wild. Reading only the echoed one would break
    // on a PostToolUse that omits it; reading only the remembered one would
    // ignore a corrected command.
    expect(types(ran({ is_error: false, content: '51 passed' }, { echoInput: true }))).toEqual([
      'tool.completed',
      'command.run',
      'test.passed',
    ]);
  });

  it('reports a failure for a run that exited non-zero', () => {
    expect(types(ran({ is_error: true, content: 'Exit code 1\n 3 failed' }))).toEqual([
      'tool.failed',
      'command.run',
      'test.failed',
    ]);
  });

  it('reports NOTHING for a command the harness blocked before it ran', () => {
    // The failure this guards is worse than a wrong answer: a blocked command
    // produced no test output at all, so a red suite is a result nobody saw.
    const events = ran({ is_error: true, content: '<tool_use_error>Blocked: pnpm test' });

    expect(types(events)).toEqual(['tool.failed', 'command.run']);
  });

  it('reports NOTHING for a command that is not a test run', () => {
    // A failing build is a command that failed, and no claim about tests.
    const events = ran({ is_error: true, content: 'Exit code 1' }, { command: 'pnpm build' });

    expect(types(events)).toEqual(['tool.failed', 'command.run']);
  });

  it('reports NOTHING when the harness said nothing either way', () => {
    // The assertion that matters most in this file. `test.passed` pays 100
    // experience, so a result this adapter cannot read has to earn no claim —
    // and the only thing standing between a silent skip and a scored green
    // suite is a test that fails when the two are confused.
    const events = ran({ content: 'still going' });

    expect(types(events)).toEqual(['tool.completed', 'command.run']);
  });
});

describe('payloads this adapter does not understand', () => {
  it('drops an event type it has no mapping for, and counts it', () => {
    // Claude ships new hooks. An adapter that threw on one would break the
    // coding session it is watching; one that silently produced nothing would
    // be indistinguishable from a session doing no work.
    const normalizer = new ClaudeHookNormalizer();

    expect(normalize(normalizer, { hook_event_name: 'PreCompact' })).toEqual([]);
    expect(normalizer.skippedCount).toBe(1);
  });

  it('drops a payload with no session id, because every event needs one', () => {
    const normalizer = new ClaudeHookNormalizer();
    const { events, skipped } = normalizer.normalize({ hook_event_name: 'SessionStart' }, CONTEXT);

    expect(events).toEqual([]);
    expect(skipped).toBe('unreadable-payload');
  });

  it('drops a payload that is not an object at all', () => {
    const normalizer = new ClaudeHookNormalizer();

    for (const payload of [null, undefined, 'a string', 42]) {
      expect(normalizer.normalize(payload, CONTEXT).events).toEqual([]);
    }
    expect(normalizer.skippedCount).toBe(4);
  });
});
