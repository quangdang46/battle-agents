import {
  DEFAULT_ROLE,
  GUILD_ROLES,
  type CanTalkToDecision,
  type GuildRole,
  type GuildRoleOrGeneralist,
  type RoleSignal,
} from './domain.js';

/**
 * The guild rules, as pure functions.
 *
 * No clock, no storage, no event bus. What a role is, what coverage is worth,
 * what a tally counts and who may message whom are all functions of their
 * arguments, which is what makes each of them testable at a boundary instead of
 * only through a database.
 *
 * The four that carry the most weight are `classifyRole`, `synergyFor`,
 * `tallyStanding` and `canTalkToDecision`, and the first three share one
 * property: **money is not an input to any of them.** §10.4's no-pay-to-win
 * rule is not a tuning decision here, it is an argument about which arguments
 * these functions accept.
 */

/* ─────────────────────────────── roles ─────────────────────────────── */

/**
 * What a role is a projection over, and how much one occurrence is worth.
 *
 * ## Why the event types are written out rather than looked up
 *
 * The durable record of what an agent did is `event_log`, and an event only
 * reaches it if its type is in core's `PERSISTED_EVENT_TYPES` or in the
 * `persistedEvents` of an installed feature. A role read off a bus-only event is
 * a claim that cannot be re-derived: the evidence is gone, the role remains, and
 * nothing can audit it.
 *
 * That is not hypothetical here. The plan's wish-list for role signals was
 * `file.read`, `file.changed`, `search` and `thinking` for a Researcher — and
 * **none of those four is in the shipped persisted set and no feature declares
 * them.** A classifier that read `file.read` to spot a Researcher would be
 * reading a column that is not there, and it would look correct.
 *
 * So the table below states, for each role, the types this build can actually
 * lean on, and `tests/unit/guild-role-signal-durability.test.ts` asserts every
 * one of them against the real declarations of the real features. Adding a type
 * here is a deliberate act with a gate on it, which is the point.
 */
export interface RoleSignalRule {
  /**
   * The event types that are evidence, and what the role is worth per event.
   *
   * A list of [type, weight] rather than a type and one weight because the two
   * evidence kinds for a Tester are not the same claim: passing a test and
   * failing one are both evidence, and `test.passed` is the stronger of the two
   * because a suite that never fails was not testing anything.
   */
  readonly evidence: readonly (readonly [eventType: string, weight: number])[];
  /**
   * The event types this build would use if they were durable, and are not.
   *
   * Empty arrays are the honest state of three of the four roles, and listing
   * the type that WOULD work keeps the gap legible instead of leaving a reader
   * to wonder whether researcher was forgotten or is impossible. Nothing reads
   * this to award anything: `roleEvidence` consults `evidence` only, so a type
   * appearing here cannot become a signal by being added carelessly.
   */
  readonly wantedButNotDurable: readonly string[];
}

export const ROLE_SIGNALS: Readonly<Record<GuildRole, RoleSignalRule>> = {
  /**
   * A completed bounty is a statement about shipping: the issue was opened, the
   * change was made, the pull request was merged. It is the plan's own
   * definition of having practised coding, and progression prices it the highest
   * of anything it awards for the same reason.
   *
   * Durable while the bounty feature is installed, because bounty declares
   * `bounty.completed` in its `persistedEvents`. Guild cannot observe whether
   * bounty is installed, so it cannot promise durability — but it does not need
   * to: no bounty feature means no such event, and the role a member already
   * earned stays earned, because the evidence is in this table rather than in
   * the feature that observed it.
   */
  coder: {
    evidence: [['bounty.completed', 3]],
    wantedButNotDurable: [],
  },
  /**
   * A merged pull request is the moment somebody ELSE read the work and accepted
   * it, which is precisely what §10.2's Reviewer is: not the person who wrote
   * the code and not the person who ran the tests, but the one whose judgement
   * about someone else's work was borne out. progression makes the same call in
   * its own words, and prices the same event under `collaboration`.
   */
  reviewer: {
    evidence: [['pr.merged', 2]],
    wantedButNotDurable: [],
  },
  /**
   * Tests, both directions. `test.passed` outweighs `test.failed` because a
   * failed test is evidence that a suite EXISTS — which is rarer than it looks,
   * since an agent that runs no tests emits neither — while a passing one is
   * evidence the suite was satisfied.
   */
  tester: {
    evidence: [
      ['test.passed', 1],
      ['test.failed', 1],
    ],
    wantedButNotDurable: [],
  },
  /**
   * EMPTY, and the emptiness is the finding rather than a gap in the work.
   *
   * §10.4 asks for a Researcher role. The plan's own signal for one —
   * `file.read`, `search`, `thinking` — is not persisted by anything, so an
   * agent that read two hundred files has no durable record that it did, and a
   * guild that called it a Researcher would be asserting something the log
   * cannot support.
   *
   * The role stays in the vocabulary, `GUILD_ROLES` still contains it, and the
   * CHECK on the column still refuses a fifth value — so the day a feature
   * declares a durable research signal, this row is where it goes, and
   * `rolesEarningableToday()` is the test that has to change with it. Inventing
   * a bus-only signal to fill the row would be the exact failure the brief names
   * as its first shortcut, wearing the costume of finishing the work.
   */
  researcher: {
    evidence: [],
    wantedButNotDurable: ['file.read', 'file.changed', 'search', 'thinking'],
  },
};

