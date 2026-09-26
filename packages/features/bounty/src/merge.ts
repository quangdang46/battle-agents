/**
 * Turning a merged pull request into a game fact.
 *
 * This file is the whole answer to "a bounty is completed by a merge, and
 * progression pays 1000 XP for a bounty and 500 XP for a merged pull request".
 * Both rows exist. One merge is one piece of work. So the question is not
 * whether to emit both names — it is that a single merge must carry exactly one
 * award, and this module is where that is decided, in one place, on purpose.
 *
 * ## The decision
 *
 * **A merged pull request pays at most one award, and the award is the larger
 * of the two it qualifies for.**
 *
 *   - a merge that completed a bounty pays `bounty.completed` — 1000 XP, the
 *     plan's bounty award;
 *   - a merge that completed no bounty pays `pr.merged` — 500 XP, the plan's
 *     merge award;
 *   - never both, and never either one twice.
 *
 * The plan lists "PR merged +500" and "bounty +1000" as separate awards, and
 * both are legitimate for their own case, so neither row is wrong. What is wrong
 * is ADDING them, because they are not two achievements: they are two names for
 * one fact, and the second name exists for a merge that has no bounty behind
 * it. Pricing that merge at 1500 would make the bounty award 50% more expensive
 * than the plan's number for the bigger of the two, and the only place it would
 * show is a leaderboard looking briefly generous.
 *
 * ## Why it is emitted as two events anyway
 *
 * The event a merge produces is `github.pull_request.merged`, which is what the
 * GitHub integration emits and what every subscriber sees. `bounty.completed`
 * says the game thing — it carries the agent, which the integration deliberately
 * cannot supply, because a GitHub account is a human and the agent came from the
 * claim record. So a bounty merge emits both: `bounty.completed` for the award,
 * and `pr.merged` for the fact, carrying `completedBounty: true`.
 *
 * The second event is what makes the guarantee structural rather than a promise
 * about this module's restraint. `pr.merged` pays 500 only when its payload says
 * `completedBounty: false` (features/progression/src/rules.ts). An event
 * carrying `completedBounty: true` pays nothing however many times it is
 * emitted, by anyone, for any reason. Removing the restraint from this module
 * would then change the log and not the money — which is the property worth
 * having, and the reason the guard lives in the price table rather than here.
 *
 * ## Why the correlation is a claim record and never the merge author
 *
 * `githubLogin` on a merge delivery is a person's GitHub account. The agent
 * that did the work is whoever holds the claim on the bounty. Reading the agent
 * off the pull request author is how reputation and experience land on the
 * wrong party, and it is wrong in the common case: a human opens a pull request
 * an agent wrote, or an agent commits under a maintainer's account, and neither
 * is information this event carries. The login is kept, as `mergedBy`, because
 * a dispute needs to know who pressed the button.
 */

import { forRepository, prUrlFor, type RepositoryCoordinates } from './domain.js';

/**
 * The name the GitHub integration emits, written out rather than imported.
 *
 * A feature may not import `packages/infrastructure/github` —
 * architecture-rules.cjs forbids a feature importing any outer layer — so this
 * string is the feature's copy of a contract it is party to. That is a drift
 * risk, and it is covered by a cross-layer test rather than by an import:
 * tests/unit/github-boundary.test.ts asserts that this is the ONLY feature that
 * names the event, and it reads the constant from the integration package to do
 * it. A rename on either side that the other does not follow fails a test rather
 * than quietly subscribing nobody.
 */
export const GITHUB_PULL_REQUEST_MERGED = 'github.pull_request.merged';

/** The two award names, declared here so a test can read both off one module. */
export const BOUNTY_COMPLETED = 'bounty.completed';
export const PULL_REQUEST_MERGED_OUTCOME = 'pr.merged';

/** What the integration layer tells us a merge happened. */
export interface MergeDelivery {
  readonly repository: string;
  readonly pullRequest: number;
  readonly merged: true;
  readonly mergedAt: string | null;
  /** A GitHub ACCOUNT. A person. Never an agent id. */
  readonly githubLogin: string | null;
  readonly deliveryId: string;
}

export interface MergeOutcomeInput {
  readonly bountyId: string;
  readonly rewardCents: number;
  readonly prUrl: string;
  readonly repository: string;
  readonly pullRequest: number;
  /**
   * The agent the CLAIM names. Passed in rather than read from the delivery,
   * which is the whole identity argument above made into a parameter.
   */
  readonly agentId: string;
  readonly mergedBy: string | null;
}

