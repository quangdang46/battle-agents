/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, because a type is erased and the
 * codegen step that unions every feature's ids could not read it. Deriving the
 * type from the value is what keeps the two from disagreeing.
 *
 * NOT the commands and NOT the event names. An id here is what `act()` accepts,
 * and anything dispatched rather than acted on has no action id.
 *
 * ## `guild.messaging.authorize` is DELIBERATELY ABSENT, and the absence is a
 * requirement rather than an oversight.
 *
 * This feature registers an action with that id, and it is not in this list.
 * `packages/features/social/src/manifest.ts` says why in its own words: the ACL
 * "is deliberately absent from the union because a caller must never be able to
 * act() this feature's way around its own ACL". Listing it here would put
 * `guild.messaging.authorize` into `RegisteredActionId`, which is the type
 * `act()` accepts — so a caller would be able to invoke the authorization
 * service directly, by name, as an ordinary operation.
 *
 * That would not grant anybody anything: the answer is a decision, and a
 * decision a caller asks for changes no state. But an authorization endpoint
 * reachable by any caller is a thing a future contributor adds a flag to, and
 * the flag is how "just for debugging" becomes "skip the check". The port is a
 * port: another feature REQUIRES it, and a person does not call it.
 *
 * `tests/unit/action-manifest-agreement.test.ts` only checks the manifest →
 * actionDefs direction, so an action defined here and absent above is a valid
 * arrangement rather than a drift it would report.
 */
export const GUILD_ACTION_IDS = [
  'guild.create',
  'guild.join',
  'guild.leave',
  'guild.members',
  'guild.roles',
  'guild.contribute',
  'guild.fund',
  'guild.treasury',
  'guild.quest.start',
  'guild.quests',
  'guild.tally',
] as const;

export type GuildActionId = (typeof GUILD_ACTION_IDS)[number];

/**
 * What each action takes and returns.
 *
 * Keyed by the id, so an action added without a declared shape is a type error
 * rather than an `any` that surfaces three layers away.
 */
export type GuildActionTypes = {
  [K in GuildActionId]: { input: unknown; output: unknown };
};
