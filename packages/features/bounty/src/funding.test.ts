import { describe, expect, it } from 'vitest';

import {
  fundingRefused,
  fundingRefusedError,
  FUNDING_REFUSAL_DISPOSITIONS,
  FUNDING_REFUSALS,
  NO_MONEY_WAS_TAKEN,
  type FundingRefusalReason,
} from './funding.js';

/**
 * What a refused contribution did to the sponsor's money.
 *
 * The feature suite in `feature.test.ts` proves the two refusal points ROUTE to
 * this; this proves the answers, which are what a sponsor reads. They are worth
 * separating because they fail differently: deleting a call site in the feature
 * leaves every assertion here green, and turning one disposition into a constant
 * here leaves both feature tests green as well, since neither of them compares
 * the two reasons against each other.
 *
 * The mutation that made the case for the third test: making `BY_REASON` return
 * `alreadyPayable` for everything is a one-line edit that satisfies every
 * per-reason assertion in `feature.test.ts`, because each of those tests only
 * ever asks about one reason. Only a test that sees both at once catches it.
 */

const EVERY_REASON: readonly FundingRefusalReason[] = [
  FUNDING_REFUSALS.terminal,
  FUNDING_REFUSALS.payable,
];

describe('a refused contribution', () => {
  it('says, for every reason, that no money moved and none is held', () => {
    for (const reason of EVERY_REASON) {
      const refusal = fundingRefused(reason);
      // The sentence is what a sponsor reads, and the feature puts it in two
      // places — the throw and the log row — so it has to be here in both.
      expect(refusal.notice, `${reason} did not carry the money statement`).toContain(
        NO_MONEY_WAS_TAKEN,
      );
      expect(refusal.notice.trim(), `${reason} explained itself with nothing`).not.toBe('');
    }
  });

  it('states the three claims that make the sentence safe to read', () => {
    // The prose may be reworded; these three are the claims, and a rewrite that
    // drops one of them has turned a sponsor-facing sentence into a decoration.
    expect(NO_MONEY_WAS_TAKEN).toContain('never takes a payment');
    expect(NO_MONEY_WAS_TAKEN).toContain('nothing was charged');
    expect(NO_MONEY_WAS_TAKEN).toContain('nothing to refund');
    // And nothing that could be read as a transfer having happened. A refusal
    // that mentioned one would be the exact bug this exists to prevent.
    expect(NO_MONEY_WAS_TAKEN.toLowerCase()).not.toMatch(
      /refunded you|we paid|has been transferred/,
    );
  });

  it('tells the two reasons apart, which is the only reason there are two', () => {
    // A single disposition for both would satisfy every per-reason assertion
    // elsewhere. Verified by mutation: replacing the lookup body with a constant
    // leaves `feature.test.ts` at 42/42 and turns this red.
    const finished = fundingRefused(FUNDING_REFUSALS.terminal);
    const payable = fundingRefused(FUNDING_REFUSALS.payable);

    expect(finished.disposition).toBe(FUNDING_REFUSAL_DISPOSITIONS.bountyFinished);
    expect(payable.disposition).toBe(FUNDING_REFUSAL_DISPOSITIONS.alreadyPayable);
    expect(finished.disposition).not.toBe(payable.disposition);
    // The prose differs too, and not only by the disposition word: a caller
    // rendering `notice` alone has to be able to answer "can I back this bounty
    // some other time?" from it.
    expect(finished.notice).not.toBe(payable.notice);
  });

  it('refuses to answer for a reason it does not know', () => {
    // The fail-closed half. A reason from a future build, or from a parsed body,
    // has no sentence in this file, and inventing one is how a sponsor is told
    // their money is safe on the strength of a rule nobody wrote.
    const invented = 'bounty-refused-by-a-rule-this-build-does-not-have';
    expect(() => fundingRefused(invented as FundingRefusalReason)).toThrow(
      /disposition .* would leave a sponsor with a reason and no answer/s,
    );
    // `undefined` is the other way a lookup can miss, and it must not become a
    // refusal with no notice.
    expect(() => fundingRefused(undefined as unknown as FundingRefusalReason)).toThrow();
  });

  it('carries the wire code, a 409 and the refusal on the error', () => {
    const refusal = fundingRefused(FUNDING_REFUSALS.payable);
    const error = fundingRefusedError(refusal, 'bounty b-1 cannot be funded.');

    expect(error).toBeInstanceOf(Error);
    // The code a caller already branches on, unchanged by the disposition
    // arriving alongside it.
    expect(error.code).toBe(FUNDING_REFUSALS.payable);
    // 409 and NOT 500: the request was well formed and the domain declined it,
    // and a client reading 500 as "transient, retry" retries a top-up that can
    // never be accepted.
    expect(error.status).toBe(409);
    expect(error.refusal).toBe(refusal);
    // The context a caller supplied leads, and the notice follows, so the first
    // line a log prints names the bounty and the rest explains the money.
    expect(error.message.startsWith('bounty b-1 cannot be funded.')).toBe(true);
    expect(error.message).toContain(NO_MONEY_WAS_TAKEN);
  });
});
