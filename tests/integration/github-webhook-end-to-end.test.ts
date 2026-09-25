import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { githubDeliveryClaims } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import { PULL_REQUEST_MERGED, signPayload, WEBHOOK_SECRET_VARIABLE } from '@battle-agents/github';

import { sharedGithubWebhook } from '../../apps/web/src/webhook-routes.js';
import type { WebhookHttpRequest } from '../../apps/web/src/webhook-routes.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';

/**
 * A signed delivery, all the way through, on the bus the app already uses.
 *
 * The unit suite proves the handler's ordering against fakes and the delivery
 * suite proves the ledger against real Postgres. Neither can catch the failure
 * this file exists for, because the thing that would break is a WIRING decision
 * neither of them sees: that the webhook publishes onto `sharedRuntime().bus`
 * rather than onto a runtime it built for itself.
 *
 * That wiring is not hypothetical. `shared-runtime.ts` exists because there used
 * to be two runtimes with two `createInMemoryEventBus()` instances, each
 * complete from the inside, publishing into different rooms. A merge published
 * onto a private bus would leave the operator stream, the SSE gateway and every
 * future subscriber empty while the webhook test suite stayed green.
 *
 * So the assertion here is deliberately indirect and behavioural: subscribe to
 * the shared bus the way the gateway does, post a delivery, and require the
 * event to arrive. It is written so that a second runtime fails it rather than
 * passing quietly.
 */

const SECRET = 'end-to-end-secret-not-real';
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const AT_REPOSITORY = 'acme/widgets';

function requireDatabase(): void {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
}

/**
 * A body GitHub would actually send: pretty-printed, with the fields the
 * normalizer reads. Pretty rather than compact on purpose — a compact body is
 * its own canonical form, so a handler that re-serialised the parsed object
 * before hashing would pass against a compact fixture and reject every real
 * delivery.
 */
function mergeBody(pullRequest: number): string {
  return JSON.stringify(
    {
      action: 'closed',
      repository: { full_name: AT_REPOSITORY },
      pull_request: {
        number: pullRequest,
        merged: true,
        merged_at: '2026-09-25T12:00:00Z',
        user: { login: 'octocat' },
      },
    },
    null,
    2,
  );
}

function delivery(options: {
  readonly body: string;
  readonly deliveryId: string;
  readonly signature?: string | null;
}): WebhookHttpRequest {
  return {
    method: 'POST',
    url: 'https://game.example/api/webhooks/github',
    headers: {
      get: (name: string): string | null => {
        switch (name.toLowerCase()) {
          case 'x-hub-signature-256':
            return options.signature === undefined
              ? signPayload(SECRET, options.body)
              : options.signature;
          case 'x-github-delivery':
            return options.deliveryId;
          case 'x-github-event':
            return 'pull_request';
          default:
            return null;
        }
      },
    },
    rawBody: options.body,
  };
}

/** Collects everything the shared bus publishes for the life of the subscription. */
function watchSharedBus(): { events: unknown[]; stop: () => void } {
  const events: unknown[] = [];
  const stop = sharedRuntime().bus.subscribe((event) => events.push(event));
  return { events, stop };
}

let database: Database;

beforeAll(async () => {
  requireDatabase();
  process.env[WEBHOOK_SECRET_VARIABLE] = SECRET;
  const { database: shared } = sharedRuntime();
  database = shared;
  // The ledger is durable, so a second run of this file would collide with the
  // first on the fact key and be refused as a duplicate — which is the ledger
  // working, not a test that can be re-run.
  await database.delete(githubDeliveryClaims);
});

afterAll(async () => {
  delete process.env[WEBHOOK_SECRET_VARIABLE];
  // Closes the pool the shared runtime opened; nothing else to release, because
  // the webhook handler holds no resource of its own.
  await closeSharedRuntime();
});

describe('a signed merge, end to end', () => {
  it('lands on the shared bus, the ledger, and neither twice', async () => {
    const { events, stop } = watchSharedBus();
    try {
      const body = mergeBody(4242);
      const first = await sharedGithubWebhook()(delivery({ body, deliveryId: 'e2e-1' }));

      expect(first.status).toBe(200);
      expect(first.body.outcome).toBe('accepted');

      // The wiring claim. Identity of the bus is what makes this meaningful: an
      // event published onto a runtime the webhook built for itself would be
      // indistinguishable from this one by shape alone, and invisible to every
      // real subscriber.
      expect(events).toHaveLength(1);
      const emitted = events[0] as { type: string; actorId: string; payload: unknown };
      expect(emitted.type).toBe(PULL_REQUEST_MERGED);
      expect(emitted.actorId).toBe('github');
      expect(emitted.payload).toMatchObject({
        repository: AT_REPOSITORY,
        pullRequest: 4242,
        merged: true,
      });

      // Durable, not just in this process: the row exists in the real table.
      const rows = await database.select().from(githubDeliveryClaims);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deliveryId).toBe('e2e-1');
      expect(rows[0]?.publishedAt).not.toBeNull();

      // A retry under a NEW delivery id is the case a delivery-id cache cannot
      // catch, and it is the one that double-completes a bounty.
      const retry = await sharedGithubWebhook()(delivery({ body, deliveryId: 'e2e-2' }));
      expect(retry.status).toBe(200);
      expect(retry.body.outcome).toBe('duplicate');
      expect(events).toHaveLength(1);
      expect(await database.select().from(githubDeliveryClaims)).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it('is refused before the bus or the ledger, and leaves neither', async () => {
    const { events, stop } = watchSharedBus();
    try {
      const body = mergeBody(5555);
      const forged = await sharedGithubWebhook()(
        delivery({ body, deliveryId: 'e2e-forged', signature: `sha256=${'0'.repeat(64)}` }),
      );

      expect(forged.status).toBe(401);
      expect(events).toEqual([]);
      // "Leaves no trace" against the real table, not against a fake: a claim
      // row written for an unsigned request is an attacker spending a real
      // merge's one chance to be seen.
      expect(await database.select().from(githubDeliveryClaims)).toHaveLength(1);
    } finally {
      stop();
    }
  });
});
