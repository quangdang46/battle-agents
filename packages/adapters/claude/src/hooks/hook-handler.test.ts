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

/** Normalizes and proves the result survives the schema every surface uses. */
function normalize(
  normalizer: ClaudeHookNormalizer,
  payload: Record<string, unknown>,
  context: ClaudeHookContext = CONTEXT,
): AgentEvent | null {
  const { event, skipped } = normalizer.normalize(
    { session_id: SESSION, ...payload },
    context,
  );
  if (event === null) {
    expect(skipped, 'a payload that produced no event should say why').toBeDefined();
    return null;
  }
  const parsed = AgentEventSchema.safeParse(event);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  return event;
}

describe('session lifecycle', () => {
  it('turns SessionStart into session.started with OUR identity, not the payload\'s', () => {
    const event = normalize(new ClaudeHookNormalizer(), { hook_event_name: 'SessionStart' });

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
    const event = normalize(new ClaudeHookNormalizer(), { hook_event_name: 'Stop' });

    expect(event).toMatchObject({ type: 'session.ended', reason: 'completed' });
  });

  it('turns UserPromptSubmit into prompt.submitted, and omits an empty prompt rather than inventing one', () => {
    const withPrompt = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'fix the build',
    });
    const withoutPrompt = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'UserPromptSubmit',
      prompt: '',
    });

    expect(withPrompt).toMatchObject({ type: 'prompt.submitted', prompt: 'fix the build' });
    expect(withoutPrompt).toMatchObject({ type: 'prompt.submitted' });
    expect(withoutPrompt).not.toHaveProperty('prompt');
  });
});

describe('tools', () => {
  it('normalises the tool name, so Read and its aliases are one activity', () => {
    const event = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    });

    expect(event).toMatchObject({
      type: 'tool.started',
      tool: normalizeToolName('Read'),
      input: normalizeToolInput({ file_path: 'src/index.ts' }),
    });
  });

  it('normalises input keys to snake_case, because a consumer reads one shape', () => {
    const event = normalize(new ClaudeHookNormalizer(), {
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
    normalize(normalizer, { hook_event_name: 'PreToolUse', tool_name: 'Bash' }, { ...CONTEXT, at: AT });
    const completed = normalize(
      normalizer,
      { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'ok' } },
      { ...CONTEXT, at: '2026-09-25T09:00:02.500Z' },
    );

    expect(completed).toMatchObject({ type: 'tool.completed', ok: true, durationMs: 2500 });
  });

  it('reports zero rather than a fabricated duration when the start was not seen', () => {
    // A restart mid-tool loses the start. Inventing an elapsed time is worse
    // than saying zero, because a game reading the number cannot tell them apart.
    const event = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { stdout: 'ok' },
    });

    expect(event).toMatchObject({ type: 'tool.completed', durationMs: 0 });
  });

  it('reports an errored tool as tool.failed, not as a successful completion', () => {
    // The protocol has a separate event for this, and the comment on it is the
    // reason: a reader treats a failure differently from a tool that returned
    // false, and an adapter deciding between them at one exit path is exactly
    // where the distinction is lost.
    const errored = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { is_error: true, error: 'permission denied' },
    });
    const messageOnly = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_response: { error: { message: 'exit 1' } },
    });

    expect(errored).toMatchObject({ type: 'tool.failed', reason: 'permission denied' });
    expect(messageOnly).toMatchObject({ type: 'tool.failed', reason: 'exit 1' });
  });

  it('reports a permission request as its own event', () => {
    const event = normalize(new ClaudeHookNormalizer(), {
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
    });

    expect(event).toMatchObject({ type: 'permission.requested', tool: normalizeToolName('Bash') });
  });

  it('emits nothing for a tool payload with no tool name, rather than an empty one', () => {
    const normalizer = new ClaudeHookNormalizer();

    expect(normalize(normalizer, { hook_event_name: 'PreToolUse' })).toBeNull();
    expect(normalizer.skippedCount).toBe(1);
  });
});

describe('payloads this adapter does not understand', () => {
  it('drops an event type it has no mapping for, and counts it', () => {
    // Claude ships new hooks. An adapter that threw on one would break the
    // coding session it is watching; one that silently produced nothing would
    // be indistinguishable from a session doing no work.
    const normalizer = new ClaudeHookNormalizer();

    expect(normalize(normalizer, { hook_event_name: 'PreCompact' })).toBeNull();
    expect(normalizer.skippedCount).toBe(1);
  });

  it('drops a payload with no session id, because every event needs one', () => {
    const normalizer = new ClaudeHookNormalizer();
    const { event, skipped } = normalizer.normalize({ hook_event_name: 'SessionStart' }, CONTEXT);

    expect(event).toBeNull();
    expect(skipped).toBe('unreadable-payload');
  });

  it('drops a payload that is not an object at all', () => {
    const normalizer = new ClaudeHookNormalizer();

    for (const payload of [null, undefined, 'a string', 42]) {
      expect(normalizer.normalize(payload, CONTEXT).event).toBeNull();
    }
    expect(normalizer.skippedCount).toBe(4);
  });
});