export interface MergeOutcomeEvents {
  /** The award. Exactly one of the two names below appears. */
  readonly award: string;
  /** Both events, in the order a reader wants the log in. */
  readonly events: readonly MergeOutcomeEvent[];
}

export interface MergeOutcomeEvent {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Reads a merge delivery's payload, or returns undefined when it is not one.
 *
 * A handler receives `unknown`, and a payload that is a merge but has no
 * coordinates is a delivery this feature cannot place. Returning undefined makes
 * "not mine" a normal answer rather than an exception thrown inside somebody
 * else's event dispatch, where the catch would swallow the real failure.
 */
export function readMergeDelivery(payload: unknown): MergeDelivery | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const record = payload as { readonly [key: string]: unknown };
  if (record['merged'] !== true) {
    return undefined;
  }
  const repository = record['repository'];
  const pullRequest = record['pullRequest'];
  if (typeof repository !== 'string' || !Number.isInteger(pullRequest)) {
    return undefined;
  }
  if ((pullRequest as number) < 1) {
    return undefined;
  }
  const mergedAt = record['mergedAt'];
  const githubLogin = record['githubLogin'];
  const deliveryId = record['deliveryId'];
  return {
    repository,
    pullRequest: pullRequest as number,
    merged: true,
    mergedAt: typeof mergedAt === 'string' ? mergedAt : null,
    githubLogin: typeof githubLogin === 'string' ? githubLogin : null,
    deliveryId: typeof deliveryId === 'string' ? deliveryId : '',
  };
}

/**
 * The canonical pull request URL a delivery refers to.
 *
 * The same string `submit` stored, built from the same helper, so the two can be
 * compared as text. Reconstructing it here rather than string-formatting it is
 * what keeps a future change to the URL shape from making every stored bounty
 * uncorrelatable.
 */
export function prUrlForDelivery(delivery: MergeDelivery): string | undefined {
  const coordinates: RepositoryCoordinates | undefined = forRepository(delivery.repository);
  if (coordinates === undefined) {
    return undefined;
  }
  return prUrlFor(coordinates, delivery.pullRequest);
}

/**
 * The two events one completed bounty produces.
 *
 * Pure, so the money rule is testable without a runtime, a store or a database —
 * which matters more here than anywhere else in this feature, because this is
 * the one function whose output is a number of experience points.
 */
export function outcomeFor(input: MergeOutcomeInput): MergeOutcomeEvents {
  const common = {
    bountyId: input.bountyId,
    repository: input.repository,
    pullRequest: input.pullRequest,
    prUrl: input.prUrl,
    /** The claim's agent. Never `mergedBy`, which is a person's account. */
    agentId: input.agentId,
  };
  return {
    award: BOUNTY_COMPLETED,
    events: [
      {
        type: BOUNTY_COMPLETED,
        payload: {
          ...common,
          // reputation reads this (features/reputation/src/feature.ts) and it is
          // a SUM, because that is where a bounty's reward comes from.
          rewardCents: input.rewardCents,
          // Kept under a name that says what it is, so a reader of the log does
          // not have to know the identity rules to avoid confusing the two.
          mergedBy: input.mergedBy,
        },
      },
      {
        type: PULL_REQUEST_MERGED_OUTCOME,
        payload: {
          ...common,
          rewardCents: input.rewardCents,
          mergedBy: input.mergedBy,
          // The statement the price table reads. See the header: this is what
          // makes a second award impossible rather than merely absent.
          completedBounty: true,
        },
      },
    ],
  };
}

/**
 * The one event a merge that completed NO bounty produces.
 *
 * No agent, because there is no claim to correlate: a merge this feature does
 * not recognise has nobody to attribute it to, and inventing one would be the
 * identity bug this package exists to avoid. So it pays nothing today and is
 * recorded as a fact. It becomes worth 500 the moment something can name an
 * agent for a merge that is not a bounty — agent_stats already counts
 * `prs_merged` with no bounty involved, so that case is real and is not this
 * bead's to answer.
 */
export function outcomeForUnclaimed(input: {
  readonly repository: string;
  readonly pullRequest: number;
  readonly prUrl: string;
  readonly mergedBy: string | null;
}): MergeOutcomeEvent {
  return {
    type: PULL_REQUEST_MERGED_OUTCOME,
    payload: {
      repository: input.repository,
      pullRequest: input.pullRequest,
      prUrl: input.prUrl,
      mergedBy: input.mergedBy,
      completedBounty: false,
    },
  };
}
