import { PROTOCOL_VERSION } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import type { BatchSender } from './watcher.js';

/**
 * The way out: this adapter's half of `POST /api/events`.
 *
 * @battle-agents/protocol exports the event union, the version and the buffer,
 * and deliberately no HTTP client — a wire format is not a primitive, and an
 * adapter is allowed to speak HTTP without dragging a server stack in with it.
 * So the transport lives here, and the one thing it must get right is the shape
 * the server parses, which is `{ protocolVersion, events }` under a Bearer
 * token. That shape is read off apps/web/src/event-batch.ts; a client that sends
 * a bare array is refused with a 400 naming a body that must be an object.
 *
 * WHY A COPY AND NOT A SHARED MODULE. The batching rules moved to protocol
 * precisely so two adapters could not build two different buffers, and the
 * argument for lifting the transport is the same one. It is not lifted here
 * because the only package both sides may import is the package this bead was
 * scoped away from, and putting one adapter's transport in it would publish it
 * as the answer while three sibling adapters are still being written against
 * the same route. The duplication is deliberate for now, and the honest fix is
 * one client in protocol once the second adapter needs it — not one per adapter
 * in the meantime. A `fetch` call is the whole reimplementation risk here, and
 * it is much smaller than the buffer was.
 */

/** The part of a `Response` this client reads, so a test can pass a plain object. */
export interface HttpResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface FetchLike {
  (url: string, init: HttpRequestInit): Promise<HttpResponseLike>;
}

export interface HttpRequestInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface IngestOptions {
  /** The server root. `/api/events` is appended; a trailing slash is tolerated. */
  readonly baseUrl: string;
  /** The installation's credential, presented as a Bearer token. */
  readonly token: string;
  /** Injectable so a test exercises the wire without a socket. */
  readonly fetch?: FetchLike;
  /** Injectable so a test proves the backoff without sleeping through it. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** A batch the server would not take, carrying enough to say why. */
export class IngestRefusedError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`the ingest endpoint refused a batch with ${status}: ${detail}`);
    this.name = 'IngestRefusedError';
    this.status = status;
    this.detail = detail;
  }
}

const EVENTS_PATH = '/api/events';
const CONTENT_TYPE = 'application/json';

/**
 * A server that advertises a `Retry-After` this client cannot read is treated
 * as having said nothing, and the default is used. A refusal with no timing in
 * it is a signal the client can only answer by guessing, and the guess that
 * turns a refusal into a stampede is the one not to make.
 */
const DEFAULT_RETRY_AFTER_MS = 1_000;

const MAX_RETRY_AFTER_MS = 60_000;

function eventsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${EVENTS_PATH}`;
}

function retryAfterMs(response: HttpResponseLike): number {
  const raw = response.headers.get('retry-after');
  if (raw === null) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_AFTER_MS;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * A `BatchSender` that posts to the ingest endpoint.
 *
 * The three server rules are all answered here rather than assumed. The size
 * limit is answered by the buffer, so this client is already inside it; a
 * refusal still arrives when a deployment configures the server tighter than
 * the client, and waiting alone cannot fix that — the batch is still too big a
 * second later. So a 413 is answered by BOTH halves of the instruction: the
 * `Retry-After` pause the header asks for, and a split, because the thing the
 * server objected to was the size. Splitting halves a batch and strictly
 * reduces it, so it terminates, and every event is still sent exactly once.
 *
 * Everything else is refused rather than retried. A 400 means the bytes are
 * wrong and the same bytes are wrong next time; a 404 means the session is not
 * one this installation owns, which is a registration problem and not
 * something a loop can talk its way out of; a 5xx leaves it genuinely unknown
 * whether the batch landed, and an event carries no id for the server to
 * deduplicate a second copy against, so retrying would trade a possible loss
 * for a possible duplicate. The honest answer to that is a caller that decides,
 * which is the daemon's job and not this file's.
 */
export function createIngestSender(options: IngestOptions): BatchSender {
  const url = eventsUrl(options.baseUrl);
  const doFetch: FetchLike = options.fetch ?? ((u, init) => fetch(u, init));
  const wait: (ms: number) => Promise<void> = options.sleep ?? defaultSleep;

  async function post(batch: readonly AgentEvent[]): Promise<void> {
    // An empty batch is not a request. The server answers a body with no events
    // with a 400, and a caller whose buffer emptied between the check and the
    // call would learn nothing useful from that.
    if (batch.length === 0) return;

    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'content-type': CONTENT_TYPE,
        authorization: `Bearer ${options.token}`,
      },
      // The version travels with every batch because the server refuses a
      // mismatch outright rather than guessing, and a client that only sends
      // it at handshake has no way to learn it is wrong until it is too late.
      body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, events: batch }),
    });

    if (response.status === 200) return;

    if (response.status === 413) {
      await wait(retryAfterMs(response));
      const middle = Math.ceil(batch.length / 2);
      await post(batch.slice(0, middle));
      await post(batch.slice(middle));
      return;
    }

    throw new IngestRefusedError(response.status, await response.text());
  }

  return post;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
