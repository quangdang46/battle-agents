import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  ACHIEVEMENT_AWARDED,
  achievementsInputRejected,
  ACHIEVEMENTS_LIST_SHAPE,
  ACHIEVEMENTS_PROJECT_SHAPE,
  isAchievementsListInput,
  isAchievementsProjectInput,
  recordedRowOf,
  viewBadge,
  whyAchievementsListIsRejected,
  whyAchievementsProjectIsRejected,
  type AchievementAwardedPayload,
  type AchievementsView,
} from './domain.js';
import type { AchievementsRepository } from './repository.js';
import {
  ACHIEVEMENT_EVENT_TYPES,
  ACHIEVEMENT_RULES,
  earnedBy,
  parseCode,
  rulesForTrigger,
  type AchievementCode,
  type AchievementRule,
  type RecordedRow,
} from './rules.js';

export const ACHIEVEMENTS_READ = 'achievements.read';
export const ACHIEVEMENTS_CATALOGUE = 'achievements.catalogue';
export const ACHIEVEMENTS_LIST = 'achievements.list';
export const ACHIEVEMENTS_PROJECT = 'achievements.project';

/** What one rule looks like to a client rendering the catalogue. */
export interface AchievementCatalogueEntry {
  readonly code: AchievementCode;
  readonly slug: string;
  readonly version: number;
  readonly title: string;
  readonly detail: string;
  /** The recorded event whose arrival can complete this rule. */
  readonly trigger: string;
  /**
   * The recorded event the rule counts, which is not always the one that
   * triggers it: `critical-hit` is completed by a pass and proved by failures.
   */
  readonly evidence: { readonly eventType: string; readonly times: number; readonly within: string };
}

export function achievementsFeature(dependencies: {
  readonly repository: AchievementsRepository;
}): GameFeature {
  const { repository } = dependencies;

  /**
   * One handler per rule trigger, built from the same table the rules come from.
   *
   * Registering them from the catalogue rather than writing them out is what
   * keeps the two in step: a rule nobody listens to cannot be earned, and a
   * listener for a rule that cannot be earned is dead code. A fourth badge
   * added to `ACHIEVEMENT_RULES` subscribes itself, and a trigger two rules
   * share gets one handler rather than two fighting over the same event.
   */
  const handlers: EventHandler[] = [
    ...new Set(ACHIEVEMENT_RULES.map((rule) => rule.trigger)),
  ].map((eventType) => ({
    on: eventType,
    async handle(event: GameEvent, context: RuntimeContext): Promise<void> {
      const row = recordedRowOf(event);
      const agentId = agentIdOf(row);
      if (agentId === undefined) {
        // An event nobody can place. The log keeps it and every other feature
        // keeps reacting to it; this one says so rather than awarding to nobody,
        // and rather than reading `actorId` as an agent when the emitter set it
        // to a feature's own name on purpose.
        context.log?.warn(
          `[achievements] ignored a ${eventType} naming no agent, so there is no character to award`,
        );
        return;
      }
      await derive(repository, agentId, context, [row]);
    },
  }));

  return {
    id: 'achievements',
    // The only event type declared here, and it is this feature's own: nothing
    // else emits `achievement.awarded`, and the registry allows exactly one
    // owner per persisted type, so a second declaration is a refusal to install.
    // The rules read OTHER features' events, and reacting to an event is not
    // owning it — bounty widening the filter for `bounty.completed` is what
    // makes the first badge derivable at all, and a declaration here would be a
    // claim about somebody else's event and would make bounty fail to install
    // on the day it declares it.
    persistedEvents: [ACHIEVEMENT_AWARDED],
    eventHandlers: handlers,
    capabilities: [
      { name: ACHIEVEMENTS_READ, description: "Read one character's badges." },
      {
        name: ACHIEVEMENTS_CATALOGUE,
        description: 'List every badge and the recorded outcome that earns it.',
      },
    ],
    actionDefs: [
      // Every `run` that reads a payload takes `unknown` and is guarded. The
      // annotation they used to carry was never checked: `act()` hands the
      // payload through as a generic, so `act('achievements.list', {})`
      // compiled clean and queried `agentId = undefined`.
      // `achievements.catalogue` is the one action with no payload, and it has
      // nothing to guard.
      defineAction({
        id: ACHIEVEMENTS_LIST,
        permissions: [ACHIEVEMENTS_READ],
        run: async (input: unknown) => {
          if (!isAchievementsListInput(input)) {
            throw achievementsInputRejected(
              ACHIEVEMENTS_LIST,
              whyAchievementsListIsRejected(input) ?? { reason: 'not-an-object' },
              ACHIEVEMENTS_LIST_SHAPE,
            );
          }
          return sheet(repository, input.agentId);
        },
      }),
      defineAction({
        id: ACHIEVEMENTS_PROJECT,
        permissions: [ACHIEVEMENTS_CATALOGUE],
        run: async (input: unknown, context) => {
          if (!isAchievementsProjectInput(input)) {
            throw achievementsInputRejected(
              ACHIEVEMENTS_PROJECT,
              whyAchievementsProjectIsRejected(input) ?? { reason: 'not-an-object' },
              ACHIEVEMENTS_PROJECT_SHAPE,
            );
          }
          const agentId = input.agentId;
          const history = await repository.history(agentId, ACHIEVEMENT_EVENT_TYPES);
          // Replayed in the log's own order rather than evaluated as a set, and
          // that is the only way `critical-hit` can mean what it says: its
          // evidence is five failures in a run followed by a pass, and a set has
          // no order. Evaluating it against every recorded pass at once would
          // award the badge for a pass that happened BEFORE the fifth failure,
          // which is the difference between recovering and getting lucky.
          const rows = [...history].sort((left, right) => left.sequence - right.sequence);
          await derive(repository, agentId, context, rows);
          return sheet(repository, agentId);
        },
      }),
      defineAction({
        id: ACHIEVEMENTS_CATALOGUE,
        permissions: [ACHIEVEMENTS_CATALOGUE],
        run: async () => catalogue(),
      }),
    ],
  };
}