/**
 * The evidence a role collects from one event, or undefined when the event is
 * not evidence of any role.
 *
 * An event can only be evidence of ONE role here, and the table is written so
 * that is a fact rather than an accident: no type appears twice. A `switch` over
 * a role would make the overlap a runtime outcome; a lookup keyed by event type
 * makes it a type error the moment somebody adds one twice.
 */
const BY_EVENT_TYPE: ReadonlyMap<string, { readonly role: GuildRole; readonly weight: number }> =
  new Map(
    GUILD_ROLES.flatMap((role) =>
      ROLE_SIGNALS[role].evidence.map(
        ([eventType, weight]) => [eventType, { role, weight }] as const,
      ),
    ),
  );

export function roleEvidence(
  eventType: string,
): { readonly role: GuildRole; readonly weight: number } | undefined {
  return BY_EVENT_TYPE.get(eventType);
}

/** Every event type this build will treat as behaviour. */
export function roleSignalEventTypes(): readonly string[] {
  return [...BY_EVENT_TYPE.keys()].sort();
}

/**
 * The roles a character can actually be right now.
 *
 * The plan asks for four and this build earns three. Rather than hide that in a
 * comment, it is a function with a test pinning its value, so a fourth durable
 * signal landing makes somebody say which role it trains — or say out loud that
 * it trains none, which is what `researcher` is today.
 */
export function rolesEarningableToday(): readonly GuildRole[] {
  return GUILD_ROLES.filter((role) => ROLE_SIGNALS[role].evidence.length > 0);
}

/**
 * The role a behaviour history adds up to.
 *
 * Generalist unless the evidence is one-sided, and for the same reason
 * `classifyBuild` in progression is: a tie is not a specialisation. Naming the
 * leader of a tie would be naming a role the agent did not earn, and it would
 * make the answer depend on the order two events arrived in, which is a visible
 * and unexplained bug rather than a tie-break.
 */
export function classifyRole(signals: readonly RoleSignal[]): GuildRoleOrGeneralist {
  const scores = new Map<GuildRole, number>(GUILD_ROLES.map((role) => [role, 0]));
  for (const signal of signals) {
    if (scores.has(signal.role)) {
      scores.set(signal.role, (scores.get(signal.role) ?? 0) + signal.weight);
    }
  }
  const best = Math.max(...scores.values());
  if (best === 0) {
    return DEFAULT_ROLE;
  }
  const leaders = GUILD_ROLES.filter((role) => scores.get(role) === best);
  return leaders.length === 1 ? (leaders[0] ?? DEFAULT_ROLE) : DEFAULT_ROLE;
}

/** A classification with its working, so a surprising role can be explained. */
export interface RoleClassification {
  readonly role: GuildRoleOrGeneralist;
  readonly scores: Readonly<Record<GuildRole, number>>;
  readonly considered: number;
}

export function explainRole(signals: readonly RoleSignal[]): RoleClassification {
  const scores = Object.fromEntries(
    GUILD_ROLES.map((role) => [
      role,
      signals.filter((signal) => signal.role === role).reduce((n, s) => n + s.weight, 0),
    ]),
  ) as Record<GuildRole, number>;
  return { role: classifyRole(signals), scores, considered: signals.length };
}

/* ───────────────────────────── coverage ───────────────────────────── */

/**
 * What a set of roles is worth together.
 *
 * §10.2's TFT half, and the clause that matters is "role COVERAGE over raw
 * stacking": three Coders is not three times a Coder, it is one Coder who
 * happens to have brought two friends. So the key is a SET of distinct roles and
 * the size of a team never enters the calculation.
 */
export interface Synergy {
  readonly name: string;
  /** The distinct roles that trigger it. A set, checked as a set. */
  readonly requires: readonly GuildRole[];
  /** Percent, whole. Applied to standing, never to money. */
  readonly bonusPercent: number;
}

