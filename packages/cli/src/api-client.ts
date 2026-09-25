import type {
  ApplicationApi,
  Observer,
  ObserveQuery,
  Discovery,
  InspectQuery,
  SearchQuery,
  SearchResult,
} from '@battle-agents/api';
import type { RegisteredActionId } from '@battle-agents/protocol';

/**
 * The Application API, over HTTP.
 *
 * The CLI used to hold an ApplicationApi object directly, which made it an
 * in-process adapter rather than a client: it could not talk to a running
 * server, and "agent-battle works against the API" was true only in the sense
 * that the object was in the same heap. This is the other shape. The five
 * primitives are the same five, the wire shapes are the ones
 * apps/web/src/routes.ts already serves, and a command cannot tell the
 * difference because it only ever saw the interface.
 *
 * The iron rule from plan section 31 survives this change intact: no game
 * logic and no database here. Every call is one of the five primitives, so a
 * command this client cannot express is a command the CLI has no business
 * having.
 */

/** How this client reaches the server. Injected so a test needs no network. */
export interface HttpTransport {
  send(request: {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly body?: unknown;
    /** Sent as a bearer credential when present. */
    readonly token?: string;
  }): Promise<{ readonly status: number; readonly body: unknown }>;
}

/** Where credentials and the server address live for a session. */
export interface ClientOptions {
  readonly baseUrl: string;
  /** Bearer credential. Absent means an unauthenticated server. */
  readonly token?: string;
  readonly transport?: HttpTransport;
}

/** Raised when the server answers with something other than success. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: unknown,
  ) {
    super(`the API answered ${String(status)} for ${path}: ${describe(body)}`);
    this.name = 'ApiError';
  }
}

function describe(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body !== null && typeof body === 'object' && 'error' in body) {
    return String((body as { error: unknown }).error);
  }
  return 'no detail given';
}

/**
 * The default transport: Node's global fetch.
 *
 * `path` carries the whole URL, base included, because the caller composed it
 * and re-deriving it here would be a second place that can drop the origin. The
 * first version built a placeholder, resolved the query against it, and then
 * reassembled against a different placeholder, which threw the base away
 * entirely.
 */
const fetchTransport: HttpTransport = {
  async send({ method, path, query, body, token }) {
    const url = new URL(path);
    for (const [name, value] of Object.entries(query ?? {})) {
      url.searchParams.set(name, value);
    }

    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    if (text === '') return { status: response.status, body: undefined };

    try {
      return { status: response.status, body: JSON.parse(text) };
    } catch {
      // A body that is not JSON is still something the server said. Passing the
      // text on beats dropping it, and beats turning it into a parse error the
      // caller cannot act on.
      return { status: response.status, body: text };
    }
  },
};

/** An ApplicationApi that speaks HTTP. Same five methods, no more. */
export class HttpApiClient implements ApplicationApi {
  readonly #baseUrl: string;
  readonly #token: string | undefined;
  readonly #transport: HttpTransport;

  constructor(options: ClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '');
    this.#token = options.token;
    this.#transport = options.transport ?? fetchTransport;
  }

  async #call<T>(request: Parameters<HttpTransport['send']>[0]): Promise<T> {
    const response = await this.#transport.send({
      ...request,
      path: `${this.#baseUrl}${request.path}`,
      ...(this.#token === undefined ? {} : { token: this.#token }),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(response.status, request.path, response.body);
    }
    return response.body as T;
  }

  discover(domain?: string): Promise<Discovery> {
    return this.#call<Discovery>({
      method: 'GET',
      path: '/api/discover',
      ...(domain === undefined ? {} : { query: { domain } }),
    });
  }

  search(query: SearchQuery): Promise<readonly SearchResult[]> {
    return this.#call<readonly SearchResult[]>({
      method: 'GET',
      path: '/api/search',
      query: { type: query.type, ...(query.name === undefined ? {} : { name: query.name }) },
    });
  }

  inspect(query: InspectQuery): Promise<unknown> {
    return this.#call<unknown>({
      method: 'GET',
      path: '/api/inspect',
      query: { type: query.type, id: query.id },
    });
  }

  act<I>(action: RegisteredActionId, input: I): Promise<unknown> {
    return this.#call<unknown>({
      method: 'POST',
      path: '/api/act',
      body: { action, input },
    });
  }

  /**
   * The observe primitive is a subscription, not a request/response call.
   *
   * Node's global EventSource is used when present. It is not in the type
   * surface everywhere, and a stream is not something this client should
   * reimplement: a hand-rolled SSE parser here would be a second reader of the
   * wire format, and the server's frame shape is not this package's business.
   */
  observe(query: ObserveQuery, listener: (event: unknown) => void): Observer {
    const OpenEventSource = (globalThis as { EventSource?: typeof EventSource }).EventSource;
    if (OpenEventSource === undefined) {
      throw new Error(
        'this runtime has no EventSource, so observe cannot subscribe. Use a Node with the global, or poll with search.',
      );
    }
    const stream = new OpenEventSource(
      `${this.#baseUrl}/api/events/stream${query.domain === undefined ? '' : `?scope=${encodeURIComponent(query.domain)}`}`,
    );
    stream.onmessage = (event) => {
      try {
        listener(JSON.parse(String(event.data)));
      } catch {
        // A frame that is not JSON is still an event the server sent. Passing
        // the raw text on beats dropping it, because the alternative is a
        // subscriber that silently sees less than the server published.
        listener(event.data);
      }
    };
    return { close: () => stream.close() };
  }
}
