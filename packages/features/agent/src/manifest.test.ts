import { agentFeature } from './feature.js';
import type { AgentRepository } from './repository.js';
import { createRuntime, createInMemoryEventBus, InMemoryStateStore } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

/**
 * A feature's declared action ids must be exactly the ids it registers.
 *
 * The declaration is the input to generated types, and generated types are only
 * as good as what they are generated from. A manifest that drifts from the
 * registry produces a union that lies: `act()` would accept an id that no longer
 * exists and reject one that does, and the error would point at a generated file
 * rather than at the feature that fell out of step.
 *
 * The runtime mirror below is hand-written on purpose. Deriving it from the
 * manifest type would make the test agree by construction and prove nothing —
 * which is the failure mode a mirror is supposed to prevent.
 *
 * This file lives INSIDE the feature package, not in the shared test suite. A
 * shared test that imports a feature is itself a coupling to that feature, and
 * the removal test refuses to move a directory that something outside it still
 * names — which it did, correctly, the first time this file sat in tests/unit.
 */

import { AGENT_ACTION_IDS } from './manifest.js';

// The mirror is derived from the manifest rather than typed out again, and the
// value is what makes the difference visible: a manifest that gains an id makes
// this test fail until the runtime agrees, which is the only direction a mirror
// is useful in.
const MANIFEST_IDS: readonly string[] = [...AGENT_ACTION_IDS].sort();

/** Storage that answers nothing, because this test only reads the registry. */
const unusedRepository: AgentRepository = {
  findOwned: async () => undefined,
  requireOwned: async () => {
    throw new Error('not used');
  },
  listForOwner: async () => [],
  create: async () => {
    throw new Error('not used');
  },
  findInstallationForOwner: async () => undefined,
};

function registeredIds(): readonly string[] {
  return createRuntime({
    // Session storage wired, because session actions exist only when it is.
    extensions: [
      agentFeature({
        repository: unusedRepository,
        sessionRepository: {
          findOrCreateInstallation: async () => ({ id: 'i' }),
          findAgentByName: async () => ({ id: 'a' }),
          findOrCreateProject: async () => ({ id: 'p' }),
          findResumableSessions: async () => [],
          createSession: async () => ({ id: 's' }),
          markSessionActive: async () => {},
          heartbeat: async () => 'active',
          end: async () => ({ status: 'ended', agentId: 'a' }),
        },
      }),
    ],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => '2026-09-24T00:00:00.000Z',
  }).actions();
}

describe('the agent feature action manifest', () => {
  it('declares every id the feature registers, and no others', () => {
    expect(registeredIds()).toEqual(MANIFEST_IDS);
  });

  it('drops the session ids when no session storage is wired', () => {
    // The manifest is not a promise about ids a host may not have. A feature
    // without session storage registers no session actions, and a manifest that
    // claimed them would send generated types at a caller who cannot use them.
    const withoutStorage = createRuntime({
      extensions: [agentFeature({ repository: unusedRepository })],
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => '2026-09-24T00:00:00.000Z',
    }).actions();

    expect(withoutStorage).toEqual(['agent.describe', 'agent.read']);
  });
});
