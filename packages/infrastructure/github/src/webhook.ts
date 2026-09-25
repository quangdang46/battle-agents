import type { ClaimOutcome, DeliveryClaim, DeliveryClaimStore } from './delivery.js';
import { normalizeDelivery, PULL_REQUEST_MERGED } from './normalize.js';
import { SIGNATURE_HEADER } from './signature.js';
import type { WebhookSecret } from './secrets.js';

/**
 * The webhook ingress, as a pure function over injected collaborators.
 *
 * The order below IS the deliverable. Everything else here is bookkeeping.
 *
 *   1. verify the signature over the RAW bytes
 *   2. only then parse
 *   3. record the delivery durably, refusing one already recorded
 *   4. publish what it asserted
 *
 * A rejected delivery writes nothing at all. That is not tidiness: the ledger is
 * the thing that decides whether a merge is published, so a claim written for an
 * unsigned request is an attacker able to burn a real merge's one chance to be
 * seen. Every early return below happens before `claims` is touched, and the
 * tests assert on the collaborator rather than on the status code, because a
 * 401 with a row written behind it is a pass that means nothing.
 *
 * On what a failure returns: publishing throws, the claim is released, and the
 * answer is 5xx so GitHub retries. The alternative — 2xx on a failed publish —
 * turns a transient failure into a merge nobody ever notices, and the brief is
 * explicit that a GitHub outage should cost a delay in noticing, not a
 * completion. The residual window is a crash between publishing and marking
 * published, which is documented in delivery.ts and in the design note rather
 * than papered over here.
 */

/** The transport's view of a delivery. `rawBody` is a string, not a parsed value. */
export interface GithubWebhookRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: { get(name: string): string | null };
  /**
   * The request bytes as received.
   *
   * Deliberately NOT `body?: unknown` like the other HTTP surface: a parsed
   * value has already lost the byte-for-byte form the signature covers, and a
   * type that offers both lets a caller quietly pick the wrong one.
   */
  readonly rawBody: string;
}

export interface GithubWebhookResponse {
  readonly status: number;
  readonly body: {
    readonly outcome:
      | 'accepted'
      | 'duplicate'
      | 'acknowledged'
      | 'unconfigured'
      | 'unauthenticated'
      | 'malformed'
      | 'rejected'
      | 'failed';
    /** Why a delivery was refused. Absent on success, and never a secret. */
    readonly reason?: string;
  };
}

export interface GithubWebhookHandler {
  (request: GithubWebhookRequest): Promise<GithubWebhookResponse>;
}

/**
 * The minimum an event must be to travel the runtime's bus. Declared here rather
 * than imported from core so this package's dependency graph stays empty; the
 * structural match is checked at the wiring site in apps/web.
 */
export interface EmittedEvent {
  readonly type: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly payload: unknown;
}

/**
 * The actor on an event this package emits. The runtime's own comment calls for
 * a system id on a system-originated event, and the temptation here is to put
 * the GitHub login in it — which would make a human's account the causal actor
 * in the activity trail, and quietly the closest thing this system has to
 * treating a GitHub identity as an agent identity.
 */
export const GITHUB_ACTOR_ID = 'github';

export const DELIVERY_HEADER = 'x-github-delivery';
export const EVENT_HEADER = 'x-github-event';

export interface GithubWebhookDependencies {
  /**
   * A provider, not a value.
   *
   * Two reasons. The check for "is a secret configured" belongs INSIDE the
   * ordering guarantee above rather than at a call site that could get it wrong
   * and pass `undefined`; and a secret that is read once at construction cannot
   * be rotated without restarting the process, which for a webhook secret means
   * an outage window you chose.
   */
  readonly secret: () => WebhookSecret | undefined;
  readonly claims: DeliveryClaimStore;
  readonly publish: (event: EmittedEvent) => Promise<void>;
  readonly now: () => string;
}

