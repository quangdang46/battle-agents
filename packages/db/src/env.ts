import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const ENV_FILE_NAME = '.env';

/**
 * The repository root, so `.env` and the migrations folder can be found from
 * whichever directory a command happens to run in.
 *
 * Three levels up from this file: packages/db/src -> packages/db -> packages
 * -> the root. This was `..` while the package lived at the repository root,
 * and moving the directory without moving this line left every path resolving
 * one level short — which surfaced as "can't find meta/_journal.json" three
 * stages later rather than as a wrong REPO_ROOT.
 */
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      `${DATABASE_URL_VARIABLE} is not set. Copy .env.example to .env and fill in the local ` +
        'Postgres connection string, or export the variable before running this command.',
    );
    this.name = 'MissingDatabaseUrlError';
  }
}

function loadLocalEnvFile(): void {
  const envFilePath = resolve(REPO_ROOT, ENV_FILE_NAME);
  if (existsSync(envFilePath)) {
    process.loadEnvFile(envFilePath);
  }
}

export function requireDatabaseUrl(): string {
  loadLocalEnvFile();
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined || connectionString.trim() === '') {
    throw new MissingDatabaseUrlError();
  }
  return connectionString;
}
