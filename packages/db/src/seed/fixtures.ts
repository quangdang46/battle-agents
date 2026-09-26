import { createHash } from 'node:crypto';

import type {
  BattleWeights,
  achievements,
  agentCredentials,
  agentStats,
  agents,
  battleParticipants,
  battles,
  bountyFunds,
  bounties,
  eventLog,
  installations,
  messages,
  projects,
  quests,
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
  quest: seededUuid('000000000009'),
  bounty: seededUuid('00000000000a'),
  leadFunding: seededUuid('00000000000b'),
  matchingFunding: seededUuid('00000000000c'),
  battle: seededUuid('00000000000d'),
  achievement: seededUuid('00000000000e'),
  message: seededUuid('00000000000f'),
  sessionStartedEvent: 1,
  bountyClaimedEvent: 2,
  testPassedEvent: 3,
} as const;

/**
 * A local-only fixture credential so the E2E smoke has something to present.
 * Real issuance, rotation and hashing live with the agent-credentials feature.
 */
export const LOCAL_DEV_AGENT_TOKEN = 'local-dev-agent-token';

const LEAD_FUNDING_CENTS = 12_500;
const MATCHING_FUNDING_CENTS = 7_500;

function hashSeedToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const BATTLE_WEIGHTS: BattleWeights = {
  correctness: 0.5,
  tests: 0.2,
  regression: 0.1,
  quality: 0.1,
  efficiency: 0.1,
};

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

export const SEED_QUEST: typeof quests.$inferInsert = {
  id: SEED_IDS.quest,
  projectId: SEED_IDS.project,
  title: 'Fix the flaky auth redirect',
  body: 'The OAuth callback loses the return path under concurrent logins.',
  difficulty: 2,
  xpReward: 250,
  status: 'open',
};

export const SEED_BOUNTY: typeof bounties.$inferInsert = {
  id: SEED_IDS.bounty,
  questId: SEED_IDS.quest,
  repoOwner: 'battle-agents',
  repoName: 'local-dojo',
  issueNumber: 42,
  issueUrl: 'https://github.com/battle-agents/local-dojo/issues/42',
  currency: 'USD',
  requirements: ['regression test', 'changelog entry'],
  status: 'open',
  sponsorUserId: SEED_IDS.user,
  claimedAgentId: null,
  prUrl: null,
  paidAt: null,
  expiresAt: null,
};

export const SEED_LEAD_FUNDING: typeof bountyFunds.$inferInsert = {
  id: SEED_IDS.leadFunding,
  bountyId: SEED_IDS.bounty,
  sponsorUserId: SEED_IDS.user,
  amountCents: LEAD_FUNDING_CENTS,
};

export const SEED_MATCHING_FUNDING: typeof bountyFunds.$inferInsert = {
  id: SEED_IDS.matchingFunding,
  bountyId: SEED_IDS.bounty,
  sponsorUserId: SEED_IDS.user,
  amountCents: MATCHING_FUNDING_CENTS,
};

export const SEEDED_BOUNTY_TOTAL_CENTS = LEAD_FUNDING_CENTS + MATCHING_FUNDING_CENTS;

/**
 * A battle between the two seeded agents, on the seeded bounty.
 *
 * `speed`, and not the `ranked` this fixture used to carry. The mode column takes
 * any string — the taxonomy belongs to another bead and the feature answers
 * fail-closed for a value it does not recognise — but `ranked` is a name nothing
 * in this repository defines, and a seed row whose mode no reader can interpret
 * is a fixture that teaches the wrong thing. `speed` is one of the six the plan
 * names for M4.
 *
 * No `winnerSessionId` and no `won` flag: this battle is still running, and the
 * winner of a finished battle is a flag on the participant rows rather than a
 * column that can hold only one of a shared win's two winners.
 */
export const SEED_BATTLE: typeof battles.$inferInsert = {
  id: SEED_IDS.battle,
  mode: 'speed',
  bountyId: SEED_IDS.bounty,
  weightsJson: BATTLE_WEIGHTS,
  status: 'running',
  replayJson: null,
  finishedAt: null,
};

export const SEED_BATTLE_PARTICIPANTS: readonly (typeof battleParticipants.$inferInsert)[] = [
  {
    battleId: SEED_IDS.battle,
    sessionId: SEED_IDS.challengerSession,
    scoreJson: { total: 0.92, contributions: [] },
    won: 0,
  },
  {
    battleId: SEED_IDS.battle,
    sessionId: SEED_IDS.opponentSession,
    scoreJson: { total: 0.81, contributions: [] },
    won: 0,
  },
];

export const SEED_AGENT_STATS: readonly (typeof agentStats.$inferInsert)[] = [
  {
    agentId: SEED_IDS.challengerAgent,
    prsOpened: 3,
    prsMerged: 2,
    prsRejected: 0,
    testsPassed: 41,
    testsFailed: 2,
    recoveries: 1,
    battlesWon: 1,
    battlesLost: 0,
    skillsJson: { typescript: 12, refactor: 5 },
  },
  {
    agentId: SEED_IDS.opponentAgent,
    prsOpened: 1,
    prsMerged: 0,
    prsRejected: 1,
    testsPassed: 18,
    testsFailed: 5,
    recoveries: 2,
    battlesWon: 0,
    battlesLost: 1,
    skillsJson: { rust: 9 },
  },
];

export const SEED_ACHIEVEMENT: typeof achievements.$inferInsert = {
  id: SEED_IDS.achievement,
  agentId: SEED_IDS.challengerAgent,
  code: 'first_blood',
};

export const SEED_MESSAGE: typeof messages.$inferInsert = {
  id: SEED_IDS.message,
  fromAgentId: SEED_IDS.challengerAgent,
  toAgentId: SEED_IDS.opponentAgent,
  guildId: null,
  body: 'Good luck on issue 42.',
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
    id: SEED_IDS.bountyClaimedEvent,
    type: 'bounty.claimed',
    actorId: SEED_IDS.opponentAgent,
    sessionId: SEED_IDS.opponentSession,
    causationId: null,
    payload: { bountyId: SEED_IDS.bounty },
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
