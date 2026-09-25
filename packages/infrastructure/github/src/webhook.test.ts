import { describe, expect, it } from 'vitest';

import type { ClaimOutcome, DeliveryClaim, DeliveryClaimStore, DeliveryFact } from './delivery.js';
import { PULL_REQUEST_MERGED } from './normalize.js';
import { signPayload } from './signature.js';
import { WebhookSecret } from './secrets.js';
import { createGithubWebhookHandler, GITHUB_ACTOR_ID } from './webhook.js';
import type { EmittedEvent, GithubWebhookRequest } from './webhook.js';

const SECRET = 'test-secret';
const AT = '2026-09-26T00:00:00.000Z';

function mergePayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    action: 'closed',
    repository: { full_name: 'acme/widgets' },
    pull_request: {
      number: 7,
      merged: true,
      merged_at: '2026-09-25T12:00:00Z',
      user: { login: 'octocat' },
      ...overrides,
    },
  };
}

function openedPayload(): unknown {
  return {
    action: 'opened',
    repository: { full_name: 'acme/widgets' },
    pull_request: { number: 7, merged: false, user: { login: 'octocat' } },
  };
}

/**
 * An in-memory stand-in for the durable ledger.
 *
 * It reproduces the two unique keys the real table has — delivery id and the
 * semantic fact — because those are the semantics under test, and it is
 * deliberately NOT a Set of delivery ids: a fake that deduplicated only on the
 * delivery id would pass the retry test while testing nothing about the case
 * that matters. That the real thing is durable across a restart is the
 * integration suite's job, and asserting it here would be a claim about a fake.
 */
class FakeClaims implements DeliveryClaimStore {
  readonly rows: ClaimRow[] = [];
  published = new Set<string>();
  private nextId = 0;

  constructor(private readonly failMarkOnce = false) {}

  async claim(delivery: DeliveryClaim): Promise<ClaimOutcome> {
    if (this.rows.some((row) => row.deliveryId === delivery.deliveryId)) {
      return this.outcomeOf(this.rows.find((row) => row.deliveryId === delivery.deliveryId));
    }
    if (
      delivery.fact !== undefined &&
      this.rows.some(
        (row) => row.fact !== undefined && sameFact(row.fact, delivery.fact ?? undefined),
      )
    ) {
      const match = this.rows.find(
        (row) => row.fact !== undefined && sameFact(row.fact, delivery.fact ?? undefined),
      );
      return this.outcomeOf(match);
    }
    this.nextId += 1;
    const row: ClaimRow = { id: `claim-${this.nextId}`, ...delivery };
    this.rows.push(row);
    return { status: 'claimed', claimId: row.id };
  }

  async markPublished(claimId: string): Promise<void> {
    if (this.failMarkOnce && this.published.size === 0) {
      throw new Error('the ledger write failed');
    }
    this.published.add(claimId);
  }

  async release(claimId: string): Promise<void> {
    const index = this.rows.findIndex((row) => row.id === claimId);
    if (index >= 0) this.rows.splice(index, 1);
  }

  async findPublishedFact(fact: DeliveryFact) {
    const row = this.rows.find((candidate) => candidate.fact && sameFact(candidate.fact, fact));
    if (row === undefined || !this.published.has(row.id)) return undefined;
    return {
      claimId: row.id,
      deliveryId: row.deliveryId,
      event: row.event,
      action: row.action,
      publishedAt: AT,
    };
  }

  private outcomeOf(row: ClaimRow | undefined): ClaimOutcome {
    if (row === undefined) return { status: 'in-flight' };
    return this.published.has(row.id) ? { status: 'already-published' } : { status: 'in-flight' };
  }
}

interface ClaimRow extends DeliveryClaim {
  readonly id: string;
}

function sameFact(left: DeliveryFact, right: DeliveryFact | undefined): boolean {
  return (
    right !== undefined &&
    left.kind === right.kind &&
    left.repository === right.repository &&
    left.subject === right.subject &&
    left.subjectNumber === right.subjectNumber
  );
}

interface Harness {
  readonly handle: (
    request: GithubWebhookRequest,
  ) => ReturnType<ReturnType<typeof createGithubWebhookHandler>>;
  readonly claims: FakeClaims;
  readonly published: EmittedEvent[];
}

