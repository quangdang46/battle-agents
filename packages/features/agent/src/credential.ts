import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Agent credentials: a revocable secret, which is deliberately not an identity.
 *
 * The four id classes in domain.ts are things you ARE. A credential is a thing
 * you HOLD, and conflating the two is how a leaked token turns into a character
 * nobody can take back.
 *
 * The raw token exists exactly twice: when it is generated, and when it is
 * handed to its owner. Everything after that is a hash, which is why rotation
 * and revocation are ordinary updates rather than a search for who used it.
 */

const TOKEN_BYTES = 32;
const HASH_ALGORITHM = 'sha256';
/** 1 hour: long enough that a working session does not churn, short enough
 *  that a leaked token stops working before anyone notices it was leaked. */
export const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;

export interface IssuedCredential {
  /** The only copy of the secret. Shown once and never stored. */
  readonly token: string;
  readonly hash: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/**
 * Mints a token and its hash.
 *
 * `random` is a parameter so a test can pin the bytes and assert the exact
 * token without reaching for a real one. The default is the CSPRNG, which is
 * the only source that is allowed in production.
 */
export function issueCredential(
  now: string,
  options: { readonly lifetimeMs?: number; readonly random?: (bytes: number) => Buffer } = {},
): IssuedCredential {
  const random = options.random ?? randomBytes;
  const token = random(TOKEN_BYTES).toString('base64url');
  const issuedAt = now;
  return {
    token,
    hash: hashToken(token),
    issuedAt,
    expiresAt: new Date(
      Date.parse(now) + (options.lifetimeMs ?? DEFAULT_TOKEN_LIFETIME_MS),
    ).toISOString(),
  };
}

/**
 * The stored form of a token.
 *
 * SHA-256, not a password hash, and the distinction is the point. A token has
 * 256 bits of entropy, so there is no dictionary to attack and no reason to pay
 * for a deliberately slow function on every request. A password gets scrypt or
 * argon2 precisely because it does not have that property, and using either
 * here would make every authenticated call expensive to defend against nothing.
 *
 * The hash is deterministic so the unique index on it can find the row. That is
 * only safe because the input has full entropy.
 */
export function hashToken(token: string): string {
  return createHash(HASH_ALGORITHM).update(token, 'utf8').digest('hex');
}

/**
 * Whether a presented token is the one that was hashed.
 *
 * Constant-time, and the comparison is on fixed-length digests so the lengths
 * cannot leak either. An early return on a length mismatch is the usual
 * shortcut and it is exactly the one that makes this measurable.
 */
export function tokenMatches(presented: string, storedHash: string): boolean {
  const presentedDigest = Buffer.from(hashToken(presented), 'hex');
  const storedDigest = Buffer.from(storedHash, 'hex');
  if (presentedDigest.length !== storedDigest.length) {
    return false;
  }
  return timingSafeEqual(presentedDigest, storedDigest);
}

/** Why a credential was refused, in terms a caller can act on. */
export type CredentialRejection =
  | { readonly reason: 'revoked' }
  | { readonly reason: 'expired' }
  | { readonly reason: 'scope-missing'; readonly required: string };

export function isCredentialUsable(
  record: {
    readonly tokenHash: string;
    readonly revokedAt: string | null;
    readonly expiresAt: string | null;
    readonly scopes: readonly string[];
  },
  presented: string,
  now: string,
  requiredScopes: readonly string[] = [],
): CredentialRejection | undefined {
  if (!tokenMatches(presented, record.tokenHash)) {
    return undefined;
  }
  if (record.revokedAt !== null) {
    return { reason: 'revoked' };
  }
  if (record.expiresAt !== null && Date.parse(record.expiresAt) <= Date.parse(now)) {
    return { reason: 'expired' };
  }
  const missing = requiredScopes.filter((scope) => !record.scopes.includes(scope));
  return missing.length === 0 ? undefined : { reason: 'scope-missing', required: missing[0] ?? '' };
}

export const CREDENTIAL_TOKEN_BYTES = TOKEN_BYTES;
