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
 * Five of the six are the plan's section 24 command list. The sixth is the
 * listing, because a lifecycle whose first step is browse cannot be driven by a
 * caller that cannot ask what is there to browse.
 */
export const BOUNTY_ACTION_IDS = [
  'bounty.create',
  'bounty.list',
  'bounty.claim',
  'bounty.submit',
  'bounty.fund',
  'bounty.expire',
] as const;

export type BountyActionId = (typeof BOUNTY_ACTION_IDS)[number];

/**
 * What each action takes and returns.
 *
 * Keyed by the id, so an action added without a declared shape is a type error
 * rather than an `any` that surfaces three layers away.
 */
export type BountyActionTypes = {
  [K in BountyActionId]: { input: unknown; output: unknown };
};
