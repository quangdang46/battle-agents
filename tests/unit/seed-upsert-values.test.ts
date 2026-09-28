import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The seed's upserts set VALUES, not columns.
 *
 * ## The failure
 *
 * Five `onConflictDoUpdate` calls in `packages/db/src/seed/seed.ts` set a drizzle
 * `Column` instead of the fixture's value:
 *
 *     set: { amountCents: bountyFunds.amountCents }
 *
 * A drizzle `Column` is a perfectly legal value for `set`. It typechecks, it
 * compiles, and Postgres accepts it — rendering the statement as
 *
 *     "amount_cents" = "bounty_funds"."amount_cents"
 *
 * which is a tautology. The upsert runs, reports success, and changes nothing.
 *
 * Two things made it survive. The first is that `checkSeedIsIdempotent` compares
 * row COUNTS between two seed runs, and a no-op upsert leaves the count
 * identical — so the one check that ought to have caught it was structurally
 * unable to. The second is that the column it broke is `amountCents`, on
 * `bounty_funds`: a money column, where being wrong is worth something and
 * where the number looks plausible afterwards.
 *
 * ## Why this is a static check and not a runtime one
 *
 * A runtime check would have to run the seed and compare VALUES, which means a
 * database, which means the check cannot live in the unit stage. This one reads
 * the source and fails on the SHAPE — and the shape is the whole defect: a value
 * that is a `Column` is a tautology by construction, whatever it is called.
 */
const SEED_SOURCE = join(process.cwd(), 'packages', 'db', 'src', 'seed', 'seed.ts');

/**
 * The `set: { … }` block of every upsert, as source text.
 *
 * Brace-counted rather than matched with a regular expression, because a
 * multi-line `set` containing a nested object defeats any pattern that stops at
 * the first `}`. The first version of this found 4 of 13 blocks and would have
 * reported success while checking a quarter of the file — which is the same
 * failure as the one it is written to catch, one level up.
 */
function upsertSetBlocks(source: string): string[] {
  const blocks: string[] = [];
  const opener = /set:\s*\{/g;
  for (const match of source.matchAll(opener)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(source.slice(match.index, index + 1));
          break;
        }
      }
    }
  }
  return blocks;
}

/**
 * The drizzle table identifiers the seed imports.
 *
 * A tautological `set` names a `Column`, and a `Column` is reached as
 * `<table>.<column>` where `<table>` is one of these. Matching on the actual
 * import list is what makes the rule mean something: the previous version
 * matched any `lowercase.identifier`, which also matched a loop variable over
 * fixtures — `set: { amountCents: funding.amountCents }` was reported as a
 * tautology, and the check was one rename away from being right for the wrong
 * reason. It is now narrower in form and wider in coverage: every table the
 * seed can possibly be tautological about is checked, rather than whichever ones
 * happen to start with a lowercase letter.
 */
function importedTables(source: string): ReadonlySet<string> {
  const importBlock = source.match(/import \{([\s\S]*?)\} from '\.\.\/schema\/index\.js';/);
  return new Set(
    (importBlock?.[1] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => /^[a-z][A-Za-z]*$/.test(name)),
  );
}

describe('the seed sets values, never columns', () => {
  const source = readFileSync(SEED_SOURCE, 'utf8');
  const tables = importedTables(source);

  it('finds the upserts to check, so an empty match is not a pass', () => {
    // A scan that matches nothing is a scan that reports success forever. This
    // is the assertion that makes the rule below mean something.
    expect(upsertSetBlocks(source).length).toBeGreaterThan(10);
  });

  it('finds the tables a tautology could name, so an empty match is not a pass', () => {
    // Same reason as above, one level down: a rule keyed off a list that came
    // back empty would reject nothing and pass forever.
    expect(tables.size).toBeGreaterThan(10);
    expect([...tables]).toContain('bountyFunds');
  });

  it('sets no field to a table.column reference', () => {
    const offenders = upsertSetBlocks(source)
      .flatMap((block) => block.split('\n'))
      .filter((line) =>
        [...tables].some((table) =>
          new RegExp(`:\\s*${table}\\.[a-z][A-Za-z]*\\s*[},]`).test(line),
        ),
      )
      .map((line) => line.trim());

    expect(offenders).toEqual([]);
  });

  it('sets each funding amount from its own fixture, which is the money column', () => {
    // Both grants, not one. The multi-row form of this statement gave BOTH rows
    // the lead's amount on a re-seed, and a check that only looked for the lead's
    // name could not have seen it — that check would have passed on the broken
    // version for exactly the reason it passed on the tautology.
    const statement = source.match(
      /for \(const funding of \[([^\]]*)\]\)[\s\S]*?insert\(bountyFunds\)[\s\S]*?set: \{([^}]*)\}/,
    );
    expect(statement).not.toBeNull();
    expect(statement?.[1]).toContain('SEED_LEAD_FUNDING');
    expect(statement?.[1]).toContain('SEED_MATCHING_FUNDING');
    expect(statement?.[2]).toMatch(/amountCents:\s*funding\.amountCents/);
  });
});