function harness(
  options: { configured?: boolean; failPublish?: boolean; failMark?: boolean } = {},
): Harness {
  const claims = new FakeClaims(options.failMark ?? false);
  const published: EmittedEvent[] = [];
  const secret = (options.configured ?? true) ? new WebhookSecret(SECRET) : undefined;
  let failPublish = options.failPublish ?? false;
  const handle = createGithubWebhookHandler({
    secret: () => secret,
    claims,
    publish: async (event) => {
      if (failPublish) {
        failPublish = false;
        throw new Error('the bus is down');
      }
      published.push(event);
    },
    now: () => AT,
  });
  return { handle, claims, published };
}

function delivery(options: {
  /** Ignored when `rawBody` is given, which is how a body-as-bytes case is written. */
  body?: unknown;
  event?: string;
  deliveryId?: string;
  signature?: string | null;
  rawBody?: string;
  method?: string;
}): GithubWebhookRequest {
  // Pretty-printed on purpose. A compact body is its own canonical form, so a
  // handler that re-serialised the parsed object before hashing it would behave
  // identically here and every ordering test below would pass against an
  // implementation that rejects every real GitHub delivery. GitHub's own test
  // deliveries are pretty-printed, so this is the realistic shape as well.
  const rawBody = options.rawBody ?? JSON.stringify(options.body ?? null, null, 2);
  return {
    method: options.method ?? 'POST',
    url: 'https://game.example/api/webhooks/github',
    headers: {
      get: (name: string) => {
        const lower = name.toLowerCase();
        if (lower === 'x-hub-signature-256') {
          return options.signature === undefined ? signPayload(SECRET, rawBody) : options.signature;
        }
        if (lower === 'x-github-delivery') return options.deliveryId ?? 'delivery-1';
        if (lower === 'x-github-event') return options.event ?? 'pull_request';
        return null;
      },
    },
    rawBody,
  };
}

describe('a delivery that cannot prove it is from GitHub', () => {
  // Every assertion here is on a COLLABORATOR, not on the status code. A 401
  // with a claim row written behind it is a pass that means nothing: the row is
  // what a real merge's one chance to be seen is spent on.
  const refusals: readonly { label: string; options: Parameters<typeof delivery>[0] }[] = [
    { label: 'unsigned', options: { body: mergePayload(), signature: null } },
    {
      label: 'signed with the wrong secret',
      options: { body: mergePayload(), signature: signPayload('not-the-secret', '{}') },
    },
    {
      label: 'a truncated signature',
      options: { body: mergePayload(), signature: 'sha256=abc' },
    },
    {
      // The signature is over one body and the request carries another. The
      // helper signs whatever `rawBody` holds, so the signature has to be
      // supplied explicitly or this case would be testing nothing.
      label: 'a body altered after it was signed',
      options: {
        rawBody: JSON.stringify(mergePayload({ number: 8 })),
        signature: signPayload(SECRET, JSON.stringify(mergePayload())),
      },
    },
  ];

  for (const { label, options } of refusals) {
    it(`leaves no trace when ${label}`, async () => {
      const { handle, claims, published } = harness();

      const response = await handle(delivery(options));

      expect(response.status).toBe(401);
      expect(claims.rows).toEqual([]);
      expect(claims.published.size).toBe(0);
      expect(published).toEqual([]);
    });
  }

  it('fails on the signature before it looks at the body', async () => {
    // A body that is not JSON, unsigned. The answer is 401 and not 400: nothing
    // parsed the attacker-chosen bytes before deciding they were not welcome.
    const { handle, claims } = harness();
    const notJson = '{"truncated": ';

    const response = await handle(
      delivery({ rawBody: notJson, signature: `sha256=${'0'.repeat(64)}` }),
    );

    expect(response.status).toBe(401);
    expect(claims.rows).toEqual([]);
  });

  it('fails closed when no secret is configured, even for a correctly signed delivery', async () => {
    const { handle, claims, published } = harness({ configured: false });

    const response = await handle(delivery({ body: mergePayload() }));

    expect(response.status).toBe(401);
    expect(response.body.outcome).toBe('unconfigured');
    expect(claims.rows).toEqual([]);
    expect(published).toEqual([]);
  });

  it('refuses a method that is not a delivery', async () => {
    const { handle, claims } = harness();

    const response = await handle(delivery({ body: mergePayload(), method: 'GET' }));

    expect(response.status).toBe(405);
    expect(claims.rows).toEqual([]);
  });
});

