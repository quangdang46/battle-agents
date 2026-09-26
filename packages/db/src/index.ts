/**
 * `@battle-agents/db` — the database client, the schema, and the repositories
 * that implement a feature's storage contract.
 *
 * This is the infrastructure layer. Features may not import it, which is why
 * the repositories here match the features' interfaces structurally rather than
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
export { DrizzleActivityLog, DEFAULT_TRAIL_LIMIT } from './repositories/activity.js';
export type { ActivityLogEntry, ActivityTrailQuery } from './repositories/activity.js';
export {
  AGENT_NAME_TAKEN,
  AGENT_NOT_OWNED,
  DrizzleAgentRepository,
} from './repositories/agents.js';
export type { AgentRow, StoredInstallationRow } from './repositories/agents.js';
export { DrizzleProgressionRepository } from './repositories/progression.js';
export { DrizzleBountyRepository, DrizzlePayoutIntentStore } from './repositories/bounties.js';
export type { StoredPayoutIntent } from './repositories/bounties.js';
export { DrizzleGithubDeliveryStore } from './repositories/github-deliveries.js';
export type {
  ClaimRow,
  ClaimStatus,
  DeliveryClaimStoreShape,
  DeliveryFactShape,
  PublishedFactShape,
} from './repositories/github-deliveries.js';
export { DrizzleReputationRepository } from './repositories/reputation.js';
export type {
  ReputationOutcomeKind,
  ReputationOutcomeRow,
  ReputationRow,
  ReputationStore,
} from './repositories/reputation.js';
export type {
  ProgressionRow,
  ProgressionStore,
  NewProgressRow,
} from './repositories/progression.js';
export { DrizzleQuestRepository } from './repositories/quests.js';
export { DrizzleCredentialStore } from './repositories/credentials.js';
export type { NewStoredCredential, StoredCredential } from './repositories/credentials.js';
export { DrizzleSocialRepository } from './repositories/social.js';
export type {
  NewSocialMessageRow,
  SocialBoardMetric,
  SocialBoardQuery,
  SocialLeaderboardRow,
  SocialMessageRow,
  SocialProfileRow,
  SocialStore,
} from './repositories/social.js';
export { DrizzleSessionRepository, DrizzleSessionSweeper } from './repositories/sessions.js';
export { DrizzleStateStore } from './repositories/state-store.js';
export { seedDatabase } from './seed/seed.js';
export * from './schema/index.js';
