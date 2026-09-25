import { describe, expect, it, vi } from 'vitest';

import type { WebhookHttpRequest } from './webhook-routes.js';

/**
 * What apps/web owns, tested without a database.
 *
 * The handler's behaviour is covered in packages/infrastructure/github, against
 * fakes. What lives here is the one decision the adapter makes and the handler
 * cannot make for it: which bytes reach the signature check. `request.json()`
 * would hand over a value whose re-serialisation is not what GitHub signed, and
 * the difference is invisible in every other test in the tree — so it is
 * asserted here, against the real `Request` object.
 */

const seen: WebhookHttpRequest[] = [];

vi.mock('@/webhook-routes.js', () => ({
  sharedGithubWebhook: () => async (request: WebhookHttpRequest) => {
    seen.push(request);
    return { status: 202, body: { outcome: 'accepted' } };
  },
}));

const { POST } = await import('../app/api/webhooks/github/route.js');

function signedDelivery(body: string): Request {
  return new Request('https://game.example/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=whatever',
      'x-github-delivery': 'd-1',
      'x-github-event': 'pull_request',
    },
    body,
  });
}

describe('the Next.js adapter', () => {
  it('hands the handler the body as bytes, not as a parsed value', async () => {
    const body = '{\n  "action": "closed"\n}';

    const response = await POST(signedDelivery(body));

    expect(seen[0]?.rawBody).toBe(body);
    // The same body after a parse and a re-serialise, which is what a handler
    // handed `request.json()` would have been verifying.
    expect(JSON.stringify(JSON.parse(body) as unknown)).not.toBe(body);
    expect(response.status).toBe(202);
  });

  it('passes the signature header through under the name the handler reads', async () => {
    await POST(signedDelivery('{}'));

    expect(seen[0]?.headers.get('X-Hub-Signature-256')).toBe('sha256=whatever');
    expect(seen[0]?.headers.get('x-hub-signature-256')).toBe('sha256=whatever');
  });

  it('passes the delivery and event headers through', async () => {
    await POST(signedDelivery('{}'));

    expect(seen[0]?.headers.get('X-GitHub-Delivery')).toBe('d-1');
    expect(seen[0]?.headers.get('X-GitHub-Event')).toBe('pull_request');
  });

  it('does not put the secret in the response body', async () => {
    const response = await POST(signedDelivery('{}'));

    await expect(response.text()).resolves.not.toContain('sha256=whatever');
  });
});
