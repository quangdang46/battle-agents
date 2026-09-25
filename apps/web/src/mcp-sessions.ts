import { createMcpServer } from '@battle-agents/mcp-server';
import type { McpServer } from '@battle-agents/mcp-server';

import type { ApplicationApi } from '@battle-agents/api';

/**
 * MCP sessions: one server per session, not per request.
 *
 * A per-request server cannot deliver a notification, because the subscription
 * an `observe` call opens dies with the response that created it. The Streamable
 * HTTP transport has a shape for this — the server answers a POST with an SSE
 * stream, or the client opens a GET carrying the `Mcp-Session-Id` it was given,
 * and server-to-client notifications travel down that. So the unit of lifetime
 * is the session id, and this is where that id becomes something with state.
 *
 * The queue is bounded. A client that opens a subscription and stops reading is
 * the same backpressure problem the public stream has, and the answer there is
 * to close a subscriber that falls too far behind rather than skip frames: a
 * notification stream cannot survive a gap, because a client that missed one and
 * kept going would be permanently wrong with nothing to tell it. Dropping the
 * oldest keeps a slow client roughly current; the transport closes the connection
 * for a client that has stopped reading altogether, which is the hub's rule and
 * the reason for the ceiling.
 *
 * Nothing here knows what a notification means. It queues `{ method, params }`
 * and the route writes it; the MCP package owns the envelope and the web layer
 * owns the socket.
 */

/** A server-to-client message, as the MCP package emits it. */
export interface McpNotification {
  readonly method: string;
  readonly params: unknown;
}

export interface McpSession {
  readonly id: string;
  readonly server: McpServer;
  /** Takes everything queued since the last call, oldest first. */
  drain(): readonly McpNotification[];
  /**
   * Resolves when something is queued or the session closes, whichever is
   * first. The timeout is a keepalive interval, not a deadline: an idle stream
   * still has to prove it is alive to whatever sits in front of it.
   */
  wait(timeoutMs: number): Promise<void>;
  close(): void;
  readonly closed: boolean;
}

export interface McpSessionStore {
  /** The session for this id, creating it if it does not exist yet. */
  open(id: string): McpSession;
  /** The session for this id, or undefined. A GET for an unknown id is a 404. */
  find(id: string): McpSession | undefined;
  close(id: string): boolean;
  readonly size: number;
}

export interface McpSessionStoreOptions {
  /** Builds the server for a session, wired to that session's queue. */
  readonly createServer: (notify: (notification: McpNotification) => void) => McpServer;
  /** How many notifications a session may hold before the oldest are dropped. */
  readonly maxQueued?: number;
}

const DEFAULT_MAX_QUEUED = 1024;
const DROPPED_NOTIFICATION = {
  method: 'notifications/message',
  params: { dropped: true },
} as const;

function createSession(
  id: string,
  createServer: (notify: (notification: McpNotification) => void) => McpServer,
  maxQueued: number,
): McpSession {
  const queue: McpNotification[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  let dropped = 0;

  const session: McpSession = {
    id,
    server: createServer((notification) => {
      if (closed) {
        return;
      }
      queue.push(notification);
      // Bounded rather than unbounded: a client that never reads must not turn
      // into a memory leak. The count is reported rather than the frames
      // silently swallowed, so a client that fell behind is told it fell behind
      // instead of quietly missing events.
      while (queue.length > maxQueued) {
        queue.shift();
        dropped += 1;
      }
      if (dropped > 0) {
        queue.unshift({ ...DROPPED_NOTIFICATION, params: { dropped: true, count: dropped } });
      }
      wake?.();
    }),
    drain() {
      return queue.splice(0, queue.length);
    },
    async wait(timeoutMs) {
      if (closed || queue.length > 0) {
        return;
      }
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          clearTimeout(timer);
          wake = undefined;
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        wake = finish;
      });
    },
    close() {
      closed = true;
      queue.length = 0;
      wake?.();
    },
    get closed() {
      return closed;
    },
  };
  return session;
}

export function createMcpSessionStore(options: McpSessionStoreOptions): McpSessionStore {
  const maxQueued = options.maxQueued ?? DEFAULT_MAX_QUEUED;
  const sessions = new Map<string, McpSession>();

  return {
    open(id) {
      const existing = sessions.get(id);
      if (existing !== undefined && !existing.closed) {
        return existing;
      }
      const session = createSession(id, options.createServer, maxQueued);
      sessions.set(id, session);
      return session;
    },
    find(id) {
      const session = sessions.get(id);
      return session === undefined || session.closed ? undefined : session;
    },
    close(id) {
      const session = sessions.get(id);
      if (session === undefined) {
        return false;
      }
      session.close();
      return sessions.delete(id);
    },
    get size() {
      return sessions.size;
    },
  };
}

/** The server factory the app uses: one API, the shared one, per session. */
export function serverFactoryFor(api: ApplicationApi) {
  return (notify: (notification: McpNotification) => void): McpServer =>
    createMcpServer({ api, notify });
}
