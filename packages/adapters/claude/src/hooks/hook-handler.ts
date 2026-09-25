import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { deriveCallEvents, deriveOutcomeEvents, type EventBase } from '../derive.js';

/**
 * The hook plane: the primary way this adapter learns what an agent is doing.
 *
 * Claude Code has the richest hook surface of any supported harness, so this is
 * where a session is understood in real time and the JSONL tail is only the
 * safety net for what a crash or a forced quit left behind.
 *
 * Two decisions shape everything here.
 *
 * The identity fields do NOT come from Claude. `agentId`, `installationId` and
 * `projectId` are ours, supplied by whoever installed the hook, because a hook
 * payload names a transcript and a cwd and nothing else. A payload that claimed
 * its own agent id would be a client asserting its identity, which is the one
 * thing an installation token exists to prevent.
 *
 * A malformed payload returns null rather than throwing. The hook runs inside
 * somebody's coding session; an adapter that crashes the session it is
 * observing is worse than an adapter that drops one event. The null is counted,
 * so a Claude version that changed its payload shape is visible rather than
 * silently producing an empty stream.
 *
 * No schema library, and that is the adapter rule rather than a preference:
 * adapters import `core` and `protocol` and nothing else, and zod was an
 * undeclared dependency here that happened to resolve because the root hoists
 * it. A package that works by accident is one reinstall away from not working.
 */

const CLAUDE_HARNESS = 'claude';

/** What a Claude Code hook POSTs, as far as this adapter cares. */
interface HookPayload {
  readonly hookEventName: string | undefined;
  readonly sessionId: string;
  readonly prompt: string | undefined;
  readonly toolName: string | undefined;
  readonly toolInput: unknown;
  readonly toolResponse: unknown;
}

/**
 * Narrows a hook POST, or returns null.
 *
 * Only `session_id` is required, because it is the one field every event needs
 * — the type union in core refuses an AgentEvent without it, so a payload
 * missing it cannot produce anything valid. Everything else is optional here
 * because Claude adds fields over time and a new one must not break the adapter.
 */
function readPayload(value: unknown): HookPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const sessionId = record.session_id;
  if (typeof sessionId !== 'string' || sessionId === '') {
    return null;
  }
  const optionalString = (key: string): string | undefined => {
    const found = record[key];
    return typeof found === 'string' ? found : undefined;
  };
  return {
    hookEventName: optionalString('hook_event_name'),
    sessionId,
    prompt: optionalString('prompt'),
    toolName: optionalString('tool_name'),
    toolInput: record.tool_input,
    toolResponse: record.tool_response,
  };
}

/**
 * What the installer knows and the payload cannot say.
 *
 * Injected rather than read from a global so the whole normalizer is testable
 * without an installation, and so nothing in this file can reach the filesystem.
 */
export interface ClaudeHookContext {
  readonly agentId: string;
  readonly installationId: string;
  readonly projectId: string;
  /** ISO 8601 with an offset. The protocol rejects a local timestamp. */
  readonly at: string;
}

export interface NormalizedHook {
  /**
   * The events one payload produced, in the order they should be reported.
   *
   * A list rather than a single event because one tool call is more than one
   * fact: a PreToolUse on Edit is a `tool.started` AND a `file.write`, and a
   * PostToolUse on Bash is a `tool.completed` AND a `command.run` AND, when the
   * command was a test run, a `test.passed`. Collapsing them to one would mean
   * dropping the ones the game actually shows.
   */
  readonly events: readonly AgentEvent[];
  /** Why no event was produced, when none was. Counted, not thrown. */
  readonly skipped: string | undefined;
}

/** The half of a tool call this adapter has to remember between payloads. */
interface PendingTool {
  readonly startedAt: number;
  readonly input: Record<string, unknown>;
}

/**
 * Stateful, because two of the payloads are halves of one fact.
 *
 * A `tool.started` and its `tool.completed` carry no shared id, so the only way
 * to report a duration is to remember when the start was emitted. The input is
 * remembered for the same reason: it is what a `command.run` is read out of, and
 * an adapter that lost it would report a tool completing and say nothing about
 * the command it ran.
 */
export class ClaudeHookNormalizer {
  readonly #pending = new Map<string, PendingTool>();
  #skipped = 0;

  /** How many payloads produced no event. A silent adapter and a broken one differ here. */
  get skippedCount(): number {
    return this.#skipped;
  }

  normalize(payload: unknown, context: ClaudeHookContext): NormalizedHook {
    const input = readPayload(payload);
    if (input === null) {
      return this.#skip('unreadable-payload');
    }
    const events = this.#toEvents(input, context);
    if (events.length === 0) {
      return this.#skip(`no-mapping:${input.hookEventName ?? '<unnamed>'}`);
    }
    return { events, skipped: undefined };
  }

