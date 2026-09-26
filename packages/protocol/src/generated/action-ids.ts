/**
 * GENERATED FILE — do not edit. Run `pnpm codegen` instead.
 *
 * The action ids this build can dispatch, assembled from each feature's manifest
 * at build time. It exists because the set is decided at runtime by
 * independently built packages, so nothing the compiler can see is a function of
 * it — and a union assembled by hand is a union that was correct the day it was
 * written.
 *
 * No imports, on purpose. packages/api consumes this without depending on a
 * feature, which the layering rules forbid and which a generated file that named
 * its sources would route around.
 *
 * The ids are real and checked. The input and output shapes are not here yet:
 * each feature has to declare its own payloads first, and emitting placeholder
 * helpers that resolve to unknown would be a union that looks typed and is not.
 */

/** agent */
export type AgentActionId =
  'agent.describe' | 'agent.read' | 'session.create' | 'session.end' | 'session.heartbeat';

/** bounty */
export type BountyActionId =
  | 'bounty.create'
  | 'bounty.list'
  | 'bounty.claim'
  | 'bounty.submit'
  | 'bounty.fund'
  | 'bounty.expire';

/** quest */
export type QuestActionId =
  'quest.create' | 'quest.list' | 'quest.claim' | 'quest.submit' | 'quest.admin.revoke';

/** progression */
export type ProgressionActionId =
  'progression.awards' | 'progression.gate' | 'progression.read' | 'progression.tiers';

/** reputation */
export type ReputationActionId = 'reputation.gate' | 'reputation.read' | 'reputation.tiers';

/** social */
export type SocialActionId =
  | 'social.broadcast'
  | 'social.inbox'
  | 'social.leaderboard'
  | 'social.poke'
  | 'social.profile'
  | 'social.send';

/** Every action id in this build, sorted. The type `act()` is checked against. */
export type RegisteredActionId =
  | 'agent.describe'
  | 'agent.read'
  | 'bounty.claim'
  | 'bounty.create'
  | 'bounty.expire'
  | 'bounty.fund'
  | 'bounty.list'
  | 'bounty.submit'
  | 'progression.awards'
  | 'progression.gate'
  | 'progression.read'
  | 'progression.tiers'
  | 'quest.admin.revoke'
  | 'quest.claim'
  | 'quest.create'
  | 'quest.list'
  | 'quest.submit'
  | 'reputation.gate'
  | 'reputation.read'
  | 'reputation.tiers'
  | 'session.create'
  | 'session.end'
  | 'session.heartbeat'
  | 'social.broadcast'
  | 'social.inbox'
  | 'social.leaderboard'
  | 'social.poke'
  | 'social.profile'
  | 'social.send';

/**
 * Whether a string names an action this build registers.
 *
 * The narrowing a dynamic caller needs. Without it, a caller holding a string
 * from a URL or a command line has to either cast to the union — which moves the
 * check rather than performing it — or give up the compile-time guarantee
 * entirely by widening act() to accept any string. Narrowing here keeps both:
 * the surface stays five primitives, and the call after the guard is typed.
 */
export function isRegisteredActionId(value: string): value is RegisteredActionId {
  return (REGISTERED_ACTION_IDS as readonly string[]).includes(value);
}

export const REGISTERED_ACTION_IDS: readonly RegisteredActionId[] = [
  'agent.describe',
  'agent.read',
  'bounty.claim',
  'bounty.create',
  'bounty.expire',
  'bounty.fund',
  'bounty.list',
  'bounty.submit',
  'progression.awards',
  'progression.gate',
  'progression.read',
  'progression.tiers',
  'quest.admin.revoke',
  'quest.claim',
  'quest.create',
  'quest.list',
  'quest.submit',
  'reputation.gate',
  'reputation.read',
  'reputation.tiers',
  'session.create',
  'session.end',
  'session.heartbeat',
  'social.broadcast',
  'social.inbox',
  'social.leaderboard',
  'social.poke',
  'social.profile',
  'social.send',
];
