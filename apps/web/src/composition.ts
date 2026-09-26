import { agentFeature } from '@battle-agents/agent';
import { bountyFeature } from '@battle-agents/bounty';
import { progressionFeature } from '@battle-agents/progression';
import { questFeature } from '@battle-agents/quest';
import { reputationFeature } from '@battle-agents/reputation';
import { socialFeature } from '@battle-agents/social';
import { createRuntime } from '@battle-agents/core';
import type { EventBus, Logger, Runtime, StateStore } from '@battle-agents/core';

import {
  closeDatabasePool,
  createDatabase,
  createDatabasePool,
  DrizzleAgentRepository,
  DrizzleBountyRepository,
  DrizzlePayoutIntentStore,
  DrizzleProgressionRepository,
  DrizzleQuestRepository,
  DrizzleReputationRepository,
  DrizzleSessionRepository,
  DrizzleSocialRepository,
} from '@battle-agents/db';

/**
 * The composition root: the one place that decides which features exist and
 * what they are wired to.
 *
 * It lives here rather than in `packages/core` because core is forbidden from
 * importing a feature — that rule is what stops the runtime from growing a
 * dependency on the game it hosts — and because the web app is the only layer
 * allowed to depend on features and infrastructure at once.
 *
 * Adding a feature is two lines here plus a dependency entry in package.json.
 * Nothing else changes, which is the property scripts/removal-test.sh checks by
 * stripping those two lines and rebuilding.
 *
 * Everything this file says about a feature is therefore confined to a line the
 * removal test can delete. That is why the dependency below is typed as the
 * concrete Postgres store rather than as the feature's `AgentRepository`
 * port: naming the port here, on a line that survives the strip, would leave
 * every removed feature's type in a live signature and make the feature
 * impossible to remove. Conformance is still checked, at the extensions[] line
 * where the port actually applies.
 */

/** What the host supplies. Core takes no position on where these come from. */
export interface GameRuntimeDependencies {
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly log?: Logger;
  /**
   * The store this root wires. Required rather than optional: a runtime with no
   * agent storage would answer "you have no characters" to every caller, which
   * reads as a working product with an empty account rather than as a
   * misconfigured one. Failing to build is the honest outcome.
   */
  readonly agentRepository: DrizzleAgentRepository;
  /**
   * Quest storage. Required for the same reason the agent store is: a quest
   * board with no store answers "no quests", which is indistinguishable from a
   * genuinely empty board, and an empty board that cannot be written to is a
   * failure that only shows up when somebody tries to play.
   */
  readonly questRepository: DrizzleQuestRepository;
  /** Session storage. What makes the session actions exist at all: without it the
   *  agent feature registers no session.heartbeat or session.end, and `discover`
   *  says so rather than offering operations that throw. */
  readonly sessionRepository: DrizzleSessionRepository;
  /**
   * Progression storage. Required for the same reason as the others: xp and
   * level answer zero with no store, and a character at level 1 is
   * indistinguishable from one whose progress was never recorded.
   */
  readonly progressionRepository: DrizzleProgressionRepository;
  /**
   * Reputation storage. Required for the same reason as the others: trust with
   * no store answers zero, and an agent nobody has heard of and an agent whose
   * record was lost are different situations.
   */
  readonly reputationRepository: DrizzleReputationRepository;
  /**
   * Social storage. Required for the same reason as the others: a character
   * sheet and a leaderboard answer from memory when there is no store, which is
   * indistinguishable from a genuinely empty board, and an inbox that cannot be
   * written to is a messaging feature that only fails when somebody tries to use
   * it.
   *
   * Note that installing this feature does not make messaging work: social
   * requires the `guild.can_talk_to` capability, and no feature provides it yet,
   * so a composed runtime reports social as degraded and `social.send` refuses.
   * That is the fail-closed half of an authorization boundary this repository
   * has deliberately not decided, and it is why the degradation is a property
   * worth wiring rather than a gap to paper over.
   */
  readonly socialRepository: DrizzleSocialRepository;
  /**
   * Bounty storage, and the record of payout intent.
   *
   * Required for the same reason as the others: a bounty board that answers with
   * no bounties because nothing was ever written to it is indistinguishable from
   * an empty one, and a reward whose funding nobody recorded is a claim the
   * platform cannot back up.
   */
  readonly bountyRepository: DrizzleBountyRepository;
  /**
   * Payout intent. The conformance between this and the feature's
   * `PayoutIntentStore` is checked here, at the one call site where the feature's
   * port and the infrastructure implementation are both in scope, because that
   * is the only layer allowed to see both.
   */
  readonly payoutIntentStore: DrizzlePayoutIntentStore;
}

export function createGameRuntime(dependencies: GameRuntimeDependencies): Runtime {
  return createRuntime({
    // One feature per line, each line the whole call. scripts/removal-test.sh
    // deletes a feature by stripping the line that constructs it, so folding
    // two onto one line, or wrapping a call across lines, would leave a
    // reference behind and fail the removal test for the wrong reason.
    extensions: [
      // This comment is load-bearing. It sits INSIDE the array because that is
      // the only place prettier will not collapse it: a short array with no
      // comment inside goes back onto one line, which puts the call behind
      // `extensions: [` where the strip pattern cannot see it. The test then
      // fails on a perfectly removable feature, which is how a contributor
      // learns to stop believing the test.
      agentFeature({
        repository: dependencies.agentRepository,
        sessionRepository: dependencies.sessionRepository,
      }),
      questFeature({ repository: dependencies.questRepository }),
      progressionFeature({ repository: dependencies.progressionRepository }),
      reputationFeature({ repository: dependencies.reputationRepository }),
      socialFeature({ repository: dependencies.socialRepository }),
      bountyFeature({
        repository: dependencies.bountyRepository,
        payouts: dependencies.payoutIntentStore,
      }),
    ],
    store: dependencies.store,
    bus: dependencies.bus,
    ...(dependencies.log === undefined ? {} : { log: dependencies.log }),
  });
}

export { closeDatabasePool, createDatabase, createDatabasePool, DrizzleAgentRepository };
