import { z } from 'zod';

import { PROTOCOL_VERSION } from './version.js';

const MIN_NON_EMPTY_LENGTH = 1;
const JSON_SCHEMA_INDENT_SPACES = 2;
const EVENT_TYPE_FIELD = 'type';
const MISSING_EVENT_TYPE_LABEL = '<missing>';
const AGENT_EVENT_SCHEMA_BASE_URL = 'https://agentbattle.gg/schemas/agent-event/';
const AGENT_EVENT_SCHEMA_TITLE = 'AgentEvent';

const identifierSchema = z.string().min(MIN_NON_EMPTY_LENGTH);

// Adapters in several languages emit local timestamps without a zone designator.
// Those are ambiguous once the event leaves the machine that wrote it, so the
// wire contract requires an explicit offset and rejects them at the boundary.
const isoTimestampSchema = z.iso.datetime({ offset: true });
const nonNegativeIntegerSchema = z.number().int().nonnegative();

// 'other' is the escape hatch: a new coding agent ships an adapter before this
// enum grows an entry, and the core must keep accepting its events meanwhile.
export const harnessSchema = z.enum([
  'claude',
  'codex',
  'opencode',
  'cursor',
  'pi',
  'gemini',
  'amp',
  'other',
]);
export type Harness = z.infer<typeof harnessSchema>;

export const sessionEndReasonSchema = z.enum(['completed', 'abandoned', 'crashed']);
export type SessionEndReason = z.infer<typeof sessionEndReasonSchema>;

function baseEvent<TType extends string>(type: TType) {
  return z.object({
    type: z.literal(type),
    sessionId: identifierSchema,
    at: isoTimestampSchema,
  });
}

export const sessionStartedEventSchema = baseEvent('session.started').extend({
  agentId: identifierSchema,
  installationId: identifierSchema,
  projectId: identifierSchema,
  harness: harnessSchema,
});
export type SessionStartedEvent = z.infer<typeof sessionStartedEventSchema>;

export const sessionHeartbeatEventSchema = baseEvent('session.heartbeat');
export type SessionHeartbeatEvent = z.infer<typeof sessionHeartbeatEventSchema>;

export const sessionEndedEventSchema = baseEvent('session.ended').extend({
  reason: sessionEndReasonSchema,
});
export type SessionEndedEvent = z.infer<typeof sessionEndedEventSchema>;

export const toolStartedEventSchema = baseEvent('tool.started').extend({
  tool: identifierSchema,
  input: z.unknown().optional(),
});
export type ToolStartedEvent = z.infer<typeof toolStartedEventSchema>;

export const toolCompletedEventSchema = baseEvent('tool.completed').extend({
  tool: identifierSchema,
  ok: z.boolean(),
  durationMs: nonNegativeIntegerSchema,
});
export type ToolCompletedEvent = z.infer<typeof toolCompletedEventSchema>;

// A failure is a separate event rather than tool.completed with ok:false. The
// game reads a failed tool differently from a tool that returned successfully
// with a false result, and an adapter that has to decide which one to emit from
// a single exit path is exactly where that distinction gets lost.
export const toolFailedEventSchema = baseEvent('tool.failed').extend({
  tool: identifierSchema,
  reason: identifierSchema.optional(),
});
export type ToolFailedEvent = z.infer<typeof toolFailedEventSchema>;

export const promptSubmittedEventSchema = baseEvent('prompt.submitted').extend({
  prompt: identifierSchema.optional(),
});
export type PromptSubmittedEvent = z.infer<typeof promptSubmittedEventSchema>;

export const fileReadEventSchema = baseEvent('file.read').extend({
  path: identifierSchema,
});
export type FileReadEvent = z.infer<typeof fileReadEventSchema>;

export const fileWriteEventSchema = baseEvent('file.write').extend({
  path: identifierSchema,
  linesAdded: nonNegativeIntegerSchema.optional(),
  linesRemoved: nonNegativeIntegerSchema.optional(),
});
export type FileWriteEvent = z.infer<typeof fileWriteEventSchema>;

export const commandRunEventSchema = baseEvent('command.run').extend({
  argv0: identifierSchema,
  exitCode: z.number().int().optional(),
});
export type CommandRunEvent = z.infer<typeof commandRunEventSchema>;

export const testPassedEventSchema = baseEvent('test.passed').extend({
  suite: identifierSchema.optional(),
  count: nonNegativeIntegerSchema.optional(),
});
export type TestPassedEvent = z.infer<typeof testPassedEventSchema>;

export const testFailedEventSchema = baseEvent('test.failed').extend({
  suite: identifierSchema.optional(),
  failure: identifierSchema.optional(),
});
export type TestFailedEvent = z.infer<typeof testFailedEventSchema>;

