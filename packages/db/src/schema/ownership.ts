/**
 * Ownership manifests decide which boundary may migrate which table. A platform
 * table added later must not require editing a feature migration, and vice
 * versa, so the split is data the verification step asserts rather than a note.
 */

// Better Auth owns these and nothing else may migrate them (plan section 38): the
// human login, its sessions, its linked OAuth accounts and its verifications.
//
// They sit inside PLATFORM_TABLES rather than in a set of their own because the
// question the verifier asks is "is this table assigned to a boundary that may
// migrate it", and inventing a third boundary for four tables the auth library
// owns would answer a question nobody asked.
export const PLATFORM_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'users',
  'agents',
  'agent_credentials',
  'sessions',
  'event_log',
  'installations',
  'projects',
  // The GitHub delivery ledger, added by ba-github-infrastructure-56v. It sits
  // on the platform side because neither list is really about ownership in the
  // abstract: FEATURE_TABLES is "a feature may migrate this", and this table
  // belongs to no feature — it records what an integration observed, and the
  // bounty feature reads the published facts rather than owning them. Leaving
  // it out of both lists is not a neutral choice: the verifier reports a table
  // in neither as belonging to no boundary, and nothing may then migrate it.
  'github_delivery_claims',
] as const;

export type PlatformTable = (typeof PLATFORM_TABLES)[number];

export const FEATURE_TABLES = [
  'quests',
  'bounties',
  'bounty_funds',
  // Added by ba-feature-bounty-xhk. It is a feature table rather than a
  // platform one for the same reason bounty_funds is: the bounty feature is the
  // only thing that reads or writes it, and "belongs to no boundary" is what
  // the verifier reports for a table missing from both lists — which is how a
  // table ends up that nothing may migrate.
  'payout_intents',
  'battles',
  'battle_participants',
  'agent_stats',
  // The reputation feature added this table in ba-feature-reputation-nnj and the
  // verifier caught it on the next schema-drift stage: a table that is not in
  // either list belongs to no boundary, so nothing may migrate it and nothing
  // asserts its invariants. That is the split doing its job — the failure was
  // the manifest being one commit behind the schema, not the check.
  'agent_reputation',
  'achievements',
  'messages',
] as const;

export type FeatureTable = (typeof FEATURE_TABLES)[number];

export const OWNED_TABLES = [...PLATFORM_TABLES, ...FEATURE_TABLES] as const;

/**
 * The tables allowed to carry a `user_id` column, and what that column means in
 * each. A column here is a claim about ownership, which is why the verifier
 * treats one appearing anywhere else as a failure rather than a curiosity.
 *
 *   users-less entries (installations, agents, projects) reference the GAME
 *     account, and are what every ownership check in the codebase is written
 *     against.
 *
 *   session, account reference the AUTH user — the Better Auth row, not ours.
 *     They are the same name for a different thing, which is the entire reason
 *     section 38 insists the two never merge. Listing them explicitly is how a
 *     reader learns that, instead of inferring it from a column name.
 */
export const PLATFORM_TABLES_OWNING_USER_ID = [
  'installations',
  'agents',
  'projects',
  'session',
  'account',
] as const;