  #skip(reason: string): NormalizedHook {
    this.#skipped += 1;
    return { events: [], skipped: reason };
  }

  #toEvents(input: HookPayload, context: ClaudeHookContext): readonly AgentEvent[] {
    const base: EventBase = { sessionId: input.sessionId, at: context.at };
    switch (input.hookEventName) {
      case 'SessionStart':
        return [
          {
            ...base,
            type: 'session.started',
            agentId: context.agentId,
            installationId: context.installationId,
            projectId: context.projectId,
            harness: CLAUDE_HARNESS,
          },
        ];
      case 'UserPromptSubmit':
        return [
          {
            ...base,
            type: 'prompt.submitted',
            // An empty prompt is still a prompt; dropping the field is honest
            // where inventing prose is not.
            ...(input.prompt === undefined || input.prompt === '' ? {} : { prompt: input.prompt }),
          },
        ];
      case 'PreToolUse': {
        const tool = this.#toolName(input.toolName);
        if (tool === null) {
          return [];
        }
        const normalized = normalizeToolInput(input.toolInput);
        this.#pending.set(this.#key(input.sessionId, tool), {
          startedAt: Date.parse(context.at),
          input: normalized,
        });
        // A file action is knowable from the call: the path is in the input and
        // the intent is the event. Nothing about the outcome is knowable yet.
        return [
          { ...base, type: 'tool.started', tool, input: normalized },
          ...deriveCallEvents(tool, normalized, base),
        ];
      }
      case 'PostToolUse': {
        const tool = this.#toolName(input.toolName);
        if (tool === null) {
          return [];
        }
        const key = this.#key(input.sessionId, tool);
        const pending = this.#pending.get(key);
        this.#pending.delete(key);
        // A completion with no remembered start means the adapter restarted
        // mid-tool, or the start was dropped. Zero is the honest duration for
        // "we do not know", and the protocol's non-negative integer has no way
        // to say "unknown" — so the alternative would be a fabricated number.
        const durationMs =
          pending === undefined ? 0 : Math.max(0, Date.parse(context.at) - pending.startedAt);
        // The payload's own input when it carries one, and the remembered one
        // otherwise, so a PostToolUse whose tool_input is absent still reports
        // the command rather than silently reporting nothing.
        const normalized = normalizeToolInput(input.toolInput ?? pending?.input);
        const completion: AgentEvent = isFailure(input.toolResponse)
          ? { ...base, type: 'tool.failed', tool, reason: failureReason(input.toolResponse) }
          : { ...base, type: 'tool.completed', tool, ok: true, durationMs };
        return [completion, ...deriveOutcomeEvents(tool, normalized, input.toolResponse, base)];
      }
      case 'PermissionRequest': {
        const tool = this.#toolName(input.toolName);
        return tool === null ? [] : [{ ...base, type: 'permission.requested', tool }];
      }
      case 'Stop':
        // Claude's Stop means the turn ended, not the process. A session that
        // keeps working emits another SessionStart-adjacent turn, and the
        // platform's own lifecycle is what finally reports 'crashed'.
        return [{ ...base, type: 'session.ended', reason: 'completed' }];
      default:
        return [];
    }
  }

  #toolName(raw: string | undefined): string | null {
    // A tool name is the one field every tool event needs, so a payload missing
    // it cannot be repaired. Returning null says "no event" rather than
    // emitting a tool.started with an empty name the protocol would reject.
    return raw === undefined || raw === '' ? null : normalizeToolName(raw);
  }

  #key(sessionId: string, tool: string): string {
    return `${sessionId} ${tool}`;
  }
}

/**
 * Whether a tool response is a failure.
 *
 * Claude reports a denied or errored tool as a response object carrying an
 * error, and a successful one as the tool's own return value. Treating every
 * response as success is how a denied permission reaches the game looking like
 * work that happened.
 */
function isFailure(response: unknown): boolean {
  if (typeof response !== 'object' || response === null) {
    return false;
  }
  const record = response as Record<string, unknown>;
  if (record.is_error === true || record.isError === true) {
    return true;
  }
  return 'error' in record && record.error !== undefined && record.error !== null;
}

/** The human-facing half of a failure, when the harness gave one. */
function failureReason(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  const error = (response as { readonly error?: unknown }).error;
  if (typeof error === 'string' && error !== '') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const message = (error as { readonly message?: unknown }).message;
    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }
  return 'tool-failed';
}
