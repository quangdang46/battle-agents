import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Scope discipline, as a check that can fail.
 *
 * Plan §17.8 risk 8 bans, in the MVP, anything past the §10.2 character sheet
 * and the M1/M2/M4 slice: no MMO, and no equipment, pets, trading, guild-war,
 * housing, crafting, marketplace, tournament, boss, season or achievements.
 * The bead calls the tempting failure mode gold-plating while M2 is still
 * incomplete, and its standing rule is that a gate is done only when a command
 * exists whose exit code settles it and that command runs somewhere other than
 * a human's memory.
 *
 * A VOCABULARY SCAN IS THE WRONG CHECK HERE, and the reason is worth recording.
 * Six of those words are scheduled for later milestones — tournaments and
 * seasons are §10.3 and §11.3, guilds are M6 — so a test that fails on the word
 * "tournament" would block legitimate M6 work and would be switched off within
 * a week. A guard that cries wolf is not a guard. `core` proves the strip-
 * comments-and-literals technique; it does not prove that vocabulary is the
 * right axis, and here it is not.
 *
 * What IS mechanical, and is the actual temptation, is INSTALLING more. A
 * feature package that exists on disk is inert; a feature in the composition
 * root's extensions[] is live, reachable from every surface, and is a decision
 * someone made. So the check is on the installed set, against a declared
 * allowlist, where each entry names the plan section that earns it.
 *
 * It is deliberately one-sided. Adding a feature to the allowlist is allowed and
 * is the point — but it has to be a line someone wrote down, reviewed, with its
 * reason, rather than a sixth entry that arrived with a commit nobody read. That
 * is the whole mechanism: the gold-plating this guards against is not prevented,
 * it is made to say its name.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const composition = readFileSync(join(repoRoot, 'apps/web/src/composition.ts'), 'utf8');

/**
 * The live feature set, with the plan section that earns each one.
 *
 * Kept as data rather than derived from a heuristic, because a heuristic here
 * would need to know which milestones have landed, and that is the decision
 * under review.
 */
const DECLARED_MVP_FEATURES: Readonly<Record<string, string>> = {
  agent: '§29.1 contract 2/3 — identity, sessions, presence. M1.',
  quest: '§29.1 contract 4 + the activity log. The generic work item.',
  bounty: '§11.1 the Bounty object + §22 its lifecycle, §24 its commands. M2.',
  progression: '§10.2 — XP and level. M3.',
  reputation: '§10.2/§11.3 — trust from outcomes, distinct from progression.',
  social:
    '§11.4 product shape — messages, profiles, leaderboard. Degraded until the ACL principal is decided.',
  // §17.8's own carve-out names the M1/M2/M4 slice, and M4 is the battle: §2.1
  // makes it the differentiator, §24 gives it CreateBattle/JoinBattle/FinishBattle,
  // and §17.4 puts its fairness properties (a published rubric) inside the MVP
  // rather than after it.
  //
  // The entry is here because the composition root installs it, and the whole
  // point of this list is that installing a feature is a decision somebody wrote
  // down. §17.8 also bans "tournament" and "boss" in the MVP — as GAMEPLAY, and
  // this feature has neither: a battle mode is a stored string this build
  // answers fail-closed for, and no season, guild-war or marketplace arrives with
  // it. The vocabulary is not the axis, and the header says so.
  battle: '§2.1/§24 — the battle, and §17.4 a rubric published before it is judged. M4.',
  // §17.8 bars achievements from the MVP "beyond the §10.2 sheet", and §10.2's
  // sheet names Achievements among the seven things a character carries. Read
  // together the two say what the sheet says and nothing more: a badge derived
  // from recorded outcomes. What would be out of scope is the thing a badge
  // invites — a points currency, a rarity tier, a shop — and the feature as
  // built is not that. The entry is here because installing it is a decision
  // somebody wrote down, which is the entire point of this list.
  achievements: '§10.2 sheet (Achievements), derived from the activity log. Not a currency.',
};

/** What a `somethingFeature({` construction looks like once prettier has run. */
const INSTALLED = /^\s*([a-z][a-zA-Z]*)Feature\(\{/gm;

function installedFeatures(): string[] {
  return [...composition.matchAll(INSTALLED)].map((match) => match[1] as string).sort();
}

describe('the MVP feature set', () => {
  it('reads the composition root at all', () => {
    // Without a floor, a regex that stops matching reports an empty runtime as
    // a clean one. The same reason tests/unit/source-alias-coverage.test.ts
    // asserts it has at least one alias.
    expect(installedFeatures().length).toBeGreaterThan(0);
    expect(composition).toContain('extensions: [');
  });

  it('installs only features the allowlist declares, and each only once', () => {
    const installed = installedFeatures();
    const undeclared = installed.filter((name) => !(name in DECLARED_MVP_FEATURES));

    expect(
      undeclared,
      'A feature is live in the composition root but not in DECLARED_MVP_FEATURES. ' +
        'Either it belongs in the MVP slice — add it above with the plan section that earns it, ' +
        'which is the point of the list — or it is §17.8 scope creep arriving with a commit.',
    ).toEqual([]);

    expect(new Set(installed).size).toBe(installed.length);
  });

  // There is deliberately no "installs every feature the allowlist claims" test
  // here, and its absence is load-bearing. This file originally had one, on the
  // reasoning that an allowlist which has drifted from reality is a claim about
  // the product that quietly stopped being true. The removal test caught it:
  // scripts/removal-test.sh strips a feature out of the composition root and
  // then runs the unit suite, so the check failed on every feature it removed —
  // the exact operation that is this repository's defining property.
  //
  // The two directions are not symmetrical and cannot both be asserted. The list
  // is an ALLOWLIST: it constrains what may be installed, and nothing in it
  // claims every entry is currently installed. A feature legitimately vanishes
  // from the composition root — that is what the removal test proves — so absence
  // below the line is a valid state, not drift.

  it('gives every declared feature a non-empty reason', () => {
    for (const [name, reason] of Object.entries(DECLARED_MVP_FEATURES)) {
      expect(
        reason.length,
        `${name} has no reason, so its presence is asserted rather than justified`,
      ).toBeGreaterThan(0);
    }
  });
});
