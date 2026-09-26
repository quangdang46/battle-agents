/**
 * The shapes that cross the wire, and the guards that keep them honest.
 *
 * Every validator here takes `unknown`. That is not a stylistic choice: `act()`
 * hands the payload through as a generic, so an action whose `run` was annotated
 * with its own input type compiled clean and read `agentId = undefined` at
 * runtime. Progression carries the note at the call site; this repeats it
 * because the next feature will make the same assumption.
 */

export type WorldRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'agent-id-not-a-string' }
  | { readonly reason: 'agent-id-empty' }
  | { readonly reason: 'building-id-not-a-string' }
  | { readonly reason: 'building-id-empty' }
  | { readonly reason: 'no-such-building' };

/** The character a read is about. */
export interface WorldAgentInput {
  readonly agentId: string;
}

/** An upgrade: which building, for which character. */
export interface WorldUpgradeInput extends WorldAgentInput {
  readonly buildingId: string;
}

export function worldInputRejected(
  action: string,
  rejection: WorldRejection,
  expected: string,
): Error {
  return Object.assign(new Error(`${action} rejected: ${rejection.reason}. ${expected}`), {
    code: 'malformed-input',
  });
}

export function isWorldAgentInput(input: unknown): input is WorldAgentInput {
  return whyWorldReadIsRejected(input) === undefined;
}

export function isWorldUpgradeInput(input: unknown): input is WorldUpgradeInput {
  return whyWorldUpgradeIsRejected(input) === undefined;
}

export function whyWorldReadIsRejected(input: unknown): WorldRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  return whyAgentIdIsMissing((input as { readonly agentId?: unknown }).agentId);
}

/**
 * Why an upgrade cannot be asked for, or undefined when it can.
 *
 * The building is checked against a KNOWN id here rather than at the
 * repository, so a typo is a malformed payload answered with the shape of the
 * question and not a lookup that comes back empty. The caller learns which
 * buildings exist from `world.buildings`; this is the other half of that pair,
 * and without it a client could send any string and be told "not found" in a
 * way indistinguishable from a character who has not built it.
 */
export function whyWorldUpgradeIsRejected(input: unknown, known?: readonly string[]): WorldRejection | undefined {
  if (typeof input !== 'object' || input === null) {
    return { reason: 'not-an-object' };
  }
  const { agentId, buildingId } = input as {
    readonly agentId?: unknown;
    readonly buildingId?: unknown;
  };
  const missing = whyAgentIdIsMissing(agentId);
  if (missing !== undefined) {
    return missing;
  }
  if (typeof buildingId !== 'string') {
    return { reason: 'building-id-not-a-string' };
  }
  if (buildingId.length === 0) {
    return { reason: 'building-id-empty' };
  }
  if (known !== undefined && !known.includes(buildingId)) {
    return { reason: 'no-such-building' };
  }
  return undefined;
}

function whyAgentIdIsMissing(agentId: unknown): WorldRejection | undefined {
  if (typeof agentId !== 'string') {
    return { reason: 'agent-id-not-a-string' };
  }
  if (agentId.length === 0) {
    return { reason: 'agent-id-empty' };
  }
  return undefined;
}
