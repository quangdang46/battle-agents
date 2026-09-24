import { describe, expect, it } from 'vitest';

import {
  canTransition,
  checkIntent,
  declareFunding,
  INTENT_ONLY,
  markPending,
  markRecorded,
  needsSandboxBanner,
  PAYOUT_REJECTIONS,
  type PayoutIntent,
} from './payout.js';

const NOW = '2026-09-24T12:00:00.000Z';
const BOUNTY = 'bounty-1';

describe('recording payout intent', () => {
  it('walks funded -> pending -> recorded without moving money', () => {
    const funded = declareFunding({
      bountyId: BOUNTY,
      amountCents: 2500,
      reportedBy: 'user-1',
      now: NOW,
    });
    const pending = markPending({
      bountyId: BOUNTY,
      amountCents: 2500,
      reportedBy: 'user-1',
      now: NOW,
    });
    const recorded = markRecorded({
      bountyId: BOUNTY,
      amountCents: 2500,
      reportedBy: 'user-2',
      now: NOW,
    });

    expect([funded.state, pending.state, recorded.state]).toEqual([
      'funded',
      'pending',
      'recorded',
    ]);
    // Every state, including the last, is somebody's claim. The platform cannot
    // observe a transfer between two humans, so a recorded payout is an
    // attributed report and not an inference.
    expect([funded.reportedBy, pending.reportedBy, recorded.reportedBy]).toEqual([
      'user-1',
      'user-1',
      'user-2',
    ]);
  });

  it('emits nothing that could name a destination for money', () => {
    const intent = declareFunding({
      bountyId: BOUNTY,
      amountCents: 2500,
      reportedBy: 'u',
      now: NOW,
    });

    // The guarantee, asserted rather than described: there is no field here that
    // could hold a bank account, a card token, a Stripe id, or a handle that
    // resolves to one. Adding one would change this test, which is the point.
    expect(Object.keys(intent).sort()).toEqual([
      'amountCents',
      'bountyId',
      'mode',
      'recordedAt',
      'reportedBy',
      'state',
    ]);
    for (const key of Object.keys(intent)) {
      expect(key).not.toMatch(/account|iban|card|token|secret|credential|destination|transfer/i);
    }
  });

  it('refuses an amount that is not whole cents', () => {
    // The failure this prevents is quiet and compounds: a float cents column
    // loses a cent somewhere, and once the sum of refunds stops equalling the
    // sum of funds, every refund path is quietly wrong.
    for (const amount of [25.5, -1, Number.NaN]) {
      expect(() =>
        declareFunding({ bountyId: BOUNTY, amountCents: amount, reportedBy: 'u', now: NOW }),
      ).toThrow(/whole number of cents/);
    }
  });

  it('refuses an intent nobody reported', () => {
    const intent = declareFunding({
      bountyId: BOUNTY,
      amountCents: 100,
      reportedBy: '  ',
      now: NOW,
    });

    expect(checkIntent(intent, undefined)).toEqual({
      accepted: false,
      code: PAYOUT_REJECTIONS.missingReporter,
    });
  });

  it('refuses a backwards transition', () => {
    const funded = declareFunding({
      bountyId: BOUNTY,
      amountCents: 100,
      reportedBy: 'u',
      now: NOW,
    });
    const pending = markPending({ bountyId: BOUNTY, amountCents: 100, reportedBy: 'u', now: NOW });

    expect(checkIntent(pending, funded)).toEqual({ accepted: true });
    expect(checkIntent(funded, pending)).toEqual({
      accepted: false,
      code: PAYOUT_REJECTIONS.illegalTransition,
    });
  });

  it('will not let a recorded payout go anywhere', () => {
    expect(canTransition('recorded', 'recorded')).toBe(false);
    const recorded = markRecorded({
      bountyId: BOUNTY,
      amountCents: 100,
      reportedBy: 'u',
      now: NOW,
    });
    expect(checkIntent(recorded, undefined)).toEqual({ accepted: true });
  });
});

describe('the sandbox banner', () => {
  it('appears for every state where money is attached and untransferred', () => {
    // The bead calls this a hard requirement rather than polish, and the reason
    // is the failure it prevents: a solver who closed a PR, saw a status that
    // read "paid", and was never paid.
    expect(needsSandboxBanner('funded')).toBe(true);
    expect(needsSandboxBanner('pending')).toBe(true);
  });

  it('does not appear for a bounty with no money, or after a reported transfer', () => {
    expect(needsSandboxBanner('none')).toBe(false);
    expect(needsSandboxBanner('recorded')).toBe(false);
  });
});

describe('a caller trying to use this to move money', () => {
  it('is refused at runtime, because a parsed body is not a type', () => {
    // Unreachable through the typed constructors — that is the point of the
    // single-member mode union. Reachable from JSON, which is why the check
    // exists at all: the types do not see a request body.
    const smuggled = {
      bountyId: BOUNTY,
      amountCents: 100,
      state: 'recorded',
      mode: 'transfer',
      recordedAt: NOW,
      reportedBy: 'attacker',
    } as unknown as PayoutIntent;

    expect(checkIntent(smuggled, undefined)).toEqual({
      accepted: false,
      code: PAYOUT_REJECTIONS.transferAttempted,
    });
  });

  it('has exactly one mode to name', () => {
    expect(INTENT_ONLY).toBe('intent-only');
    const funded = declareFunding({
      bountyId: BOUNTY,
      amountCents: 100,
      reportedBy: 'u',
      now: NOW,
    });
    expect(funded.mode).toBe(INTENT_ONLY);
  });
});
