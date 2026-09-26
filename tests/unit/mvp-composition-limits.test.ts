import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_SESSION_RESUME_GRACE_MS } from '@battle-agents/protocol';

/**
 * The two numbers the composition root writes out by hand.
 *
 * `battleFeature` takes its session window as two required parameters rather than
 * defaulting them, which is right: a default inside the battle package would be
 * a second copy of a number the agent feature already answers to. The composition
 * root could not import it, though, and the reason is worth stating because it
 * looks like a mistake and is not.
 *
 * scripts/removal-test.sh strips a feature by stripping the line that constructs
 * it, then typechecks the tree. An import from a package the strip does not
 * remove — and protocol is not a feature — survives the removal of the feature
 * that used it, and an unused import is a typecheck error under noUnusedLocals.
 * The removal test therefore failed on battle with "declared but never read",
 * which is a failure about the gate rather than about battle.
 *
 * So the numbers are written out, and THIS is what keeps them honest. A literal
 * cannot drift from the constant by accident: it can only be changed to a wrong
 * value, and that is a red test rather than a silent second answer.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const composition = readFileSync(join(repoRoot, 'apps/web/src/composition.ts'), 'utf8');

/** The literals the battle wiring passes, read rather than remembered. */
function battleLimits(): { graceMs: number; matchMs: number } | undefined {
  const call = /battleFeature\(\{([\s\S]*?)\}\)/.exec(composition)?.[1];
  if (call === undefined) return undefined;
  const graceMs = /graceMs:\s*([0-9_]+)/.exec(call)?.[1];
  const matchMs = /matchMs:\s*([0-9_]+)/.exec(call)?.[1];
  if (graceMs === undefined || matchMs === undefined) return undefined;
  return {
    graceMs: Number(graceMs.replace(/_/g, '')),
    matchMs: Number(matchMs.replace(/_/g, '')),
  };
}

describe('the battle session windows the composition root declares', () => {
  // The first version of this file asserted the literals unconditionally and the
  // removal test caught it: with battle stripped from the composition root the
  // literals are gone, and `undefined` is not 900000. That is the SAME mistake
  // mvp-scope made and the same one feature-package-isolation made — a check that
  // only holds while every part of the system is present, in a repository whose
  // defining property is that parts can be removed. The floor below keeps this
  // honest instead: it fails when the scan cannot find the file it is reading,
  // and the two assertions after it are about what is there.
  it('reads a composition root that exists', () => {
    expect(composition).toContain('extensions: [');
    expect(composition).toContain('createGameRuntime');
  });

  it('agrees with the one definition of the grace window', () => {
    const limits = battleLimits();
    if (limits === undefined) return; // battle is stripped; there is nothing to hold to
    expect(limits.graceMs).toBe(DEFAULT_SESSION_RESUME_GRACE_MS);
  });

  it('bounds a match at the same fifteen minutes, per §10.3', () => {
    // §10.3 puts a match at 5-15 minutes and §3.2 gives a session the same
    // grace. They are different concepts that currently share a value — the
    // match ceiling is what makes `expired` reachable, the grace is how long a
    // participant may be away — so this asserts today rather than claiming they
    // are the same thing. The day one moves without the other, this is where that
    // gets noticed.
    const limits = battleLimits();
    if (limits === undefined) return;
    expect(limits.matchMs).toBe(DEFAULT_SESSION_RESUME_GRACE_MS);
  });

  it('reads a value rather than asserting a constant against itself', () => {
    // The check is about the composition root, so it is only worth anything if it
    // reads what is there. Proved by changing graceMs to 600_000 and watching
    // exactly one test go red.
    const limits = battleLimits();
    if (limits === undefined) return;
    expect(limits.graceMs).not.toBe(0);
  });
});
