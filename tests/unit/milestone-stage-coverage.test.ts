import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Every test file in a milestone pipeline is named by a stage, and every file a
 * stage names exists.
 *
 * ## Why this sits in the UNIT stage, which is M0's
 *
 * It asserts no M2 or M4 product surface. Plan section 40's 2026-09-24 amendment
 * moved the bounty-claim and replay-render assertions out of the M0 smoke because
 * a gate that asserts a milestone which does not exist yet cannot be green, and
 * this file asserts nothing about whether a bounty completes or a replay renders.
 * What it asserts is the SHAPE of those two pipelines, which is the same job
 * `tests/unit/no-orphan-tests.test.ts` does for M0's own globs — and it runs here
 * so a milestone stage cannot be dropped the day the milestone is declared done.
 *
 * ## The hole this closes
 *
 * `scripts/lib/pipeline.sh` runs ONE named file per milestone stage rather than
 * a directory glob, and the reason is in its own comment: a stage that ran
 * everything under `tests/m2` would pull a new test into the pipeline by
 * accident, and the new test would then be in the gate by proximity rather than
 * by decision.
 *
 * That choice opens the opposite hole, and nothing else covered it. A file added
 * to `tests/m2/` is claimed by `vitest.m2.config.ts`, so `no-orphan-tests` is
 * satisfied; it is named by no stage, so `run_milestone_tests` never runs it; and
 * the M2 pipeline reports green over a stage set that has quietly stopped
 * testing something. A silently skipped test is worse than a missing one, because
 * a missing one shows up in the file list.
 *
 * Verified by mutation when it was written: adding an unreferenced file to
 * `tests/m4/` turns this red, and deleting a stage's file argument from
 * `scripts/test-m4.sh` turns it red the other way.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface Milestone {
  readonly id: string;
  readonly manifest: string;
  readonly runner: string;
  readonly config: string;
  readonly testDir: string;
}

const MILESTONES: readonly Milestone[] = [
  {
    id: 'm2',
    manifest: join(REPO_ROOT, 'scripts', 'stages-m2.manifest'),
    runner: join(REPO_ROOT, 'scripts', 'test-m2.sh'),
    config: 'vitest.m2.config.ts',
    testDir: 'm2',
  },
  {
    id: 'm4',
    manifest: join(REPO_ROOT, 'scripts', 'stages-m4.manifest'),
    runner: join(REPO_ROOT, 'scripts', 'test-m4.sh'),
    config: 'vitest.m4.config.ts',
    testDir: 'm4',
  },
];

/**
 * The `<config> <file>` pair of every `run_milestone_tests` call in a runner.
 *
 * The call is `run_milestone_tests <stage> <owner> \\ <config> <file>`, wrapped
 * across lines by the repository's formatting, so the backslash continuation is
 * a token of its own and a plain `\\S+` captures it as the config. The config is
 * matched by name instead, which does two useful things: it steps over the
 * continuation, and a stage that names some OTHER pipeline's config does not
 * silently satisfy the wrong milestone.
 *
 * Read the source rather than running the pipeline: this has to hold on a
 * checkout with no database and no docker, and a test that needs the thing it is
 * testing cannot be the one that says the thing is wired up.
 */
function filesNamedByStages(runner: string, config: string): readonly string[] {
  const source = readFileSync(runner, 'utf8');
  const pattern = new RegExp(
    `run_milestone_tests\\s+\\S+\\s+\\S+\\s*\\\\?\\s*(${config.replace(
      /\./g,
      '\\.',
    )})\\s*\\\\?\\s*(\\S+)`,
    'g',
  );
  return [...source.matchAll(pattern)].map(
    (match) => `${match[1] as string} ${match[2] as string}`,
  );
}

function testFilesIn(dir: string): readonly string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        // support/ holds shared fixtures, not suites. A `*.test.ts` in there
        // would be picked up by the config's include glob and is a file that
        // belongs somewhere else; skipping the directory here would hide it, so
        // the walk includes support/ and the coverage assertion below is what
        // would have to name it.
        walk(full);
      } else if (entry.endsWith('.test.ts')) {
        found.push(relative(REPO_ROOT, full).split(sep).join('/'));
      }
    }
  };
  walk(join(REPO_ROOT, 'tests', dir));
  return found;
}

describe.each(MILESTONES)('the $id milestone pipeline', (milestone) => {
  const present = existsSync(milestone.manifest) && existsSync(milestone.runner);

  it('has a manifest and a runner, so there is a stage set to check', () => {
    // The guard for every assertion below. A milestone whose files have been
    // deleted is not a milestone whose tests are uncovered; treating the two the
    // same would make this file pass on an empty tree, which is the shape of gate
    // that cannot fail.
    expect(present, `the ${milestone.id} pipeline is missing its manifest or its runner`).toBe(
      true,
    );
  });

  it('names a real file for every stage that runs one', () => {
    if (!present) return;
    const named = filesNamedByStages(milestone.runner, milestone.config);

    expect(named.length, `no ${milestone.id} stage names a test file`).toBeGreaterThan(0);
    for (const entry of named) {
      const [config, file] = entry.split(' ');
      expect(config, 'a stage named a file without naming its vitest config').toBe(
        milestone.config,
      );
      expect(
        existsSync(join(REPO_ROOT, 'tests', file as string)),
        `the ${milestone.id} pipeline names tests/${file as string}, which does not exist`,
      ).toBe(true);
    }
  });

  it('is claimed by every test file in its directory, exactly once', () => {
    if (!present) return;
    // `run_milestone_tests` takes a path relative to `tests/`, because that is
    // how the pipeline invokes vitest. Prefixed here so the two sides are the
    // same string rather than two spellings of the same file, which is a
    // comparison that fails for a reason nobody can see.
    const named = filesNamedByStages(milestone.runner, milestone.config).map(
      (entry) => `tests/${entry.split(' ')[1] as string}`,
    );
    const presentFiles = testFilesIn(milestone.testDir);

    const unclaimed = presentFiles.filter((file) => !named.includes(file));
    expect(
      unclaimed,
      `a test file in tests/${milestone.testDir} is in the vitest config and in no ${milestone.id} stage, ` +
        'so nothing runs it and the pipeline reports green over it',
    ).toEqual([]);

    // Exactly once rather than at least once. Two stages naming the same file
    // means the same assertions run twice, and a stage that appears to cover
    // something because a second stage also names it is a stage whose removal
    // changes nothing.
    const counts = new Map<string, number>();
    for (const file of named) counts.set(file, (counts.get(file) ?? 0) + 1);
    const doubled = [...counts].filter(([, count]) => count > 1).map(([file]) => file);
    expect(doubled, `a ${milestone.id} stage names a file another stage already names`).toEqual([]);
  });
});
