import { describe, expect, it } from 'vitest';

import { ApiError, HttpApiClient, type HttpTransport } from './api-client.js';

/**
 * The client has to be a CLIENT.
 *
 * The version this replaces held an ApplicationApi object directly, so nothing
 * here had been proven about the wire: which path each primitive uses, whether
 * the query string is carried, and whether a failure from the server arrives as
 * a rejection rather than a silent empty result. Those are the things a
 * same-heap object cannot fail at, which is why they need a transport spy.
 */

/** Records every call and answers from a script, so assertions are on the wire. */
function recordingTransport(answers: Record<string, { status?: number; body?: unknown }> = {}) {
  const calls: {
    method: string;
    path: string;
    query?: Readonly<Record<string, string>>;
    body?: unknown;
    token?: string;
  }[] = [];
  const transport: HttpTransport = {
    async send(request) {
      calls.push(request);
      const answer = answers[`${request.method} ${request.path}`] ?? { status: 200, body: {} };
      return { status: answer.status ?? 200, body: answer.body };
    },
  };
  return { transport, calls };
}

describe('the HTTP client', () => {
  it('reaches discover over GET and carries the domain', async () => {
    const { transport, calls } = recordingTransport({
      'GET http://api.test/api/discover': { body: { domains: ['quest'] } },
    });
    const api = new HttpApiClient({ baseUrl: 'http://api.test', transport });

    await expect(api.discover('quest')).resolves.toEqual({ domains: ['quest'] });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.query).toEqual({ domain: 'quest' });
  });

  it('keeps the base URL in the path it sends', async () => {
    // The first transport built a placeholder, resolved the query against it and
    // reassembled against a different placeholder, which discarded the origin.
    // An assertion on the path is the only thing that catches that.
    const { transport, calls } = recordingTransport();
    const api = new HttpApiClient({ baseUrl: 'http://api.test:3000', transport });

    await api.discover();

    expect(calls[0]?.path).toBe('http://api.test:3000/api/discover');
  });

  it('does not double the slash when the base has a trailing one', async () => {
    const { transport, calls } = recordingTransport();
    const api = new HttpApiClient({ baseUrl: 'http://api.test/', transport });

    await api.discover();

    expect(calls[0]?.path).toBe('http://api.test/api/discover');
  });

  it('sends a token when there is one and none when there is not', async () => {
    const { transport, calls } = recordingTransport();

    await new HttpApiClient({ baseUrl: 'http://api.test', transport }).discover();
    await new HttpApiClient({
      baseUrl: 'http://api.test',
      token: 'secret',
      transport,
    }).discover();

    expect(calls[0]?.token).toBeUndefined();
    expect(calls[1]?.token).toBe('secret');
  });

  it('posts act with the action and its input as a body', async () => {
    const { transport, calls } = recordingTransport({
      'POST http://api.test/api/act': { body: { ok: true } },
    });
    const api = new HttpApiClient({ baseUrl: 'http://api.test', transport });

    await expect(api.act('quest.claim', { questId: 'q1' })).resolves.toEqual({ ok: true });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toEqual({ action: 'quest.claim', input: { questId: 'q1' } });
  });

  it('turns a server failure into an error carrying the status and the body', async () => {
    // A 4xx that came back as an empty result would be the worst outcome: the
    // CLI would report nothing happened for a request the server refused.
    const { transport } = recordingTransport({
      'GET http://api.test/api/discover': { status: 401, body: { error: 'unauthenticated' } },
    });
    const api = new HttpApiClient({ baseUrl: 'http://api.test', transport });

    await expect(api.discover()).rejects.toThrow(ApiError);
    await expect(api.discover()).rejects.toThrow(/401/);
    await expect(api.discover()).rejects.toThrow(/unauthenticated/);
  });

  it('names the path in the failure, so the CLI can say which call broke', async () => {
    const { transport } = recordingTransport({
      'GET http://api.test/api/discover': { status: 500, body: 'boom' },
    });
    const api = new HttpApiClient({ baseUrl: 'http://api.test', transport });

    await expect(api.discover()).rejects.toThrow(/api\/discover/);
  });
  it('fetches the URL it was given, origin and all', async () => {
    // The tests above inject a spy, so they can only assert the path the client
    // hands DOWN. They cannot see what the default transport does with it, and
    // that is where the first version was wrong: it rebuilt the URL against a
    // placeholder and threw the origin away. So the default transport is
    // exercised here, with the real global fetch stubbed.
    const requested: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ domains: ['quest'] }), { status: 200 });
    }) as typeof fetch;

    try {
      const api = new HttpApiClient({ baseUrl: 'http://api.test:3000' });
      await expect(api.discover('quest')).resolves.toEqual({ domains: ['quest'] });
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(requested[0]).toBe('http://api.test:3000/api/discover?domain=quest');
  });
});
