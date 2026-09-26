/**
 * `@battle-agents/guild` — teams, a collective treasury, and quests over shared
 * work. M6.
 *
 * Three things this feature is for, and one it will not do.
 *
 * **Teams.** Members, and a roster read that also says what each member has
 * actually been doing. §10.2 forbids a class from a model name, so there is no
 * role column, no action that sets one, and no way to declare yourself a Tester.
 * A role is a projection over persisted behaviour, and `rules.ts` holds the
 * entire table it is projected from.
 *
 * **Treasury.** Members put money in collectively and earmark it for bounties.
 * The balance is a sum over the rows, not a column — the same arrangement
 * `bounty_funding_totals` uses, and `db:verify` fails the build if a balance
 * column is ever added beside them. Nothing here is escrowed and the reply says
 * so on every write and every read, because a number called a balance is exactly
 * the thing a reader will assume means money this platform is holding.
 *
 * **Quests.** "Fix 10 issues in project X", counted from the work ledger rather
 * than read off a counter, plus a weekly board of guilds ranked by completed
 * work with role coverage applied.
 *
 * **What it will not do.** §10.4 says no pay-to-win, and that is a shape rather
 * than a promise: the function that produces a guild's standing takes a work
 * count and a set of roles, and there is no cents parameter anywhere in it to
 * fill. A treasury can be enormous and buy nothing on that board.
 *
 * It also provides the `guild.messaging.authorize` capability that
 * `features/social` has been requiring, so social's messaging stops degrading.
 * That capability is an authorization ANSWER and is deliberately not reachable
 * through `act()` — see `manifest.ts`, which argues the point at length.
 */
export { guildFeature, assertGuildRole } from './feature.js';
export {
  GUILD_CREATE,
  GUILD_JOIN,
  GUILD_LEAVE,
  GUILD_QUEST_CREATE,
  GUILD_READ_MEMBERS,
  GUILD_READ_QUESTS,
  GUILD_READ_ROLES,
  GUILD_READ_TREASURY,
  GUILD_TALLY,
  GUILD_TREASURY_CONTRIBUTE,
  GUILD_TREASURY_FUND,
} from './feature.js';
export { GUILD_ACTION_IDS, type GuildActionId, type GuildActionTypes } from './manifest.js';
export type { GuildRepository } from './repository.js';
export {
  DEFAULT_ROLE,
  GUILD_MESSAGING_AUTHORIZE,
  GUILD_PERSISTED_EVENTS,
  GUILD_ROLES,
  NO_MONEY_IS_HELD_HERE,
  TREASURY_KINDS,
  type CanTalkToDecision,
  type CanTalkToQuery,
  type Guild,
  type GuildMembership,
  type GuildQuest,
  type GuildRole,
  type GuildRoleOrGeneralist,
  type RoleSignal,
  type TreasuryBalance,
  type TreasuryEntry,
  type TreasuryKind,
  type WorkRecord,
} from './domain.js';
export {
  canTalkToDecision,
  classifyRole,
  coverageOf,
  explainRole,
  MAX_COVERAGE_BONUS_PERCENT,
  PLAN_CODER_TESTER_REVIEWER,
  rankTallies,
  ROLE_SIGNALS,
  roleEvidence,
  roleSignalEventTypes,
  rolesEarningableToday,
  standingPercent,
  SYNERGIES,
  synergiesFor,
  tallyStanding,
  type RoleClassification,
  type Synergy,
  type TallyInput,
  type TallyRow,
} from './rules.js';
