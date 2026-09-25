import { z } from 'zod';

import type { McpServer, ToolResult } from './server.js';

/**
 * The MCP Streamable HTTP wire, as a pure function of an `McpServer`.
 *
 * This is the piece `server.ts` said was missing. Everything the protocol
 * decides — the JSON-RPC envelope, the `Accept` gate, the `Mcp-Session-Id`
 * handshake, the method table — lives here, and nothing else in the repository
 * has to know any of it. The alternative was teaching a Next.js route handler
 * about JSON-RPC, which is how a transport ends up owning a decision.
 *
 * Deliberately not the official SDK. The SDK's Streamable HTTP transport is built
 * around a Node `http.Server`, so adopting it means either a custom server in
 * front of Next.js or a transport that never sees the outer request. The
 * handshake below is a few hundred lines of specification, it is exercised by
 * tests that speak it over `Request`/`Response`, and keeping it here means the
 * SDK stays a swap: `handleMcpRequest` is the whole surface a real transport
 * would have to reproduce.
 *
 * One thing this file deliberately does NOT do is authenticate. It has no idea
 * what a credential is. Authentication happens before this is called, and the
 * reason the MCP session id is safe to hand out unauthenticated-by-protocol is
 * written where it is assigned.
 */

const JSON_RPC_VERSION = '2.0';

/** The JSON-RPC error codes, which are the protocol's vocabulary, not ours. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

export const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * Newest first. The spec says a server answers with a version it supports, and
 * that a client disconnects if it cannot use the answer — so recognising the
 * older ones costs nothing and refusing them would break every client written
 * against a 2025 spec revision.
 */
const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  MCP_PROTOCOL_VERSION,
  '2025-03-26',
  '2024-11-05',
];

const SERVER_NAME = 'agent-battle';
const SERVER_VERSION = '0.0.0';

const JSON_CONTENT_TYPE = 'application/json';
const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';

/**
 * The spec requires a client to accept both, because a server may answer a POST
 * with a single JSON body or with an SSE stream. This server always answers with
 * JSON, and says so by requiring the header anyway: a client that cannot take
 * either is one we would rather refuse than answer in a format it will misparse.
 */
const REQUIRED_ACCEPT = [JSON_CONTENT_TYPE, EVENT_STREAM_CONTENT_TYPE];

const ACCEPTED = 202;
const OK = 200;
const BAD_REQUEST = 400;
const METHOD_NOT_ALLOWED = 405;
const UNSUPPORTED_MEDIA_TYPE = 415;
const NOT_ACCEPTABLE = 406;

const SESSION_HEADER = 'mcp-session-id';

type JsonRpcId = string | number | null;

interface JsonRpcSuccess {
  readonly jsonrpc: typeof JSON_RPC_VERSION;
  readonly id: JsonRpcId;
  readonly result: unknown;
}

interface JsonRpcFailure {
  readonly jsonrpc: typeof JSON_RPC_VERSION;
  readonly id: JsonRpcId;
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
}

type JsonRpcOutcome = JsonRpcSuccess | JsonRpcFailure;

/**
 * A failure that carries a JSON-RPC code, so the dispatcher can turn it into an
 * error response without every handler having to return a union. The alternative
 * — a result union threaded through four handlers — puts the failure shape in
 * every signature, which is how a handler ends up returning `ok: false` from two
 * different conventions.
 */
class McpProtocolError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

const idSchema = z.union([z.string(), z.number()]);

const messageSchema = z.object({
  jsonrpc: z.literal(JSON_RPC_VERSION),
  id: idSchema.nullish(),
  method: z.string(),
  params: z.unknown().optional(),
});

const initializeParamsSchema = z.object({
  protocolVersion: z.string(),
});

const callToolParamsSchema = z.object({
  name: z.string(),
  arguments: z.unknown().optional(),
});

