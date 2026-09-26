import {
  isAuthenticationFailure,
  UnknownActionError,
  UnknownDomainError,
} from '@battle-agents/api';

import type { HttpResponse } from './routes.js';

/**
 * One failure-to-status mapping, for every HTTP surface in this app.
 *
 * This was a private function copied into `routes.ts`, `event-routes.ts`,
 * `session-routes.ts` and `cron-routes.ts`, and each copy carried a comment
 * saying that collapsing them was somebody else's job. Four copies of a mapping
 * whose whole purpose is to be identical is four places for it to stop being
 * identical: a client that cannot tell "log in again" from "that does not exist"
 * from "the platform is broken" retries the wrong thing, and a dead credential
 * reported as a 500 reads as our fault rather than theirs.
 *
 * The copies had also drifted in the only way four hand-written copies can. The
 * one in `routes.ts` knew about `UnknownActionError` and `UnknownDomainError` and
 * the other three did not, so an unknown action surfaced as 404 on the primitives
 * and as 500 on the session route. Only the primitives could raise one today,
 * which is why nothing had broken — and "only this one path can raise it today"
 * is the kind of claim that stops being true without anybody deciding it should.
 *
 * The union is therefore the one that was already correct, and every surface now
 * uses it. A 404 for an unknown action or domain is the right answer wherever it
 * appears: neither class is ever raised for anything a client could retry.
 */
export function describeHttpFailure(error: unknown): HttpResponse {
  if (isAuthenticationFailure(error)) {
    return { status: 401, body: { error: error.message, reason: error.reason } };
  }
  if (error instanceof UnknownActionError || error instanceof UnknownDomainError) {
    return { status: 404, body: { error: error.message } };
  }
  if (isMalformedInput(error)) {
    // 400, and the reason is that the fault is provably the caller's: the
    // feature narrowed the payload, found a field that is not what it asked
    // for, and said so. Every feature raises this one code and every one of
    // them meant the same thing by it.
    //
    // It used to fall through to the 500 below, and that was a lie in the
    // direction that costs the most: a client that sent a negative amount was
    // told the platform was broken, so a client that retries a 500 retried a
    // request that could never succeed, and the message it logged named
    // something it had not done. Observed on `POST /api/act` with
    // `bounty.fund` carrying `amountCents: -1`, which answered 500 with a body
    // saying "refused its input: amount-negative".
    //
    // Named here rather than read off a `status` because no feature sets one, and
    // that is the point: they are describing a value, and the transport is what
    // knows what an unusable value is worth over HTTP.
    const reason = rejectionOf(error);
    return {
      status: 400,
      body: {
        error: error instanceof Error ? error.message : String(error),
        ...(reason === undefined ? {} : { reason }),
      },
    };
  }
  const declined = declaredStatus(error);
  if (declined !== undefined) {
    return {
      status: declined,
      body: {
        error: error instanceof Error ? error.message : String(error),
        ...bodyDetails(error),
      },
    };
  }
  return { status: 500, body: { error: error instanceof Error ? error.message : String(error) } };
}

/**
 * The one code every feature raises for a payload it would not accept.
 *
 * Spelled out rather than imported, for the reason the two branches above name
 * classes rather than codes and the branch below reads a `status` instead of
 * keeping a table: a transport that cannot import a feature still has to agree
 * with all of them about what this word means, and a copy here is the one that
 * can be checked by this repository's own tests rather than by a build order.
 */
const MALFORMED_INPUT = 'malformed-input';

function isMalformedInput(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly code?: unknown }).code === MALFORMED_INPUT
  );
}

/**
 * The feature's own machine-readable reason, when it sent one.
 *
 * `bountyInputRejected` attaches a `reason` and a shape string; a caller that
 * only reads `error` has to parse a sentence to find out which field was wrong,
 * and a client fixing a request should not have to do that.
 */
function rejectionOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { reason } = error as { readonly reason?: unknown };
  return typeof reason === 'object' && reason !== null && !Array.isArray(reason)
    ? reason
    : undefined;
}

/**
 * A status the thrower declared, or undefined.
 *
 * A feature that refuses a well-formed request for a domain reason — a bounty
 * that is already payable and cannot take a top-up — has decided something real
 * and the request is not going to succeed on a retry. Reporting that as a 500
 * says the platform is broken, and a client that believes it will keep retrying
 * a contribution that can never be accepted.
 *
 * Read off the value rather than kept in a table here, because the rule is the
 * thrower's: `packages/features/bounty` owns why a funding attempt is refused,
 * and a second list of its codes would be the copy that drifts. This is the
 * same reason the two branches above name classes rather than codes.
 *
 * Bounded to 4xx and excluding 401, which the branch above owns: a declared
 * status must not be able to turn an authentication failure into something a
 * client treats as its own fault. 5xx is excluded on purpose as well — a server
 * that says "this is my fault" with a 200-shaped body is a worse lie than a
 * 500.
 */
function declaredStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { status } = error as { readonly status?: unknown };
  return typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500 &&
    status !== 401
    ? status
    : undefined;
}

/**
 * Whatever else the thrower attached, so a refusal can say more than a status.
 *
 * The bounty refusal carries a `refusal` with the disposition and the sentence
 * about the sponsor's money, and dropping it here would leave an HTTP caller
 * with `409` and a message while the log row says something richer. Anything
 * that is not a plain object is dropped rather than stringified: this is a
 * response body, and a `Function` in one is a leak.
 */
function bodyDetails(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) return {};
  const { refusal } = error as { readonly refusal?: unknown };
  return typeof refusal === 'object' && refusal !== null && !Array.isArray(refusal)
    ? { refusal }
    : {};
}
