import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { Database } from './client.js';
import { REPO_ROOT } from './env.js';

export const MIGRATIONS_FOLDER = resolve(REPO_ROOT, 'drizzle', 'migrations');

export async function applyMigrations(database: Database): Promise<void> {
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}
