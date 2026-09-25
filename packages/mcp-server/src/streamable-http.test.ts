import { createApplicationApi, PRIMITIVES } from '@battle-agents/api';
import type { ApplicationApi } from '@battle-agents/api';
import {
  createInMemoryEventBus,
  createRuntime,
  defineAction,
  InMemoryStateStore,
} from '@battle-agents/core';

import { describe, expect, it } from 'vitest';

import { createMcpServer } from './server.js';
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from './streamable-http.js';

/**
 * These tests speak the Streamable HTTP protocol rather than calling
 * `createMcpServer`, because the in-process test that already exists is exactly
 * what passed before there was a wire and proved nothing about one. Every
 * assertion here goes through `Request` headers and a JSON-RPC body, so a
 * change that keeps the server working while breaking the transport fails here.
 */

const FIXTURE_DOMAINS = [
  { domain: 'quest', verb: 'claim' },
  { domain: 'reputation', verb: 'read' },
  { domain: 'progression', verb: 'read' },
] as const;

function apiWith(extensionCount: number): ApplicationApi {
  return createApplicationApi(
    createRuntime({
      extensions: FIXTURE_DOMAINS.slice(0, extensionCount).map((entry) => ({
        id: entry.domain,
        capabilities: [{ name: `${entry.domain}.read`, description: `reads ${entry.domain}` }],
        actionDefs: [
          defineAction({
            id: `${entry.domain}.${entry.verb}`,
            permissions: [`${entry.domain}.${entry.verb}`],
            run: async (input: { args: string }) => ({ claimed: input.args }),
          }),
        ],
      })),
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => '2026-09-25T12:00:00.000Z',
    }),
  );
}

/** The headers a conforming client sends. Overridable so a test can break one. */
function clientHeaders(overrides: Record<string, string> = {}): {
  get(name: string): string | null;
} {
  const headers = new Map<string, string>([
    ['accept', 'application/json, text/event-stream'],
    ['content-type', 'application/json'],
    ...Object.entries(overrides),
  ]);
  return { get: (name: string) => headers.get(name.toLowerCase()) ?? null };
}

const FIXED_SESSION_ID = 'session-under-test';

function post(
  server: ReturnType<typeof createMcpServer>,
  body: unknown,
  overrides: Record<string, string> = {},
) {
  return handleMcpRequest(
    server,
    { method: 'POST', headers: clientHeaders(overrides), body },
    { newSessionId: () => FIXED_SESSION_ID },
  );
}

function serverWith(extensionCount = 3) {
  return createMcpServer({ api: apiWith(extensionCount) });
}