/** A request the transport must route, reduced to what the protocol reads. */
export interface McpHttpRequest {
  readonly method: string;
  readonly headers: { get(name: string): string | null };
  /** Already parsed. Parsing failure is the web layer's to detect, not this one's. */
  readonly body: unknown;
}

export interface McpHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface McpHttpOptions {
  /**
   * Mints the value handed back as `Mcp-Session-Id`.
   *
   * Required rather than defaulted so this module never reaches for a platform
   * RNG: it has no `types: ["node"]`, and importing `node:crypto` for one UUID
   * would make a protocol translator depend on a runtime it does not otherwise
   * care about. It is also what lets a test assert the header without pinning a
   * random value into an expectation.
   *
   * The id is a correlation handle, not a credential. Authentication is the
   * Bearer token and happens before this is called, so an id handed to an
   * unauthenticated caller grants nothing — which is why this one can be
   * required without becoming an authentication surface of its own.
   */
  readonly newSessionId: () => string;
}

/**
 * Answers one Streamable HTTP POST.
 *
 * Async because `tools/call` reaches the Application API, and the API is async
 * for reasons the contract froze. Everything else here is synchronous; that is
 * why this returns a promise rather than a response and not a stream — a stream
 * would be the alternative encoding, not a different level of async.
 */
export async function handleMcpRequest(
  server: McpServer,
  request: McpHttpRequest,
  options: McpHttpOptions,
): Promise<McpHttpResponse> {
  const rejection = rejectUnsupportedTransport(request);
  if (rejection !== undefined) {
    return rejection;
  }

  const messages = readBatch(request.body);
  if ('error' in messages) {
    // A body we could not read is an HTTP failure carrying a JSON-RPC error,
    // not a JSON-RPC error wearing an HTTP status. The client needs both: the
    // status to know the request never reached dispatch, and the code to know
    // whether to fix the framing or the JSON.
    return { status: BAD_REQUEST, body: jsonRpcFailure(null, messages.error) };
  }

  const mintSessionId = options.newSessionId;
  let assignedSessionId: string | undefined;
  const outcomes: JsonRpcOutcome[] = [];

  for (const message of messages.messages) {
    const parsed = messageSchema.safeParse(message);
    if (!parsed.success) {
      outcomes.push(jsonRpcFailure(readId(message), new McpProtocolError(INVALID_REQUEST, describeIssues(parsed.error))));
      continue;
    }

    const { id, method, params } = parsed.data;
    // No id means a notification: the client is not waiting for an answer, and
    // replying with one is a protocol violation rather than a courtesy.
    if (id === undefined) {
      if (method === 'initialize') {
        assignedSessionId ??= mintSessionId();
      }
      continue;
    }

    try {
      const result = await dispatch(server, method, params);
      if (method === 'initialize') {
        assignedSessionId ??= mintSessionId();
      }
      outcomes.push({ jsonrpc: JSON_RPC_VERSION, id, result });
    } catch (thrown) {
      outcomes.push(
        jsonRpcFailure(
          id,
          thrown instanceof McpProtocolError
            ? thrown
            : new McpProtocolError(INTERNAL_ERROR, describeError(thrown)),
        ),
      );
    }
  }

  // A batch of nothing but notifications has no answer to give, and 202 is how
  // the spec says to say "received, nothing to report".
  if (outcomes.length === 0) {
    return {
      status: ACCEPTED,
      body: null,
      ...(assignedSessionId === undefined ? {} : { headers: { [SESSION_HEADER]: assignedSessionId } }),
    };
  }

  const body = messages.messages.length === 1 && outcomes.length === 1 ? outcomes[0] : outcomes;
  return {
    status: OK,
    body,
    ...(assignedSessionId === undefined ? {} : { headers: { [SESSION_HEADER]: assignedSessionId } }),
  };
}

