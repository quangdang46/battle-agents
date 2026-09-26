import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BountyDetailPanel, BoardHeader, HotBounties } from './ui/board.js';
import { AgentCardPanel, AgentRoster } from './ui/roster.js';
import { TabStrip } from './ui/shell.js';
import { gateFor } from './ui/viewer-gate.js';
import type { BountyBoard, BountyBoardRow, BountyDetail } from './board-view.js';
import type { AgentCard, RosterEntry } from './roster-view.js';
import type { Viewer } from './viewer-view.js';

/**
 * What the pages put on screen, and what they leave off.
 *
 * WHICH PART OF THIS IS FAKED, AND WHICH IS NOT
 *
 * The view models below are CONSTRUCTED. They are the one thing faked in this
 * file, and the brief's rule for a fixture is that the test must also say what
 * the fixture stands in for — so:
 *
 *   THIS FILE proves the components render the values they are handed, and
 *   render nothing they are not. A component holding a hardcoded array fails
 *   every assertion below, because the values on screen would be its own.
 *
 *   tests/integration/web-ui-surface.test.ts proves the OTHER half: that the
 *   view models those components receive are built from the bounty and
 *   progression commands answering against a real database, and that the same
 *   components render THAT.
 *
 * Neither half is optional and neither was written first, because each one on
 * its own has a wrong version that passes: a component can render a hardcoded
 * list perfectly (caught here), and a read model can be correct while the page
 * shows something else (caught there).
 *
 * WHY THIS IS A UNIT TEST AND NOT AN INTEGRATION ONE
 *
 * The unit stage globs every test file under an app's `src` directory, and the
 * removal test runs that stage with one feature deleted at a time. A unit test
 * here that called the bounty list through the real runtime would fail the
 * removal test for a feature that is perfectly removable, so it must not — and
 * it does not: every import of a read model in this file is `import type`,
 * erased at runtime, so this loads react and three components and nothing else.
 */

const ROW: BountyBoardRow = {
  id: 'bounty-0001',
  rewardCents: 200_000,
  rewardLabel: '$2,000',
  currency: 'USD',
  repoLabel: 'verifier-board/replay-boundary',
  issueNumber: 4242,
  issueUrl: 'https://github.com/verifier-board/replay-boundary/issues/4242',
  status: 'open',
  mode: 'first-valid',
  sponsorCount: 2,
  claimedByAgentId: null,
  expiresLabel: '6d left',
};

const BOARD: BountyBoard = { rows: [ROW], totalCents: 200_000, openCount: 1 };

const DETAIL: BountyDetail = {
  ...ROW,
  requirements: ['keep the redacted fields redacted'],
  funds: [
    { sponsorUserId: 'user-a', amountCents: 150_000, label: '$1,500' },
    { sponsorUserId: 'user-b', amountCents: 50_000, label: '$500' },
  ],
  prUrl: 'https://github.com/verifier-board/replay-boundary/pull/7',
  mergedBy: null,
  payoutNotice: 'SANDBOX: this reward is a target, not a payment.',
  refundNotice: null,
  battle: { replayId: 'replay-abc', status: 'completed' },
};

const ONLINE: RosterEntry = {
  id: 'agent-online',
  name: 'Codex',
  harness: 'codex',
  level: 19,
  xp: 8_421,
  build: 'debugger',
  presence: 'online',
  lastSeenAt: '2026-09-26T11:59:30.000Z',
  lastSeenLabel: 'just now',
  sessionId: 'session-online',
  sessionStatus: 'active',
  currentQuest: 'Fix the memleak in the ingest pool',
};

const STALE: RosterEntry = {
  id: 'agent-stale',
  name: 'Claude',
  harness: 'claude',
  level: 18,
  xp: 7_100,
  build: 'researcher',
  // The row is still `active`; nothing has heartbeated for an hour. A roster
  // that trusted the status column would show this character as busy.
  presence: 'offline',
  lastSeenAt: '2026-09-26T11:00:00.000Z',
  lastSeenLabel: '1h ago',
  sessionId: 'session-stale',
  sessionStatus: 'active',
  currentQuest: null,
};

