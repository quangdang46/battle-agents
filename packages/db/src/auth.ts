import { createHash, timingSafeEqual } from 'node:crypto';

/** Kept in step with the stored hash, which is what makes a comparison constant-time. */
const HASH_ALGORITHM = 'sha256';

export function tokenMatches(presented: string, storedHash: string): boolean {
  const presentedDigest = Buffer.from(hashToken(presented), 'hex');
  const storedDigest = Buffer.from(storedHash, 'hex');
  if (presentedDigest.length !== storedDigest.length) {
    return false;
  }
  return timingSafeEqual(presentedDigest, storedDigest);
}

/**
 * Bearer credential verification.
 *
 * Moved here from packages/features/agent/src/auth.ts, and the move is the
 * point rather than tidiness. The gateway imported `authenticate` from the
 * agent feature, so a feature had to be wired into a second file besides the
 * composition root — and the removal test reported, correctly, that the agent
 * feature could not be taken out. "Adding a feature is a package and one line"
 * had quietly stopped being true.
 *
 * Verifying a token is infrastructure. Which agents exist, what a credential
 * means to the game, and when one should be revoked are feature concerns; none
 * of them is needed to answer "does this request carry a valid bearer", and
 * making the transport depend on a game concept to ask that question is the
 * coupling.
 *
 * The feature keeps the credential MODEL — issue, rotate, revoke, scopes,
 * expiry — and declares the store it needs as a port. This package owns the
 * storage and the check, and the composition root is the only place that binds
 * the two.
 */

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
export function hashToken(token: string): string {
  return createHash(HASH_ALGORITHM).update(token, 'utf8').digest('hex');
}

/**
 * How a caller proves which installation it is.
 *
 * Only a header. The plan is explicit that a token must never appear in a URL:
 * `?token=` ends up in access logs, in browser history, in Referer headers and
 * in the shell history of whoever pasted the link, none of which anybody
 * remembers to scrub. Reading one from a query string here is refused rather
 * than tolerated, because a rule somebody can opt out of is not a rule.
 */

export interface CredentialRecord {
  readonly id: string;
  readonly tokenHash: string;
  readonly installationId: string;
  readonly agentId: string | null;
  readonly scopes: readonly string[];
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface AuthenticatedCaller {
  readonly installationId: string;
  readonly agentId: string | null;
  readonly scopes: readonly string[];
}

export type AuthFailure =
  | { readonly reason: 'missing' }
  | { readonly reason: 'malformed' }
  | { readonly reason: 'unknown' }
  | CredentialRejection
  | { readonly reason: 'token-in-url' };

export class AuthenticationError extends Error {
  readonly failure: AuthFailure;

  constructor(failure: AuthFailure) {
    super(explain(failure));
    this.name = 'AuthenticationError';
    this.failure = failure;
  }
}

function explain(failure: AuthFailure): string {
  switch (failure.reason) {
    case 'missing':
      return 'no credential presented; send Authorization: Bearer <token>';
    case 'malformed':
      return 'the Authorization header is not "Bearer <token>"';
    case 'token-in-url':
      return (
        'a token in a URL is refused. URLs are logged, cached, stored in browser ' +
        'history and sent in Referer headers. Put it in an Authorization header.'
      );
    case 'unknown':
      return 'no such credential';
    case 'revoked':
      return 'this credential was revoked; issue a new one';
    case 'expired':
      return 'this temporary credential has expired; issue a new one';
    case 'scope-missing':
      return `this credential lacks the "${failure.required}" scope`;
  }
}

export interface CredentialStore {
  findByHash(hash: string): Promise<CredentialRecord | undefined>;
  insert(credential: {
    readonly id: string;
    readonly tokenHash: string;
    readonly installationId: string;
    readonly agentId: string | null;
    readonly scopes: readonly string[];
    readonly expiresAt: string | null;
  }): Promise<void>;
  revoke(id: string, now: string): Promise<void>;
  listForInstallation(installationId: string): Promise<readonly CredentialRecord[]>;
}

export interface AuthOptions {
  readonly store: CredentialStore;
  readonly now: string;
  /** Scopes the caller must hold to authenticate at all. */
  readonly requiredScopes?: readonly string[];
}

/**
 * Reads the token from the one place it is allowed to be.
 *
 * Takes the two things a request actually has rather than a whole Request, so
 * there is no way for a caller to hand over a URL and have it quietly honoured.
 */
export function readBearerToken(request: {
  readonly headers: { get(name: string): string | null };
  readonly url: string;
}): string {
  const fromQuery = /[?&](?:token|access_token|api_key)=/i.test(request.url);
  // Normalised, because the two things a caller actually passes disagree: the
  // Fetch Headers object returns null for a missing header and a Map returns
  // undefined. Without this, a Map-based caller is told its header is malformed
  // when the real problem is that it never sent one.
  const header = request.headers.get('authorization') ?? null;

  if (fromQuery && header === null) {
    throw new AuthenticationError({ reason: 'token-in-url' });
  }
  if (header === null) {
    throw new AuthenticationError({ reason: 'missing' });
  }
  const match = /^Bearer (\S+)$/.exec(header);
  if (match?.[1] === undefined) {
    throw new AuthenticationError({ reason: 'malformed' });
  }
  return match[1];
}

/** Resolves a presented token to the caller it belongs to. */
export async function authenticate(
  options: AuthOptions,
  request: { readonly headers: { get(name: string): string | null }; readonly url: string },
): Promise<AuthenticatedCaller> {
  const token = readBearerToken(request);
  const record = await options.store.findByHash(hashToken(token));
  if (record === undefined) {
    throw new AuthenticationError({ reason: 'unknown' });
  }

  const rejection = isCredentialUsable(record, token, options.now, options.requiredScopes ?? []);
  if (rejection !== undefined) {
    throw new AuthenticationError(rejection);
  }

  return {
    installationId: record.installationId,
    agentId: record.agentId,
    scopes: record.scopes,
  };
}
