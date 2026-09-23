import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const ENV_FILE_NAME = '.env';

export const REPO_ROOT = resolve(import.meta.dirname, '..');

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
