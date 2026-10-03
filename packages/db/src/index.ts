/**
 * `@battle-agents/db` — the database client, the schema, and the repositories
 * that implement a storage contract.
 *
 * This is the infrastructure layer. Extensions may not import it, which is why
 * the repositories here match a host's interfaces structurally rather than
 * importing them: the two sides agree on a contract, and apps/web — the only
 * place allowed to see both — is where that agreement is checked.
 */
export * from './auth.js';
export { and, eq, or, sql } from 'drizzle-orm';
// Re-exported so a consumer can build a query without depending on drizzle
// directly. A caller that needs to delete a row is doing infrastructure work
// anyway, and making it add the driver as its own dependency would only let the
// two drift apart.
export { closeDatabasePool, createDatabase, createDatabasePool } from './client.js';
export type { Database } from './client.js';
export { applyMigrations } from './migrate.js';
export { DrizzleGithubDeliveryStore } from './repositories/github-deliveries.js';
export type {
  ClaimRow,
  ClaimStatus,
  DeliveryClaimStoreShape,
  DeliveryFactShape,
  PublishedFactShape,
} from './repositories/github-deliveries.js';
export { DrizzleCredentialStore } from './repositories/credentials.js';
export type { NewStoredCredential, StoredCredential } from './repositories/credentials.js';
export { DrizzleInstallationRepository } from './repositories/installations.js';
export type { InstallationOwner } from './repositories/installations.js';
export { DrizzleSessionRepository, DrizzleSessionSweeper } from './repositories/sessions.js';
export { DrizzleStateStore } from './repositories/state-store.js';
export { seedDatabase } from './seed/seed.js';
export * from './schema/index.js';