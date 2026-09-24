/**
 * `@battle-agents/db` — the database client, the schema, and the repositories
 * that implement a feature's storage contract.
 *
 * This is the infrastructure layer. Features may not import it, which is why
 * the repositories here match the features' interfaces structurally rather than
 * importing them: the two sides agree on a contract, and apps/web — the only
 * place allowed to see both — is where that agreement is checked.
 */
export { and, eq, or, sql } from 'drizzle-orm';
// Re-exported so a consumer can build a query without depending on drizzle
// directly. A caller that needs to delete a row is doing infrastructure work
// anyway, and making it add the driver as its own dependency would only let the
// two drift apart.
export { closeDatabasePool, createDatabase, createDatabasePool } from './client.js';
export type { Database } from './client.js';
export { applyMigrations } from './migrate.js';
export {
  AGENT_NAME_TAKEN,
  AGENT_NOT_OWNED,
  DrizzleAgentRepository,
} from './repositories/agents.js';
export type { AgentRow, StoredInstallationRow } from './repositories/agents.js';
export { seedDatabase } from './seed/seed.js';
export * from './schema/index.js';
