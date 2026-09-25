import { describe, expect, it } from 'vitest';

import { signPayload, verifySignature } from './signature.js';
import { githubWebhookSecretFromEnv, WebhookSecret, WEBHOOK_SECRET_VARIABLE } from './secrets.js';

const SECRET = 'a-secret-that-is-not-real';
/**
 * Pretty-printed, because that is what GitHub's own test deliveries send and
 * what any proxy in front of this endpoint is free to reformat. It matters for
 * the test below: a body that is ALREADY canonical survives a parse and a
 * re-serialise unchanged, so a handler that hashed the re-serialisation would
 * pass against this fixture while being wrong against every real delivery. The
 * whitespace is what makes the assertion bite.
 */
const BODY = '{\n  "action": "closed",\n  "number": 7\n}';

function verdict(header: string | null, body: string = BODY, secret: string = SECRET) {
  return verifySignature({ rawBody: body, header, secret });
}

describe('a signed delivery', () => {
  it('is accepted over the exact bytes GitHub sent', () => {
    expect(verdict(signPayload(SECRET, BODY))).toEqual({ accepted: true });
  });

  it('is REJECTED over a re-serialised body, which is the whole point', () => {
    // A handler that parses and re-serialises computes its HMAC over different
    // bytes than the ones GitHub signed, so every legitimate delivery fails and
    // the check is decorative. The mismatch here is a single space.
    const reserialised = JSON.stringify(JSON.parse(BODY) as unknown);

    expect(reserialised).not.toBe(BODY);
    expect(verdict(signPayload(SECRET, BODY), reserialised)).toEqual({
      accepted: false,
      reason: 'mismatch',
    });
  });

  it('is rejected when the body changed by one byte after signing', () => {
    const signed = signPayload(SECRET, BODY);

    expect(verdict(signed, `${BODY} `)).toEqual({ accepted: false, reason: 'mismatch' });
  });

  it('is rejected under a different secret', () => {
    expect(verdict(signPayload('a-different-secret', BODY))).toEqual({
      accepted: false,
      reason: 'mismatch',
    });
  });
});

describe('a delivery nobody signed', () => {
  it('is rejected when the header is absent', () => {
    expect(verdict(null)).toEqual({ accepted: false, reason: 'missing' });
  });

  it('is rejected when the header is empty', () => {
    expect(verdict('')).toEqual({ accepted: false, reason: 'missing' });
  });

  it('is rejected on a body that is not JSON at all', () => {
    // The signature is checked before anything parses, so the failure is a
    // signature failure and not a parse failure. An implementation that parsed
    // first would report a 400 here, and would have done so on attacker-chosen
    // input before deciding whether the caller was allowed to ask.
    const notJson = 'not json at all, just bytes';

    expect(verdict(signPayload(SECRET, notJson), notJson)).toEqual({ accepted: true });
    expect(verdict('sha256=' + '0'.repeat(64), notJson)).toEqual({
      accepted: false,
      reason: 'mismatch',
    });
  });
});

describe('a malformed signature header', () => {
  it('is rejected when the algorithm prefix is missing', () => {
    expect(verdict('a'.repeat(64))).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('is rejected when the algorithm is the one GitHub deprecated', () => {
    expect(verdict(`sha1=${'a'.repeat(40)}`)).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('is rejected when the digest is truncated', () => {
    expect(verdict(`sha256=${'a'.repeat(63)}`)).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('is rejected when the digest is not hex', () => {
    expect(verdict(`sha256=${'z'.repeat(64)}`)).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('is rejected rather than throwing on a short signature', () => {
    // `timingSafeEqual` throws when the two buffers differ in length, so an
    // implementation that calls it without checking first turns an
    // unauthenticated request into a 500. The verdict is the assertion; a throw
    // would fail the test as an error, not as a mismatch.
    const short = signPayload(SECRET, BODY).slice(0, 30);

    expect(() => verdict(short)).not.toThrow();
    expect(verdict(short)).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('is rejected rather than throwing when the header carries multi-byte characters', () => {
    // 'é' is two bytes in utf8, so a length comparison in characters and one in
    // bytes disagree. The byte length is the one that decides whether
    // timingSafeEqual throws.
    const padded = `sha256=${'a'.repeat(64)}é`;

    expect(() => verdict(padded)).not.toThrow();
    expect(verdict(padded).accepted).toBe(false);
  });
});

describe('the secret itself', () => {
  it('has no readable property, so it cannot be logged or serialised', () => {
    const secret = new WebhookSecret(SECRET);

    expect(Object.keys(secret)).toEqual([]);
    expect(JSON.stringify(secret)).toBe('{}');
    expect({ ...secret }).toEqual({});
    expect(String(secret)).not.toContain(SECRET);
  });

  it('verifies through its own operation, which is its only public one', () => {
    const secret = new WebhookSecret(SECRET);

    expect(secret.accepts(BODY, signPayload(SECRET, BODY))).toEqual({ accepted: true });
    expect(secret.accepts(BODY, null)).toEqual({ accepted: false, reason: 'missing' });
  });

  it('does not survive being thrown inside an Error', () => {
    const secret = new WebhookSecret(SECRET);
    const thrown = new Error('webhook rejected', { cause: secret });

    expect(JSON.stringify(thrown)).not.toContain(SECRET);
  });

  it('refuses to be constructed empty, because an empty secret signs everything', () => {
    expect(() => new WebhookSecret('')).toThrow();
  });

  it('is absent when the environment has no secret, so the endpoint can fail closed', () => {
    expect(githubWebhookSecretFromEnv({})).toBeUndefined();
    expect(githubWebhookSecretFromEnv({ [WEBHOOK_SECRET_VARIABLE]: '' })).toBeUndefined();
    expect(githubWebhookSecretFromEnv({ [WEBHOOK_SECRET_VARIABLE]: SECRET })).toBeInstanceOf(
      WebhookSecret,
    );
  });
});
