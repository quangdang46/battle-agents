/**
 * The action ids this feature registers, as a VALUE.
 *
 * A const array rather than a bare type, for the reason every feature's manifest
 * says the same thing: a type is erased, so the codegen step that unions every
 * feature's action ids could not read it. `scripts/generate-action-ids.ts`
 * also DISCOVERS any `*_ACTION_IDS` a feature declares and refuses to emit a
 * union that omits one, so forgetting this file is a failed build rather than a
 * silently narrower type.
 *
 * NOT the capability names and NOT the event types. An id here is what `act()`
 * accepts; `guild.messaging.authorize` is a capability another feature must
 * provide before any of this runs, and it is deliberately absent from the union
 * because a caller must never be able to act() this feature's way around its
 * own ACL.
 */
export const SOCIAL_ACTION_IDS = [
  'social.broadcast',
  'social.inbox',
  'social.leaderboard',
  'social.poke',
  'social.profile',
  'social.send',
] as const;

export type SocialActionId = (typeof SOCIAL_ACTION_IDS)[number];

/**
 * What each action takes and returns.
 *
 * Keyed by the id, so an action added without a declared shape is a type error
 * rather than an `any` that surfaces three layers away.
 */
export type SocialActionTypes = {
  [K in SocialActionId]: { input: unknown; output: unknown };
};
