/**
 * The GAME event names, in one non-removable place.
 *
 * WHY THIS EXISTS, and it is a real incident rather than tidiness.
 * `bounty.completed` was spelled as a bare string literal in five feature
 * packages — the emitter in bounty, and subscribers in reputation, progression,
 * achievements and guild. Renaming it on the emitter side therefore
 * SILENTLY UNSUBSCRIBES four consumers: no error, no failed test, and the
 * reward simply stops arriving. Nothing in the architecture check sees it,
 * because a copy of a string is not a dependency.
 *
 * This is the same hazard the action-id machinery was built for, and the reason
 * the fix is the same shape. `generate-action-ids.ts` reads each feature's
 * manifest and ASSEMBLES the union, so a missing registration is a type error at
 * every call site. An event name registered by hand in five packages is a
 * contract held by everyone spelling it the same way, which is not a contract.
 *
 * WHY PROTOCOL, WHICH IS NOT A FEATURE. Every feature is REMOVABLE — the removal
 * test strips each in turn and typechecks. A constant owned by a feature is a
 * constant that disappears with it, and the consumers of that constant would
 * then fail for a reason that looks like an unrelated removal bug. Protocol is
 * imported by everyone and removed by no one.
 *
 * WHAT IS AND IS NOT HERE. These are GAME events — things the game narrates, like
 * the agent telemetry in agent-event.ts, and they are a different vocabulary with
 * a different lifecycle. Only the NAMES live here. A feature still decides what
 * its payload carries, because that is the feature's business; what lives here is
 * the thing whose loss is silent.
 */

/** Bounty's lifecycle, as narrated. The emitter is features/bounty. */
export const BOUNTY_EVENTS = {
  created: 'bounty.created',
  claimed: 'bounty.claimed',
  submitted: 'bounty.submitted',
  completed: 'bounty.completed',
  failed: 'bounty.failed',
  expired: 'bounty.expired',
  fundingRefused: 'bounty.funding_refused',
  payoutFunded: 'bounty.payout_funded',
  payoutPending: 'bounty.payout_pending',
  payoutRecorded: 'bounty.payout_recorded',
} as const;

/** Quest lifecycle. */
export const QUEST_EVENTS = {
  created: 'quest.created',
  rejected: 'quest.rejected',
  claimed: 'quest.claimed',
  completed: 'quest.completed',
  cancelled: 'quest.cancelled',
} as const;

/** Session lifecycle, and the signal the agent feature's death rule reads. */
export const SESSION_EVENTS = {
  started: 'session.started',
  ended: 'session.ended',
  resumed: 'session.resumed',
  /**
   * A run that failed and taught something. §10.2's death rule: HP 0 never kills
   * the character, and a crashed session grants experience. It is named here
   * because it is the event with a PRICE and no PRODUCER, and a price with no
   * producer is invisible — nothing fails when the award never arrives.
   */
  recovered: 'session.recovered',
} as const;

/** Character lifecycle. */
export const AGENT_EVENTS = {
  registered: 'agent.registered',
  registrationRejected: 'agent.registration_rejected',
  levelUp: 'agent.level_up',
} as const;

/** Badges. */
export const ACHIEVEMENT_EVENTS = {
  awarded: 'achievement.awarded',
} as const;

/** Guild work, and the evidence its roles are scored from. */
export const GUILD_EVENTS = {
  created: 'guild.created',
  memberJoined: 'guild.member_joined',
  memberLeft: 'guild.member_left',
  treasuryContributed: 'guild.treasury_contributed',
  treasuryCommitted: 'guild.treasury_committed',
  questStarted: 'guild.quest_started',
  questCompleted: 'guild.quest_completed',
  roleEvidenced: 'guild.role_evidenced',
  tallyRecorded: 'guild.tally_recorded',
} as const;

/** A match, from both sides: the fight and the review of it. */
export const BATTLE_EVENTS = {
  created: 'battle.created',
  opened: 'battle.opened',
  joined: 'battle.joined',
  joinRefused: 'battle.join_refused',
  finished: 'battle.finished',
  abandoned: 'battle.abandoned',
  expired: 'battle.expired',
  paused: 'battle.paused',
  resumed: 'battle.resumed',
} as const;

/** What one agent says to another. */
export const SOCIAL_EVENTS = {
  message: 'social.message',
  messageSent: 'social.message_sent',
  messageBroadcast: 'social.message_broadcast',
  pokeSent: 'social.poke_sent',
} as const;

/**
 * The merge that started all of it, and the reviewer's evidence. Not in a
 * group because no feature narrates it: the GitHub integration emits it, and
 * bounty translates it into the two outcomes a merge can be.
 */
export const PULL_REQUEST_MERGED = 'github.pull_request.merged';

/**
 * What a merge is worth in the game, which is not the same question.
 *
 * `github.pull_request.merged` is the fact — a pull request closed. THIS is the
 * game's judgement about it, and one merge produces both: bounty emits
 * `bounty.completed` and `pr.merged` together, with `completedBounty: true` on
 * the second saying which of the two is carrying the work. Guild's reviewer
 * evidence reads that flag, which is how it tells a reviewer from an author.
 *
 * It was missing from `GAME_EVENT_NAMES` while guild's rules table listed it
 * literally, and the drift check could not see the omission: it only reports a
 * spelling whose first segment matches something already in the set, and no
 * name in the set began with `pr`, so a misspelling of this one was invisible
 * too. The set is now asserted complete from the other direction — every event
 * a feature actually emits must appear in it — which does not depend on the set
 * already knowing a namespace.
 */
export const PULL_REQUEST_MERGED_OUTCOME = 'pr.merged';

/**
 * Every game event name, as one flat set.
 *
 * What a check needs to say "a feature must not spell an event name itself" —
 * the per-group objects above give the named constant, and this gives the shape
 * a test can compare against.
 *
 * COMPLETENESS IS ASSERTED, not trusted. The first version of this file listed
 * twenty-odd names written by hand and was wrong about eleven of them:
 * `guild.member_joined`, `quest.claimed` and the eight other guild names were
 * missing, so `tests/unit/game-event-name-drift.test.ts` reported each as a
 * misspelling. A hand-written list of names that features already emit is a
 * list that has to be kept in step by a person, and the set is precisely the
 * thing nobody notices drifting. The check is the mechanism; this comment is
 * why it exists and why it must keep running.
 */
export const GAME_EVENT_NAMES: ReadonlySet<string> = new Set<string>([
  ...Object.values(BOUNTY_EVENTS),
  ...Object.values(QUEST_EVENTS),
  ...Object.values(SESSION_EVENTS),
  ...Object.values(AGENT_EVENTS),
  ...Object.values(ACHIEVEMENT_EVENTS),
  ...Object.values(GUILD_EVENTS),
  ...Object.values(BATTLE_EVENTS),
  ...Object.values(SOCIAL_EVENTS),
  PULL_REQUEST_MERGED,
  PULL_REQUEST_MERGED_OUTCOME,
]);
