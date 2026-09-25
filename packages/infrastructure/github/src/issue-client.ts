import { INSTALLATION_TOKEN_VARIABLE, type SecretEnvironment } from './secrets.js';

/**
 * Does this issue exist? The one GitHub API call this bead needs.
 *
 * Octokit is the obvious answer and it is not the right one here. The brief asks
 * for a single GET against api.github.com; Octokit is a large dependency whose
 * transitive tree lands in pnpm-lock.yaml, and scripts/check-licenses.sh scans
 * only first-party files under packages/ and apps/ — so an npm dependency passes
 * the licence gate trivially while contributing nothing to it. The dependency
 * would be paid for in lockfile surface and review burden and would buy one
 * request line. If the call count grows past a handful, that trade flips; at
 * one call, `fetch` is the cheaper dependency, and it is injectable, so the
 * test never opens a socket either way.
 *
 * The token is never a parameter and never a return value. It is read from the
 * environment inside `createIssueLookup` and captured, so no type exported from
 * this package is capable of holding it and there is nothing for a caller to
 * leak into a log, a response or a URL.
 */

const DEFAULT_API_ORIGIN = 'https://api.github.com';

/** Only the response fields this package reads. */
interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  readonly headers: Readonly<Record<string, string>>;
}

export type HttpFetch = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

/** A repository's issue, by the two things GitHub and a bounty both have. */
export interface IssueRef {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

export type IssueExistence =
  | { readonly exists: true; readonly title: string; readonly url: string }
  | { readonly exists: false; readonly reason: 'not-found' | 'unavailable' | 'not-configured' };

export interface IssueLookup {
  issue(ref: IssueRef): Promise<IssueExistence>;
}

/**
 * `globalThis.fetch`, adapted once.
 *
 * The structural `HttpFetch` type is what keeps this package free of a
 * web-platform lib and of an ambient DOM, and it means a test supplies a plain
 * function rather than a request-interception framework.
 */
const defaultFetch: HttpFetch = (url, init) => fetch(url, { ...init });

function parseOrigin(value: string | undefined): string {
  return value === undefined || value === '' ? DEFAULT_API_ORIGIN : value.replace(/\/+$/, '');
}

export function createIssueLookup(
  env: SecretEnvironment,
  http: HttpFetch = defaultFetch,
): IssueLookup {
  const origin = parseOrigin(env['GITHUB_API_ORIGIN']);
  const token = env[INSTALLATION_TOKEN_VARIABLE];

  return {
    async issue(ref: IssueRef): Promise<IssueExistence> {
      if (token === undefined || token === '') {
        // A lookup that cannot authenticate is not a lookup that found nothing.
        // Reporting `not-found` here would let an outage look like a rejection,
        // and the caller would refuse a bounty for a reason that is untrue.
        return { exists: false, reason: 'not-configured' };
      }

      const url = `${origin}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/issues/${ref.number}`;
      let response: HttpResponseLike;
      try {
        response = await http(url, {
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28',
            'user-agent': 'battle-agents',
          },
        });
      } catch {
        return { exists: false, reason: 'unavailable' };
      }

      if (response.status === 404) {
        return { exists: false, reason: 'not-found' };
      }
      if (!response.ok) {
        // 401 and 403 are a token problem, 5xx is GitHub's. None of them is
        // evidence the issue is absent, and treating any of them as `not-found`
        // is how a rate limit turns into a wave of refused bounties.
        return { exists: false, reason: 'unavailable' };
      }

      const body = await response.json();
      if (typeof body !== 'object' || body === null) {
        return { exists: false, reason: 'unavailable' };
      }
      const record = body as { title?: unknown; html_url?: unknown };
      return {
        exists: true,
        title: typeof record.title === 'string' ? record.title : '',
        url: typeof record.html_url === 'string' ? record.html_url : url,
      };
    },
  };
}