/**
 * The synergies, keyed by the exact set of roles that triggers them.
 *
 * `PLAN_CODER_TESTER_REVIEWER` is §10.2's own example — "Coder+Tester+Reviewer
 * -> +10% validation" — spelled out with the word "validation" read as
 * standing, because a percentage of MONEY is the pay-to-win this feature is
 * built to make unreachable. A synergy that multiplied a payout would be a
 * guild winning by being rich, wearing the vocabulary of a bonus.
 */
export const PLAN_CODER_TESTER_REVIEWER = 'coder-tester-reviewer';

export const SYNERGIES: readonly Synergy[] = [
  {
    name: PLAN_CODER_TESTER_REVIEWER,
    requires: ['coder', 'tester', 'reviewer'],
    bonusPercent: 10,
  },
];

/**
 * The largest bonus any coverage can earn.
 *
 * A cap, and not a tuning detail: the table is data somebody will add to, and
 * without a ceiling a guild could double its standing by splitting one agent
 * into nine. Five percent of coverage plus a flat ten for the full kit is the
 * shape this takes — bounded, and bounded by a constant a test can read.
 */
export const MAX_COVERAGE_BONUS_PERCENT = 5;

/** The distinct roles a roster covers. A set, so a name is not a multiplier. */
export function coverageOf(roles: readonly GuildRoleOrGeneralist[]): readonly GuildRole[] {
  const seen = new Set<GuildRole>();
  for (const role of roles) {
    if (role !== DEFAULT_ROLE && (GUILD_ROLES as readonly string[]).includes(role)) {
      seen.add(role as GuildRole);
    }
  }
  return GUILD_ROLES.filter((role) => seen.has(role));
}

/** Every synergy the roster's coverage triggers, best first. */
export function synergiesFor(roles: readonly GuildRoleOrGeneralist[]): readonly Synergy[] {
  const covered = new Set(coverageOf(roles));
  return SYNERGIES.filter((synergy) => synergy.requires.every((role) => covered.has(role)));
}

/**
 * The whole standing multiplier for a roster: a flat bonus for breadth, plus
 * every triggered synergy.
 *
 * Breadth pays because §10.2 says coverage is the point, and a roster that
 * covers four roles has done something a roster of four Coders has not. It pays
 * at `MAX_COVERAGE_BONUS_PERCENT` per role, so the breadth half is bounded by a
 * constant rather than by the size of the team.
 */
export function synergyFor(roles: readonly GuildRoleOrGeneralist[]): number {
  const breadth = coverageOf(roles).length * MAX_COVERAGE_BONUS_PERCENT;
  return breadth + synergiesFor(roles).reduce((total, synergy) => total + synergy.bonusPercent, 0);
}

/* ───────────────────────────── the tally ───────────────────────────── */

/**
 * What a weekly tally is computed from.
 *
 * A work count and a role list, and nothing else. There is no cents field, and
 * its absence is the no-pay-to-win rule expressed as a type: a guild cannot
 * convert money into standing because the function that produces standing has
 * nowhere to read money from. `test('cannot be bought')` in rules.test.ts
 * proves it by passing the largest numbers money allows and checking the answer
 * does not move.
 */
export interface TallyInput {
  readonly guildId: string;
  readonly guildName: string;
  /** Completed work inside the window. Counted, never weighted. */
  readonly completedWork: number;
  /** Each member's behaviour-derived role. */
  readonly memberRoles: readonly GuildRoleOrGeneralist[];
}

/** One guild's line in a tally. */
export interface TallyRow {
  readonly guildId: string;
  readonly guildName: string;
  readonly rank: number;
  readonly completedWork: number;
  readonly coverage: readonly GuildRole[];
  readonly synergies: readonly string[];
  /** `completedWork`, multiplied by coverage and synergies. Never by money. */
  readonly standing: number;
}

/**
 * The multiplier as a percentage, so the arithmetic a reader can redo by hand
 * is the arithmetic that ran. Rounded DOWN on the product rather than to
 * nearest, because the rounding belongs to the reader's side: two guilds with
 * the same inputs must produce the same integer, and a banker's-rounding helper
 * would be a decision nobody asked for.
 */
export function standingPercent(roles: readonly GuildRoleOrGeneralist[]): number {
  return 100 + synergyFor(roles);
}

export function tallyStanding(input: TallyInput): number {
  const boosted = Math.floor((input.completedWork * standingPercent(input.memberRoles)) / 100);
  return Math.max(0, boosted);
}

/**
 * A board, ordered and numbered.
 *
 * Highest standing first, then completed work — so two guilds level on
 * coverage are separated by the work that earned it, which is the tie-break
 * that cannot be bought — then name, then id. The last two make the order total,
 * and a board that reshuffles between two identical calls is one nobody
 * believes.
 */