function rejectUnsupportedTransport(request: McpHttpRequest): McpHttpResponse | undefined {
  if (request.method !== 'POST') {
    return {
      status: METHOD_NOT_ALLOWED,
      body: { error: `use POST; this endpoint speaks MCP over Streamable HTTP` },
      headers: { allow: 'POST' },
    };
  }

  const accept = request.headers.get('accept') ?? '';
  const missing = REQUIRED_ACCEPT.filter((type) => !accept.includes(type));
  if (missing.length > 0) {
    // 406 rather than 400 because the request is well-formed JSON-RPC; it is the
    // client's declared response types that cannot carry an answer.
    return {
      status: NOT_ACCEPTABLE,
      body: {
        error: `Accept must offer ${REQUIRED_ACCEPT.join(' and ')}`,
        missing,
      },
    };
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes(JSON_CONTENT_TYPE)) {
    return { status: UNSUPPORTED_MEDIA_TYPE, body: { error: `Content-Type must be ${JSON_CONTENT_TYPE}` } };
  }

  return undefined;
}

function readBatch(body: unknown): { messages: unknown[] } | { error: McpProtocolError } {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return { error: new McpProtocolError(INVALID_REQUEST, 'a batch must contain at least one message') };
    }
    return { messages: body };
  }
  if (body === undefined || body === null) {
    return { error: new McpProtocolError(PARSE_ERROR, 'a request body is required') };
  }
  return { messages: [body] };
}

async function dispatch(server: McpServer, method: string, params: unknown): Promise<unknown> {
  switch (method) {
    case 'initialize':
      return initialize(params);
    case 'tools/list':
      return listTools(server);
    case 'tools/call':
      return callTool(server, params);
    case 'ping':
      return {};
    default:
      throw new McpProtocolError(METHOD_NOT_FOUND, `unknown method "${method}"`);
  }
}

function initialize(params: unknown): unknown {
  const parsed = initializeParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new McpProtocolError(INVALID_PARAMS, 'initialize needs a protocolVersion', describeIssues(parsed.error));
  }

  // The client may ask for a revision this server predates. Answering with our
  // own version is what the spec prescribes, and the client disconnects if it
  // cannot speak it — which is a clearer failure than refusing to talk at all.
  const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(parsed.data.protocolVersion)
    ? parsed.data.protocolVersion
    : MCP_PROTOCOL_VERSION;

  return {
    protocolVersion: negotiated,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  };
}

function listTools(server: McpServer): unknown {
  return {
    tools: server.listTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputJsonSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    })),
  };
}

async function callTool(server: McpServer, params: unknown): Promise<unknown> {
  const parsed = callToolParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new McpProtocolError(INVALID_PARAMS, 'tools/call needs a name', describeIssues(parsed.error));
  }

  const result = await server.callTool(parsed.data.name, parsed.data.arguments);
  return toToolContent(result);
}

/**
 * MCP carries a tool failure as a successful JSON-RPC response whose payload
 * declares `isError`, not as a JSON-RPC error. The distinction is the client's
 * cue that the model should read the text and correct itself, rather than the
 * transport giving up — so an unknown tool has to survive this mapping intact.
 */
function toToolContent(result: ToolResult): unknown {
  const text = result.ok
    ? JSON.stringify(result.value ?? null)
    : (result.error?.message ?? 'the tool failed without saying why');

  return {
    content: [{ type: 'text', text }],
    isError: !result.ok,
  };
}

function jsonRpcFailure(id: JsonRpcId, error: McpProtocolError): JsonRpcFailure {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: {
      code: error.code,
      message: error.message,
      ...(error.data === undefined ? {} : { data: error.data }),
    },
  };
}

/**
 * Reads an id off a message we could not parse, so a malformed request still
 * gets its own error back rather than `id: null`. Losing it strands a client
 * that is waiting on a correlation it will never see echoed.
 */
function readId(message: unknown): JsonRpcId {
  if (typeof message !== 'object' || message === null) {
    return null;
  }
  const id = (message as { id?: unknown }).id;
  if (typeof id === 'string' || typeof id === 'number') {
    return id;
  }
  return null;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

function describeError(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}
