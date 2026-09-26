/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, because a type is erased and
 * `scripts/generate-action-ids.ts` builds the dispatchable-id union by reading
 * this constant. Deriving the type from the value is what keeps the two from
 * disagreeing.
 *
 * Not commands and not event names. An id here is what `act()` accepts, and
 * anything dispatched rather than acted on has no action id.
 */
export const ANIMATION_ACTION_IDS = ['animation.pose'] as const;

export type AnimationActionId = (typeof ANIMATION_ACTION_IDS)[number];

/** What each action takes and returns, keyed by id so a missing shape is a type error. */
export type AnimationActionTypes = {
  [K in AnimationActionId]: { input: unknown; output: unknown };
};
