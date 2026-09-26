/**
 * Payload guards.
 *
 * Every action takes `unknown` and every one of them is narrowed here first.
 * That is not defensive style: `act()` hands the payload through as a generic,
 * so a signature reading `input: CreateBountyInput` would be an annotation the
 * registry never checks, and `act('bounty.create', {})` would compile clean and
 * arrive as `{}`. The quest feature has the comment that explains this at
 * length (features/quest/src/domain.ts, on `whyQuestIsRejected`); this file is
 * the same mechanism with the bounty's own reasons.
 *
 * It is a separate file from `domain.ts` because the two answer different
 * questions. `domain.ts` says what a bounty IS and which moves it allows; this
 * says what a caller may send. Merging them produced a 500-line file in an
 * earlier draft of this feature, and the guards were the half nobody could
 * find.
 */

import { isRepositoryCoordinates, type RepositoryCoordinates } from './domain.js';
import { BOUNTY_MODES, DEFAULT_BOUNTY_MODE, isKnownBountyMode } from './modes.js';

/**
 * Every way this feature refuses a payload, or undefined when it accepts one.
 *
 * One union for all five actions rather than one per action. A rejection is
 * turned into a sentence naming what the action wanted, and a caller that
 * switched on the reason to work out WHICH action it was would be switching on
 * the id it just called, which it already knows.
 */
export type BountyRejection =
  | { readonly reason: 'not-an-object' }
  | { readonly reason: 'repo-coordinates-invalid' }
  | { readonly reason: 'issue-number-not-an-integer' }
  | { readonly reason: 'issue-number-not-positive' }
  | { readonly reason: 'currency-not-a-string' }
  | { readonly reason: 'currency-empty' }
  | { readonly reason: 'requirements-not-strings' }
  | { readonly reason: 'expires-at-not-an-instant' }
  | { readonly reason: 'bounty-id-not-a-string' }
  | { readonly reason: 'bounty-id-empty' }
  | { readonly reason: 'agent-id-not-a-string' }
  | { readonly reason: 'agent-id-empty' }
  | { readonly reason: 'amount-not-integer-cents' }
  | { readonly reason: 'amount-negative' }
  | { readonly reason: 'sponsor-user-id-not-a-string' }
  | { readonly reason: 'sponsor-user-id-empty' }
  | { readonly reason: 'reported-by-empty' }
  | { readonly reason: 'pr-url-not-a-github-pull-request' }
  | { readonly reason: 'pr-url-wrong-repository' }
  | { readonly reason: 'status-not-a-known-status' }
  | { readonly reason: 'mode-not-a-known-bounty-mode' };

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The value as a string, or `''` when it is not one.
 *
 * `'not-a-mode'` is as good as `'speed'` for a rejection, which is why this is a
 * narrowing helper rather than an assertion. `isKnownBountyMode` wants a string
 * because its argument is a database column; the payload it guards is `unknown`,
 * and a value of the wrong type fails the same check either way.
 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : 'not-a-string';
}

/** An ISO 8601 instant, or nothing. `Date.parse` accepting a bare word is the risk. */
function isInstant(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && !Number.isNaN(Date.parse(value));
}

/* ───────────────────────────── create ───────────────────────────── */

/**
 * A create that has been proven creatable.
 *
 * Flat `repoOwner`/`repoName` rather than a nested `repository`, because that is
 * what `whyCreateIsRejected` actually proves. Declaring a nested object here
 * while the guard checks two top-level fields is the "two interfaces that look
 * alike and are not" defect features/quest/src/domain.ts warns about: the type
 * says `input.repository.repoOwner` and the value has never got one, so the
 * first read after the guard threw on `undefined`.
 */
export interface CreateBountyInput {
  readonly repoOwner: string;
  readonly repoName: string;
  readonly issueNumber: number;
  readonly currency?: string;
  readonly requirements?: readonly string[];
  readonly expiresAt?: string;
  readonly mode?: string;
}

/** The two coordinate fields, as the shape a caller sends them. */
export function coordinatesOf(draft: CreateBountyInput): RepositoryCoordinates {
  return { repoOwner: draft.repoOwner, repoName: draft.repoName };
}

