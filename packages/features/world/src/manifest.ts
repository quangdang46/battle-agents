/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, because a type is erased and the
 * codegen step that unions every feature's ids could not read it. Deriving the
 * type from the value is what keeps the two from disagreeing.
 */
export const WORLD_ACTION_IDS = [
  'world.read',
  'world.buildings',
  'world.unlocks',
  'world.upgrade',
] as const;

export type WorldActionId = (typeof WORLD_ACTION_IDS)[number];

/** What each action takes and returns. */
export type WorldActionTypes = {
  [K in WorldActionId]: { input: unknown; output: unknown };
};
