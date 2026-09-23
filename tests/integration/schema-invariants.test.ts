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
const AGENTS_TABLE = 'agents';
const SECRET_LIKE_COLUMN = /(token|secret|password|api_?key|credential)/i;
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

  it('enforces sessions.agent_id as a foreign key to agents specifically', async () => {
    // Asserting only "some foreign key exists on agent_id" is weak enough to
    // pass while the reference points somewhere inert, so the referenced table
    // is resolved rather than assumed.
    const result = await pool.query<{ referenced_table: string }>(
      `SELECT ref.relname AS referenced_table
         FROM pg_constraint con
         JOIN pg_class src ON src.oid = con.conrelid
         JOIN pg_class ref ON ref.oid = con.confrelid
        WHERE con.contype = 'f'
          AND src.relname = $1
          AND con.conkey[1] = (
            SELECT attnum FROM pg_attribute
             WHERE attrelid = con.conrelid AND attname = $2
          )`,
      [SESSIONS_TABLE, IDENTITY_COLUMN],
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.map((row) => row.referenced_table)).toContain(AGENTS_TABLE);
  });

  it('stores a token hash on agent_credentials and exposes no plaintext token column', async () => {
    // A raw token in the database is a credential leak on first backup.
    const columns = await columnsOf(CREDENTIALS_TABLE);
    expect(columns.has(TOKEN_HASH_COLUMN)).toBe(true);
    // A fixed word list missed "access_token". Anything that smells like a
    // credential has to be accounted for by name, and the only one that is
    // allowed is the hash.
    const secretish = [...columns].filter((column) => SECRET_LIKE_COLUMN.test(column));
    expect(secretish).toEqual([TOKEN_HASH_COLUMN]);
  });

  it('derives a bounty total from funding rows rather than a drifting scalar', async () => {
    // Two sponsors funding one bounty must not require a write to the bounty
    // row, otherwise the displayed total can disagree with the fund rows.
    const columns = await columnsOf(BOUNTIES_TABLE);
    expect(columns.has(DENORMALIZED_TOTAL_COLUMN)).toBe(false);
  });

  it('keeps both the bounty and its funding rows', async () => {
    // The previous assertions only ever looked at bounties, so deleting that
    // table wholesale satisfied every one of them. Both halves of the pair are
    // checked, and the funding rows are checked to actually reference bounties.
    expect((await columnsOf(BOUNTIES_TABLE)).size).toBeGreaterThan(0);
    expect((await columnsOf(BOUNTY_FUNDS_TABLE)).has(MONEY_COLUMN)).toBe(true);

    const link = await pool.query<{ referenced_table: string }>(
      `SELECT ref.relname AS referenced_table
         FROM pg_constraint con
         JOIN pg_class src ON src.oid = con.conrelid
         JOIN pg_class ref ON ref.oid = con.confrelid
        WHERE con.contype = 'f' AND src.relname = $1 AND ref.relname = $2`,
      [BOUNTY_FUNDS_TABLE, BOUNTIES_TABLE],
    );
    expect(link.rows.length).toBeGreaterThan(0);
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
