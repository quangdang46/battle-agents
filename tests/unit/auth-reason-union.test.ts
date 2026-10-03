import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUTHENTICATION_REASONS, isAuthenticationFailure } from '../../packages/api/src/index.js';

/**
 * The auth reason union is as wide as the reasons this repository actually raises.
 *
 * ## The failure this exists for
 *
 * `AuthenticationFailure.reason` was `string`. Narrowing it to the three reasons
 * `packages/features/agent/src/credential.ts` produces LOOKED like the fix and was
 * a regression: `packages/db/src/auth.ts` raises four more —
 * `missing`, `malformed`, `unknown`, `token-in-url` — so a narrowed union stopped
 * matching them, and every "refuses … without a credential" route answered 500
 * instead of 401. Eleven tests went red.
 *
 * The mistake was reading one source and assuming it was the only one.
 *
 * ## Why a set-agreement test is NOT enough
 *
 * The first attempt at holding this was "every value in the set must be accepted
 * by the guard". That is necessary and it is not sufficient: when the union was
 * narrow AND the guard was narrow, both agreed with each other and the test was
 * green. Two things being consistent says nothing about either being right.
 *
 * So this compares against the place the reasons are WRITTEN DOWN. If someone
 * adds an eighth reason to `auth.ts` and forgets the union, this fails — and if
 * someone removes one, this fails too, because a reason nothing raises is a
 * reason no caller will ever be told about.
 *
 * ## Why it reads the source instead of importing
 *
 * The obvious version imports `AuthFailure` from `packages/db` and compares the
 * types. That crosses a layer the api package is not allowed to cross, and
 * `tests/unit/removal-test`-adjacent checks are right to fail on it. Reading the
 * text is deliberately weaker — it cannot see a reason composed at runtime —
 * and deliberately honest about it: a reason is always a literal in these
 * unions, because that is what makes them `switch`-able on the other side.
 */
const REPO = join(process.cwd());
const AUTH_SOURCE = join(REPO, 'packages', 'db', 'src', 'auth.ts');
/**
 * A second source of reasons, kept because the union is only worth checking
 * against more than one place.
 *
 * It pointed at `packages/features/agent/src/credential.ts`, which was deleted
 * with the feature that owned it, so `reasonsIn` returned nothing for it and the
 * comparison silently became single-source — a test that still passed while
 * checking half of what it claimed. `packages/db/src/auth.ts` raises all seven
 * reasons on its own, so the rule is still enforced; the redundancy is what an
 * extension reinstating its own credential store should add back here.
 */
const CREDENTIAL_SOURCE = join(REPO, 'packages', 'features', 'agent', 'src', 'credential.ts');
const API_SOURCE = join(REPO, 'packages', 'api', 'src', 'api.ts');

/**
 * Every `reason: '…'` literal in a file — the reasons it can actually produce.
 *
 * A file that is not there contributes nothing rather than throwing, so this
 * tolerates an extension being absent — the same rule AGENTS.md states for a
 * check that reads a feature's `src` at a fixed path. That tolerance is exactly
 * what let this one go quietly half-blind when the agent feature was removed,
 * which is why the header above names the lost source rather than leaving a
 * reader to assume there are still two. `packages/db` and `packages/api` are not
 * optional, and the floor in the first assertion is what keeps them from quietly
 * joining it.
 */
function reasonsIn(path: string): string[] {
  if (!existsSync(path)) return [];
  const source = readFileSync(path, 'utf8');
  return [...source.matchAll(/reason:\s*'([a-z-]+)'/g)].map((match) => match[1] as string);
}

/** The reasons the api's union DECLARES, read from the exported type. */
function declaredUnion(): string[] {
  const source = readFileSync(API_SOURCE, 'utf8');
  const declaration = source.match(
    /export type AuthenticationFailureReason\s*=([\s\S]*?);/,
  );
  if (declaration === null) {
    throw new Error('could not find the AuthenticationFailureReason union in api.ts');
  }
  return [...declaration[1]!.matchAll(/'([a-z-]+)'/g)].map((match) => match[1] as string);
}

/** A throwaway error shaped like a refusal the transport would receive. */
function refusedWith(reason: string): Error {
  const error = new Error('refused') as Error & { reason: string };
  error.reason = reason;
  return error;
}

describe('the authentication reason union', () => {
  const raised = [...new Set([...reasonsIn(AUTH_SOURCE), ...reasonsIn(CREDENTIAL_SOURCE)])].sort();
  const declared = [...new Set(declaredUnion())].sort();

  it('found the reasons to check, so an empty match is not a pass', () => {
    // A scan that reads nothing passes everything. This is the assertion that
    // makes the rule below mean anything.
    expect(raised.length).toBeGreaterThanOrEqual(7);
    expect(declared.length).toBeGreaterThan(0);
  });

  it('declares every reason this repository raises', () => {
    // The regression. The union was three, the repository raises seven, and
    // nothing said so until eleven route tests went red.
    expect(declared.sort()).toEqual(raised);
  });

  it('accepts every reason the transport can be handed', () => {
    // The guard is what decides 401 versus 500, so it must not be narrower than
    // what anything produces.
    for (const reason of raised) {
      expect(isAuthenticationFailure(refusedWith(reason)), reason).toBe(true);
    }
  });

  it('keeps the runtime set and the declared union in step', () => {
    // Necessary rather than sufficient — the two agreeing proves nothing on
    // their own, which is the trap the first attempt fell into. It is here so a
    // future edit to ONE of them is caught by the comparison above instead of
    // waiting for a route test.
    expect([...AUTHENTICATION_REASONS].sort()).toEqual(declared);
  });

  it('refuses a reason that is not one of ours', () => {
    // The property that makes the union worth having: a misspelled reason from
    // some future harness is not a credential failure, and answering 401 for it
    // would tell the caller to sign in again over a typo.
    expect(isAuthenticationFailure(refusedWith('typo-in-a-harness'))).toBe(false);
    expect(isAuthenticationFailure(new Error('plain'))).toBe(false);
    expect(isAuthenticationFailure({ reason: 'revoked' })).toBe(false);
  });
});
