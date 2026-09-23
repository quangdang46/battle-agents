import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Schema invariants, checked against a live Postgres.
 *
 * These are the constraints the plan treats as load-bearing rather than
 * stylistic. A comment in a schema file is not enforcement, so each one is
 * asserted against the catalog, which is what a runtime query would see.
 *
 * Requires DATABASE_URL pointing at a migrated database. When it is absent the
 * suite reports itself as unimplemented instead of silently passing: an empty
 * green suite is worse than a red one, because it reads as coverage.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 2;
const IDENTITY_COLUMN = 'agent_id';
const FORBIDDEN_IDENTITY_COLUMN = 'user_id';
const CREDENTIALS_TABLE = 'agent_credentials';
const TOKEN_HASH_COLUMN = 'token_hash';
const BOUNTIES_TABLE = 'bounties';
const DENORMALIZED_TOTAL_COLUMN = 'amount_cents';
const BOUNTY_FUNDS_TABLE = 'bounty_funds';
const MONEY_COLUMN = 'amount_cents';
const SESSIONS_TABLE = 'sessions';

interface ColumnRow {
  column_name: string;
}

let pool: Pool;

async function columnsOf(table: string): Promise<Set<string>> {
  const result = await pool.query<ColumnRow>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (!connectionString) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  await pool.query('SELECT 1');
});

afterAll(async () => {
  await pool?.end();
});

describe('schema invariants', () => {
  it('keys a session on agent_id, never on user_id', async () => {
    // Section 29.1 and 38: a session belongs to an Agent, and GitHub User ID is
    // not Agent ID, permanently. If sessions ever gained a user_id identity
    // column, one user's agents would silently merge with another's.
    const columns = await columnsOf(SESSIONS_TABLE);
    expect(columns.has(IDENTITY_COLUMN)).toBe(true);
    expect(columns.has(FORBIDDEN_IDENTITY_COLUMN)).toBe(false);
  });

  it('enforces sessions.agent_id as a foreign key to agents', async () => {
    const result = await pool.query<{ constraint_name: string }>(
      `SELECT tc.constraint_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1
          AND kcu.column_name = $2`,
      [SESSIONS_TABLE, IDENTITY_COLUMN],
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('stores a token hash on agent_credentials and exposes no plaintext token column', async () => {
    // A raw token in the database is a credential leak on first backup.
    const columns = await columnsOf(CREDENTIALS_TABLE);
    expect(columns.has(TOKEN_HASH_COLUMN)).toBe(true);
    for (const forbidden of ['token', 'secret', 'api_key', 'bearer']) {
      expect(columns.has(forbidden)).toBe(false);
    }
  });

  it('derives a bounty total from funding rows rather than a drifting scalar', async () => {
    // Two sponsors funding one bounty must not require a write to the bounty
    // row, otherwise the displayed total can disagree with the fund rows.
    const columns = await columnsOf(BOUNTIES_TABLE);
    expect(columns.has(DENORMALIZED_TOTAL_COLUMN)).toBe(false);
  });

  it('keeps money in integer cents on the funding rows', async () => {
    // A float amount cannot represent 0.10 exactly, so payouts drift by cents.
    // The column lives on bounty_funds because a bounty's total is the SUM of
    // its funding rows, not a scalar anyone can forget to update.
    const result = await pool.query<{ data_type: string }>(
      `SELECT data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [BOUNTY_FUNDS_TABLE, MONEY_COLUMN],
    );
    // noUncheckedIndexedAccess is on, so rows[0] is T | undefined. Asserting
    // length first does not narrow the type, so bind the value and assert on it.
    const [moneyColumn] = result.rows;
    expect(moneyColumn).toBeDefined();
    expect(moneyColumn?.data_type).toBe('integer');
  });
});
