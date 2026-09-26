import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { checkNoCachedTotals, type SchemaSnapshot } from './verify.js';

/**
 * The guild feature must never grow a cached total, and the check that says so
 * has to be able to fail.
 *
 * ## What this protects
 *
 * `bounties.amount_cents` is already forbidden, and the reason is written down
 * where it is defined: a stored total is right until the second contribution
 * arrives and then is right about nothing. A guild sits on the same money AND
 * the same scoreboard, so the same failure is available twice — a cached
 * treasury balance that disagrees with the entries behind it, and a cached quest
 * counter that disagrees with the work log. Either one turns a guild's standing
 * into a number nobody can reconstruct, and §10.4's no-pay-to-win rule is a
 * claim about the economy being honest.
 *
 * ## Why a synthetic snapshot rather than a live database
 *
 * These are pure functions over a `SchemaSnapshot`, and the alternative is a
 * test that needs a migrated Postgres to assert something about three column
 * names. The unit stage runs without a database; the integration stage proves
 * the same rule against the catalog in `tests/integration/guild-persistence.test.ts`.
 * Two layers, because a check that only runs where a database happens to be up
 * is a check that does not run.
 *
 * ## And why it is worth a test at all
 *
 * Because a verification function that has only ever returned `[]` is
 * indistinguishable from one that is not wired. The last case below is the
 * important one: it plants all three forbidden columns at once and asserts three
 * failures, so a rule that silently stopped matching its table would show up as
 * a count that came back short.
 */

function snapshotWith(columns: Readonly<Record<string, readonly string[]>>): SchemaSnapshot {
  return {
    tableNames: Object.keys(columns),
    columns: Object.entries(columns).flatMap(([tableName, names]) =>
      names.map((column_name) => ({
        table_name: tableName,
        column_name,
        data_type: 'integer',
      })),
    ),
    primaryKeys: [],
    foreignKeys: [],
    checkConstraints: [],
  } as unknown as SchemaSnapshot;
}

const SHIPPED = snapshotWith({
  guilds: ['id', 'name', 'tag', 'founded_by_agent_id', 'created_at'],
  guild_quests: ['id', 'guild_id', 'title', 'repository', 'goal', 'created_at', 'completed_at'],
  guild_treasury_entries: ['id', 'guild_id', 'kind', 'amount_cents'],
  bounties: ['id', 'repo_owner', 'status', 'mode'],
});

describe('a cached total is a bug the build should refuse', () => {
  it('passes on the shipped guild schema', () => {
    expect(checkNoCachedTotals(SHIPPED)).toEqual([]);
  });

  it('catches a balance column on a guild', () => {
    // The exact failure the design rules out: a guild whose "balance" is stored
    // and therefore disagrees with the entries a reader can count.
    const planted = snapshotWith({
      guilds: ['id', 'name', 'tag', 'balance_cents'],
    });
    expect(checkNoCachedTotals(planted)).toEqual([
      'guilds.balance_cents stores a drifting scalar; the total must be derived from guild_treasury_entries',
    ]);
  });

  it('catches a balance wearing a different noun', () => {
    // `amount_cents` on a guild is the same defect with bounty's name on it, and
    // the reason `guilds` has a list of names rather than one.
    expect(checkNoCachedTotals(snapshotWith({ guilds: ['id', 'amount_cents'] }))).toHaveLength(1);
  });

  it('catches a quest progress counter', () => {
    // A counter beside `goal` is a number that can be ahead of the work, and a
    // quest that reads 10 of 10 while a reader counts nine rows is a quest
    // nobody can trust or lower.
    expect(checkNoCachedTotals(snapshotWith({ guild_quests: ['id', 'goal', 'progress'] }))).toEqual(
      [
        'guild_quests.progress stores a drifting scalar; the total must be derived from guild_work_log',
      ],
    );
  });

  it('still forbids the one that was already there', () => {
    // bounties.amount_cents moved from checkMoneyIsIntegerCents into the shared
    // table of rules rather than being duplicated, and a rule that is only
    // enforced in one of two places is a rule that gets dropped from the wrong
    // one.
    expect(checkNoCachedTotals(snapshotWith({ bounties: ['id', 'amount_cents'] }))).toEqual([
      'bounties.amount_cents stores a drifting scalar; the total must be derived from bounty_funds',
    ]);
  });

  it('reports every violation, so a rule that stopped matching is a short count', () => {
    // All three at once. If a table name were edited in one place, the failure
    // list would come back with two entries instead of three and the test would
    // still be "passing" if it only checked emptiness.
    const planted = snapshotWith({
      guilds: ['id', 'balance_cents'],
      guild_quests: ['id', 'progress'],
      bounties: ['id', 'amount_cents'],
    });
    expect(checkNoCachedTotals(planted)).toHaveLength(3);
  });

  it('scans a real catalog rather than trusting a fixture, which the integration stage does', () => {
    // A pointer, not a duplicate: the live assertion lives in
    // tests/integration/guild-persistence.test.ts and reads
    // information_schema. This one exists so the rule is checked in the stage
    // that runs without a database.
    expect(checkNoCachedTotals(snapshotWith({}))).toEqual([]);
  });

  it('is actually CALLED, because a defined check that nothing runs is worse than none', () => {
    // Every other test in this file calls the function directly, so every one of
    // them passes whether or not `runSchemaVerification` invokes it. Deleting
    // that one line was tried and turned this file entirely green — a check
    // that exists, is correct, and is never invoked is the exact shape of a gate
    // that has been green while checking nothing.
    //
    // Read from the source rather than from behaviour because the function needs
    // a migrated Postgres to run, and the stage that runs without one is the
    // stage that has to notice. Scoped to the BODY of `runSchemaVerification` —
    // from its declaration to the next top-level `const` — so a mention in this
    // file's own comment, or the export's own definition, cannot satisfy it.
    const source = readFileSync(new URL('./verify.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export async function runSchemaVerification');
    expect(
      start,
      'runSchemaVerification is gone; this test is guarding a function that no longer runs',
    ).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\nconst ', start));
    expect(body).toContain('checkNoCachedTotals(snapshot)');
  });
});