export function whyCreateIsRejected(input: unknown): BountyRejection | undefined {
  const draft = asObject(input);
  if (draft === undefined) {
    return { reason: 'not-an-object' };
  }
  // Coordinates arrive flattened rather than nested. A nested object is what a
  // caller would send if the shape were declared as one, and the two spellings
  // would then need a migration to unify. Flattened is what the store's columns
  // are named, so the payload and the row agree.
  if (!isRepositoryCoordinates({ repoOwner: draft['repoOwner'], repoName: draft['repoName'] })) {
    return { reason: 'repo-coordinates-invalid' };
  }
  const issueNumber = draft['issueNumber'];
  if (!Number.isInteger(issueNumber)) {
    return { reason: 'issue-number-not-an-integer' };
  }
  if ((issueNumber as number) < 1) {
    return { reason: 'issue-number-not-positive' };
  }
  if (draft['currency'] !== undefined && typeof draft['currency'] !== 'string') {
    return { reason: 'currency-not-a-string' };
  }
  if (typeof draft['currency'] === 'string' && draft['currency'].trim() === '') {
    return { reason: 'currency-empty' };
  }
  if (draft['requirements'] !== undefined && !isStringArray(draft['requirements'])) {
    return { reason: 'requirements-not-strings' };
  }
  if (draft['expiresAt'] !== undefined && !isInstant(draft['expiresAt'])) {
    return { reason: 'expires-at-not-an-instant' };
  }
  // A mode that IS sent is held to the taxonomy; a mode that is absent is not a
  // rejection, because the default is the build's answer rather than a value the
  // creator got wrong. Checking it here rather than at claim time is the point of
  // the field: a bounty whose mode was never checked would carry a promise the
  // platform made on its own, and the refusal would arrive to an agent as a
  // surprise about a bounty whose creator was never asked.
  if (draft['mode'] !== undefined && !isKnownBountyMode(asString(draft['mode']))) {
    return { reason: 'mode-not-a-known-bounty-mode' };
  }
  return undefined;
}

export function isCreateBountyInput(input: unknown): input is CreateBountyInput {
  return whyCreateIsRejected(input) === undefined;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '')
  );
}

/* ───────────────────────────── fund ───────────────────────────── */

export interface FundBountyInput {
  readonly bountyId: string;
  readonly amountCents: number;
  readonly sponsorUserId: string;
  /**
   * The person reporting the commitment. A GitHub login is a PERSON's account
   * and never an agent id, and the payout rail requires every recorded fact to
   * be attributed, so the two cannot be the same field.
   */
  readonly reportedBy: string;
}

export function whyFundIsRejected(input: unknown): BountyRejection | undefined {
  const draft = asObject(input);
  if (draft === undefined) {
    return { reason: 'not-an-object' };
  }
  const bounty = whyBountyIdIsRejected(draft['bountyId']);
  if (bounty !== undefined) {
    return bounty;
  }
  const amount = draft['amountCents'];
  if (!Number.isInteger(amount)) {
    return { reason: 'amount-not-integer-cents' };
  }
  if ((amount as number) < 0) {
    return { reason: 'amount-negative' };
  }
  const sponsor = draft['sponsorUserId'];
  if (typeof sponsor !== 'string') {
    return { reason: 'sponsor-user-id-not-a-string' };
  }
  if (sponsor.trim() === '') {
    return { reason: 'sponsor-user-id-empty' };
  }
  if (!isNonEmptyString(draft['reportedBy'])) {
    return { reason: 'reported-by-empty' };
  }
  return undefined;
}

export function isFundBountyInput(input: unknown): input is FundBountyInput {
  return whyFundIsRejected(input) === undefined;
}

/* ───────────────────────────── claim / submit / expire ───────────────────────────── */

export interface ClaimBountyInput {
  readonly bountyId: string;
  readonly agentId: string;
}

export interface SubmitBountyInput {
  readonly bountyId: string;
  readonly agentId: string;
  readonly prUrl: string;
}

export interface ExpireBountyInput {
  readonly bountyId: string;
}

function whyBountyIdIsRejected(value: unknown): BountyRejection | undefined {
  if (typeof value !== 'string') {
    return { reason: 'bounty-id-not-a-string' };
  }
  if (value.trim() === '') {
    return { reason: 'bounty-id-empty' };
  }
  return undefined;
}

function whyAgentIdIsRejected(value: unknown): BountyRejection | undefined {
  if (typeof value !== 'string') {
    return { reason: 'agent-id-not-a-string' };
  }
  if (value.trim() === '') {
    return { reason: 'agent-id-empty' };
  }
  return undefined;
}

export function whyClaimIsRejected(input: unknown): BountyRejection | undefined {
  const draft = asObject(input);
  if (draft === undefined) {
    return { reason: 'not-an-object' };
  }
  return whyBountyIdIsRejected(draft['bountyId']) ?? whyAgentIdIsRejected(draft['agentId']);
}

export function isClaimBountyInput(input: unknown): input is ClaimBountyInput {
  return whyClaimIsRejected(input) === undefined;
}

export function whySubmitIsRejected(input: unknown): BountyRejection | undefined {
  const draft = asObject(input);
  if (draft === undefined) {
    return { reason: 'not-an-object' };
  }
  const early = whyBountyIdIsRejected(draft['bountyId']) ?? whyAgentIdIsRejected(draft['agentId']);
  if (early !== undefined) {
    return early;
  }
  const prUrl = draft['prUrl'];
  if (!isPullRequestUrl(prUrl)) {
    return { reason: 'pr-url-not-a-github-pull-request' };
  }
  return undefined;
}

export function isSubmitBountyInput(input: unknown): input is SubmitBountyInput {
  return whySubmitIsRejected(input) === undefined;
}

export function whyExpireIsRejected(input: unknown): BountyRejection | undefined {
  const draft = asObject(input);
  if (draft === undefined) {
    return { reason: 'not-an-object' };
  }
  return whyBountyIdIsRejected(draft['bountyId']);
}

