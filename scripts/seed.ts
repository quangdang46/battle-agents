import { closeDatabasePool, createDatabase, createDatabasePool } from '../drizzle/client.js';
import { applyMigrations } from '../drizzle/migrate.js';
import { seedDatabase } from '../drizzle/seed/seed.js';

const SEED_COMPLETE_MESSAGE = 'Migrations applied and seed data is ready.';

async function runSeed(): Promise<void> {
  const pool = createDatabasePool();
  try {
    const database = createDatabase(pool);
    await applyMigrations(database);
    await seedDatabase(database);
    process.stdout.write(`${SEED_COMPLETE_MESSAGE}\n`);
  } finally {
    await closeDatabasePool(pool);
  }
}

function describeFailure(error: unknown): string {
  return error instanceof Error
    ? `Seed failed: ${error.message}`
    : 'Seed failed with an unknown error.';
}

try {
  await runSeed();
} catch (error: unknown) {
  process.stderr.write(`${describeFailure(error)}\n`);
  process.exitCode = 1;
}
