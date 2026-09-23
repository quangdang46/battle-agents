import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'drizzle-kit';

// drizzle-kit bundles this file as CommonJS and resolves its paths from the
// working directory, so it deliberately imports nothing from the rest of
// `drizzle/`.
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const ENV_FILE_NAME = '.env';

// `drizzle-kit generate` only diffs the schema against the journal, so it must
// not fail on a machine with no database. Commands that do connect surface a
// connection error instead, and `db:seed` reports a missing variable directly.
const OFFLINE_GENERATION_URL = 'postgresql://offline:offline@127.0.0.1:5432/offline';

function readDatabaseUrl(): string {
  const envFilePath = resolve(process.cwd(), ENV_FILE_NAME);
  if (existsSync(envFilePath)) {
    process.loadEnvFile(envFilePath);
  }
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  return connectionString !== undefined && connectionString.trim() !== ''
    ? connectionString
    : OFFLINE_GENERATION_URL;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema/index.ts',
  out: './drizzle/migrations',
  dbCredentials: { url: readDatabaseUrl() },
  strict: true,
  verbose: true,
});
