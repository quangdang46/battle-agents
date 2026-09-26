/**
 * The bounty mode taxonomy, and the reason it is not called Race/Open/Tournament/Team.
 *
 * ## The collision this file exists to settle
 *
 * Plan §11.3 names four bounty modes: Race, Open, Tournament, Team. Plan §10.3
 * names six battle modes, and two of them — `team` and `tournament` — are
 * BATTLE_MODES in features/battle/src/domain.ts. The two lists answer different
 * questions: a battle mode is the shape of a match, a bounty mode is the rule
 * that decides one bounty. Keeping two lists is defensible. Keeping two lists
 * that share two words, in a codebase where both are `string`, is a way to hand
 * a caller a plausible wrong answer: `battleCapacity('tournament')` returns 2 and
 * `isKnownBattleMode('open')` returns false, both without an error, and a caller
 * who asked the wrong feature has no way to tell.
 *
 * ba-bounty-modes-tiers-seasons-62l records three ways out and leans toward
 * renaming one side before sharing a vocabulary in @battle-agents/protocol. This
 * file is that rename, applied to the BOUNTY side, and the reasoning for the
 * side is in docs/design/bounty-modes.md.
 *
 * ## Why the bounty side and not the battle side
 *
 * A rename costs the side whose values are not yet load-bearing. Battle modes
 * are shipped: M4 is complete, the judge reads them, and the replay published at
 * /replay/[replayId] is a public artefact a battle's mode travels in. Bounty
 * modes are a `text` column with one writer and a seed row that never sets it.
 * Renaming the battle list would rewrite published history to fix a hazard that
 * renaming the free-text list fixes for free.
 *
 * ## Why rule-names and not format-names
 *
 * The four names here are not tidier versions of §11.3's four. Each one names
 * the RULE that decides the bounty, which is what a mode actually is, and the
 * naming is what makes the collision structurally hard to reintroduce: a
 * question phrased as a rule ("what decides this bounty?") cannot be answered
 * with a word from a different question's namespace ("what shape is this
 * match?"), whereas "Race" and "Tournament" are free-floating nouns that belong
 * to both. §11.3's words are kept in the table below so nobody has to go to the
 * plan to find out which name is which.
 */

/** The modes a bounty resolves work under. The whole list. */
export const BOUNTY_MODES = [
  'first-valid',
  'maintainer-picks',
  'best-validated',
  'single-pr',
] as const;

export type BountyMode = (typeof BOUNTY_MODES)[number];

/**
 * What a bounty is until somebody says otherwise.
 *
 * `first-valid` rather than a caller's first guess, and the reason is that this
 * is the ONE mode the shipped claim and merge path can actually honour — see
 * `canHonourMode`. A default that named a mode the build cannot enforce would
 * hand every unlabelled bounty a claim policy nobody chose and the platform
 * cannot keep.
 */
export const DEFAULT_BOUNTY_MODE: BountyMode = 'first-valid';

/** How many agents may hold one bounty at the same time. */
export type ClaimantCount = 'one' | 'many';

export interface BountyModeRule {
  readonly mode: BountyMode;
  /** The word §11.3 uses. Kept so a reader holding the plan can find its mode. */
  readonly planName: string;
  /** What decides this bounty, stated as the rule rather than as a label. */
  readonly resolves: string;
  /**
   * Whether one agent or many may hold it.
   *
   * A property of the MODE and not of this build, and it is the only property
   * the current store can express: `bounties.claimed_agent_id` is one nullable
   * uuid, and `BountyRepository.claim` is one compare-and-set on it. So this
   * column is what `canHonourMode` reads, and a mode that says `many` is refused
   * at claim rather than quietly resolved as if it said `one`.
   */
  readonly claimants: ClaimantCount;
}