export function isExpireBountyInput(input: unknown): input is ExpireBountyInput {
  return whyExpireIsRejected(input) === undefined;
}

/* ───────────────────────────── list ───────────────────────────── */

export interface ListBountiesInput {
  readonly status?: string;
  readonly repoOwner?: string;
  readonly repoName?: string;
}

export function whyListIsRejected(input: unknown): BountyRejection | undefined {
  const draft = asObject(input);
  if (draft === undefined) {
    return { reason: 'not-an-object' };
  }
  const { status, repoOwner, repoName } = draft;
  if (status !== undefined && (typeof status !== 'string' || status.trim() === '')) {
    return { reason: 'status-not-a-known-status' };
  }
  if (
    (repoOwner !== undefined && typeof repoOwner !== 'string') ||
    (repoName !== undefined && typeof repoName !== 'string')
  ) {
    return { reason: 'repo-coordinates-invalid' };
  }
  return undefined;
}

export function isListBountiesInput(input: unknown): input is ListBountiesInput {
  return whyListIsRejected(input) === undefined;
}

/* ───────────────────────────── the pull request URL ───────────────────────────── */

/**
 * What a github.com pull request URL is spelled like.
 *
 * Deliberately a shape and not a lookup. A feature may not import the GitHub
 * integration package — architecture-rules.cjs forbids a feature importing any
 * outer layer — and it may not open a socket (tests/unit/github-boundary.test.ts
 * fails the build if one reaches for anything outside the workspace). So the
 * question this answers is "is this string a GitHub pull request link", and the
 * answer is a pattern. Whether the pull request exists is the integration
 * layer's question, answered by the merge delivery that eventually arrives; a
 * bounty that names a pull request nobody ever opened simply never completes.
 */
const PULL_REQUEST_URL = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)$/;

export function isPullRequestUrl(value: unknown): value is string {
  return typeof value === 'string' && parsePullRequestUrl(value) !== undefined;
}

/**
 * The coordinates a pull request URL names, or undefined.
 *
 * Exported because the merge handler needs the same parse in reverse: a merged
 * delivery says `owner/name` and a number, and correlating it to a bounty means
 * turning that back into the canonical URL the bounty stored.
 */
export function parsePullRequestUrl(
  url: string,
): { readonly repository: RepositoryCoordinates; readonly pullRequest: number } | undefined {
  const match = PULL_REQUEST_URL.exec(url);
  if (match === null) {
    return undefined;
  }
  const [, owner, repo, number] = match;
  if (owner === undefined || repo === undefined || number === undefined) {
    return undefined;
  }
  return {
    repository: { repoOwner: owner, repoName: repo },
    pullRequest: Number.parseInt(number, 10),
  };
}

/* ───────────────────────────── rejections as sentences ───────────────────────────── */

export const BOUNTY_CREATE_SHAPE =
  'A create takes a repoOwner and repoName that are GitHub owner/repository names, a positive ' +
  'whole issueNumber, and optionally a currency, an array of non-empty requirement strings, an ' +
  `ISO expiresAt and a mode, one of ${BOUNTY_MODES.join(', ')}. A mode names the rule that ` +
  'decides the bounty — which pull request wins — and not the shape of a match; only ' +
  `${DEFAULT_BOUNTY_MODE} can be claimed by this build.`;

export const BOUNTY_FUND_SHAPE =
  'A funding takes a bountyId, a whole number of amountCents that is not negative, a ' +
  'sponsorUserId naming the platform user row (not a GitHub login), and a reportedBy naming the ' +
  'person making the claim.';

export const BOUNTY_TRANSITION_SHAPE =
  'A transition takes a bountyId and the agentId the call is about. A submit also takes a prUrl ' +
  'of the form https://github.com/<owner>/<repo>/pull/<number> in the same repository as the ' +
  "bounty's issue.";

export const BOUNTY_EXPIRE_SHAPE = 'An expiry takes a bountyId.';

export const BOUNTY_LIST_SHAPE =
  'A listing takes an optional status, an optional repoOwner and an optional repoName.';

/**
 * A refusal, as the error every action in this feature throws.
 *
 * A discriminant rather than a class, for the reason the other cross-layer
 * contracts use one: the error crosses a process boundary to a transport that
 * cannot import this package, so what the two sides can agree on is a stable
 * `code`.
 */
export interface BountyInputRejected extends Error {
  readonly code: 'malformed-input';
  readonly reason: BountyRejection;
}

export function bountyInputRejected(
  action: string,
  rejection: BountyRejection,
  shape: string,
): BountyInputRejected {
  // `as const` on the code, because Object.assign infers `string` and the
  // interface names a literal. A caller branches on the code, and a code widened
  // to `string` would make that branch a comparison rather than a narrowing.
  return Object.assign(new Error(`${action} refused its input: ${rejection.reason}. ${shape}`), {
    code: 'malformed-input' as const,
    reason: rejection,
  });
}
