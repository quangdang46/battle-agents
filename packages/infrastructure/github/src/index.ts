/**
 * `@battle-agents/github` — the GitHub integration, behind a boundary.
 *
 * The package has no dependencies, and that is the point of it. Everything a
 * consumer needs arrives as a parameter: the secret, the durable claim store,
 * the publish function, the clock, and (for the one outbound call) the HTTP
 * function. So the boundary is enforced by the dependency graph rather than by
 * a convention somebody has to remember — a feature cannot reach Octokit through
 * here, because there is no Octokit, and it cannot reach the ledger, because the
 * ledger is a port declared here and implemented in packages/db.
 *
 * What this package is FORBIDDEN from knowing: what a merge means. It observes
 * a pull request merge and says so, in an event named after this integration
 * rather than after a game concept. See src/normalize.ts for why the two names
 * it does not use are the interesting part of the design.
 */

export { createIssueLookup } from './issue-client.js';
export type {
  HttpFetch,
  HttpRequestInit,
  IssueExistence,
  IssueLookup,
  IssueRef,
} from './issue-client.js';

export type {
  ClaimOutcome,
  DeliveryClaim,
  DeliveryClaimStore,
  DeliveryFact,
  PublishedFact,
} from './delivery.js';

export { normalizeDelivery, PULL_REQUEST_MERGED, PULL_REQUEST_MERGED_FACT } from './normalize.js';
export type { NormalizedDelivery, PullRequestMergedPayload } from './normalize.js';

export { signPayload, SIGNATURE_HEADER, SIGNATURE_PREFIX, verifySignature } from './signature.js';
export type { SignatureFailure, SignatureVerdict } from './signature.js';

export {
  githubWebhookSecretFromEnv,
  INSTALLATION_TOKEN_VARIABLE,
  WEBHOOK_SECRET_VARIABLE,
  WebhookSecret,
} from './secrets.js';
export type { SecretEnvironment } from './secrets.js';

export {
  createGithubWebhookHandler,
  DELIVERY_HEADER,
  EVENT_HEADER,
  GITHUB_ACTOR_ID,
} from './webhook.js';
export type {
  EmittedEvent,
  GithubWebhookDependencies,
  GithubWebhookHandler,
  GithubWebhookRequest,
  GithubWebhookResponse,
} from './webhook.js';