function status(
  code: number,
  outcome: GithubWebhookResponse['body']['outcome'],
  reason?: string,
): GithubWebhookResponse {
  return { status: code, body: reason === undefined ? { outcome } : { outcome, reason } };
}

export function createGithubWebhookHandler(
  dependencies: GithubWebhookDependencies,
): GithubWebhookHandler {
  const { secret, claims, publish, now } = dependencies;

  return async function handle(request: GithubWebhookRequest): Promise<GithubWebhookResponse> {
    if (request.method !== 'POST') {
      return status(405, 'rejected', 'only POST is a delivery');
    }

    // Fail closed with no secret configured. An endpoint that cannot tell an
    // authentic delivery from a forged one must not accept either, and "the
    // operator has not set the env var yet" is exactly the state where a
    // permissive default would mint state for whoever asks first.
    const configured = secret();
    if (configured === undefined) {
      return status(401, 'unconfigured', 'no webhook secret is configured');
    }

    // Before the parse, and over the bytes rather than anything derived from
    // them. Everything after this line is irrelevant to a caller who cannot
    // produce a valid HMAC.
    const verdict = configured.accepts(request.rawBody, request.headers.get(SIGNATURE_HEADER));
    if (!verdict.accepted) {
      return status(401, 'unauthenticated', verdict.reason);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(request.rawBody);
    } catch {
      return status(400, 'malformed', 'body is not JSON');
    }

    const deliveryId = request.headers.get(DELIVERY_HEADER);
    if (deliveryId === null || deliveryId === '') {
      // Authenticated, but unidentifiable. GitHub always sends the header, so
      // this is a caller that is not GitHub, and proceeding would mean
      // publishing a fact with no way to dedupe its retry.
      return status(400, 'rejected', 'missing delivery id');
    }

    const event = request.headers.get(EVENT_HEADER) ?? '';
    const normalized = normalizeDelivery(event, parsed, deliveryId);

    const delivery: DeliveryClaim = {
      deliveryId,
      event: normalized.event,
      action: normalized.action,
      fact: normalized.fact,
    };

    const claim = await claims.claim(delivery);
    if (claim.status === 'already-published') {
      return status(200, 'duplicate');
    }
    if (claim.status === 'in-flight') {
      // A concurrent delivery of the same fact holds the claim. It will publish
      // or fail; either way this one must not publish as well.
      return status(200, 'duplicate');
    }

    try {
      if (normalized.merged !== undefined) {
        await publish({
          type: PULL_REQUEST_MERGED,
          occurredAt: now(),
          actorId: GITHUB_ACTOR_ID,
          payload: normalized.merged,
        });
      }
    } catch (error: unknown) {
      // Release before answering, so the retry GitHub is about to send finds a
      // free claim rather than one that is in-flight forever. Without this the
      // claim stays, every retry sees 'in-flight', and a merged pull request is
      // never seen again — a transient failure turned into a permanent loss.
      await claims.release(claim.claimId);
      // 5xx, so GitHub actually retries, and the cause is named rather than
      // swallowed: the operator's first question is which half broke, and a bare
      // 500 answers nothing.
      return status(500, 'failed', error instanceof Error ? error.message : 'publish failed');
    }

    try {
      await claims.markPublished(claim.claimId, now());
    } catch (error: unknown) {
      // NOT released, and the asymmetry with the branch above is the whole point.
      // The event is already on the bus. Releasing here would hand the retry a
      // free claim and publish the same merge a second time — turning a ledger
      // write that failed into the double completion this package exists to
      // prevent. The cost is a claim row that stays unpublished forever, which
      // is the safe direction: the fact is not lost, it is not repeated, and a
      // reconcile pass can see it. Answering 5xx says so out loud.
      return status(
        500,
        'failed',
        `published but not recorded: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return normalized.fact === undefined ? status(200, 'acknowledged') : status(200, 'accepted');
  };
}

export type { ClaimOutcome, DeliveryClaim, DeliveryClaimStore };
