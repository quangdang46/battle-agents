/**
 * The action-id inventory, checked at compile time.
 *
 * ## What this file stopped asserting, and why
 *
 * It used to prove that a misspelled action id is a COMPILE error, by pinning
 * `ApplicationApi.act` to the generated union and pairing each bogus id with a
 * `@ts-expect-error`.
 *
 * That guarantee depended on the union being complete for every action any
 * caller could reach. It was not, and could not be: `act` is also reachable with
 * an id composed at runtime by a host, and `extension-contract.ts` exists
 * precisely to let an out-of-tree extension install one. An extension that
 * cannot appear in a union generated from this repository's manifests cannot be
 * dispatched through a signature keyed on that union.
 *
 * So the compile-time check was a gate rather than a narrowing device, and it was
 * enforced in three places — the Application API, the MCP `act` tool and the CLI.
 * All three refused a correctly installed action the moment the union stopped
 * covering it. `act` now takes `string`, and the check is the one that cannot be
 * wrong about runtime state: `UnknownActionError` from the registry, which each
 * surface translates into its own wording.
 *
 * What remains here is the inventory, which is still generated and still worth
 * asserting: it is what `discover()` is checked against, and a generator that
 * quietly stopped reading a manifest would make it drift.
 */
import type { ApplicationApi } from '@battle-agents/api';
import { REGISTERED_ACTION_IDS } from '@battle-agents/protocol';

declare const api: ApplicationApi;

/**
 * The inventory is empty while nothing is registered, and an empty array is the
 * honest statement of that — the generator ran, read zero manifests and wrote
 * zero ids.
 */
export const inventoryIsEmpty = (): readonly string[] => {
  const ids: readonly string[] = REGISTERED_ACTION_IDS;
  return ids;
};

/**
 * A misspelled id is refused at runtime, not at compile time. The value of this
 * case is the MESSAGE: an agent driving the CLI reads it, so the wording is part
 * of the surface rather than an implementation detail.
 */
export const misspelledIsRefused = async (): Promise<void> => {
  await expectUnknown(api, 'quest.cliam');
};

/** An id from an extension that is not mounted here, refused the same way. */
export const notInstalledIsRefused = async (): Promise<void> => {
  await expectUnknown(api, 'inventory.open');
};

/** A dispatched command is not an action, and is refused as one. */
export const commandNotActionIsRefused = async (): Promise<void> => {
  await expectUnknown(api, 'agent.register');
};

/**
 * A registered id IS dispatchable. With no extension mounted there is no such
 * id, which is why this asserts the negative shape — the guard rejects every
 * input rather than accepting one and rejecting the rest.
 */
export const nothingIsDispatchable = async (): Promise<void> => {
  await expectUnknown(api, REGISTERED_ACTION_IDS[0] ?? 'anything');
};

async function expectUnknown(target: ApplicationApi, action: string): Promise<void> {
  try {
    await target.act(action, {});
  } catch (error) {
    if ((error as { code?: string }).code === 'unknown-action') return;
    throw error;
  }
  throw new Error(`act(${action}) resolved; this build registers nothing`);
}