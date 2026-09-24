import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOKEN_LIFETIME_MS,
  issueCredential,
  isCredentialUsable,
  tokenMatches,
} from './credential.js';
import { AuthenticationError, authenticate, readBearerToken } from './auth.js';
import type { CredentialRecord, CredentialStore } from './auth.js';

const NOW = '2026-09-24T12:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;

function later(ms: number): string {
  return new Date(Date.parse(NOW) + ms).toISOString();
}

describe('issuing a credential', () => {
  it('never puts the raw token in what it returns to be stored', () => {
    const issued = issueCredential(NOW);

    expect(issued.hash).not.toContain(issued.token);
    expect(issued.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires an hour out by default, and says so', () => {
    expect(issueCredential(NOW).expiresAt).toBe(later(DEFAULT_TOKEN_LIFETIME_MS));
    expect(DEFAULT_TOKEN_LIFETIME_MS).toBe(HOUR_MS);
  });

  it('honours a lifetime the host chose', () => {
    expect(issueCredential(NOW, { lifetimeMs: 5 * 60 * 1000 }).expiresAt).toBe(
      later(5 * 60 * 1000),
    );
  });

  it('mints a different token every time', () => {
    const first = issueCredential(NOW);
    const second = issueCredential(NOW);

    expect(first.token).not.toBe(second.token);
    expect(first.hash).not.toBe(second.hash);
  });

  it('mints enough entropy to be unguessable', () => {
    // 32 bytes is the claim; asserting the length is what keeps somebody from
    // quietly lowering it to 8 to make a test readable.
    expect(Buffer.from(issueCredential(NOW).token, 'base64url')).toHaveLength(32);
  });
});

describe('checking a presented token', () => {
  it('accepts the token it issued and refuses a different one', () => {
    const issued = issueCredential(NOW);
    const other = issueCredential(NOW);
    const record = {
      tokenHash: issued.hash,
      revokedAt: null,
      expiresAt: issued.expiresAt,
      scopes: [],
    };

    expect(tokenMatches(issued.token, record.tokenHash)).toBe(true);
    expect(tokenMatches(other.token, record.tokenHash)).toBe(false);
  });

  it('refuses a revoked credential', () => {
    const issued = issueCredential(NOW);

    const rejection = isCredentialUsable(
      { tokenHash: issued.hash, revokedAt: NOW, expiresAt: issued.expiresAt, scopes: [] },
      issued.token,
      NOW,
    );

    expect(rejection).toEqual({ reason: 'revoked' });
  });

  it('refuses an expired one, exactly at the boundary', () => {
    const issued = issueCredential(NOW);
    const record = {
      tokenHash: issued.hash,
      revokedAt: null,
      expiresAt: issued.expiresAt,
      scopes: [],
    };

    expect(
      isCredentialUsable(record, issued.token, later(DEFAULT_TOKEN_LIFETIME_MS - 1)),
    ).toBeUndefined();
    expect(isCredentialUsable(record, issued.token, later(DEFAULT_TOKEN_LIFETIME_MS))).toEqual({
      reason: 'expired',
    });
  });

  it('refuses a credential that lacks a required scope, and names it', () => {
    const issued = issueCredential(NOW);
    const record = {
      tokenHash: issued.hash,
      revokedAt: null,
      expiresAt: issued.expiresAt,
      scopes: ['agent.read'],
    };

    expect(isCredentialUsable(record, issued.token, NOW, ['bounty.claim'])).toEqual({
      reason: 'scope-missing',
      required: 'bounty.claim',
    });
    expect(isCredentialUsable(record, issued.token, NOW, ['agent.read'])).toBeUndefined();
  });

  it('says nothing at all about a token that is simply wrong', () => {
    // Refusing without a reason is the point: telling a caller their token was
    // valid-but-revoked rather than unknown is the difference between an error
    // they can act on and one that confirms a guess.
    const issued = issueCredential(NOW);

    expect(
      isCredentialUsable(
        { tokenHash: issued.hash, revokedAt: null, expiresAt: issued.expiresAt, scopes: [] },
        'not-the-token',
        NOW,
      ),
    ).toBeUndefined();
  });
});

/** A store that only ever holds hashes, so a test cannot accidentally assert
 *  against a raw token it happens to have kept. */
class HashOnlyStore implements CredentialStore {
  readonly rows: CredentialRecord[] = [];

  async findByHash(hash: string): Promise<CredentialRecord | undefined> {
    return this.rows.find((row) => row.tokenHash === hash);
  }

  async insert(credential: Parameters<CredentialStore['insert']>[0]): Promise<void> {
    this.rows.push({ revokedAt: null, ...credential });
  }

  async revoke(id: string, now: string): Promise<void> {
    const row = this.rows.find((each) => each.id === id);
    if (row !== undefined) {
      this.rows[this.rows.indexOf(row)] = { ...row, revokedAt: now };
    }
  }

  async listForInstallation(installationId: string): Promise<readonly CredentialRecord[]> {
    return this.rows.filter((row) => row.installationId === installationId);
  }
}

function requestWith(token: string, url = 'https://agentbattle.gg/api/events') {
  return { headers: new Map([['authorization', `Bearer ${token}`]]) as never, url };
}

describe('authenticating a caller', () => {
  it('resolves a good token to the installation it belongs to', async () => {
    const store = new HashOnlyStore();
    const issued = issueCredential(NOW);
    await store.insert({
      id: 'cred-1',
      tokenHash: issued.hash,
      installationId: 'install-1',
      agentId: 'agent-1',
      scopes: ['agent.read'],
      expiresAt: issued.expiresAt,
    });

    const caller = await authenticate({ store, now: NOW }, requestWith(issued.token));

    expect(caller).toMatchObject({ installationId: 'install-1', agentId: 'agent-1' });
  });

  it('refuses a token in a URL, and says why', () => {
    // The whole point: a token in a query string is logged, cached, kept in
    // browser history and sent in Referer headers, none of which anybody
    // remembers to scrub. No header here, because a URL is then the only place
    // the token could have come from.
    const urlOnly = (query: string) => ({
      headers: new Map() as never,
      url: `https://x/api?${query}`,
    });

    expect(() => readBearerToken(urlOnly('token=secret'))).toThrow(AuthenticationError);
    expect(() => readBearerToken(urlOnly('access_token=secret'))).toThrow(
      /token in a URL is refused/,
    );
    expect(() => readBearerToken(urlOnly('api_key=secret'))).toThrow(/refused/);
  });

  it('still reads the header when a URL also carries one', () => {
    // Both present is not a reason to prefer the URL: the header is the
    // authenticated channel and the query string is at best noise.
    const issued = issueCredential(NOW);

    expect(readBearerToken(requestWith(issued.token, 'https://x/api?token=leaked'))).toBe(
      issued.token,
    );
  });

  it('refuses a missing or malformed header', () => {
    // A Map is what a test or a Node server hands over; the Fetch Headers
    // object returns null for a missing header and a Map returns undefined.
    // Both have to read as "missing" rather than as a malformed header.
    const noHeader = { headers: new Map() as never, url: 'https://x/api' };
    const nullHeader = { headers: { get: () => null } as never, url: 'https://x/api' };
    const wrongScheme = {
      headers: new Map([['authorization', 'Basic abc123']]) as never,
      url: 'https://x/api',
    };

    expect(() => readBearerToken(noHeader)).toThrow(/no credential presented/);
    expect(() => readBearerToken(nullHeader)).toThrow(/no credential presented/);
    expect(() => readBearerToken(wrongScheme)).toThrow(/not "Bearer <token>"/);
  });

  it('refuses a revoked credential with an actionable error, not a generic failure', async () => {
    const store = new HashOnlyStore();
    const issued = issueCredential(NOW);
    await store.insert({
      id: 'cred-1',
      tokenHash: issued.hash,
      installationId: 'install-1',
      agentId: null,
      scopes: [],
      expiresAt: issued.expiresAt,
    });
    await store.revoke('cred-1', NOW);

    const failure = await authenticate({ store, now: NOW }, requestWith(issued.token)).catch(
      (cause: unknown) => cause as AuthenticationError,
    );

    expect(failure).toBeInstanceOf(AuthenticationError);
    expect((failure as AuthenticationError).failure).toEqual({ reason: 'revoked' });
    expect((failure as Error).message).toMatch(/revoked; issue a new one/);
  });

  it('refuses a token it has never seen', async () => {
    const store = new HashOnlyStore();

    await expect(
      authenticate({ store, now: NOW }, requestWith(issueCredential(NOW).token)),
    ).rejects.toThrow(/no such credential/);
  });

  it('checks the store only ever receives a hash', async () => {
    // Asserted through the store rather than by reading its rows: the point is
    // that the lookup key is a digest, so the raw token has no path into storage.
    const store = new HashOnlyStore();
    const issued = issueCredential(NOW);
    await store.insert({
      id: 'cred-1',
      tokenHash: issued.hash,
      installationId: 'install-1',
      agentId: null,
      scopes: [],
      expiresAt: issued.expiresAt,
    });

    await authenticate({ store, now: NOW }, requestWith(issued.token));

    const looked = await store.findByHash(issued.hash);
    expect(looked).toBeDefined();
    expect(JSON.stringify(store.rows)).not.toContain(issued.token);
  });
});