export function rankTallies(inputs: readonly TallyInput[]): readonly TallyRow[] {
  const scored = inputs.map((input) => {
    const coverage = coverageOf(input.memberRoles);
    return {
      input,
      coverage,
      synergies: synergiesFor(input.memberRoles).map((synergy) => synergy.name),
      standing: tallyStanding(input),
    };
  });

  return scored
    .sort((left, right) => {
      if (right.standing !== left.standing) return right.standing - left.standing;
      if (right.input.completedWork !== left.input.completedWork) {
        return right.input.completedWork - left.input.completedWork;
      }
      const byName = left.input.guildName.localeCompare(right.input.guildName);
      return byName !== 0 ? byName : left.input.guildId.localeCompare(right.input.guildId);
    })
    .map((entry, index) => ({
      guildId: entry.input.guildId,
      guildName: entry.input.guildName,
      rank: index + 1,
      completedWork: entry.input.completedWork,
      coverage: entry.coverage,
      synergies: entry.synergies,
      standing: entry.standing,
    }));
}

/* ─────────────────────────────── the ACL ───────────────────────────── */

/**
 * The two shapes a messaging question can take, and the rule for each.
 *
 * The whole point of this feature answering at all is that the alternative —
 * an absent ACL treated as an open channel — is the mistake the social feature's
 * own comment refuses by name. So:
 *
 *   a DIRECT message is allowed between two agents who share a guild
 *   a BROADCAST is allowed to a guild the sender belongs to
 *
 * The first is the can_talk_to pattern from §1.1: membership is the declared
 * relationship, and there is no channel for two agents who share nothing. The
 * second is one level looser and deliberately so — a guild broadcast is a
 * message TO the guild, so the only question is whether the sender is one of
 * them.
 *
 * ## What this does NOT decide, stated because a capability name is a claim
 *
 * `RuntimeContext` carries no principal and `ActionDef.permissions` is
 * documented in core as a declaration nothing enforces, so a `fromAgentId`
 * arriving here is a CLAIM. This function authorises two claimed agent ids'
 * relationship to each other. That is strictly narrower than "the ACL decides
 * who may DM whom" and strictly weaker than it: it constrains the graph of
 * permitted conversations, and it does not establish that either endpoint is
 * who it says it is. Closing that needs a transport that passes an
 * authenticated principal to the Application API, which is a frozen-contract
 * question and not this feature's to answer.
 *
 * Note the second thing it is not: being permitted to write to an agent is not
 * being trusted. A guild member allowed to message you can still carry a
 * prompt injection. The ACL says WHO; it says nothing about WHAT, and
 * membership in a guild must never widen what a message body is allowed to do.
 */
export function canTalkToDecision(
  query: {
    readonly fromAgentId: string;
    readonly toAgentId: string | null;
    readonly guildId: string | null;
  },
  membership: {
    /** Every guild the sender belongs to. */
    readonly senderGuilds: readonly string[];
    /** A lookup for a recipient's guilds. Absent for a broadcast. */
    readonly guildsOf?: (agentId: string) => readonly string[];
  },
): CanTalkToDecision {
  if (query.toAgentId === null && query.guildId === null) {
    return {
      allowed: false,
      reason: 'the question names neither a recipient agent nor a guild',
    };
  }
  if (query.toAgentId !== null && query.guildId !== null) {
    return {
      allowed: false,
      reason: 'a question is either direct or a guild broadcast, not both',
    };
  }

  const senderGuilds = new Set(membership.senderGuilds);

  if (query.guildId !== null) {
    if (!senderGuilds.has(query.guildId)) {
      return {
        allowed: false,
        reason: `agent ${query.fromAgentId} is not a member of guild ${query.guildId}`,
      };
    }
    return {
      allowed: true,
      reason: 'the sender is a member of the guild the message is addressed to',
    };
  }

  const recipient = query.toAgentId;
  if (recipient === null) {
    return { allowed: false, reason: 'the question names no recipient' };
  }
  if (membership.guildsOf === undefined) {
    return {
      allowed: false,
      reason: 'a direct message needs the recipient’s guilds, and none were supplied',
    };
  }
  const shared = membership.guildsOf(recipient).filter((guildId) => senderGuilds.has(guildId));
  if (shared.length === 0) {
    return {
      allowed: false,
      reason:
        `agent ${query.fromAgentId} and agent ${recipient} share no guild, and the only ` +
        'relationship this ACL knows is guild membership',
    };
  }
  return {
    allowed: true,
    reason: `both agents are members of guild ${shared[0] as string}`,
  };
}
