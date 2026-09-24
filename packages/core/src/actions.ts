import type { ActionDef, RuntimeContext } from './contracts.js';

/**
 * Dotted, lowercase, at least two segments: "quest.claim", "battle.accept".
 *
 * The dotted minimum is not decoration. A bare "claim" collides the moment two
 * features each have one, and the collision surfaces at dispatch time as one
 * feature silently answering for another. Requiring the namespace here means
 * the mistake is a rejected declaration instead.
 */
const ACTION_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

/**
 * Declares one typed action and rejects the two ways the action registry goes
 * wrong in practice.
 *
 * Every action a CLI verb or an MCP tool calls is built here, so this is the
 * single point where a malformed action is caught: at authoring time, by the
 * feature author, with a message naming the offending id.
 */
export function defineAction<I, O>(definition: {
  readonly id: string;
  readonly input: I;
  readonly output: O;
  readonly permissions: readonly string[];
  run(input: I, context: RuntimeContext): Promise<O>;
}): ActionDef<I, O> {
  if (!ACTION_ID_PATTERN.test(definition.id)) {
    throw new Error(
      `action id must be dotted, lowercase and have at least two segments, got "${definition.id}"`,
    );
  }
  if (definition.permissions.length === 0) {
    // An action nobody can be granted is an action nobody can authorise, which
    // would otherwise look like a working feature that is simply never called.
    throw new Error(`action ${definition.id} declares no permissions`);
  }
  return definition;
}
