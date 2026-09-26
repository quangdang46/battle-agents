import { describe, expect, it } from 'vitest';

import {
  BOUNTY_MODES,
  BOUNTY_MODE_RULES,
  bountyModeRule,
  canHonourMode,
  DEFAULT_BOUNTY_MODE,
  describeBountyMode,
  isKnownBountyMode,
  toKnownBountyMode,
  unplayableModes,
  type BountyMode,
} from './modes.js';

/**
 * The §11.3 names, spelled out here rather than imported.
 *
 * Duplicated on purpose. A test that read them out of the implementation would
 * pass if the implementation renamed `maintainer-picks` to anything at all,
 * which is the failure this whole file exists to rule out — the collision was
 * never a spelling bug, it was two lists sharing a spelling.
 */
const PLAN_SECTION_11_3 = ['Race', 'Open', 'Tournament', 'Team'];

describe('the mode taxonomy', () => {
  it('is the four rules §11.3 names, one row each', () => {
    expect(BOUNTY_MODES).toHaveLength(PLAN_SECTION_11_3.length);
    expect(BOUNTY_MODE_RULES.map((rule) => rule.planName).sort()).toEqual(
      [...PLAN_SECTION_11_3].sort(),
    );
  });

  it('carries every mode in the list, and nothing else', () => {
    // The two ways the table could rot: a mode in BOUNTY_MODES with no rule
    // (bountyModeRule would throw at the first claim) and a rule for a mode
    // nobody can name (a fifth row nothing can ever select).
    expect(BOUNTY_MODE_RULES.map((rule) => rule.mode).sort()).toEqual([...BOUNTY_MODES].sort());
  });

  it('defaults to a mode this build can actually honour', () => {
    // The default is the answer for every bounty whose creator did not choose,
    // so a default naming an unplayable mode hands out a claim policy the store
    // cannot keep. This is the assertion that would have caught it.
    expect(canHonourMode(DEFAULT_BOUNTY_MODE)).toBe(true);
  });

  it('gives every mode a rule that says what decides it', () => {
    for (const rule of BOUNTY_MODE_RULES) {
      expect(rule.resolves.length, `${rule.mode} does not say what resolves it`).toBeGreaterThan(
        10,
      );
    }
  });
});

describe('the collision with battle modes', () => {
  it('shares no name with the battle taxonomy', () => {
    // Battle's list, copied rather than imported: features/battle and
    // features/bounty may not import each other, and a test that imported it
    // would be modelling the coupling this file removes. The seam test in
    // tests/unit/bounty-mode-vocabulary.test.ts is what reads both for real;
    // this is the copy a reader of the bounty package can check alone.
    const BATTLE_MODES = ['speed', 'quality', 'survival', 'boss', 'team', 'tournament'];
    const shared = BOUNTY_MODES.filter((mode) => BATTLE_MODES.includes(mode));
    expect(shared, `bounty and battle both call these '${shared.join("', '")}'`).toEqual([]);
  });

  it('refuses the plan names rather than accepting them as aliases', () => {
    // The tempting shortcut is to accept 'race' as a synonym of 'first-valid'
    // so old callers keep working. That reinstates the collision: a caller
    // writing 'tournament' would be accepted here and interpreted as a battle
    // format somewhere else, which is the exact failure the rename removes.
    for (const name of ['race', 'open', 'tournament', 'team']) {
      expect(isKnownBountyMode(name), `'${name}' is still accepted`).toBe(false);
    }
  });
});

describe('reading a stored mode', () => {
  it('knows its own modes', () => {
    for (const mode of BOUNTY_MODES) {
      expect(isKnownBountyMode(mode)).toBe(true);
      expect(toKnownBountyMode(mode)).toBe(mode);
    }
  });

  it('answers undefined for a mode it has never heard of, and names no fallback', () => {
    // Not a default. A column is text, so a row written by a future build — or
    // by hand — can carry anything; mapping it to a real mode would grant that
    // row a claim policy its sponsor never chose.
    expect(toKnownBountyMode('speed')).toBeUndefined();
    expect(toKnownBountyMode('')).toBeUndefined();
    expect(toKnownBountyMode('FIRST-VALID')).toBeUndefined();
  });

  it('throws rather than inventing a rule for a mode it does not list', () => {
    // The asymmetry is deliberate and is the reason `toKnownBountyMode` returns
    // undefined while this throws: coercion belongs at the storage boundary,
    // where a text column can hold anything, and a caller holding a mode it
    // cannot name has a bug that a plausible-looking rule would hide.
    expect(() => bountyModeRule('speed' as BountyMode)).toThrow(/no rule/);
  });
});

describe('which modes this build can resolve', () => {
  it('honours exactly the modes whose rule needs one holder', () => {
    const honourable = BOUNTY_MODES.filter(canHonourMode);
    expect(honourable).toEqual([DEFAULT_BOUNTY_MODE]);
  });

  it('derives the answer from the rule rather than declaring it per mode', () => {
    // canHonourMode reads `claimants`. If it were a hand-written per-mode
    // boolean, these two assertions could both hold while a rule said `many` for
    // a mode the build claimed to honour — which is the bug a table can hide.
    for (const mode of BOUNTY_MODES) {
      expect(canHonourMode(mode)).toBe(bountyModeRule(mode).claimants === 'one');
    }
  });

  it('lists the rest, so a refusal can name them', () => {
    expect(unplayableModes()).toEqual(['maintainer-picks', 'best-validated', 'single-pr']);
  });

  it('is decided by the store, not by taste: one nullable claimant column', () => {
    // The reason `canHonourMode` exists in the shape it does. Written as a
    // comment-shaped assertion because the property it names is a fact about
    // packages/db, and this file cannot import that package to check it — the
    // test that CAN is tests/integration/bounty-chains.test.ts, which claims a
    // chained bounty through the real database. Here the claim is only that the
    // three modes that need many holders are the three refused.
    const needsMany = BOUNTY_MODES.filter((mode) => bountyModeRule(mode).claimants === 'many');
    expect(needsMany).toHaveLength(3);
  });
});

describe('describing a mode', () => {
  it('says the rule, not the name', () => {
    // A refusal that reads "maintainer-picks" tells an agent nothing. This is
    // the string a claim error carries.
    const described = describeBountyMode('maintainer-picks');
    expect(described).toContain('maintainer');
    expect(described).toContain('maintainer chooses');
  });
});