export const BOUNTY_MODE_RULES: readonly BountyModeRule[] = Object.freeze([
  {
    mode: 'first-valid',
    planName: 'Race',
    resolves: 'the first valid pull request merged against the issue',
    claimants: 'one',
  },
  {
    mode: 'maintainer-picks',
    planName: 'Open',
    resolves: 'which of the submitted pull requests the maintainer chooses to merge',
    claimants: 'many',
  },
  {
    mode: 'best-validated',
    planName: 'Tournament',
    resolves: 'which validated solution scores best against the bounty requirements',
    claimants: 'many',
  },
  {
    mode: 'single-pr',
    planName: 'Team',
    resolves: 'a role-composed team delivering one pull request between them',
    claimants: 'many',
  },
]);

export function isKnownBountyMode(mode: string): mode is BountyMode {
  return (BOUNTY_MODES as readonly string[]).includes(mode);
}

function ruleFor(mode: BountyMode): BountyModeRule {
  const rule = BOUNTY_MODE_RULES.find((candidate) => candidate.mode === mode);
  if (rule === undefined) {
    // Unreachable for any value `isKnownBountyMode` accepted, and thrown rather
    // than defaulted. A table that quietly answered for a mode it does not list
    // is how a fifth mode ends up governed by the first row.
    throw new Error(`BOUNTY_MODE_RULES has no rule for the known mode '${mode}'`);
  }
  return rule;
}

/**
 * What a mode means, for a value this build knows.
 *
 * Throws on an unknown value rather than defaulting, on purpose — and the
 * asymmetry with `toKnownBountyMode` is the point. Coercing is for the storage
 * boundary, where a `text` column can hold a row a future build wrote. A caller
 * that has a mode in hand and does not recognise it has a bug, and handing back
 * a plausible rule for it is how a bounty gets resolved under a policy nobody
 * read.
 */
export function bountyModeRule(mode: BountyMode): BountyModeRule {
  return ruleFor(mode);
}

/**
 * A stored mode, or undefined when this build does not know it.
 *
 * `undefined` rather than a fallback mode, and the callers below are the reason:
 * an unknown mode must not become `first-valid` (that grants a claim policy to a
 * row whose sponsor wrote something else) and must not become a mode that
 * refuses (that strands a row a future build can play). The answer is that this
 * build cannot say, and each caller decides what to do with not-knowing.
 */
export function toKnownBountyMode(stored: string): BountyMode | undefined {
  return isKnownBountyMode(stored) ? stored : undefined;
}

/**
 * Whether this build can resolve a bounty under this mode.
 *
 * DERIVED from `claimants`, never declared per mode, so the two cannot drift
 * apart: a mode is honourable exactly when its rule needs one holder, which is
 * exactly what one nullable `claimed_agent_id` column and one compare-and-set
 * claim can express. Adding a fifth mode that says `one` makes it honourable
 * without editing this function, and adding a table row that says `many` cannot
 * make an unhonourable mode honourable by accident.
 *
 * The three that answer false are §11.3's own modes, not aspirational ones. They
 * are stored, carried on the bounty, and published in the created event, so a
 * row has the right shape from the moment it exists; they are refused at the
 * claim because a claim under them cannot be kept. `bounty.claim` says so by
 * name rather than resolving them as `first-valid`, which would be the
 * plausible-wrong-answer failure this file was written to remove.
 */
export function canHonourMode(mode: BountyMode): boolean {
  return ruleFor(mode).claimants === 'one';
}

/** Every mode this build refuses to claim, for a message that lists them honestly. */
export function unplayableModes(): readonly BountyMode[] {
  return BOUNTY_MODES.filter((mode) => !canHonourMode(mode));
}

/**
 * A human sentence for a mode, used in a refusal and in a surface's label.
 *
 * Not the plan's word, and not the mode's own string. A refusal that says
 * "maintainer-picks" tells an agent nothing; one that says which maintainer
 * picks is the answer to the question the agent actually has.
 */
export function describeBountyMode(mode: BountyMode): string {
  return `${mode} (${ruleFor(mode).resolves})`;
}
