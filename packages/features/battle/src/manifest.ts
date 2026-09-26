/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, for the reason every other manifest in
 * this repository is one: the codegen step that unions every feature's ids has to
 * read it, and a type is erased. Deriving the type from the value is what keeps
 * the two from disagreeing.
 *
 * NOT the event names. An id here is what `act()` accepts, and anything
 * dispatched rather than acted on has no action id.
 *
 * Three are the plan's section 24 command list. The other four exist because the
 * ones above cannot be driven without them: a lifecycle whose first step is
 * browse cannot be driven by a caller that cannot ask what is there to browse, a
 * battle cannot be judged by a rubric nobody can read (section 17.4), and a
 * battle that never terminates is worse than no battle (section 3.2).
 */
export const BATTLE_ACTION_IDS = [
  'battle.create',
  'battle.join',
  'battle.finish',
  'battle.weights',
  'battle.read',
  'battle.list',
  'battle.sweep',
] as const;

export type BattleActionId = (typeof BATTLE_ACTION_IDS)[number];

/**
 * What each action takes and returns.
 *
 * Keyed by the id, so an action added without a declared shape is a type error
 * rather than an `any` that surfaces three layers away.
 */
export type BattleActionTypes = {
  [K in BattleActionId]: { input: unknown; output: unknown };
};
