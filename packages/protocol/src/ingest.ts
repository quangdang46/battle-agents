import { PROTOCOL_VERSION } from './version.js';
import type { AgentEvent } from './agent-event.js';

/**
 * The way out: `POST /api/events`, which is the only thing an adapter does with
 * the network.
 *
 * WHY IT LIVES HERE. It was one adapter's file — `packages/adapters/codex/src/
 * ingest.ts` — whose own comment said the duplication was deliberate "for now"
 * and named the condition that would end it: "the honest fix is one client in
 * protocol once the second adapter needs it". The second adapter is here. An
 * adapter may not import another adapter, so a copy per adapter was the only
 * alternative, and a third copy of a 150-line transport is the drift this
 * package already exists to prevent — the batching rules were lifted here for
 * exactly that reason, one bead earlier. Adapters may import this; nothing else
 * outside protocol should.
 *
 * The batching RULES stayed here too, so the client and the buffer that feeds
 * it are one contract in one package. A client that invented its own size limit
 * would be refused by the very endpoint it posts to.
 *
 * The body shape is `{ protocolVersion, events }` under a Bearer token, read off
 * apps/web/src/event-batch.ts. A client that sends a bare array is refused with a
 * 400 naming a body that must be an object.
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

/** Where a watcher hands off a batch. Structurally the type every adapter declares. */
export type IngestSender = (batch: readonly AgentEvent[]) => Promise<void>;

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
 * A sender that posts batches to the ingest endpoint.
 *
 * The three server rules are all answered here rather than assumed. The size
 * limit is answered by `EventBuffer`, so this client is already inside it; a
 * refusal still arrives when a deployment configures the server tighter than
 * the client, and waiting alone cannot fix that — the batch is still too big a
 * second later. So a 413 is answered by BOTH halves of the instruction: the
 * `Retry-After` pause the header asks for, and a split, because the thing the
 * server objected to was the size. Splitting halves a batch and strictly
 * reduces it, so it terminates, and every event is still sent exactly once.
 *
 * Everything else is refused rather than retried. A 400 means the bytes are
 * wrong and the same bytes are wrong next time; a 404 means the session is not
 * one this installation owns, which is a registration problem and not something
 * a loop can talk its way out of; a 5xx leaves it genuinely unknown whether the
 * batch landed, and an event carries no id for the server to deduplicate a
 * second copy against, so retrying would trade a possible loss for a possible
 * duplicate. The honest answer to that is a caller that decides, which is the
 * daemon's job and not this file's.
 */
export function createIngestSender(options: IngestOptions): IngestSender {
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