/**
 * The one path a badge is ever granted on, live or by backfill.
 *
 * `rows` are recorded outcomes to replay, oldest first, and the live handler
 * passes exactly one of them: the event that just arrived, which the runtime
 * persisted before it dispatched here. So a live award and a re-derivation are
 * the same evaluation over the same rows, which is the only reason a backfill
 * can be trusted to agree with what already happened — two code paths that
 * happen to agree today is a promise, and one function is not.
 *
 * `agentId` is a parameter rather than read off `rows` because a backfill's
 * rows are read by agent in the first place, and a live event that names no
 * agent has to be refused before any of this runs.
 */
async function derive(
  repository: AchievementsRepository,
  agentId: string | undefined,
  context: RuntimeContext,
  rows: readonly RecordedRow[],
): Promise<void> {
  if (agentId === undefined || rows.length === 0) {
    return;
  }
  const held = new Set((await repository.list(agentId)).map((awarded) => awarded.code));
  const outstanding = ACHIEVEMENT_RULES.filter((rule) => !held.has(rule.code));
  if (outstanding.length === 0) {
    // Nothing to earn, so nothing to read. Worth the early exit: this is the
    // case for almost every event an established agent's work produces, and the
    // log read behind it is the expensive half.
    return;
  }

  const history = await repository.history(agentId, [
    ...new Set(outstanding.map((rule) => rule.evidence.eventType)),
  ]);
  for (const row of rows) {
    for (const rule of rulesForTrigger(row.type)) {
      if (held.has(rule.code)) continue;
      if (!earnedBy(rule, row, history)) continue;
      // The unique key is the authority on who was first. Losing that race is
      // not a failure: it is the guard doing its job, and the bus delivering
      // twice or a backfill re-deriving a rule are the two ways it gets taken.
      if (!(await repository.award(agentId, rule.code, context.now()))) {
        continue;
      }
      held.add(rule.code);
      // `emit`, not `bus.publish`, for the reason progression's level-up gives:
      // the event is in this feature's `persistedEvents`, and only `emit`
      // appends to the state store before publishing. Re-entering the dispatcher
      // is not a risk here — nothing handles `achievement.awarded`, including
      // this feature, whose rules are all triggered by the other names.
      await context.runtime.emit({
        type: ACHIEVEMENT_AWARDED,
        occurredAt: context.now(),
        actorId: agentId,
        payload: awardPayload(agentId, rule, row, context.now()) satisfies AchievementAwardedPayload,
      });
    }
  }
}

/** The character sheet's line for badges, answering for a character with none. */
async function sheet(
  repository: AchievementsRepository,
  agentId: string,
): Promise<AchievementsView> {
  const badges = (await repository.list(agentId)).map(viewBadge);
  return { agentId, badges, count: badges.length, exists: badges.length > 0 };
}

function catalogue(): readonly AchievementCatalogueEntry[] {
  return ACHIEVEMENT_RULES.map((rule) => ({
    code: rule.code,
    // The slug and version are read back OUT of the code rather than held beside
    // it, so the two cannot be written disagreeing. parseCode is the same
    // function describeCode uses to render a badge a caller already holds.
    slug: parseCode(rule.code)?.slug ?? rule.code,
    version: parseCode(rule.code)?.version ?? 1,
    title: rule.title,
    detail: rule.detail,
    trigger: rule.trigger,
    evidence: { ...rule.evidence },
  }));
}

function awardPayload(
  agentId: string,
  rule: AchievementRule,
  row: RecordedRow,
  now: string,
): AchievementAwardedPayload {
  return {
    agentId,
    code: rule.code,
    awardedAt: now,
    // The recorded instant, never `now`. A backfill run today grants a badge for
    // work from months ago, and an event reporting only the grant time would put
    // that badge at a moment in a session's trail when the agent was doing
    // something else entirely.
    evidenceAt: row.occurredAt,
    evidenceType: row.type,
  };
}

/**
 * Which character a recorded outcome is about.
 *
 * Two shapes reach this feature and the log stores them two ways. A game's own
 * event names the agent in its payload and sets `actorId` to the feature that
 * emitted it — `bounty.completed` arrives with `actorId: 'bounty'`, because the
 * identity argument in features/bounty/src/merge.ts is that a GitHub login is a
 * person and not an agent. An adapter's event has no agent in the payload at all
 * and carries the character in `actorId`, because the session resolved the agent
 * and that is the only field the ingest route fills.
 *
 * The payload wins when it names one. That is not a preference — the two shapes
 * never both name an agent, so there is nothing to prefer between — and the
 * repository's own query makes the same choice, because a rule that counted rows
 * the handler could not see would be a badge awarded on a fraction of the
 * evidence. Both sides state the rule in the same words and the integration test
 * proves the two agree against a real database.
 *
 * The consequence worth stating rather than hiding: a platform event that named
 * no agent at all is attempted against its actor, which is a feature's own
 * name. No feature emits such an event, and the case cannot be closed here —
 * `award` is the authority on whether a badge was granted, and the column is a
 * foreign key to `agents`, so the insert is refused by the database rather than
 * recorded against a string. The refusal belongs there rather than in a guess
 * about which strings are agent ids.
 */
function agentIdOf(row: RecordedRow): string | undefined {
  const named = row.payload['agentId'];
  if (typeof named === 'string' && named.length > 0) {
    return named;
  }
  return typeof row.actorId === 'string' && row.actorId.length > 0 ? row.actorId : undefined;
}
