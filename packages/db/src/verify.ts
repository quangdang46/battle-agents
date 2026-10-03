import { sql } from 'drizzle-orm';

import { closeDatabasePool, createDatabase, createDatabasePool } from './client.js';
import { applyMigrations } from './migrate.js';
import {
  FEATURE_TABLES,
  OWNED_TABLES,
  PLATFORM_TABLES,
  PLATFORM_TABLES_OWNING_USER_ID,
} from './schema/ownership.js';
import { seedDatabase } from './seed/seed.js';
import type { Database } from './client.js';

const PUBLIC_SCHEMA = 'public';
const EVENTS_SEQUENCE_TABLE = 'event_log';
const EVENT_LOG_PROBE_TYPE = 'verify.probe';
const EVENT_LOG_PROBE_ACTOR = 'verify';

export class SchemaVerificationError extends Error {
  constructor(failures: readonly string[]) {
    super(`Schema verification failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`);
    this.name = 'SchemaVerificationError';
  }
}

interface TableNameRow {
  readonly table_name: string;
}

interface ColumnRow {
  readonly table_name: string;
  readonly column_name: string;
  readonly data_type: string;
}

interface ForeignKeyRow extends ColumnRow {
  readonly foreign_table_name: string;
  readonly foreign_column_name: string;
}

interface PrimaryKeyRow extends ColumnRow {
  readonly ordinal_position: number;
}

interface CheckConstraintRow {
  readonly table_name: string;
  readonly constraint_name: string;
  readonly check_clause: string;
}

interface CountRow {
  readonly row_count: number;
}

interface ProbeIdRow {
  readonly id: number;
}

export interface SchemaSnapshot {
  readonly tableNames: readonly string[];
  readonly columns: readonly ColumnRow[];
  readonly foreignKeys: readonly ForeignKeyRow[];
  readonly primaryKeys: readonly PrimaryKeyRow[];
  readonly checkConstraints: readonly CheckConstraintRow[];
}

async function readRows<TRow>(result: unknown, label: string): Promise<readonly TRow[]> {
  if (typeof result !== 'object' || result === null || !('rows' in result)) {
    throw new Error(`Expected ${label} to return a row array`);
  }
  const rows: unknown = (result as { rows: unknown }).rows;
  if (!Array.isArray(rows)) {
    throw new Error(`Expected ${label} rows to be an array`);
  }
  return rows as readonly TRow[];
}

