/**
 * Ownership manifests decide which boundary may migrate which table. A platform
 * table added later must not require editing a feature migration, and vice
 * versa, so the split is data the verification step asserts rather than a note.
 */
export const PLATFORM_TABLES = [
  'users',
  'agents',
  'agent_credentials',
  'sessions',
  'event_log',
  'installations',
  'projects',
] as const;

export type PlatformTable = (typeof PLATFORM_TABLES)[number];

export const FEATURE_TABLES = [
  'quests',
  'bounties',
  'bounty_funds',
  'battles',
  'battle_participants',
  'agent_stats',
  'achievements',
  'messages',
] as const;

export type FeatureTable = (typeof FEATURE_TABLES)[number];

export const OWNED_TABLES = [...PLATFORM_TABLES, ...FEATURE_TABLES] as const;

export const PLATFORM_TABLES_OWNING_USER_ID = ['installations', 'agents', 'projects'] as const;
