import type { DeliveryFact } from './delivery.js';

/**
 * GitHub's delivery, turned into something this repository can name.
 *
 * Everything here is deliberately free of game vocabulary. The event type and
 * every payload key say what the OUTSIDE WORLD did — a pull request in a
 * repository was merged — and stop there. Deciding that a merge completes a
 * bounty, and who the bounty belonged to, is the bounty layer's job, and it
 * cannot do that job if this package has already made the decision for it.
 *
 * The two names that are NOT used, and why.
 *
 *   `bounty.completed` — a game fact, and this package knows nothing about
 *     bounties. Emitting it here would put the game vocabulary at the
 *     integration edge, which is exactly the layering the plan forbids.
 *
 *   `pr.merged` — subtler, and the reason is a live defect rather than a taste.
 *     progression registers a handler for it and pays 500 XP
 *     (packages/features/progression/src/rules.ts). When the bounty feature
 *     lands and translates this same merge into `bounty.completed`, which pays
 *     1000, one merged pull request pays 1500 and writes two history rows. The
 *     double-pay is armed today and only this event name pulls the trigger, so
 *     the integration edge takes a name nothing is subscribed to.
 *
 * The name is therefore namespaced under the integration that observed it, which
 * is also what makes it obvious in a log whose line came from here.
 */
export const PULL_REQUEST_MERGED = 'github.pull_request.merged';

/** The kind recorded against the delivery ledger, and the same string as the event type. */
export const PULL_REQUEST_MERGED_FACT = PULL_REQUEST_MERGED;

/**
 * The payload, and the shape of the identity boundary in one type.
 *
 * `githubLogin` is the GitHub ACCOUNT that opened the pull request. It is a
 * human's GitHub identity and nothing else: this package has no way to know
 * which local agent produced the pull request, and the type is built so that
 * there is no field a consumer could mistake for an agent id. Both existing
 * consumers read `payload.agentId` and silently skip an event without one
 * (progression/src/feature.ts, reputation/src/feature.ts), so the absence is
 * not a bug here — it is the invariant, and the bounty layer is the only thing
 * that can legitimately supply the agent by correlating the claim record.
 */
export interface PullRequestMergedPayload {
  readonly repository: string;
  readonly pullRequest: number;
  readonly merged: true;
  /** GitHub's own timestamp, or null when the delivery did not carry one. */
  readonly mergedAt: string | null;
  readonly githubLogin: string | null;
  readonly deliveryId: string;
}

export interface NormalizedDelivery {
  readonly event: string;
  readonly action: string;
  readonly fact: DeliveryFact | undefined;
  readonly merged: PullRequestMergedPayload | undefined;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * Read the two things a merge is identified by: which repository, and which
 * pull request. `repository.full_name` is the only spelling GitHub guarantees
 * (`owner/name`); the nested `owner.login` is not used, because a repository
 * can be transferred and `full_name` is what follows it.
 */
function coordinatesOf(
  payload: JsonObject,
): { repository: string; pullRequest: JsonObject; number: number } | undefined {
  const repository = asString(asObject(payload['repository'])?.['full_name']);
  const pullRequest = asObject(payload['pull_request']);
  const number = asNumber(pullRequest?.['number']);
  if (repository === undefined || pullRequest === undefined || number === undefined) {
    return undefined;
  }
  return { repository, pullRequest, number };
}

/**
 * A delivery with no usable coordinates is a real GitHub delivery we cannot
 * place. It is acknowledged rather than rejected: refusing it would make GitHub
 * retry a message that will never become plainer, and answering 4xx for a
 * well-signed delivery is a lie about what went wrong.
 */
export function normalizeDelivery(
  event: string,
  payload: unknown,
  deliveryId: string,
): NormalizedDelivery {
  const body = asObject(payload);
  const action = asString(body?.['action']) ?? 'unknown';
  const acknowledged: NormalizedDelivery = { event, action, fact: undefined, merged: undefined };

  if (body === undefined || event !== 'pull_request') {
    return acknowledged;
  }

  const coordinates = coordinatesOf(body);
  if (coordinates === undefined) {
    return acknowledged;
  }

  // Only a merge is a fact. `closed` without `merged` is a pull request that was
  // abandoned or closed as stale, and treating it as a merge would complete work
  // that was never accepted.
  if (action !== 'closed' || coordinates.pullRequest['merged'] !== true) {
    return acknowledged;
  }

  const login = asString(asObject(coordinates.pullRequest['user'])?.['login']) ?? null;
  const mergedAt = asString(coordinates.pullRequest['merged_at']) ?? null;

  return {
    event,
    action,
    fact: {
      kind: PULL_REQUEST_MERGED_FACT,
      repository: coordinates.repository,
      subject: 'pull_request',
      subjectNumber: coordinates.number,
    },
    merged: {
      repository: coordinates.repository,
      pullRequest: coordinates.number,
      merged: true,
      mergedAt,
      githubLogin: login,
      deliveryId,
    },
  };
}
