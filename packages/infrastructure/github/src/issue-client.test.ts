import { describe, expect, it } from 'vitest';

import { createIssueLookup } from './issue-client.js';
import type { HttpFetch, HttpRequestInit } from './issue-client.js';
import { INSTALLATION_TOKEN_VARIABLE } from './secrets.js';

const TOKEN = 'ghs_installation_token_value';

const REF = { owner: 'acme', repo: 'widgets', number: 7 } as const;

interface Call {
  readonly url: string;
  readonly init: HttpRequestInit;
}

function fakeFetch(response: {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}): { http: HttpFetch; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    http: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.body,
      };
    },
  };
}

const EXISTS = {
  ok: true,
  status: 200,
  body: { title: 'Widgets fall over', html_url: 'https://github.com/acme/widgets/issues/7' },
};

describe('an issue that exists', () => {
  it('is found by one GET against the repository', async () => {
    const { http, calls } = fakeFetch(EXISTS);

    const result = await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(
      REF,
    );

    expect(result).toEqual({
      exists: true,
      title: 'Widgets fall over',
      url: 'https://github.com/acme/widgets/issues/7',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.github.com/repos/acme/widgets/issues/7');
  });

  it('carries the installation token in a header, never in the URL', async () => {
    const { http, calls } = fakeFetch(EXISTS);

    await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(REF);

    // URLs leak through access logs, referrers and error messages. A token in
    // the query string is a token in every one of those.
    expect(calls[0]?.url).not.toContain(TOKEN);
    expect(calls[0]?.init.headers['authorization']).toBe(`Bearer ${TOKEN}`);
  });
});

describe('an issue that is not there, or that cannot be checked', () => {
  it('reports a 404 as not-found', async () => {
    const { http } = fakeFetch({ ok: false, status: 404, body: { message: 'Not Found' } });

    const result = await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(
      REF,
    );

    expect(result).toEqual({ exists: false, reason: 'not-found' });
  });

  it('reports a rate limit as unavailable, not as an issue that does not exist', async () => {
    // The failure this prevents: a wave of 403s looks exactly like a wave of
    // missing issues, and the caller refuses a bounty for a reason that is
    // untrue. Only a 404 is evidence of absence.
    const { http } = fakeFetch({ ok: false, status: 403, body: { message: 'rate limited' } });

    const result = await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(
      REF,
    );

    expect(result).toEqual({ exists: false, reason: 'unavailable' });
  });

  it('reports a 500 as unavailable', async () => {
    const { http } = fakeFetch({ ok: false, status: 500, body: null });

    const result = await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(
      REF,
    );

    expect(result).toEqual({ exists: false, reason: 'unavailable' });
  });

  it('reports a thrown request as unavailable rather than letting it escape', async () => {
    const http: HttpFetch = async () => {
      throw new Error('ENOTFOUND api.github.com');
    };

    const result = await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(
      REF,
    );

    expect(result).toEqual({ exists: false, reason: 'unavailable' });
  });

  it('reports an unconfigured installation token as unconfigured, and makes no request', async () => {
    // A lookup that cannot authenticate has not found anything. Reporting
    // not-found here would let a deployment that forgot a secret variable look
    // like a repository full of invented issues.
    const { http, calls } = fakeFetch(EXISTS);

    const result = await createIssueLookup({}, http).issue(REF);

    expect(result).toEqual({ exists: false, reason: 'not-configured' });
    expect(calls).toEqual([]);
  });

  it('reports a 200 with a body that is not an issue as unavailable', async () => {
    const { http } = fakeFetch({ ok: true, status: 200, body: 'nope' });

    const result = await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue(
      REF,
    );

    expect(result).toEqual({ exists: false, reason: 'unavailable' });
  });
});

describe('the installation token', () => {
  it('is not reachable from anything the client hands back', async () => {
    const { http } = fakeFetch(EXISTS);
    const lookup = createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http);

    // The port is the only thing that leaves this factory, and it has no field
    // capable of holding a secret. If somebody later widens the port, this fails.
    expect(Object.values(lookup).every((value) => typeof value === 'function')).toBe(true);
    expect(JSON.stringify(lookup)).not.toContain(TOKEN);

    const result = await lookup.issue(REF);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('escapes the owner and the repository, so a crafted ref cannot rewrite the URL', async () => {
    const { http, calls } = fakeFetch(EXISTS);

    await createIssueLookup({ [INSTALLATION_TOKEN_VARIABLE]: TOKEN }, http).issue({
      owner: 'acme/../../evil',
      repo: 'widgets?access_token=leaked',
      number: 7,
    });

    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/acme%2F..%2F..%2Fevil/widgets%3Faccess_token%3Dleaked/issues/7',
    );
  });
});
