import { readBearerToken } from '@battle-agents/db';

import { describe, expect, it } from 'vitest';

/**
 * Where a credential is allowed to appear.
 *
 * The rule this pins is narrow and was once wrong: a token in the query string
 * is refused whether or not a correct `Authorization` header accompanies it.
 * The first version tested `fromQuery && header === null`, which served a
 * request that had already leaked the token into access logs, referrers and
 * shell history — a valid header does not un-leak it. The second case below is
 * the one that regression would have reintroduced.
 */

const TOKEN = 'agent_battle_a_secret_value';

function request(authorization: string | undefined, url: string) {
  const headers = new Map<string, string>();
  if (authorization !== undefined) {
    headers.set('authorization', authorization);
  }
  // A Map, deliberately: its get() returns undefined where a Fetch Headers
  // returns null, and the two disagreeing used to make a caller with no header
  // at all be told its header was malformed.
  return { headers: headers as unknown as { get(name: string): string | null }, url };
}

function reasonFor(authorization: string | undefined, url: string): string {
  try {
    readBearerToken(request(authorization, url));
  } catch (error) {
    // The db's AuthenticationError nests its reason; reading the top level
    // would report "threw without a reason" for every case and make this file
    // assert nothing.
    return (error as { failure?: { reason?: string } }).failure?.reason ?? 'threw without a reason';
  }
  return 'accepted';
}

describe('a token in the URL is refused', () => {
  it('refuses ?token= with no header at all', () => {
    expect(reasonFor(undefined, 'https://host/api/mcp?token=leaked')).toBe('token-in-url');
  });

  it('refuses ?token= even when a valid header is also present', () => {
    // The regression guard. Serving this would mean a client that leaks a token
    // gets no signal at all, and keeps doing it.
    expect(reasonFor(`Bearer ${TOKEN}`, 'https://host/api/mcp?token=leaked')).toBe('token-in-url');
  });

  it('refuses the other two spellings a caller might reach for', () => {
    expect(reasonFor(`Bearer ${TOKEN}`, 'https://host/api/mcp?access_token=leaked')).toBe('token-in-url');
    expect(reasonFor(`Bearer ${TOKEN}`, 'https://host/api/mcp?api_key=leaked')).toBe('token-in-url');
  });

  it('refuses a token smuggled after another parameter', () => {
    expect(reasonFor(`Bearer ${TOKEN}`, 'https://host/api/mcp?scope=mcp&token=leaked')).toBe('token-in-url');
  });

  it('does not mistake a parameter merely named token for a credential', () => {
    // `?tokens=` and `?token=`-as-a-prefix are different requests, and refusing
    // them would train callers to stop reading the reason they were given.
    expect(readBearerToken(request(`Bearer ${TOKEN}`, 'https://host/api/mcp?tokens=2'))).toBe(TOKEN);
  });
});

describe('a token in the header is the only place one is read', () => {
  it('accepts a well-formed bearer', () => {
    expect(readBearerToken(request(`Bearer ${TOKEN}`, 'https://host/api/mcp'))).toBe(TOKEN);
  });

  it('names a missing header as missing, not as malformed', () => {
    expect(reasonFor(undefined, 'https://host/api/mcp')).toBe('missing');
  });

  it('names a non-bearer scheme as malformed', () => {
    expect(reasonFor(`Basic ${TOKEN}`, 'https://host/api/mcp')).toBe('malformed');
  });

  it('names an empty bearer value as malformed', () => {
    expect(reasonFor('Bearer ', 'https://host/api/mcp')).toBe('malformed');
  });
});