describe('a merge', () => {
  it('is published once, under a name that is not a game event', async () => {
    const { handle, published } = harness();

    const response = await handle(delivery({ body: mergePayload() }));

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe('accepted');
    expect(published).toHaveLength(1);
    expect(published[0]?.type).toBe(PULL_REQUEST_MERGED);
    // The two names that would double-pay or smuggle game vocabulary in.
    expect(PULL_REQUEST_MERGED).not.toBe('pr.merged');
    expect(PULL_REQUEST_MERGED).not.toBe('bounty.completed');
  });

  it('carries the coordinates a bounty would resolve against', async () => {
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload() }));

    expect(published[0]?.payload).toEqual({
      repository: 'acme/widgets',
      pullRequest: 7,
      merged: true,
      mergedAt: '2026-09-25T12:00:00Z',
      githubLogin: 'octocat',
      deliveryId: 'delivery-1',
    });
  });

  it('does not publish a closed pull request that was not merged', async () => {
    const { handle, published, claims } = harness();

    const response = await handle(delivery({ body: mergePayload({ merged: false }) }));

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe('acknowledged');
    expect(published).toEqual([]);
    // Still recorded: it arrived, it was authentic, and an operator asking
    // "did GitHub send this" deserves an answer that is not "probably".
    expect(claims.rows).toHaveLength(1);
    expect(claims.rows[0]?.fact).toBeUndefined();
  });

  it('refuses a delivery GitHub sent with no delivery id to deduplicate on', async () => {
    const { handle, claims, published } = harness();

    const response = await handle(delivery({ body: mergePayload(), deliveryId: '' }));

    expect(response.status).toBe(400);
    expect(claims.rows).toEqual([]);
    expect(published).toEqual([]);
  });

  it('acknowledges a body that parses to nothing usable', async () => {
    const { handle, published } = harness();

    const response = await handle(delivery({ body: { hello: 'world' }, event: 'star' }));

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe('acknowledged');
    expect(published).toEqual([]);
  });
});

describe('a merge delivered more than once', () => {
  it('publishes once when GitHub retries under the same delivery id', async () => {
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    const second = await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));

    expect(second.body.outcome).toBe('duplicate');
    expect(published).toHaveLength(1);
  });

  it('publishes once when a retry arrives under a NEW delivery id', async () => {
    // This is the case a delivery-id cache cannot answer. GitHub's retry is a
    // fresh delivery with a fresh id, so the only thing that can catch it is the
    // semantic key — and it is the case that matters, because losing the cache
    // (a restart) is exactly when the id-based guard is gone.
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    const retry = await handle(delivery({ body: mergePayload(), deliveryId: 'd-2' }));

    expect(retry.status).toBe(200);
    expect(retry.body.outcome).toBe('duplicate');
    expect(published).toHaveLength(1);
  });

  it('still publishes a DIFFERENT merge, because the key is per pull request', async () => {
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    await handle(delivery({ body: mergePayload({ number: 8 }), deliveryId: 'd-2' }));

    expect(published).toHaveLength(2);
  });

  it('still publishes the same pull request in another repository', async () => {
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    await handle(
      delivery({
        body: mergePayload({ merged: false, number: 7 }),
        deliveryId: 'd-2',
      }),
    );
    await handle(
      delivery({
        body: { ...(mergePayload() as object), repository: { full_name: 'other/widgets' } },
        deliveryId: 'd-3',
      }),
    );

    expect(published).toHaveLength(2);
  });
});

