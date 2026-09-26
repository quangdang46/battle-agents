import { describe, expect, it } from 'vitest';

import { describeHttpFailure } from './http-failure.js';

/**
 * The one failure-to-status mapping, and the statuses it is allowed to invent.
 *
 * This function had four private copies before it was collapsed, and it is the
 * last place a status is decided for every surface in this app, so a change
 * here is a change to what the CLI, the MCP client and every HTTP caller are
 * told. The `malformed-input` case is the one that was wrong: a caller that sent
 * a negative `amountCents` to `POST /api/act` was answered 500 with a body
 * saying "refused its input: amount-negative", which reads as the platform
 * being broken and, worse, invites a retry of a request that can never succeed.
 */

/** What a feature throws for a payload it will not accept, rebuilt rather than imported. */
function malformed(reason: string): Error {
  return Object.assign(new Error(`bounty.fund refused its input: ${reason}. A funding takes…`), {
    code: 'malformed-input',
    reason: { reason },
  });
}

describe('describeHttpFailure', () => {
  it('answers a refused payload with 400 and the reason that refused it', () => {
    const response = describeHttpFailure(malformed('amount-negative'));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: expect.stringContaining('amount-negative') as unknown as string,
      reason: { reason: 'amount-negative' },
    });
  });

  it('does not put a reason key on a refusal that carried none', () => {
    // A feature that raises the code without a `reason` still gets a 400; the
    // key is omitted rather than serialised as null, so a client branching on
    // `body.reason` is not handed a value it has to tell apart from absent.
    const response = describeHttpFailure(
      Object.assign(new Error('nope'), { code: 'malformed-input' }),
    );

    expect(response.status).toBe(400);
    expect(Object.keys(response.body as object)).toEqual(['error']);
  });

  it('leaves a declared domain status alone', () => {
    // The branch above must not swallow the one below it: a bounty that is
    // already payable carries its own 409, and that answer is the funding
    // disposition's whole point.
    const declined = Object.assign(new Error('cannot take a top-up'), {
      code: 'payout-illegal-transition',
      status: 409,
      refusal: { disposition: 'already-payable' },
    });

    const response = describeHttpFailure(declined);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ refusal: { disposition: 'already-payable' } });
  });

  it('still answers 500 for something nobody claimed was the caller’s fault', () => {
    // The fail-closed half. `malformed-input` is a promise the thrower makes
    // about a VALUE; anything else keeps the server-fault answer, because a
    // client that retries a 500 is doing the right thing when the 500 is true.
    const response = describeHttpFailure(new Error('connection reset'));

    expect(response.status).toBe(500);
  });

  it('does not treat a declared 401 as a bad payload', () => {
    // `declaredStatus` excludes 401 on purpose so it cannot un-own an
    // authentication failure. The malformed branch is keyed on a code rather
    // than a status, so a feature that attached both is still a payload
    // refusal — and a test asserting the exclusion would pass vacuously unless
    // the two branches were in the same shape, which they now are not.
    const both = Object.assign(new Error('expired'), {
      code: 'malformed-input',
      status: 401,
    });

    expect(describeHttpFailure(both).status).toBe(400);
  });
});
