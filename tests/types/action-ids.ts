/**
 * The action-id union, checked at compile time.
 *
 * This is the criterion ba-capability-registry-klw was reopened for: a bogus
 * action id must be a COMPILE error, not a runtime surprise. The ids are
 * generated from each feature's manifest by scripts/generate-action-ids.ts,
 * because the registered set is decided at runtime by independently built
 * packages and a hand-written union is correct only on the day it was written.
 *
 * `@ts-expect-error` fails in both directions, which is what keeps this honest:
 * if the error ever stops happening, the unused directive becomes an error
 * itself. So the day the union stops being enforced, the build says so.
 */
import type { ApplicationApi } from '@battle-agents/api';
import type { RegisteredActionId } from '@battle-agents/protocol';

declare const api: ApplicationApi;

/** An id this build registers. */
export const registered: RegisteredActionId = 'quest.claim';

/**
 * A misspelled id, and the same misspelling a caller would actually type.
 * This compiled clean before the union existed, which is the whole point: the
 * error was always possible, it just was not being reported.
 */
export const misspelled = async (): Promise<void> => {
  // @ts-expect-error 'quest.cliam' is not registered; 'quest.claim' is
  await api.act('quest.cliam', { id: 'q1' });
};

/** An id from a feature that exists but is not installed in this build. */
export const notInstalled = async (): Promise<void> => {
  // @ts-expect-error no such domain is built into this union
  await api.act('guild.join', { id: 'g1' });
};

/** A command reached through dispatch, which act() must not accept. */
export const commandNotAction = async (): Promise<void> => {
  // @ts-expect-error agent.register is dispatched, not acted on
  await api.act('agent.register', { name: 'x' });
};

/** The valid case still compiles, or the guards above prove nothing. */
export const valid = async (): Promise<void> => {
  await api.act('quest.claim', { id: 'q1' });
  await api.act('session.heartbeat', { sessionId: 's1' });
  await api.act('reputation.read', { ownerId: 'u1' });
};