export const thinkingEventSchema = baseEvent('thinking');
export type ThinkingEvent = z.infer<typeof thinkingEventSchema>;

export const waitingEventSchema = baseEvent('waiting').extend({
  reason: identifierSchema.optional(),
});
export type WaitingEvent = z.infer<typeof waitingEventSchema>;

export const permissionRequestedEventSchema = baseEvent('permission.requested').extend({
  tool: identifierSchema,
});
export type PermissionRequestedEvent = z.infer<typeof permissionRequestedEventSchema>;

export const messageSentEventSchema = baseEvent('message.sent').extend({
  toAgentId: identifierSchema,
  body: identifierSchema,
});
export type MessageSentEvent = z.infer<typeof messageSentEventSchema>;

// The receiver's side of the same message. Without it, a message is only ever
// visible to the machine that sent it, so a game watching a second agent would
// have no event to show for what it was told.
export const messageReceivedEventSchema = baseEvent('message.received').extend({
  fromAgentId: identifierSchema,
  body: identifierSchema,
});
export type MessageReceivedEvent = z.infer<typeof messageReceivedEventSchema>;

// A change the harness noticed but did not necessarily make itself: a branch
// switch, a pull, a checkout. Distinct from file.write, which is a write the
// agent performed.
export const fileChangedEventSchema = baseEvent('file.changed').extend({
  path: identifierSchema,
  change: z.enum(['created', 'modified', 'deleted', 'renamed']),
});
export type FileChangedEvent = z.infer<typeof fileChangedEventSchema>;

export const taskCreatedEventSchema = baseEvent('task.created').extend({
  taskRef: identifierSchema,
  title: identifierSchema.optional(),
});
export type TaskCreatedEvent = z.infer<typeof taskCreatedEventSchema>;

export const subagentSpawnedEventSchema = baseEvent('subagent.spawned').extend({
  childSessionId: identifierSchema,
});
export type SubagentSpawnedEvent = z.infer<typeof subagentSpawnedEventSchema>;

export const subagentCompletedEventSchema = baseEvent('subagent.completed').extend({
  childSessionId: identifierSchema,
  ok: z.boolean(),
});
export type SubagentCompletedEvent = z.infer<typeof subagentCompletedEventSchema>;

export const agentEventSchemas = [
  sessionStartedEventSchema,
  sessionHeartbeatEventSchema,
  sessionEndedEventSchema,
  promptSubmittedEventSchema,
  toolStartedEventSchema,
  toolCompletedEventSchema,
  toolFailedEventSchema,
  fileReadEventSchema,
  fileWriteEventSchema,
  fileChangedEventSchema,
  commandRunEventSchema,
  testPassedEventSchema,
  testFailedEventSchema,
  thinkingEventSchema,
  waitingEventSchema,
  permissionRequestedEventSchema,
  messageSentEventSchema,
  messageReceivedEventSchema,
  subagentSpawnedEventSchema,
  subagentCompletedEventSchema,
  taskCreatedEventSchema,
] as const;

export const AGENT_EVENT_TYPES = Object.freeze(
  agentEventSchemas.map((schema) => schema.shape.type.value),
);

function readEventType(input: unknown): string {
  if (typeof input === 'object' && input !== null) {
    const candidate = (input as Record<string, unknown>)[EVENT_TYPE_FIELD];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }
  return MISSING_EVENT_TYPE_LABEL;
}

function describeUnknownEventType(input: unknown): string {
  return [
    `unknown AgentEvent type ${JSON.stringify(readEventType(input))}`,
    `expected one of: ${AGENT_EVENT_TYPES.join(' | ')}`,
    `(protocol ${PROTOCOL_VERSION})`,
  ].join('; ');
}

export const AgentEventSchema = z.discriminatedUnion(EVENT_TYPE_FIELD, agentEventSchemas, {
  error: (issue) => describeUnknownEventType(issue.input),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent[typeof EVENT_TYPE_FIELD];

export const AGENT_EVENT_JSON_SCHEMA_ID = `${AGENT_EVENT_SCHEMA_BASE_URL}${PROTOCOL_VERSION}.json`;
export const AGENT_EVENT_JSON_SCHEMA_FILE_NAME = 'agent-event.schema.json';

export const agentEventJsonSchema = z.toJSONSchema(AgentEventSchema, {
  io: 'output',
  override: (context) => {
    if (context.zodSchema !== AgentEventSchema) {
      return;
    }
    context.jsonSchema.$id = AGENT_EVENT_JSON_SCHEMA_ID;
    context.jsonSchema.title = AGENT_EVENT_SCHEMA_TITLE;
  },
});

export function serializeAgentEventJsonSchema(): string {
  return `${JSON.stringify(agentEventJsonSchema, null, JSON_SCHEMA_INDENT_SPACES)}\n`;
}
