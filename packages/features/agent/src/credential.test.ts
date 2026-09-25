import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOKEN_LIFETIME_MS,
  issueCredential,
  isCredentialUsable,
  tokenMatches,
} from './credential.js';

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
