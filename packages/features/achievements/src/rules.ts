import { BOUNTY_EVENTS } from '@battle-agents/protocol';

/**
 * The achievement catalogue, as data.
 *
 * Everything tunable lives here rather than inside a handler, because the set
 * will be wrong and tuning it should not mean reading a reducer. Nothing here
 * does I/O, which is what makes the load-bearing claim testable: that a badge
 * is a PREDICATE over recorded outcomes rather than a counter somebody
 * remembers to bump.
 *
 * There is no points value, no rarity and no tier anywhere in this file. Plan
 * section 10.2 puts Achievements on the MVP character sheet as a line of
 * badges, and section 17.8 risk 8 bans an achievement economy in the MVP; a
 * badge with a score attached is the first step towards a currency, and a
 * currency is a second progression system with a leaderboard nobody understands.
 */

/* ───────────────────────────── codes ───────────────────────────── */

/**
 * A field the payload must carry before a row counts, in the same shape
 * progression's price table uses.
 *
 * A field name and one value, not a predicate: `achievements.catalogue` hands
 * these rows to a client verbatim, and a function would cross the wire as a
 * value nothing can call.
 */
export interface AchievementCondition {
  readonly field: string;
  readonly equals: string | number | boolean;
}

/**
 * What an agent's recorded outcomes have to look like.
 *
 * The count is over rows the LOG already holds, including the row whose arrival
 * is being handled. That is not a convenience: the runtime persists before it
 * dispatches to handlers, so by the time this runs the event is a durable
 * record and the count is a fact about the log rather than about the handler.
 * It is also why the same evaluator can be handed a replayed row, which is what
 * makes a backfill and a live award the same code rather than two that agree
 * today.
 */
export interface AchievementEvidence {
  /** The recorded event type that has to have happened. */
  readonly eventType: string;
  /** How many times, within the scope below. */
  readonly times: number;
  /**
   * `agent` counts a lifetime; `session` counts one run.
   *
   * Session scope is why this feature reads the log and nothing else. Which
   * failures belonged to the same run is a property of the trail — the store
   * lifts `sessionId` out of the payload into its own column precisely so a
   * query can group on it — and there is no feature table that could answer it.
   * A failure with no session cannot be placed in a run, so it counts for
   * nothing: attributing it to whichever run happened to be current would award
   * a badge on a guess.
   */
  readonly within: 'agent' | 'session';
}

/** The codes above, as a union, so a typo is a compile error rather than a row. */
export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

export const ACHIEVEMENT_CODES = [
  'first-bounty.v1',
  'survived-a-crash.v1',
  'critical-hit.v1',
] as const;

/**
 * The codes are spelled twice, and a test asserts the two agree.
 *
 * `ACHIEVEMENT_RULES` is a value so it can be indexed by code, and
 * `ACHIEVEMENT_CODES` is a tuple so `AchievementCode` is a union rather than
 * `string`. One of them has to give up the thing it wants, and a table that
 * grows a code without the tuple is a code no caller can name in a type — which
 * is the failure the derived types exist to prevent everywhere else in this
 * repository.
 */
export function isAchievementCode(value: string): value is AchievementCode {
  return (ACHIEVEMENT_CODES as readonly string[]).includes(value);
}

/** One badge, described once. */
export interface AchievementRule {
  readonly code: AchievementCode;
  /**
   * The recorded event whose arrival can complete this rule, and the only
   * event the feature subscribes to on this rule's behalf.
   */
  readonly trigger: string;
  /** Applied to the triggering payload AND to every row the count looks at. */
  readonly requires?: AchievementCondition;
  readonly evidence: AchievementEvidence;
  readonly title: string;
  readonly detail: string;
}

/**
 * The badges the MVP sheet implies, and nothing past it.
 *
 * Two of the three are FAILURE achievements, which is the plan's own ratio and
 * not an editorial choice. Section 10.2's death rule says HP 0 never kills the
 * character, only the session fails, and then says "Failure achievements
 * included" in the same breath — an achievements system that only rewards
 * success contradicts the design it is part of, because it says the failures
 * that make a character worth reading about are not accomplishments at all.
 *
 * The three, and where each comes from:
 *
 *   first-bounty        section 12.2 names it, and it is the one everybody
 *                       already expects to exist.
 *   survived-a-crash    section 10.2's death rule, made recordable. A session
 *                       that crashed and a character that is still here is the
 *                       rule's whole content.
 *   critical-hit        section 10.3's "5 fails -> damage; fix-own-bug ->
 *                       critical hit", which is the same fact said the other
 *                       way round: the plan counts the failures as damage and
 *                       the fix as the hit, so both halves of the rule are here.
 */
