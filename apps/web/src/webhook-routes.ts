import { DrizzleGithubDeliveryStore } from '@battle-agents/db';
import { createGithubWebhookHandler, githubWebhookSecretFromEnv } from '@battle-agents/github';
import type { GithubWebhookResponse } from '@battle-agents/github';

import { sharedRuntime } from './shared-runtime.js';

/**
 * `POST /api/webhooks/github`, as a pure handler over injected collaborators.
 *
 * The split is the same one apps/web/app/api/events/route.ts uses, and the
 * interesting difference between them is the shape of the request below. The
 * events route may parse its body, because nothing is signed. This one may not:
 * the signature covers the exact bytes GitHub sent, so `rawBody` is a string
 * that arrived from `request.text()` and there is deliberately no `body` field
 * for a caller to reach for instead.
 *
 * It lives in apps/web/src rather than under app/ for the same reason
 * routes.ts does: the composition root is the one place in the presentation
 * layer allowed to decide which collaborators exist, and
 * architecture-rules.cjs narrows `no-route-handler-game-logic` to `app/**` for
 * precisely that reason. The rule does not apply here; the shape is the same.
 */

/** The request, with the body still bytes. Not `HttpRequest` — see the note above. */
export interface WebhookHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: { get(name: string): string | null };
  readonly rawBody: string;
}

/**
 * The response, narrowed from `HttpResponse`.
 *
 * `HttpResponse.body` is `unknown`, which is right for a surface that returns
 * whatever an Application API call happened to produce and wrong here: the set
 * of outcomes is closed and already declared next to the code that produces it.
 * Returning the declared shape means the adapter and its tests read
 * `body.outcome` without a cast, and a new outcome is a compile error at both
 * ends instead of an `any` somebody casts on the way past.
 */
export interface WebhookHttpResponse {
  readonly status: number;
  readonly body: GithubWebhookResponse['body'];
}

export type WebhookHttpHandler = (request: WebhookHttpRequest) => Promise<WebhookHttpResponse>;

/**
 * The shared runtime's bus, not a second one.
 *
 * `shared-runtime.ts` exists because there used to be two runtimes with two
 * buses and an event emitted by a game action was published where nobody could
 * see it. A merge is a game-adjacent fact, so it goes on the same bus the SSE
 * stream and the Application API already use — building one here would repeat
 * that bug in a new place.
 */
let cached: WebhookHttpHandler | undefined;

export async function sharedGithubWebhook(): Promise<WebhookHttpHandler> {
  if (cached === undefined) {
    const { database, runtime } = await sharedRuntime();
    const handle = createGithubWebhookHandler({
      // A provider, not a value, so the secret is read per request: rotating it
      // needs no restart, and an unset secret fails closed on the very next
      // delivery rather than on the one after a restart.
      secret: () => githubWebhookSecretFromEnv(process.env),
      claims: new DrizzleGithubDeliveryStore(database),
      // The shared runtime's own emit, not `bus.publish` and not a runtime built
      // here. The distinction is the whole point: `emit` is persist → handlers →
      // publish, so a merge reaches the same subscribers every other event in
      // the system does, and a feature that later registers a handler for
      // `github.pull_request.merged` is reached by this call without any
      // rewiring here. Building a second runtime — which is what this line used
      // to do, under a comment denying that it did — produces a bus nobody else
      // is on, and the failure is invisible from inside it.
      publish: (event) => runtime.emit(event),
      now: () => new Date().toISOString(),
    });

    cached = async (request) => {
      const response = await handle(request);
      return { status: response.status, body: response.body };
    };
  }
  return cached;
}
