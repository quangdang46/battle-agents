import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The two mode vocabularies, and the copy of one that lives in the schema.
 *
 * ## What this is for
 *
 * Plan §11.3 named four bounty modes — Race, Open, Tournament, Team — and §10.3
 * named six battle modes, two of which (`team`, `tournament`) were the same
 * words. They answer different questions, and having two lists was defensible.
 * What was not defensible is two lists that share two words when both columns
 * are `text`: a caller resolving a mode through the wrong feature got a
 * plausible answer rather than an error. ba-bounty-modes-tiers-seasons-62l owns
 * that decision; this file is the check that keeps it made.
 *
 * ## Why the sources are READ and not IMPORTED
 *
 * `scripts/removal-test.sh` moves a feature's directory aside and then runs this
 * suite. A static import of @battle-agents/bounty would fail for every feature
 * it removed — the exact operation this repository is built on — and
 * tests/unit/mvp-scope.test.ts records having been caught exactly that way.
 * Reading the source costs nothing here and is what the two other cross-package
 * checks in this directory already do.
 *
 * ## What happens when a file is MISSING
 *
 * Silently. Not as an oversight: when the removal test moves
 * packages/features/bounty aside, this file and the feature's own co-located
 * tests disappear as a unit, and a check that insisted the taxonomy exist would
 * fail the operation the architecture exists to permit. The floor is not "the
 * file is here" — it is that whenever the file IS here, the extraction below
 * must succeed, which is the half that was silently checkable before.
 *
 * That floor is the whole reason `listFrom` throws. An extractor that returned
 * an empty array on a parse failure would make the disjointness assertion
 * trivially true — two empty sets share nothing — and the collision this file
 * exists to prevent would come back with every gate green.
 */

const repoRoot = resolve(import.meta.dirname, '../..');

const read = (...parts: string[]): string => readFileSync(join(repoRoot, ...parts), 'utf8');

