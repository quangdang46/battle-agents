/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, for one reason: a type is erased, so a
 * build step that unions every feature's action ids could not read it. Making it
 * a value lets the generator assemble the union, and deriving the type from the
 * value means the two cannot disagree.
 *
 * NOT the commands. `agent.register` is dispatched, not acted on, so it has no
 * action id and listing it here would hand callers an id `act()` rejects.
 */
export const AGENT_ACTION_IDS = [
  'agent.describe',
  'agent.read',
  'session.end',
  'session.heartbeat',
] as const;

export type AgentActionId = (typeof AGENT_ACTION_IDS)[number];

/**
 * What each action takes and returns.
 *
 * Keyed by the id, so adding an action without saying what it does is a type
 * error rather than an `any` that surfaces three layers away.
 */
export type AgentActionTypes = {
  [K in AgentActionId]: { input: unknown; output: unknown };
};
