/**
 * How a caller proves which installation it is.
 *
 * Only a header. The plan is explicit that a token must never appear in a URL:
 * `?token=` ends up in access logs, in browser history, in Referer headers and
 * in the shell history of whoever pasted the link, none of which anybody
 * remembers to scrub. Reading one from a query string here is refused rather
 * than tolerated, because a rule somebody can opt out of is not a rule.
 */

/**
 * The shape a stored credential has.
 *
 * Verifying a bearer token against one of these lives in @battle-agents/db,
 * because that is infrastructure and the transport must not reach into a game
 * concept to ask whether a request is authenticated. This file keeps the MODEL:
 * what a credential is, what a scope means, when one expires and who issued it.
 * The store that satisfies the port is bound in the composition root.
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

/**
 * Reads the token from the one place it is allowed to be.
 *
 * Takes the two things a request actually has rather than a whole Request, so
 * there is no way for a caller to hand over a URL and have it quietly honoured.
 */

/** Resolves a presented token to the caller it belongs to. */