/** The string literals of a `const NAME = [ ... ] as const` array, in order. */
function listFrom(source: string, name: string): string[] {
  const block = new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm').exec(source)?.[1];
  if (block === undefined) {
    throw new Error(
      `no ${name} = [ ... ] array in this source. A renamed or reformatted ` +
        'declaration must fail here rather than parse to an empty list, because an empty ' +
        'list satisfies "these two vocabularies share no words" trivially.',
    );
  }
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

/** The value of a `const NAME ... = '...'` string declaration. */
function stringFrom(source: string, name: string): string {
  const value = new RegExp(`${name}[^=]*=\\s*'([^']+)'`, 'm').exec(source)?.[1];
  if (value === undefined) {
    throw new Error(`no \`${name} = '...'\` string declaration in this source`);
  }
  return value;
}

/** The quoted values of a `CHECK (... IN ('a', 'b'))` expression. */
function checkListFrom(source: string, constraint: string): string[] {
  const statement = new RegExp(`'${constraint}'[\\s\\S]*?sql\`[^\`]*?IN \\(([^)]*)\\)\``).exec(
    source,
  )?.[1];
  if (statement === undefined) {
    throw new Error(`no CHECK named '${constraint}' with an IN (...) list in this source`);
  }
  return [...statement.matchAll(/'([^']+)'/g)].map((match) => match[1] as string);
}

/** The `SET "mode" = 'x' WHERE "mode" = 'y'` rewrites a migration performs. */
function backfillsFrom(source: string): Array<{ readonly from: string; readonly to: string }> {
  const statement = /UPDATE "bounties" SET "mode" = '([^']+)' WHERE "mode" = '([^']+)'/g;
  return [...source.matchAll(statement)].map((match) => ({
    to: match[1] as string,
    from: match[2] as string,
  }));
}

const bountyModesFile = join(repoRoot, 'packages/features/bounty/src/modes.ts');
const battleDomainFile = join(repoRoot, 'packages/features/battle/src/domain.ts');
const migrationFile = join(repoRoot, 'packages/db/migrations/0018_bounty_mode_vocabulary.sql');

/** The §11.3 words, written out. A test reading them from code proves nothing. */
const PLAN_SECTION_11_3 = ['Race', 'Open', 'Tournament', 'Team'];

describe('the bounty and battle vocabularies', () => {
  it('share no word, which is the collision this bead was opened to resolve', () => {
    if (!existsSync(bountyModesFile) || !existsSync(battleDomainFile)) return;
    const bounty = listFrom(read('packages/features/bounty/src/modes.ts'), 'BOUNTY_MODES');
    const battle = listFrom(read('packages/features/battle/src/domain.ts'), 'BATTLE_MODES');
    expect(bounty.length).toBeGreaterThan(0);
    expect(battle.length).toBeGreaterThan(0);
    const shared = bounty.filter((mode) => battle.includes(mode));
    expect(shared, `bounty and battle both call these '${shared.join("', '")}'`).toEqual([]);
  });

  it('covers all four §11.3 modes, by rule-name rather than by plan-name', () => {
    if (!existsSync(bountyModesFile)) return;
    const source = read('packages/features/bounty/src/modes.ts');
    const planNames = [...source.matchAll(/planName: '([^']+)'/g)].map((m) => m[1] as string);
    expect(planNames.sort()).toEqual([...PLAN_SECTION_11_3].sort());
  });
});

describe('the schema copy of the bounty taxonomy', () => {
  it('is the same list the feature declares', () => {
    if (!existsSync(bountyModesFile)) return;
    const feature = listFrom(read('packages/features/bounty/src/modes.ts'), 'BOUNTY_MODES');
    const schema = listFrom(read('packages/db/src/schema/features/bounty.ts'), 'BOUNTY_MODES');
    expect([...schema].sort()).toEqual([...feature].sort());
  });

  it('is the list the CHECK actually enforces', () => {
    const schema = read('packages/db/src/schema/features/bounty.ts');
    const declared = listFrom(schema, 'BOUNTY_MODES');
    const enforced = checkListFrom(schema, 'bounties_mode_known');
    // A schema that exports a list and checks a different one is two claims, and
    // the second is the one the database enforces.
    expect([...enforced].sort()).toEqual([...declared].sort());
  });

  it('agrees with the feature on the default', () => {
    if (!existsSync(bountyModesFile)) return;
    const feature = stringFrom(
      read('packages/features/bounty/src/modes.ts'),
      'DEFAULT_BOUNTY_MODE',
    );
    const schema = stringFrom(
      read('packages/db/src/schema/features/bounty.ts'),
      'DEFAULT_BOUNTY_MODE',
    );
    // Two literals for one default, which is the duplication this file exists to
    // bound. It is allowed only because something fails when they part.
    expect(schema).toBe(feature);
  });
});

describe('the rename was carried on live rows', () => {
  it('backfills every §11.3 name to the mode that replaced it', () => {
    expect(existsSync(migrationFile), '0018 is missing, so live rows kept the old names').toBe(
      true,
    );
    const backfills = backfillsFrom(read('packages/db/migrations/0018_bounty_mode_vocabulary.sql'));
    const migrated = backfills.map((rewrite) => rewrite.from).sort();
    // The four §11.3 words lowercased. A rename that backfilled three of them
    // leaves a row whose mode nothing can name, and the claim path would put it
    // on the older exclusive reading — the plausible-wrong-answer failure again,
    // one layer down.
    expect(migrated).toEqual(PLAN_SECTION_11_3.map((name) => name.toLowerCase()).sort());
  });

  it('backfills each old name to a mode the taxonomy now declares', () => {
    if (!existsSync(bountyModesFile)) return;
    const modes = listFrom(read('packages/features/bounty/src/modes.ts'), 'BOUNTY_MODES');
    for (const rewrite of backfillsFrom(
      read('packages/db/migrations/0018_bounty_mode_vocabulary.sql'),
    )) {
      expect(modes, `the migration writes a mode the feature does not declare`).toContain(
        rewrite.to,
      );
    }
  });

  it('is in the journal, so the runner will actually apply it', () => {
    // drizzle-kit keeps its ledger in `_journal.json` and nowhere else. A
    // migration file on disk that the journal does not name is a file nothing
    // runs, and the schema looks correct on a fresh database.
    const journal = JSON.parse(read('packages/db/migrations/meta/_journal.json')) as {
      entries?: Array<{ readonly idx: number; readonly tag: string }>;
    };
    const tags = (journal.entries ?? []).map((entry) => entry.tag);
    expect(tags).toContain('0018_bounty_mode_vocabulary');
  });
});
