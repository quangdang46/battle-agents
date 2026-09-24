import {
  PRIMITIVES,
  UnknownActionError,
  UnknownDomainError,
  isAuthenticationFailure,
} from '@battle-agents/api';
import type { ApplicationApi, Primitive } from '@battle-agents/api';

import { createTools } from './tools.js';
import type { ToolContext, ToolDefinition } from './tools.js';

/**
 * The MCP server, minus the SDK.
 *
 * Everything here is a pure function of an ApplicationApi, which is what makes
 * the surface testable without a socket. What is deliberately absent is any
 * knowledge of a particular game feature: the server is handed the same five
 * primitives the CLI and HTTP surfaces get, and it has no way to grow.
 *
 * The MCP SDK is not installed yet. When it is, this becomes a thin translation
 * — register these five tools, call `callTool`, send notifications from
 * `deliver`. Nothing about the surface changes, and that is the point of
 * keeping the transport out of the handler layer.
 */

export type NotificationSink = (notification: { method: string; params: unknown }) => void;

export interface McpServerOptions {
  readonly api: ApplicationApi;
  /**
   * Where subscription events go. Absent means events are dropped, which is
   * the honest state until a transport exists: the event-ingest and SSE bead
   * owns where they eventually land, and guessing here would put a second,
   * competing answer in the codebase.
   */
  readonly notify?: NotificationSink;
}

export interface ToolResult {
  /** True when the tool ran; false when the caller has to correct the call. */
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: { readonly message: string; readonly kind: string };
}

export interface McpServer {
  /** The registered tools, in the order a client should be offered them. */
  listTools(): readonly ToolDefinition[];
  callTool(name: string, rawInput: unknown): Promise<ToolResult>;
  closeObservation(subscriptionId: string): boolean;
  /** How many subscriptions are open. For tests and for the server's own log. */
  openSubscriptions(): number;
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const tools = createTools();
  const observers = new Map<string, { close(): void }>();
  let nextSubscription = 1;

  const context: ToolContext = {
    api: options.api,
    subscribe(domain) {
      const subscriptionId = `sub-${nextSubscription++}`;
      // Built conditionally: with exactOptionalPropertyTypes, an explicit
      // `domain: undefined` is not the same as omitting it, and the api's own
      // query type says so.
      const observer = options.api.observe(domain === undefined ? {} : { domain }, (event) => {
        options.notify?.({ method: 'notifications/event', params: { subscriptionId, event } });
      });
      observers.set(subscriptionId, observer);
      return subscriptionId;
    },
  };

  return {
    listTools: () => PRIMITIVES.map((name) => tools.get(name) as ToolDefinition),

    async callTool(name, rawInput) {
      const tool = tools.get(name as Primitive);
      if (tool === undefined) {
        return {
          ok: false,
          error: {
            message:
              `unknown tool "${name}". This server exposes exactly: ${PRIMITIVES.join(', ')}. ` +
              'There is no per-feature tool; run discover to see what the platform can do.',
            kind: 'unknown-tool',
          },
        };
      }

      const parsed = tool.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            message: `invalid input for ${name}: ${parsed.error.issues
              .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('; ')}`,
            kind: 'invalid-input',
          },
        };
      }

      try {
        return { ok: true, value: await tool.handle(context, parsed.data as never) };
      } catch (error) {
        return { ok: false, error: describeFailure(error) };
      }
    },

    closeObservation(subscriptionId) {
      const observer = observers.get(subscriptionId);
      if (observer === undefined) {
        return false;
      }
      observer.close();
      return observers.delete(subscriptionId);
    },

    openSubscriptions: () => observers.size,
  };
}

/**
 * Maps a thrown error to something a caller can act on.
 *
 * The kind is the part that matters: an agent deciding whether to correct its
 * own call, fix its credentials, or report a platform failure reads this string,
 * and a flat "request failed" sends it to the wrong one of the three.
 */
function describeFailure(error: unknown): { message: string; kind: string } {
  if (error instanceof UnknownActionError || error instanceof UnknownDomainError) {
    return { message: error.message, kind: 'not-found' };
  }
  if (isAuthenticationFailure(error)) {
    return { message: error.message, kind: 'unauthenticated' };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    kind: 'failed',
  };
}