function call(id: number, method: string, params?: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

describe('the handshake a real client performs', () => {
  it('answers initialize with a protocol version, capabilities and a session id', async () => {
    const response = await post(
      serverWith(),
      call(1, 'initialize', { protocolVersion: MCP_PROTOCOL_VERSION }),
    );

    expect(response.status).toBe(200);
    expect(response.headers?.['mcp-session-id']).toBe(FIXED_SESSION_ID);

    const body = response.body as { result: Record<string, unknown> };
    expect(body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it('answers an older protocol revision by echoing it back', async () => {
    // A client pinned to a revision this server predates should be told what it
    // got rather than being refused: the spec says the client disconnects if it
    // cannot use the answer, which is a clearer failure than a 4xx.
    const response = await post(
      serverWith(),
      call(1, 'initialize', { protocolVersion: '2024-11-05' }),
    );

    const body = response.body as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe('2024-11-05');
  });

  it('answers ping with an empty result', async () => {
    const response = await post(serverWith(), call(1, 'ping'));

    expect(response.status).toBe(200);
    expect((response.body as { result: unknown }).result).toEqual({});
  });
});

describe('the tool list over the wire', () => {
  it('is exactly five with every feature composed in', async () => {
    // The bead's success criterion as a test. A per-feature tool added later
    // fails here rather than shipping a six-tool surface.
    const response = await post(serverWith(3), call(2, 'tools/list'));

    const { result } = response.body as { result: { tools: { name: string }[] } };
    expect(result.tools.map((tool) => tool.name)).toEqual([...PRIMITIVES]);
  });

  it('carries a JSON Schema for each tool, because the SDK has nothing to infer', async () => {
    const response = await post(serverWith(1), call(2, 'tools/list'));

    const { result } = response.body as { result: { tools: { inputSchema: unknown }[] } };
    for (const tool of result.tools) {
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});

describe('tools/call reaches the application API', () => {
  it('dispatches act and returns the value as text content', async () => {
    const response = await post(
      serverWith(1),
      call(3, 'tools/call', {
        name: 'act',
        arguments: { action: 'quest.claim', input: { args: 'an-issue' } },
      }),
    );

    const { result } = response.body as {
      result: { content: { type: string; text: string }[]; isError: boolean };
    };
    expect(result.isError).toBe(false);

    // noUncheckedIndexedAccess: indexing an array yields `T | undefined`, and
    // asserting on a possibly-absent first element would let this pass with
    // zero content blocks.
    const [first] = result.content;
    expect(first?.type).toBe('text');
    expect(JSON.parse(first?.text ?? 'null')).toEqual({ claimed: 'an-issue' });
  });

  it('reports a tool failure as isError content, not a JSON-RPC error', async () => {
    // The distinction is the client's cue that the model should read the text
    // and correct itself. Collapsing it into a transport error makes an
    // unknown tool look like a broken server.
    const response = await post(
      serverWith(1),
      call(3, 'tools/call', { name: 'guild.join', arguments: {} }),
    );

    const body = response.body as { error?: unknown; result?: { isError: boolean } };
    expect(body.error).toBeUndefined();
    expect(body.result?.isError).toBe(true);
  });
});

describe('the transport gate', () => {
  it('refuses a client that cannot accept either response encoding', async () => {
    // 406 and not 400: the JSON-RPC in the body is well formed. It is the
    // client's declared response types that cannot carry an answer.
    const response = await post(serverWith(), call(1, 'ping'), { accept: 'text/plain' });

    expect(response.status).toBe(406);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await post(serverWith(), call(1, 'ping'), { 'content-type': 'text/plain' });

    expect(response.status).toBe(415);
  });

  it('refuses a method other than POST', async () => {
    const response = await handleMcpRequest(
      serverWith(),
      { method: 'GET', headers: clientHeaders(), body: undefined },
      { newSessionId: () => FIXED_SESSION_ID },
    );

    expect(response.status).toBe(405);
    expect(response.headers?.allow).toBe('POST');
  });

  it('answers an unreadable body with 400 carrying a JSON-RPC parse error', async () => {
    // A body that is not JSON is an HTTP failure that has to look like a
    // JSON-RPC failure too, or a client reading only the body cannot tell a
    // framing problem from a rejected method.
    const response = await post(serverWith(), undefined);

    expect(response.status).toBe(400);
    const { error } = response.body as { error: { code: number; message: string } };
    expect(error.code).toBe(-32700);
  });

  it('answers a notification with 202 and no body', async () => {
    const response = await post(serverWith(), {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(response.status).toBe(202);
    expect(response.body).toBeNull();
  });

  it('answers an unknown method with -32601, not a 404', async () => {
    // The request reached dispatch and dispatch declined it. A transport-level
    // 404 would tell the client the route is missing, which is a different bug
    // with a different fix.
    const response = await post(serverWith(), call(1, 'resources/list'));

    const { error } = response.body as { error: { code: number } };
    expect(error.code).toBe(-32601);
  });

  it('answers a malformed envelope on the id the client sent', async () => {
    // Losing the id strands a client waiting on a correlation it will never
    // see echoed, which reads as a hung request rather than a bad one.
    const response = await post(serverWith(), { jsonrpc: '2.0', id: 77, method: 5 });

    const { id, error } = response.body as { id: number; error: { code: number } };
    expect(id).toBe(77);
    expect(error.code).toBe(-32600);
  });
});
