import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { requireDatabaseUrl } from './env.js';
import * as schema from './schema/index.js';

const SCRIPT_POOL_MAX_CONNECTIONS = 4;

export type Database = NodePgDatabase<typeof schema>;

export function createDatabasePool(): Pool {
  return new Pool({
    connectionString: requireDatabaseUrl(),
    max: SCRIPT_POOL_MAX_CONNECTIONS,
  });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

export async function closeDatabasePool(pool: Pool): Promise<void> {
  await pool.end();
}
