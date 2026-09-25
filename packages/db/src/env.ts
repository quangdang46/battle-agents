import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 *
 * The directory comes from `import.meta.url` rather than `import.meta.dirname`
 * because a bundler rewrites `import.meta` to an object that has no `dirname`,
 * and the result is `resolve(undefined, ...)` — which fails as a TypeError
 * inside a webpack chunk during `next build`, with nothing in this file's name
 * to point at the cause. tsc, vitest and the build disagreed about the same
 * code, and only the build could see it.
 */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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
