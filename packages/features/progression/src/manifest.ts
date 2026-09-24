/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, because a type is erased and the
 * codegen step that unions every feature's ids could not read it. Deriving the
 * type from the value is what keeps the two from disagreeing.
 *
 * NOT the commands and NOT the event names. An id here is what `act()` accepts,
 * and anything dispatched rather than acted on has no action id.
 */
export const PROGRESSION_ACTION_IDS = ['progression.awards', 'progression.read'] as const;

export type ProgressionActionId = (typeof PROGRESSION_ACTION_IDS)[number];

/**
 * What each action takes and returns.
 *
 * Keyed by the id, so an action added without a declared shape is a type error
 * rather than an `any` that surfaces three layers away.
 */
export type ProgressionActionTypes = {
  [K in ProgressionActionId]: { input: unknown; output: unknown };
};
