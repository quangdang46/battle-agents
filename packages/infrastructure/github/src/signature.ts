import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * X-Hub-Signature-256 verification.
 *
 * GitHub signs every delivery with an HMAC-SHA256 of the RAW request body, keyed
 * by the webhook secret, and sends the digest in a header. This is the only
 * thing standing between the public internet and an endpoint whose job is to
 * mint game state, so it is written to fail closed and to fail for the same
 * reason on every kind of bad input.
 *
 * The one detail that decides whether this works at all: the digest covers the
 * bytes on the wire. `JSON.parse` followed by `JSON.stringify` does not return
 * those bytes — key order, unicode escaping and whitespace all change — so a
 * handler that hashes a re-serialised object rejects every legitimate delivery
 * and would accept a crafted one. The caller therefore hands over the raw text
 * and this module never parses anything.
 */

/** The header GitHub signs with. Lower-cased: HTTP header names are not case sensitive. */
export const SIGNATURE_HEADER = 'x-hub-signature-256';

export const SIGNATURE_PREFIX = 'sha256=';

const SHA256_HEX_LENGTH = 64;
const HEX_DIGITS = /^[0-9a-f]+$/i;

export type SignatureFailure = 'missing' | 'malformed' | 'mismatch';

export type SignatureVerdict =
  { readonly accepted: true } | { readonly accepted: false; readonly reason: SignatureFailure };

/** The hex digest GitHub would send for this body. Exported so a fixture can be signed. */
export function signPayload(secret: string, rawBody: string): string {
  return `${SIGNATURE_PREFIX}${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

/**
 * Why each rejection is its own reason rather than one opaque "invalid".
 *
 * An operator staring at a 401 has one question — is GitHub sending the wrong
 * secret, or is somebody forging? — and the answer is the difference between
 * `missing` and `mismatch`. It is also a real difference in threat: a missing
 * header on a delivery from GitHub is a misconfigured app, and a mismatch on a
 * body that parses perfectly is somebody guessing.
 */
export function verifySignature(params: {
  readonly rawBody: string;
  readonly header: string | null;
  readonly secret: string;
}): SignatureVerdict {
  const { rawBody, header, secret } = params;

  if (header === null || header === '') {
    return { accepted: false, reason: 'missing' };
  }
  if (!header.startsWith(SIGNATURE_PREFIX)) {
    return { accepted: false, reason: 'malformed' };
  }

  const digest = header.slice(SIGNATURE_PREFIX.length);
  if (digest.length !== SHA256_HEX_LENGTH || !HEX_DIGITS.test(digest)) {
    return { accepted: false, reason: 'malformed' };
  }

  const expected = Buffer.from(signPayload(secret, rawBody), 'utf8');
  const provided = Buffer.from(header, 'utf8');

  // Length first, and this is a correctness check rather than a defence.
  // `timingSafeEqual` THROWS on a length mismatch, so a short signature would
  // otherwise turn a rejection into a 500 — an unauthenticated caller could
  // produce a server error with one header, and a caller watching for 5xx would
  // treat the endpoint as broken rather than as hostile. Length is not secret
  // (it is visible in the header), so branching on it leaks nothing the compare
  // was there to hide.
  if (expected.length !== provided.length) {
    return { accepted: false, reason: 'mismatch' };
  }

  return timingSafeEqual(expected, provided)
    ? { accepted: true }
    : { accepted: false, reason: 'mismatch' };
}
