import { createHash } from 'node:crypto';

import type {
  agentCredentials,
  agents,
  eventLog,
  installations,
  projects,
  sessions,
  users,
} from '../schema/index.js';

const UUID_PREFIX = '00000000-0000-4000-8000-';

function seededUuid(ordinal: string): string {
  return `${UUID_PREFIX}${ordinal}`;
}

export const SEED_IDS = {
  user: seededUuid('000000000001'),
  installation: seededUuid('000000000002'),
  challengerAgent: seededUuid('000000000003'),
  opponentAgent: seededUuid('000000000004'),
  project: seededUuid('000000000005'),
  credential: seededUuid('000000000006'),
  challengerSession: seededUuid('000000000007'),
  opponentSession: seededUuid('000000000008'),
  sessionStartedEvent: 1,
  testPassedEvent: 3,
} as const;

/**
 * A local-only fixture credential so the E2E smoke has something to present.
 * Real issuance, rotation and hashing live with the agent-credentials feature.
 */
export const LOCAL_DEV_AGENT_TOKEN = 'local-dev-agent-token';

function hashSeedToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const SEED_USER: typeof users.$inferInsert = {
  id: SEED_IDS.user,
  githubId: '1000001',
  login: 'local-developer',
  avatarUrl: null,
};

export const SEED_INSTALLATION: typeof installations.$inferInsert = {
  id: SEED_IDS.installation,
  userId: SEED_IDS.user,
  installationKey: 'local-installation-key',
  label: 'local docker',
  lastSeenAt: null,
};

export const SEED_PROJECT: typeof projects.$inferInsert = {
  id: SEED_IDS.project,
  userId: SEED_IDS.user,
  repoUrl: 'https://github.com/battle-agents/local-dojo',
  name: 'local-dojo',
};

export const SEED_CHALLENGER_AGENT: typeof agents.$inferInsert = {
  id: SEED_IDS.challengerAgent,
  userId: SEED_IDS.user,
  name: 'CodeKnight',
  harness: 'claude-code',
  level: 1,
  xp: 0,
  reputation: 0,
  build: null,
  status: 'offline',
  lastSeenAt: null,
};

export const SEED_OPPONENT_AGENT: typeof agents.$inferInsert = {
  ...SEED_CHALLENGER_AGENT,
  id: SEED_IDS.opponentAgent,
  name: 'RustMantis',
  harness: 'codex',
};

export const SEED_CREDENTIAL: typeof agentCredentials.$inferInsert = {
  id: SEED_IDS.credential,
  installationId: SEED_IDS.installation,
  agentId: SEED_IDS.challengerAgent,
  tokenHash: hashSeedToken(LOCAL_DEV_AGENT_TOKEN),
  scopes: ['agent:read', 'agent:write'],
  expiresAt: null,
  revokedAt: null,
};

export const SEED_CHALLENGER_SESSION: typeof sessions.$inferInsert = {
  id: SEED_IDS.challengerSession,
  agentId: SEED_IDS.challengerAgent,
  installationId: SEED_IDS.installation,
  projectId: SEED_IDS.project,
  harnessSessionRef: 'seed-session-challenger',
  status: 'active',
  endedAt: null,
  lastHeartbeatAt: null,
};

export const SEED_OPPONENT_SESSION: typeof sessions.$inferInsert = {
  ...SEED_CHALLENGER_SESSION,
  id: SEED_IDS.opponentSession,
  agentId: SEED_IDS.opponentAgent,
  harnessSessionRef: 'seed-session-opponent',
};

export const SEED_EVENTS: readonly (typeof eventLog.$inferInsert)[] = [
  {
    id: SEED_IDS.sessionStartedEvent,
    type: 'session.started',
    actorId: SEED_IDS.challengerAgent,
    sessionId: SEED_IDS.challengerSession,
    causationId: null,
    payload: { harness: 'claude-code' },
  },
  {
    id: SEED_IDS.testPassedEvent,
    type: 'test.passed',
    actorId: SEED_IDS.challengerAgent,
    sessionId: SEED_IDS.challengerSession,
    causationId: null,
    payload: { suite: 'unit' },
  },
];
