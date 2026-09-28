import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A `set` clause belongs to a statement, and a statement with several rows has
 * one `set` for all of them.
 *
 * ## The defect, which was four of them
 *
 * `onConflictDoUpdate` takes a single `set`, applied to whichever row
 * conflicted. Every multi-row insert in the seed had exactly one, holding the
 * FIRST fixture's values, so re-seeding wrote the first row's data over every
 * other row in the statement:
 *
 *   agents       the opponent was renamed to the challenger's name, which
 *                collided with `agents_user_id_name_unique` and failed the whole
 *                seed on the second run
 *   sessions     the opponent took the challenger's status and harness ref
 *   agent_stats  the opponent took the challenger's eight skills, so
 *                `progression.read` answered both characters identically
 *   bounty_funds BOTH grants took the lead's amount — the one column here where
 *                being wrong is worth money
 *
 * Every one of them passed on a first run, because a conflict is what triggers
 * the `set`. The seed was only ever wrong when re-run, which is the one thing a
 * seed exists to be safe about.
 *
 * ## Why this reads source
 *
 * The damage is not observable from outside: the statements typecheck, they run,
 * and they leave the same row COUNTS, which is what `checkSeedIsIdempotent`
 * compares. A test that seeded a database and checked the amounts would be an
 * integration test that needs a migrated Postgres to assert something about four
 * literals, and the unit stage runs without one.
 *
 * So this asserts the SHAPE, which is where the bug is. It is narrower than it
 * looks: it does not claim the `set` values are right, only that no `set` is
 * asked to serve more than one row.
 */

/** The seed with comments removed, so prose cannot trip the shape checks. */
const CODE = readFileSync(fileURLToPath(new URL('./seed.ts', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/** The `.values(` argument, by balancing parentheses rather than by regex. */
function valuesArgument(source: string, open: number): string {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error('unbalanced .values( in seed.ts');
}

interface Insert {
  /** The line the insert starts on, for a failure message a human can use. */
  readonly line: number;
  /** How many rows the statement inserts. */
  readonly rows: 'one' | 'many';
  /** Which conflict clause the statement uses, if any. */
  readonly clause: 'update' | 'nothing' | undefined;
}

function inserts(): readonly Insert[] {
  const found: Insert[] = [];
  for (const match of CODE.matchAll(/\.values\(/g)) {
    const start = match.index ?? 0;
    const argument = valuesArgument(CODE, start + '.values'.length);
    // What follows the statement decides how it can be written. Stopping at the
    // next `.insert(` keeps one statement's clause from being read as another's.
    const rest = CODE.slice(start);
    const nextInsert = rest.indexOf('.insert(', 1);
    const boundary = nextInsert === -1 ? rest : rest.slice(0, nextInsert);
    const clause = boundary.includes('.onConflictDoNothing(')
      ? 'nothing'
      : boundary.includes('.onConflictDoUpdate(')
        ? 'update'
        : undefined;
    found.push({
      line: CODE.slice(0, start).split('\n').length,
      rows: argument.trimStart().startsWith('[') ? 'many' : 'one',
      clause,
    });
  }
  return found;
}

describe('a multi-row seed statement must not carry one set for all its rows', () => {
  it('has no multi-row insert with an onConflictDoUpdate', () => {
    const offenders = inserts()
      .filter((insert) => insert.rows === 'many' && insert.clause === 'update')
      .map((insert) => `seed.ts:${String(insert.line)} upserts several rows with one set`);
    expect(offenders).toEqual([]);
  });

  it('has at least one multi-row insert, so the check above is not vacuous', () => {
    // A check that passes because it matched nothing is the failure this whole
    // repository keeps making. The seed really does have multi-row inserts —
    // it had four — so if that stops being true this test says so rather than
    // letting the rule above pass by finding nothing to complain about.
    expect(inserts().filter((insert) => insert.rows === 'many').length).toBeGreaterThan(0);
  });

  it('never asks drizzle for an update with nothing to set', () => {
    // `onConflictDoUpdate({ set: {} })` reads as "set nothing" and is not:
    // drizzle's `mapUpdateSet` throws "No values to set" while BUILDING the
    // query, so the statement never runs at all. The comment above that call
    // said the empty set was a deliberate decision, above a crash. Doing
    // nothing is `onConflictDoNothing`.
    expect(CODE).not.toMatch(/set:\s*\{\s*\}/);
  });
});