const NEVER: RosterEntry = {
  id: 'agent-never',
  name: 'Gemini',
  harness: 'gemini',
  level: 1,
  xp: 0,
  build: 'generalist',
  presence: 'offline',
  lastSeenAt: null,
  lastSeenLabel: 'never reported',
  sessionId: null,
  sessionStatus: null,
  currentQuest: null,
};

const CARD: AgentCard = {
  ...ONLINE,
  hasProgress: true,
  battlesWon: 12,
  battlesLost: 4,
  testsPassed: 88,
  pullRequestsMerged: 142,
  skills: [
    { skill: 'coding', level: 82, xp: 40_000 },
    { skill: 'debugging', level: 91, xp: 60_000 },
    { skill: 'testing', level: 76, xp: 20_000 },
  ],
};

function html(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('the bounty board', () => {
  it('renders the amount, the repository, the issue and the status it was handed', () => {
    const markup = html(createElement(HotBounties, { rows: [ROW] }));

    expect(markup).toContain('$2,000');
    expect(markup).toContain('verifier-board/replay-boundary');
    expect(markup).toContain('#4242');
    expect(markup).toContain('open');
    expect(markup).toContain('2 sponsors');
    expect(markup).toContain('6d left');
  });

  it('links each row at the bounty it came from', () => {
    expect(html(createElement(HotBounties, { rows: [ROW] }))).toContain(
      'href="/bounties/bounty-0001"',
    );
  });

  it('shows a real total, and not one it made up', () => {
    const header = html(createElement(BoardHeader, { board: BOARD }));
    expect(header).toContain('1 open of 1');
    expect(header).toContain('$2,000 on the board');
  });

  it('renders nothing a second board does not carry', () => {
    // The wrong implementation this catches is a row list that always shows the
    // plan's four example bounties. A distinctive repo and amount have to
    // arrive from props for this page to say anything at all.
    const markup = html(createElement(HotBounties, { rows: [ROW] }));
    expect(markup).not.toContain('SSO');
    expect(markup).not.toContain('memleak');
  });

  it('says why an empty board is empty and what fills it', () => {
    const markup = html(createElement(HotBounties, { rows: [] }));
    expect(markup).toContain('Nothing is on the board yet');
    expect(markup).toContain('bounty.create');
  });
});

describe('the bounty detail', () => {
  it('renders the repo, the reward, the requirements and the sponsors', () => {
    const markup = html(createElement(BountyDetailPanel, { bounty: DETAIL }));
    expect(markup).toContain('verifier-board/replay-boundary');
    expect(markup).toContain('#4242');
    expect(markup).toContain('$2,000');
    expect(markup).toContain('keep the redacted fields redacted');
    expect(markup).toContain('$1,500');
    expect(markup).toContain('$500');
  });

  it('carries the payout notice verbatim, because the platform holds no money', () => {
    expect(html(createElement(BountyDetailPanel, { bounty: DETAIL }))).toContain(
      'SANDBOX: this reward is a target, not a payment.',
    );
  });

  it('links into the replay the battle has a handle for', () => {
    expect(html(createElement(BountyDetailPanel, { bounty: DETAIL }))).toContain(
      'href="/replay/replay-abc"',
    );
  });

  it('offers no battle link when no battle has been fought', () => {
    const markup = html(createElement(BountyDetailPanel, { bounty: { ...DETAIL, battle: null } }));
    expect(markup).not.toContain('/replay/');
    expect(markup).toContain('No battle yet');
  });
});

describe('the roster', () => {
  it('renders a character whose session is stale, with the time it was last seen', () => {
    const markup = html(createElement(AgentRoster, { agents: [ONLINE, STALE, NEVER] }));
    expect(markup).toContain('Claude');
    expect(markup).toContain('1h ago');
  });

  it('renders a character that has never reported, rather than dropping it', () => {
    const markup = html(createElement(AgentRoster, { agents: [ONLINE, STALE, NEVER] }));
    expect(markup).toContain('Gemini');
    expect(markup).toContain('never reported');
  });

  it('renders a character with no session at all', () => {
    // The case a join against the live sessions drops, and the only one a
    // reader notices when they go looking for somebody.
    const markup = html(createElement(AgentRoster, { agents: [NEVER] }));
    expect(markup).toContain('Gemini');
  });

  it('renders every character it is given and filters none of them', () => {
    const markup = html(createElement(AgentRoster, { agents: [ONLINE, STALE, NEVER] }));
    for (const name of ['Codex', 'Claude', 'Gemini']) {
      expect(markup).toContain(name);
    }
  });

  it('marks the online one as online and the stale one as offline', () => {
    const markup = html(createElement(AgentRoster, { agents: [ONLINE, STALE] }));
    expect(markup).toContain('online');
    expect(markup).toContain('offline');
    // A presence dot is a real state, so the current one is a class rather than
    // a decoration. One row is online and the other is not.
    expect(markup.match(/presence--online/g)).toHaveLength(1);
  });
});

describe('the agent card', () => {
  it('renders the level, the quest, the session and the skill bars', () => {
    const markup = html(createElement(AgentCardPanel, { card: CARD }));
    expect(markup).toContain('Codex');
    expect(markup).toContain('Level 19');
    expect(markup).toContain('Fix the memleak in the ingest pool');
    expect(markup).toContain('session-online');
    expect(markup).toContain('debugging');
    expect(markup).toContain('82');
    expect(markup).toContain('91');
  });

  it('fills a bar in proportion to the level the feature awarded', () => {
    const markup = html(createElement(AgentCardPanel, { card: CARD }));
    // debugging 91 against a sheet whose highest is 91 is full; coding 82 is
    // not. A bar that is always 100% wide is decoration.
    expect(markup).toContain('width:90%');
    expect(markup).toContain('width:100%');
  });

  it('says a character has no recorded outcomes rather than showing zeroed bars', () => {
    const markup = html(
      createElement(AgentCardPanel, { card: { ...CARD, hasProgress: false, skills: [] } }),
    );
    expect(markup).toContain('no recorded outcomes');
    expect(markup).not.toContain('skill__bar');
  });

  it('counts the battles and the merges the card claims', () => {
    const markup = html(createElement(AgentCardPanel, { card: CARD }));
    expect(markup).toContain('142');
    expect(markup).toContain('88');
  });
});

describe('the tab strip', () => {
  it('marks the current tab and leaves the unbuilt ones as text', () => {
    const markup = html(createElement(TabStrip, { active: 'agents' }));
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/agents"');
    // A tab that looks live and 404s is a broken promise, so the ones with no
    // destination are not links at all.
    expect(markup).not.toContain('href="/arena"');
    expect(markup).not.toContain('href="/profile"');
    expect(markup).not.toContain('href="/quests"');
  });
});

describe('the gate in front of the board', () => {
  it('lets a signed-in reader through and shows them nothing', () => {
    expect(gateFor({ kind: 'signed-in', login: 'someone' })).toBeNull();
    expect(gateFor({ kind: 'signed-in', login: null })).toBeNull();
  });

  it('turns a signed-out reader away, and says where to sign in', () => {
    const markup = gate({ kind: 'signed-out' });
    expect(markup).toContain('Sign in to see the board');
    expect(markup).toContain('href="/api/auth/sign-in/social"');
    // The reason is on the page. A gate that only says "no" leaves a reader
    // guessing whether they are signed out, not allowed, or looking at a
    // broken build.
    expect(markup).toContain('not public');
  });

  it('tells an operator which variables are empty', () => {
    const markup = gate({ kind: 'auth-unconfigured', missing: ['BETTER_AUTH_SECRET'] });
    expect(markup).toContain('BETTER_AUTH_SECRET');
    expect(markup).toContain('not configured');
  });

  it('is not the same answer for signed out and unconfigured', () => {
    // The two look alike in a browser and mean different things to the person
    // looking, which is why the state is a union rather than a boolean.
    const out = gate({ kind: 'signed-out' });
    const unconfigured = gate({ kind: 'auth-unconfigured', missing: ['A'] });
    expect(out).not.toBe(unconfigured);
  });
});

/**
 * What a refusing viewer is shown, as markup.
 *
 * `gateFor` returns a NODE rather than a component, so this renders it inside a
 * wrapper and there is no component boundary to type around. A JSX expression
 * would be shorter and is a parse error in a `.ts` file.
 */
function gate(viewer: Viewer): string {
  return html(createElement('div', null, gateFor(viewer)));
}
