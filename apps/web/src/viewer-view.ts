import { sharedAuth, MissingAuthConfigurationError } from './auth/server.js';

/**
 * Who is looking, as far as this page is concerned.
 *
 * ## The board is not public, and that is not a choice made here
 *
 * `bounty-routes.ts` authenticates every request on the bounty surface,
 * INCLUDING the list, and gives its reason in the code: a bounty names a
 * repository and an issue number, and `docs/design/public-replay.md` rules that
 * publishing a repository is publishing a place to look. A page that read the
 * same command with no check would publish exactly what the route refuses to,
 * through a door the route does not have.
 *
 * So the whole `(app)` route group is behind this one check. The alternative —
 * gating `/bounties` and leaving `/agents` open — would be defensible on the
 * narrowest reading and wrong on the one the codebase actually wrote down.
 * `/replay/[replayId]` stays outside the group, because that page is the
 * surface `docs/design/public-replay.md` is about and it decides its own
 * boundary.
 *
 * ## The three answers, and why there are three
 *
 * `signed-out`, `auth-unconfigured` and `signed-in` look alike in a browser and
 * mean three different things to the person looking: they need to sign in, the
 * operator needs to finish `cp .env.example .env`, and everything is fine. A
 * gate that collapsed them would tell a developer their OAuth app is broken
 * when they have simply not signed in yet, and tell a signed-out visitor that
 * the platform is misconfigured.
 *
 * `readAuthEnvironment` THROWS when a variable is missing, and that is the
 * correct behaviour for a startup. On a page render it would be a 500 for
 * somebody who did nothing wrong, so it is caught here and turned into a state
 * the page can render.
 */
export type Viewer =
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'auth-unconfigured'; readonly missing: readonly string[] }
  | { readonly kind: 'signed-in'; readonly login: string | null };

/**
 * The signed-in human, or the state that explains why there is not one.
 *
 * The request headers are a PARAMETER rather than a `next/headers` call inside
 * this file, for the same reason `assemblePublicReplay` takes its sources: it
 * keeps Next out of the read models, so this can be exercised with a plain
 * `Headers` and the page stays the only place that knows about a request.
 */
export async function resolveViewer(requestHeaders: Headers): Promise<Viewer> {
  let auth: ReturnType<typeof sharedAuth>;
  try {
    auth = sharedAuth();
  } catch (error) {
    if (error instanceof MissingAuthConfigurationError) {
      return { kind: 'auth-unconfigured', missing: error.missing };
    }
    throw error;
  }

  const answer = await auth.api.getSession({ headers: requestHeaders });
  if (answer === null || answer.user === null || answer.user === undefined) {
    return { kind: 'signed-out' };
  }
  return { kind: 'signed-in', login: githubLogin(answer.user) };
}

/**
 * The GitHub login of the signed-in person, when the session carries one.
 *
 * Null rather than a fallback to an email or a synthetic name. The account is
 * keyed on the GitHub id (`bootstrapGameAccount`), so a value that is not that
 * id would greet somebody by a name the game does not hold for them, and a
 * greeting is not worth a wrong identity.
 */
function githubLogin(user: { readonly name?: unknown; readonly email?: unknown }): string | null {
  const candidate = user.name;
  if (typeof candidate !== 'string' || candidate.trim() === '') return null;
  return candidate.trim();
}

/**
 * Whether the gate is open, as the layout asks it.
 *
 * A type predicate rather than a boolean so the call site narrows and does not
 * have to re-check the discriminant — a `boolean` here produced a layout that
 * read `viewer.login` off a union that had no such field, which is a compile
 * error today and would become a `?.` tomorrow.
 */
export function viewerMayRead(
  viewer: Viewer,
): viewer is Extract<Viewer, { readonly kind: 'signed-in' }> {
  return viewer.kind === 'signed-in';
}

/** The path a signed-out visitor is sent to. */
export const SIGN_IN_PATH = '/api/auth/sign-in/social';