export const ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  {
    code: 'first-bounty.v1',
    trigger: BOUNTY_EVENTS.completed,
    evidence: { eventType: BOUNTY_EVENTS.completed, times: 1, within: 'agent' },
    title: 'First Bounty',
    detail: 'Completed a bounty. The whole job: the issue was opened, the work was done, it shipped.',
  },
  {
    code: 'survived-a-crash.v1',
    trigger: 'session.ended',
    // Fail-closed, and it has to be. `session.ended` is the one durable event
    // that carries a reason, and a session that was completed or abandoned is
    // the opposite of this badge; a payload that says neither is not evidence
    // of a crash and is not treated as one.
    requires: { field: 'reason', equals: 'crashed' },
    evidence: { eventType: 'session.ended', times: 1, within: 'agent' },
    title: 'Survived a Crash',
    detail:
      'A run ended in a crash and the character is still here. HP 0 fails the session, never the agent.',
  },
  {
    code: 'critical-hit.v1',
    trigger: 'test.passed',
    evidence: { eventType: 'test.failed', times: 5, within: 'session' },
    title: 'Critical Hit',
    detail: 'Five failing tests in one run, then a green one. The damage was real and so was the fix.',
  },
];

/** The catalogue by code, so a read can render a badge it was handed. */
export const RULES_BY_CODE: Readonly<Record<AchievementCode, AchievementRule>> = Object.freeze(
  Object.fromEntries(ACHIEVEMENT_RULES.map((rule) => [rule.code, rule])) as Record<
    AchievementCode,
    AchievementRule
  >,
);

/* ───────────────────────── codes are versioned ───────────────── */

/**
 * A code is `<slug>.v<major>`, and the version is load-bearing.
 *
 * The bead asks for stable, versioned strings so that a renamed achievement
 * does not orphan historical rows, and the mechanism has to be a real one
 * rather than a convention. Two things follow from the version being part of
 * the code rather than a column beside it:
 *
 *   - a rule whose MEANING changes takes a new code (`first-bounty.v2`), and
 *     the old rows keep saying v1, which is the only way an old award can still
 *     be rendered as the thing it was;
 *   - a rule that is merely REWORDED keeps its code, so a copy change costs no
 *     history at all.
 *
 * The title and detail are therefore never stored on a row, only in this file.
 * Storing them is the failure the bead names: a mutable name in the row, and a
 * rename orphans every award that used to carry the old one.
 */
