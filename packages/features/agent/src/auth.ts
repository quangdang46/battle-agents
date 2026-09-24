import { hashToken, isCredentialUsable, type CredentialRejection } from './credential.js';

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