describe('a merge that arrives before the event that supposedly preceded it', () => {
  // The brief's reorder case. A handler that assumes `opened` then `closed`
  // drops the close and leaves a bounty stuck forever, so the effect has to be a
  // function of what the delivery says rather than of what came before.
  it('publishes with no prior opened, and identically when opened came first', async () => {
    const withoutOpen = harness();
    await withoutOpen.handle(delivery({ body: mergePayload(), deliveryId: 'd-merge' }));

    const withOpen = harness();
    await withOpen.handle(delivery({ body: openedPayload(), deliveryId: 'd-open' }));
    await withOpen.handle(delivery({ body: mergePayload(), deliveryId: 'd-merge' }));

    expect(withoutOpen.published).toEqual(withOpen.published);
    expect(withoutOpen.published).toHaveLength(1);
  });

  it('publishes when the merge arrives again after the opened one, in either order', async () => {
    const forward = harness();
    await forward.handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    await forward.handle(delivery({ body: openedPayload(), deliveryId: 'd-2' }));

    const backward = harness();
    await backward.handle(delivery({ body: openedPayload(), deliveryId: 'd-2' }));
    await backward.handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));

    expect(forward.published).toEqual(backward.published);
  });
});

describe('a publish that fails', () => {
  it('answers 5xx and gives the claim back, so the retry is not lost forever', async () => {
    const { handle, claims, published } = harness({ failPublish: true });

    const response = await handle(delivery({ body: mergePayload() }));

    expect(response.status).toBe(500);
    expect(response.body.outcome).toBe('failed');
    expect(published).toEqual([]);
    // Released, so the retry GitHub is about to send finds a free claim rather
    // than one that reads as in-flight until the heat death of the universe.
    expect(claims.rows).toEqual([]);
  });

  it('lets the retry publish, which is the merge a naive design would have lost', async () => {
    const { handle, published } = harness({ failPublish: true });

    await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    const retry = await handle(delivery({ body: mergePayload(), deliveryId: 'd-2' }));

    expect(retry.status).toBe(200);
    expect(retry.body.outcome).toBe('accepted');
    expect(published).toHaveLength(1);
  });

  it('never puts the secret in the answer', async () => {
    const { handle } = harness({ failPublish: true });

    const response = await handle(delivery({ body: mergePayload() }));

    expect(JSON.stringify(response.body)).not.toContain(SECRET);
  });
});

describe('a ledger write that fails after the event is already on the bus', () => {
  it('answers 5xx and does NOT release, because releasing republishes the merge', async () => {
    const { handle, claims, published } = harness({ failMark: true });

    const response = await handle(delivery({ body: mergePayload() }));

    expect(response.status).toBe(500);
    expect(published).toHaveLength(1);
    // The claim survives. The merge is already published, so a free claim would
    // hand GitHub's retry permission to publish it a second time — a failed
    // bookkeeping write turned into a double completion.
    expect(claims.rows).toHaveLength(1);
    expect(claims.published.size).toBe(0);
  });

  it('does not publish again when the retry arrives', async () => {
    const { handle, published } = harness({ failMark: true });

    await handle(delivery({ body: mergePayload(), deliveryId: 'd-1' }));
    const retry = await handle(delivery({ body: mergePayload(), deliveryId: 'd-2' }));

    expect(retry.status).toBe(200);
    expect(retry.body.outcome).toBe('duplicate');
    expect(published).toHaveLength(1);
  });
});

describe('the identity boundary', () => {
  it('never puts a GitHub account anywhere a consumer could read it as an agent', async () => {
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload() }));

    const payload = published[0]?.payload as Record<string, unknown>;
    const agentish = Object.keys(payload).filter((key) => /agent/i.test(key));
    expect(agentish).toEqual([]);
    // The login is present, under a name that says what it is.
    expect(payload['githubLogin']).toBe('octocat');
  });

  it('attributes the event to the integration, not to the human who opened the PR', async () => {
    const { handle, published } = harness();

    await handle(delivery({ body: mergePayload() }));

    expect(published[0]?.actorId).toBe(GITHUB_ACTOR_ID);
    expect(published[0]?.actorId).not.toBe('octocat');
  });

  it('reports a null login rather than inventing one from the author', async () => {
    const { handle, published } = harness();

    await handle(
      delivery({
        body: { ...(mergePayload() as object), pull_request: { number: 7, merged: true } },
      }),
    );

    expect((published[0]?.payload as Record<string, unknown>)['githubLogin']).toBeNull();
  });
});