const CODE_PATTERN = /^(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\.v(?<version>[1-9][0-9]*)$/;

export interface ParsedCode {
  /** The unversioned name, stable across wording changes. */
  readonly slug: string;
  /** The major version, 1 for everything in the MVP. */
  readonly version: number;
}

/** A code's slug and version, or undefined when it is not one of ours. */
export function parseCode(code: string): ParsedCode | undefined {
  const match = CODE_PATTERN.exec(code);
  if (match?.groups === undefined) return undefined;
  const { slug, version } = match.groups as { slug?: string; version?: string };
  if (slug === undefined || version === undefined) return undefined;
  return { slug, version: Number(version) };
}

/** The version a code claims, whether or not this build knows the achievement. */
export function versionOf(code: string): number | null {
  return parseCode(code)?.version ?? null;
}

/**
 * What a code means, looked up now rather than read from the row.
 *
 * A code this build has never heard of still renders: the badge is real, it was
 * awarded by a build that knew what it meant, and refusing to show it would
 * make a character sheet lose a badge because the code moved on. The title
 * comes back null in that case, which is a different thing from the badge not
 * being there.
 */
export function describeCode(code: string): {
  readonly code: string;
  readonly slug: string | null;
  readonly version: number | null;
  readonly title: string | null;
  readonly detail: string | null;
} {
  const rule = isAchievementCode(code) ? RULES_BY_CODE[code] : undefined;
  const parsed = parseCode(code);
  return {
    code,
    slug: parsed?.slug ?? null,
    version: parsed?.version ?? null,
    title: rule?.title ?? null,
    detail: rule?.detail ?? null,
  };
}

/* ───────────────────────── what has to be durable ───────────────── */

/**
 * The recorded events this feature's rules read.
 *
 * Every one of them has to reach `event_log`, and the platform's filter decides
 * that: five types are always recorded and a feature widens the set by declaring
 * `persistedEvents`. This list is the statement of what has to have been
 * widened, written down here next to the rules that need it rather than left to
 * whoever reads the catalogue.
 *
 * It is NOT a declaration, and the difference is load-bearing. This feature
 * cannot own `bounty.completed` — the bounty feature emits it, and the registry
 * throws on a second owner — so the widening that makes the first badge
 * possible is bounty's line, not this one. What this feature can do is refuse to
 * pretend: a rule whose evidence the log does not hold is simply never met, and
 * the feature says so rather than reporting a character who has earned nothing
 * because nothing was ever recorded. That refusal is the test in
 * feature.test.ts, and it is the honest shape of the dependency.
 */
export const ACHIEVEMENT_EVENT_TYPES: readonly string[] = [
  ...new Set(
    ACHIEVEMENT_RULES.flatMap((rule) => [rule.trigger, rule.evidence.eventType]),
  ),
];

/** The rules a given recorded event type can complete. */
export function rulesForTrigger(eventType: string): readonly AchievementRule[] {
  return ACHIEVEMENT_RULES.filter((rule) => rule.trigger === eventType);
}

/**
 * Whether a rule is met by the history the log holds.
 *
 * Pure, and the only place a badge is decided. Everything about it is a
 * function of recorded rows: no stored counter, no state carried between calls,
 * and therefore a backfill over the same rows reaches the same answer as the
 * live handler did.
 *
 * The count is bounded by the trigger, and both halves of that matter:
 *
 *   INCLUDING it, because the runtime persists before it dispatches. By the time
 *   a handler runs, its own event is already a durable row, so `first-bounty`
 *   sees the one completion that just happened rather than zero of them.
 *   Counting only what came before would make a backfill disagree with a live
 *   award by exactly one, and a replay of an established agent would earn
 *   nothing at all.
 *
 *   STOPPING at it, because that is the instant the question was asked. A pass
 *   that arrived BEFORE the fifth failure is not a recovery, and evaluating it
 *   against rows that had not happened yet awards the badge for a lucky
 *   sequence. This is what makes `earnedBy` safe to call for every row in a
 *   replay rather than only for the last one.
 */
export function earnedBy(
  rule: AchievementRule,
  trigger: RecordedRow,
  history: readonly RecordedRow[],
): boolean {
  if (!holds(trigger.payload, rule.requires)) {
    return false;
  }
  const { eventType, times, within } = rule.evidence;
  let counted = 0;
  for (const row of history) {
    if (row.sequence > trigger.sequence) continue;
    if (row.type !== eventType) continue;
    if (!holds(row.payload, rule.requires)) continue;
    if (within === 'session') {
      const sessionId = trigger.sessionId;
      // A trigger with no session cannot be placed in a run, so neither can the
      // evidence it would need. Returning false is the answer that does not
      // award a badge on a guess about which run this was.
      if (sessionId === null || row.sessionId !== sessionId) continue;
    }
    counted += 1;
  }
  return counted >= times;
}

/**
 * A field the payload must carry, checked fail-closed.
 *
 * A condition naming a field the payload does not have is not satisfied. That is
 * the same default the rest of this repository uses for money and for merges:
 * silence is not permission, and an event that never said which case it is
 * should not have one inferred for it.
 */
function holds(payload: Readonly<Record<string, unknown>>, condition: AchievementCondition | undefined): boolean {
  if (condition === undefined) {
    return true;
  }
  return payload[condition.field] === condition.equals;
}

/**
 * One row of the agent's recorded history, in the shape this feature reads.
 *
 * `sessionId` is here because session-scoped evidence needs it, and it is a
 * column of its own in the log rather than something to dig out of the payload.
 * `actorId` is here because that is where an adapter event keeps its character.
 * `sequence` is the log's own ordering and is what makes a replay reproducible:
 * timestamps are what a reader sees, and two events in the same millisecond have
 * no order between them.
 */
export interface RecordedRow {
  readonly sequence: number;
  readonly type: string;
  readonly sessionId: string | null;
  readonly actorId: string | null;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * The sequence an in-flight event is given.
 *
 * It is the newest thing in the log, because the runtime persisted it a moment
 * ago and nothing has been appended since — which is the position `earnedBy`
 * needs, since it counts the rows at or before the trigger. Zero would be the
 * oldest, and would quietly turn every live award into a question about an
 * empty history.
 */
export const IN_FLIGHT_SEQUENCE = Number.MAX_SAFE_INTEGER;
