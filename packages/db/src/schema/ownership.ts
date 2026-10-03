/**
 * Ownership manifests decide which boundary may migrate which table. A platform
 * table added later must not require editing a feature migration, and vice
 * versa, so the split is data the verification step asserts rather than a note.
 *
 * Every feature package was removed from this repository, so FEATURE_TABLES is
 * empty. The boundary is kept: an extension package that is added back
 * registers its own tables here, and the verifier refuses a table that is in
 * neither list, which is the failure that makes a table nobody may migrate.
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
  'feature_state',
  'installations',
  'projects',
  // The GitHub delivery ledger. It sits on the platform side because it belongs
  // to no feature — it records what an integration observed. Leaving it out of
  // both lists is not a neutral choice: the verifier reports a table in neither
  // as belonging to no boundary, and nothing may then migrate it.
  'github_delivery_claims',
] as const;

export type PlatformTable = (typeof PLATFORM_TABLES)[number];

/**
 * Tables an extension package may migrate.
 *
 * Empty. A table that an extension adds belongs here, and until one does the
 * verifier's "in neither list" failure is what stops a table escaping both
 * boundaries.
 */
export const FEATURE_TABLES = [] as const;

export type FeatureTable = (typeof FEATURE_TABLES)[number];

export const OWNED_TABLES = [...PLATFORM_TABLES, ...FEATURE_TABLES] as const;

/**
 * The tables allowed to carry a `user_id` column, and what that column means in
 * each. A column here is a claim about ownership, which is why the verifier
 * treats one appearing anywhere else as a failure rather than a curiosity.
 *
 *   users-less entries (installations, agents, projects) reference the platform
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
