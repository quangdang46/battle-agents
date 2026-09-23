import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AGENT_EVENT_JSON_SCHEMA_FILE_NAME,
  AGENT_EVENT_JSON_SCHEMA_ID,
  AGENT_EVENT_TYPES,
  AgentEventSchema,
  agentEventJsonSchema,
  agentEventSchemas,
  serializeAgentEventJsonSchema,
  type AgentEvent,
  type AgentEventType,
} from './agent-event.js';
import { PROTOCOL_VERSION } from './version.js';

const SCHEMAS_DIR_NAME = 'schemas';
const SESSION_ID = 'session-1';
const ISO_AT = '2026-09-24T02:29:27.000Z';
const COMMON_FIELDS = { sessionId: SESSION_ID, at: ISO_AT } as const;

const SCHEMA_FILE_URL = new URL(
  `../${SCHEMAS_DIR_NAME}/${AGENT_EVENT_JSON_SCHEMA_FILE_NAME}`,
  import.meta.url,
);

const VALID_EVENTS: readonly AgentEvent[] = [
  {
    type: 'session.started',
    ...COMMON_FIELDS,
    agentId: 'agent-1',
    installationId: 'install-1',
    projectId: 'project-1',
    harness: 'claude',
  },
  { type: 'session.heartbeat', ...COMMON_FIELDS },
  { type: 'session.ended', ...COMMON_FIELDS, reason: 'completed' },
  {
    type: 'tool.started',
    ...COMMON_FIELDS,
    tool: 'bash',
    input: { command: 'ls' },
  },
  { type: 'tool.completed', ...COMMON_FIELDS, tool: 'bash', ok: true, durationMs: 12 },
  { type: 'file.read', ...COMMON_FIELDS, path: 'src/index.ts' },
  { type: 'file.write', ...COMMON_FIELDS, path: 'src/index.ts', linesAdded: 4, linesRemoved: 1 },
  { type: 'command.run', ...COMMON_FIELDS, argv0: 'pnpm', exitCode: 0 },
  { type: 'test.passed', ...COMMON_FIELDS, suite: 'unit', count: 3 },
  { type: 'test.failed', ...COMMON_FIELDS, suite: 'unit', failure: 'expected true' },
  { type: 'thinking', ...COMMON_FIELDS },
  { type: 'waiting', ...COMMON_FIELDS, reason: 'user input' },
  { type: 'permission.requested', ...COMMON_FIELDS, tool: 'bash' },
  { type: 'message.sent', ...COMMON_FIELDS, toAgentId: 'agent-2', body: 'hello' },
  { type: 'subagent.spawned', ...COMMON_FIELDS, childSessionId: 'session-2' },
  { type: 'subagent.completed', ...COMMON_FIELDS, childSessionId: 'session-2', ok: true },
];

interface RejectedSample {
  readonly label: string;
  readonly input: unknown;
  readonly expectedPath: string;
  readonly expectedMessage: string;
}

const REJECTED_SAMPLES: readonly RejectedSample[] = [
  {
    label: 'unknown event type',
    input: { type: 'session.exploded', ...COMMON_FIELDS },
    expectedPath: 'type',
    expectedMessage: 'unknown AgentEvent type "session.exploded"',
  },
  {
    label: 'missing event type',
    input: { ...COMMON_FIELDS },
    expectedPath: 'type',
    expectedMessage: 'unknown AgentEvent type "<missing>"',
  },
  {
    label: 'missing at',
    input: { type: 'session.heartbeat', sessionId: SESSION_ID },
    expectedPath: 'at',
    expectedMessage: 'expected string, received undefined',
  },
  {
    label: 'missing sessionId',
    input: { type: 'session.heartbeat', at: ISO_AT },
    expectedPath: 'sessionId',
    expectedMessage: 'expected string, received undefined',
  },
  {
    label: 'at without timezone designator',
    input: { type: 'session.heartbeat', sessionId: SESSION_ID, at: '2026-09-24T02:29:27' },
    expectedPath: 'at',
    expectedMessage: 'Invalid ISO datetime',
  },
  {
    label: 'empty sessionId',
    input: { type: 'session.heartbeat', sessionId: '', at: ISO_AT },
    expectedPath: 'sessionId',
    expectedMessage: 'Too small',
  },
  {
    label: 'harness outside the enum',
    input: {
      type: 'session.started',
      ...COMMON_FIELDS,
      agentId: 'agent-1',
      installationId: 'install-1',
      projectId: 'project-1',
      harness: 'emacs',
    },
    expectedPath: 'harness',
    expectedMessage: 'Invalid option: expected one of "claude"',
  },
  {
    label: 'missing type-specific field',
    input: { type: 'tool.completed', ...COMMON_FIELDS, tool: 'bash', durationMs: 1 },
    expectedPath: 'ok',
    expectedMessage: 'expected boolean, received undefined',
  },
  {
    label: 'negative durationMs',
    input: { type: 'tool.completed', ...COMMON_FIELDS, tool: 'bash', ok: true, durationMs: -1 },
    expectedPath: 'durationMs',
    expectedMessage: 'Too small',
  },
];

function parseIssues(input: unknown): readonly string[] {
  const result = AgentEventSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.message);
}

function parseIssuePaths(input: unknown): readonly string[] {
  const result = AgentEventSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.join('.'));
}

function describeUnionShape(): Record<string, readonly string[]> {
  return Object.fromEntries(
    agentEventSchemas.map((schema) => [schema.shape.type.value, Object.keys(schema.shape).sort()]),
  );
}