async function readSchemaSnapshot(database: Database): Promise<SchemaSnapshot> {
  const tableNames = await readRows<TableNameRow>(
    await database.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = ${PUBLIC_SCHEMA} AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `),
    'tables',
  );

  const columns = await readRows<ColumnRow>(
    await database.execute(sql`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = ${PUBLIC_SCHEMA}
      ORDER BY table_name, ordinal_position
    `),
    'columns',
  );

  const foreignKeys = await readRows<ForeignKeyRow>(
    await database.execute(sql`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name,
             ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = ${PUBLIC_SCHEMA} AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, kcu.column_name
    `),
    'foreign keys',
  );

  const primaryKeys = await readRows<PrimaryKeyRow>(
    await database.execute(sql`
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = ${PUBLIC_SCHEMA} AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `),
    'primary keys',
  );

  const checkConstraints = await readRows<CheckConstraintRow>(
    await database.execute(sql`
      SELECT tc.table_name, tc.constraint_name, cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = ${PUBLIC_SCHEMA} AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name, cc.check_clause
    `),
    'check constraints',
  );

  return {
    tableNames: tableNames.map((row) => row.table_name),
    columns,
    foreignKeys,
    primaryKeys,
    checkConstraints,
  };
}

function columnNames(snapshot: SchemaSnapshot, tableName: string): readonly string[] {
  return snapshot.columns
    .filter((column) => column.table_name === tableName)
    .map((column) => column.column_name);
}

function findForeignKey(
  snapshot: SchemaSnapshot,
  tableName: string,
  columnName: string,
): ForeignKeyRow | undefined {
  return snapshot.foreignKeys.find(
    (key) => key.table_name === tableName && key.column_name === columnName,
  );
}

export function checkTablesExist(snapshot: SchemaSnapshot): readonly string[] {
  const actual = new Set(snapshot.tableNames);
  return OWNED_TABLES.filter((table) => !actual.has(table)).map(
    (table) => `missing table "${table}" from the platform/feature ownership manifest`,
  );
}

/**
 * Every check the schema declares, by table and name.
 *
 * `readSchemaSnapshot` has always collected `checkConstraints` and nothing has
 * ever read it, so deleting a constraint left the database able to accept a
 * negative amount while every gate stayed green: the money is enforced by
 * these constraints and by nothing else at the storage layer. A collected
 * field that no assertion reads is the same defect as no guard at all, so the
 * manifest is here and the check below is what reads it.
 *
 * Matching is by constraint NAME, not by clause text. Postgres reports every
 * NOT NULL as a CHECK, so `amount_cents IS NOT NULL` is a row in the same
 * table as the real money guard. A substring match on the column name is
 * satisfied by the NOT NULL row, which is a passing check that guards nothing.
 * The name is what distinguishes the constraint, and the clause is only read
 * to confirm it still mentions the column it is supposed to protect.
 */
const REQUIRED_CHECK_CONSTRAINTS: readonly {
  readonly table: string;
  readonly name: string;
  readonly mustMention: string;
}[] = [
  // Four survive, all on platform tables. The ten that named bounty_funds,
  // payout_intents, bounties, reputation_outcomes and agent_stats went with the
  // features that owned those tables and were dropped in
  // 0023_drop_feature_tables.sql — a constraint on a table that does not exist
  // is a check that cannot pass and does not guard anything, which is the shape
  // of gate this file exists to avoid. An extension that reinstates one of them
  // adds its entry back here.
  { table: 'agents', name: 'agents_level_min', mustMention: 'level' },
  { table: 'agents', name: 'agents_xp_non_negative', mustMention: 'xp' },
  { table: 'agents', name: 'agents_reputation_non_negative', mustMention: 'reputation' },
  { table: 'sessions', name: 'sessions_disconnected_has_ended_at', mustMention: 'ended_at' },
];

export function checkRequiredCheckConstraints(snapshot: SchemaSnapshot): readonly string[] {
  const problems: string[] = [];
  for (const required of REQUIRED_CHECK_CONSTRAINTS) {
    const found = snapshot.checkConstraints.find(
      (constraint) =>
        constraint.table_name === required.table && constraint.constraint_name === required.name,
    );
    if (found === undefined) {
      problems.push(`check constraint "${required.name}" is missing from "${required.table}"`);
      continue;
    }
    if (!found.check_clause.includes(required.mustMention)) {
      problems.push(
        `check constraint "${required.name}" no longer mentions ${required.mustMention}, ` +
          `so it no longer guards the column it was written for`,
      );
    }
  }
  return problems;
}

export function checkAgentIdentityInvariant(snapshot: SchemaSnapshot): readonly string[] {
  const failures: string[] = [];
  const sessionColumns = columnNames(snapshot, 'sessions');
  const agentIdKey = findForeignKey(snapshot, 'sessions', 'agent_id');

  if (!sessionColumns.includes('agent_id')) {
    failures.push('sessions.agent_id is missing; agent identity must hang off agents.id');
  }
  if (agentIdKey === undefined || agentIdKey.foreign_table_name !== 'agents') {
    failures.push('sessions.agent_id must reference agents.id');
  }

  const userScoped = sessionColumns.filter((column) => column.includes('user'));
  if (userScoped.length > 0) {
    failures.push(`sessions must carry no user identity column, found: ${userScoped.join(', ')}`);
  }
  return failures;
}

export function checkUserIdOwnership(snapshot: SchemaSnapshot): readonly string[] {
  const allowed = new Set<string>(PLATFORM_TABLES_OWNING_USER_ID);
  return snapshot.columns
    .filter((column) => column.column_name === 'user_id' && !allowed.has(column.table_name))
    .map((column) => `table "${column.table_name}" owns a user_id column outside the platform set`);
}

export function checkCredentialStoresOnlyHashes(snapshot: SchemaSnapshot): readonly string[] {
  const columns = columnNames(snapshot, 'agent_credentials');
  if (!columns.includes('token_hash')) {
    return ['agent_credentials.token_hash is missing'];
  }
  const rawTokenColumns = columns.filter(
    (column) => column.includes('token') && column !== 'token_hash',
  );
  return rawTokenColumns.map(
    (column) => `agent_credentials must not store a raw token, found column "${column}"`,
  );
}


export function checkPlatformAndFeatureSplit(snapshot: SchemaSnapshot): readonly string[] {
  const managed = new Set<string>([...PLATFORM_TABLES, ...FEATURE_TABLES]);
  return snapshot.tableNames
    .filter((table) => !managed.has(table) && !table.startsWith('drizzle'))
    .map((table) => `table "${table}" is not assigned to the platform or a feature`);
}


async function countRowsOwnedTables(database: Database): Promise<readonly number[]> {
  const counts: number[] = [];
  for (const table of OWNED_TABLES) {
    const rows = await readRows<CountRow>(
      await database.execute(
        sql`SELECT COUNT(*)::integer AS row_count FROM ${sql.identifier(table)}`,
      ),
      `count for ${table}`,
    );
    counts.push(rows[0]?.row_count ?? 0);
  }
  return counts;
}

async function checkSeedIsIdempotent(database: Database): Promise<readonly string[]> {
  await seedDatabase(database);
  const firstRun = await countRowsOwnedTables(database);
  await seedDatabase(database);
  const secondRun = await countRowsOwnedTables(database);

  return firstRun
    .map((count, index) => ({
      table: OWNED_TABLES[index] ?? 'unknown',
      count,
      after: secondRun[index],
    }))
    .filter(({ count, after }) => count !== after)
    .map(
      ({ table, count, after }) =>
        `re-running the seed changed "${table}" from ${String(count)} to ${String(after)} rows`,
    );
}

async function checkEventLogSequenceIsWritable(database: Database): Promise<readonly string[]> {
  try {
    const inserted = await database.execute(sql`
      INSERT INTO ${sql.identifier(EVENTS_SEQUENCE_TABLE)} (type, actor_id)
      VALUES (${EVENT_LOG_PROBE_TYPE}, ${EVENT_LOG_PROBE_ACTOR})
      RETURNING id
    `);
    const rows = await readRows<ProbeIdRow>(inserted, 'event log probe');
    return rows.length === 1
      ? []
      : ['event_log sequence is not writable after seeding explicit ids'];
  } catch {
    return ['event_log sequence is not writable after seeding explicit ids'];
  } finally {
    await removeEventLogProbe(database);
  }
}

async function removeEventLogProbe(database: Database): Promise<void> {
  await database.execute(sql`
    DELETE FROM ${sql.identifier(EVENTS_SEQUENCE_TABLE)}
    WHERE type = ${EVENT_LOG_PROBE_TYPE} AND actor_id = ${EVENT_LOG_PROBE_ACTOR}
  `);
}

export async function runSchemaVerification(database: Database): Promise<readonly string[]> {
  await applyMigrations(database);
  const snapshot = await readSchemaSnapshot(database);

  const failures: string[] = [
    ...checkTablesExist(snapshot),
    ...checkRequiredCheckConstraints(snapshot),
    ...checkPlatformAndFeatureSplit(snapshot),
    ...checkAgentIdentityInvariant(snapshot),
    ...checkUserIdOwnership(snapshot),
    ...checkCredentialStoresOnlyHashes(snapshot),
  ];

  failures.push(...(await checkSeedIsIdempotent(database)));
  failures.push(...(await checkEventLogSequenceIsWritable(database)));
  return failures;
}

// The migrations stage runs this before the seed exists, so it needs a mode
// that checks shape only. Without it, "db:verify -- --tables-only" would run the
// full data assertions and fail on an unseeded database, which is the opposite
// of what the flag is for.
const TABLES_ONLY_FLAG = '--tables-only';

async function verifyTablesExist(database: Database): Promise<readonly string[]> {
  const result = await database.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = ${PUBLIC_SCHEMA}`,
  );
  const present = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
  // `OWNED_TABLES` rather than a list written out here, and this is the one
  // place that difference showed up as a hole in the gate.
  //
  // The list this used to name thirty of the thirty-two tables in
  // `OWNED_TABLES` and never heard of `agent_reputation` or `agent_bases`, both
  // of which their feature migrations create. Dropping either one left this
  // reporting "Migrated tables are present" — the stage whose whole job is
  // proving the migration applied was the stage that had the hole, which is the
  // failure AGENTS.md names when it warns that a migration reporting success is
  // not proof. A second list was never going to stay current: the drift was
  // silent, and `pnpm db:seed` is what noticed the previous one, long after it
  // landed.
  return OWNED_TABLES.filter((table) => !present.has(table)).map(
    (table) => `table "${table}" does not exist, so the migration did not apply`,
  );
}

async function main(): Promise<void> {
  const pool = createDatabasePool();
  try {
    const database = createDatabase(pool);
    const tablesOnly = process.argv.includes(TABLES_ONLY_FLAG);
    const failures = tablesOnly
      ? await verifyTablesExist(database)
      : await runSchemaVerification(database);
    if (failures.length > 0) {
      throw new SchemaVerificationError(failures);
    }
    process.stdout.write(
      tablesOnly ? 'Migrated tables are present.\n' : 'Schema verification passed.\n',
    );
  } finally {
    await closeDatabasePool(pool);
  }
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