function classify(event: AgentEvent): AgentEventType {
  switch (event.type) {
    case 'session.started':
    case 'session.heartbeat':
    case 'session.ended':
    case 'tool.started':
    case 'tool.completed':
    case 'file.read':
    case 'file.write':
    case 'command.run':
    case 'test.passed':
    case 'test.failed':
    case 'thinking':
    case 'waiting':
    case 'permission.requested':
    case 'message.sent':
    case 'subagent.spawned':
    case 'subagent.completed':
      return event.type;
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

describe('AgentEvent union', () => {
  it('round-trips one well-formed event per declared type', () => {
    for (const event of VALID_EVENTS) {
      expect(AgentEventSchema.parse(event)).toEqual(event);
    }
  });

  it('covers every declared type with exactly one round-trip sample', () => {
    expect(VALID_EVENTS.map((event) => event.type)).toEqual(AGENT_EVENT_TYPES);
    expect(new Set(AGENT_EVENT_TYPES).size).toBe(AGENT_EVENT_TYPES.length);
  });

  it('narrows on the type discriminator without an exhaustiveness gap', () => {
    expect(VALID_EVENTS.map(classify)).toEqual(AGENT_EVENT_TYPES);
  });

  it('rejects malformed events at the offending field with an actionable message', () => {
    for (const sample of REJECTED_SAMPLES) {
      const messages = parseIssues(sample.input);
      expect(messages, sample.label).not.toEqual([]);
      expect(parseIssuePaths(sample.input), sample.label).toContain(sample.expectedPath);
      expect(messages.join('\n'), sample.label).toContain(sample.expectedMessage);
    }
  });

  it('names every known type when the discriminator is unrecognised', () => {
    const issues = parseIssues({ type: 'nope', ...COMMON_FIELDS });
    expect(issues.join('\n')).toContain(AGENT_EVENT_TYPES.join(' | '));
    expect(issues.join('\n')).toContain(`protocol ${PROTOCOL_VERSION}`);
  });

  it('requires sessionId and at on every variant', () => {
    for (const schema of agentEventSchemas) {
      const type = schema.shape.type.value;
      expect(parseIssues({ type }), `${type} without sessionId/at`).not.toEqual([]);
    }
  });

  it('locks the union shape so an accidental breaking change fails CI', () => {
    expect(describeUnionShape()).toMatchInlineSnapshot(`
      {
        "command.run": [
          "argv0",
          "at",
          "exitCode",
          "sessionId",
          "type",
        ],
        "file.read": [
          "at",
          "path",
          "sessionId",
          "type",
        ],
        "file.write": [
          "at",
          "linesAdded",
          "linesRemoved",
          "path",
          "sessionId",
          "type",
        ],
        "message.sent": [
          "at",
          "body",
          "sessionId",
          "toAgentId",
          "type",
        ],
        "permission.requested": [
          "at",
          "sessionId",
          "tool",
          "type",
        ],
        "session.ended": [
          "at",
          "reason",
          "sessionId",
          "type",
        ],
        "session.heartbeat": [
          "at",
          "sessionId",
          "type",
        ],
        "session.started": [
          "agentId",
          "at",
          "harness",
          "installationId",
          "projectId",
          "sessionId",
          "type",
        ],
        "subagent.completed": [
          "at",
          "childSessionId",
          "ok",
          "sessionId",
          "type",
        ],
        "subagent.spawned": [
          "at",
          "childSessionId",
          "sessionId",
          "type",
        ],
        "test.failed": [
          "at",
          "failure",
          "sessionId",
          "suite",
          "type",
        ],
        "test.passed": [
          "at",
          "count",
          "sessionId",
          "suite",
          "type",
        ],
        "thinking": [
          "at",
          "sessionId",
          "type",
        ],
        "tool.completed": [
          "at",
          "durationMs",
          "ok",
          "sessionId",
          "tool",
          "type",
        ],
        "tool.started": [
          "at",
          "input",
          "sessionId",
          "tool",
          "type",
        ],
        "waiting": [
          "at",
          "reason",
          "sessionId",
          "type",
        ],
      }
    `);
  });
});

describe('AgentEvent JSON Schema', () => {
  it('pins the schema id to the protocol version', () => {
    expect(AGENT_EVENT_JSON_SCHEMA_ID).toContain(PROTOCOL_VERSION);
    expect(agentEventJsonSchema.$id).toBe(AGENT_EVENT_JSON_SCHEMA_ID);
    expect(agentEventJsonSchema.oneOf).toHaveLength(AGENT_EVENT_TYPES.length);
  });

  it('matches the committed artifact for cross-language adapters', () => {
    // Compared as parsed JSON, not byte-for-byte: the committed copy is run
    // through prettier, so only the schema content is the contract.
    //
    // Regenerate with:
    //   pnpm --filter @battle-agents/protocol build
    //   node -e "import('./packages/protocol/dist/index.js').then(m => process.stdout.write(m.serializeAgentEventJsonSchema()))" > packages/protocol/schemas/agent-event.schema.json
    //   pnpm exec prettier --write packages/protocol/schemas/agent-event.schema.json
    const committed: unknown = JSON.parse(readFileSync(fileURLToPath(SCHEMA_FILE_URL), 'utf8'));
    const generated: unknown = JSON.parse(serializeAgentEventJsonSchema());
    expect(committed).toEqual(generated);
  });
});
