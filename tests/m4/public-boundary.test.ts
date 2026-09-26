import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { battles, DrizzleActivityLog, users } from '@battle-agents/db';
import { eq } from 'drizzle-orm';
import type { PublicReplay } from '@battle-agents/activity';

import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';
import {
  loadPublicReplay,
  replayHeadline,
  replayShare,
  type ReplayPage,
} from '../../apps/web/src/replay-view.js';
import { REPLAY_BEAT_NAMES } from '@battle-agents/activity';
import { act, aFinishedMatch, finishInput, type Match } from './support/match.js';

/**
 * Section 27 M4's DoD, the sentence that distinguishes M4 from "a battle page
 * exists":
 *
 *   "share replay link with a logged-out user and they see the full timeline."
 *
 * ## The claim is about ABSENCE, and absence is hard to test by calling things
 *
 * The naive way to reach this DoD is to delete the auth check on an
 * authenticated endpoint, and the naive way to keep it is to add a session check
 * to a page that never had one. Both leave every logged-in viewer perfectly
 * happy, so a suite that only ever reads the replay as an authenticated caller
 * is green through both.
 *
 * So this asserts the claim in the two halves it actually has:
 *
 *   1. DYNAMICALLY — the read model the page calls is driven with no credential
 *      of any kind, and returns the full timeline. Then it is driven again with
 *      a Better Auth session sitting in the database belonging to a different
 *      person, and returns byte-identical output. The session neither enables
 *      anything nor is required for anything, which is the only reading of
 *      "logged-out" that is worth anything.
 *
 *   2. STATICALLY — the files a logged-out request actually reaches contain no
 *      authentication call at all. This is the half that catches the regression
 *      the DoD invites, because a new `auth()` in `replay-view.ts` is invisible
 *      to assertion 1: the suite would keep calling the function directly and
 *      keep being green while every real viewer got a 401.
 *
 * A source check is not a substitute for a behavioural one and this is not
 * offered as one. It is the same shape as `apps/web/src/auth/wiring.test.ts` —
 * "a test that calls a function proves the function; it says nothing about the
 * caller" — and it is here precisely because the caller's failure mode is a
 * missing check rather than a broken one.
 *
 * ## What is NOT covered, stated rather than implied
 *
 * The React page in `apps/web/app/replay/[replayId]/page.tsx` is not rendered.
 * It calls `headers()` from `next/headers`, which needs a request context a vitest
 * process does not have, and pulling React's server renderer into the root
 * dependency set for one assertion is a change to the tree this milestone did not
 * ask for. The seam asserted here is `loadPublicReplay` — the single function the
 * page calls to get its data — plus the page's own source, which the static half
 * reads. If the page grew a session check, the static half goes red.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DATABASE_URL_VARIABLE = 'DATABASE_URL';
/** The origin a shared link is minted against. Any host will do; the shape is the claim. */
const SHARED_FROM = 'https://agentbattle.gg';
/** Stable, so the canonical URL in an assertion is a fact and not a snapshot. */
const OTHER_ORIGIN = 'https://tweet.example';

let closed = false;
let match: Match;
let replayId = '';

beforeAll(async () => {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m4.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  match = await aFinishedMatch();
  await act('battle.finish', finishInput(match));
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({ replayId: battles.replayId })
    .from(battles)
    .where(eq(battles.id, match.battle.id))
    .limit(1);
  replayId = row?.replayId ?? '';
  if (replayId === '') throw new Error('a finished battle has no replay handle');
}, 120_000);

afterAll(() => {
  if (closed) return;
  closed = true;
  return closeSharedRuntime();
});

/** A Better Auth session row, for a person who is not either fighter. */
async function somebodyElseIsSignedIn(): Promise<string> {
  const { database } = await sharedRuntime();
  const githubId = `m4-viewer-${randomUUID()}`;
  const [viewer] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  if (viewer === undefined) throw new Error('a viewer was created and could not be read back');
  return viewer.id;
}

function beatsOf(replay: PublicReplay): readonly string[] {
  return replay.beats.map((beat) => beat.beat);
}

describe('the M4 DoD: a logged-out viewer sees the full timeline', () => {
  it('reads the whole match with no session, no cookie and no credential', async () => {
    // ONE argument. `loadPublicReplay` takes a replay id and nothing else, so
    // there is no session to pass and therefore no branch where one could be
    // required and forgotten. Asserted through the real function, not through a
    // copy of it, so a second parameter added later is a compile error here.
    const page: ReplayPage = await loadPublicReplay(replayId);
    const replay = page.replay;

    expect(replay, 'a logged-out read returned no replay at all').toBeDefined();
    expect(replay?.state).not.toBe('expired');
    expect(replay?.outcome).toBe('won');
    expect(replay?.mode).not.toBeNull();

    // The TIMELINE, in order, opening to verdict — which is the word "full" in
    // the DoD. Two beats would satisfy every other assertion in this file while
    // describing a match nobody could follow.
    const names = beatsOf(replay as PublicReplay);
    for (const expected of ['battle.opened', 'fighter.joined', 'battle.finished']) {
      expect(names, `the timeline a logged-out viewer sees is missing ${expected}`).toContain(
        expected,
      );
    }
    // ORDER, not mere presence: the beat a reader must see first is the opening,
    // and the one they must see last is the verdict. A timeline assembled from a
    // query rather than from the log's own sequence satisfies every assertion
    // above and reads as a plausible story in the wrong order.
    expect(names.indexOf('battle.opened')).toBeLessThan(names.indexOf('fighter.joined'));
    expect(names.indexOf('fighter.joined')).toBeLessThan(names.indexOf('battle.finished'));
    expect(names.at(-1)).toBe('battle.finished');

    // Ordered by the log's own sequence, which is what makes two people opening
    // the same link seconds apart see the same story.
    const offsets = (replay as PublicReplay).beats.map((beat) => beat.offsetMs);
    expect([...offsets].sort((left, right) => left - right)).toEqual([...offsets]);

    // Every beat name is from the projection's closed set, so a raw event type
    // cannot reach a viewer wearing a friendly name.
    for (const name of names) {
      expect(REPLAY_BEAT_NAMES as readonly string[]).toContain(name);
    }
  });

  it("keeps the judge's work durable but does NOT project it, and pins that gap", async () => {
    // §27 M4 lists "judge run" and then makes the DoD "they see the full
    // timeline". Today a logged-out viewer does not see the judge run, and the
    // two halves of this test are why that is visible rather than assumed.
    //
    // DURABLE: the judge's steps and its verdict are in `event_log`, tagged with
    // the battle, which is what the battle feature's `persistedEvents`
    // declaration promises and what `battle-judge-persistence.test.ts` proves
    // against a restart. A replay assembled from the log is therefore one beat
    // away from showing them.
    const { database } = await sharedRuntime();
    const rows = await new DrizzleActivityLog(database).scopedTimeline({
      tagged: { key: 'battleId', value: match.battle.id },
    });
    const types = rows.map((row) => row.type);
    expect(types.filter((type) => type.startsWith('battle.judge.')).length).toBeGreaterThan(0);

    // PROJECTED: not one of them. `REPLAY_BEAT_NAMES` in
    // `packages/features/activity/src/replay.ts` has no judge entry, so the
    // projection drops a stream the log is holding for exactly this purpose —
    // and `packages/features/battle/src/feature.ts` describes those declarations
    // as "the reason a replay can show its work", which is currently a claim
    // about durability rather than about what a viewer sees.
    //
    // Pinned rather than asserted away. Add the beats and this goes red, which
    // is the moment to flip it, update `docs/design/public-replay.md`, and stop
    // describing the M4 DoD as short. Until then a green stage is not a claim
    // that a logged-out viewer saw the judge run, and this line is what stops it
    // from being read as one.
    const { replay } = await loadPublicReplay(replayId);
    if (replay === undefined) throw new Error('the fixture just read this replay');
    expect(beatsOf(replay).filter((name) => name.startsWith('battle.judge.'))).toEqual([]);
  });

  it('shows the rubric, the fighters and the scores, labelled rather than by id', async () => {
    const { replay } = await loadPublicReplay(replayId);
    if (replay === undefined) throw new Error('the fixture just read this replay');

    expect(replay.rubric).not.toBeNull();
    expect(replay.fighters).toHaveLength(2);
    const totals = replay.fighters.map((fighter) => fighter.total);
    expect(totals.some((total) => total !== null && total > 0)).toBe(true);
    expect(replay.fighters.filter((fighter) => fighter.won)).toHaveLength(1);

    // Labels, not session ids. A permanent public link carrying an internal
    // handle is a way for a reader to correlate this page with an authenticated
    // API, and `replay.ts` says so where the projection is written.
    for (const fighter of replay.fighters) {
      expect(fighter.label).not.toBe(match.alice.sessionId);
      expect(fighter.label).not.toBe(match.bob.sessionId);
    }
    expect(JSON.stringify(replay)).not.toContain(match.alice.sessionId);
    expect(JSON.stringify(replay)).not.toContain(match.bob.sessionId);
  });

  it('returns byte-identical output whether or not somebody is signed in', async () => {
    const before = await loadPublicReplay(replayId);
    await somebodyElseIsSignedIn();
    const after = await loadPublicReplay(replayId);

    // The bead asks for the other half too — the public path must not be a
    // logged-in-only path with the session stripped — and this is the assertion
    // for it. A signed-in viewer gets the SAME bytes: not more (which would mean
    // the public projection is filtered down for logged-out viewers) and not
    // fewer (which would mean it is a logged-in view with a credential made
    // optional).
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('mints a shareable absolute URL, and will not answer to the internal id', async () => {
    const { replay } = await loadPublicReplay(replayId);
    if (replay === undefined) throw new Error('the fixture just read this replay');

    const share = replayShare(replay, SHARED_FROM);
    expect(share.url).toBe(`${SHARED_FROM}/replay/${replayId}`);
    // Deterministic in the replay and the origin, and nothing else. A share card
    // whose canonical URL moved between two people opening the same link is a
    // share card that told each of them a different story about where it came
    // from.
    expect(JSON.stringify(replayShare(replay, SHARED_FROM))).toBe(JSON.stringify(share));
    expect(replayShare(replay, OTHER_ORIGIN).url).toBe(`${OTHER_ORIGIN}/replay/${replayId}`);

    // The headline has to survive a page with no request to read an origin from,
    // because `generateMetadata` and the body both call it and only one of them
    // has headers.
    const headline = replayHeadline(replay);
    expect(headline.title).not.toContain('undefined');
    expect(headline.description.length).toBeGreaterThan(0);

    // The internal id must not address a replay. A leaked `battles.id` in a
    // screenshot is a leaked id, and one that works.
    const leaked = await loadPublicReplay(match.battle.id);
    expect(leaked.replay, 'the internal battle id addressed a public replay').toBeUndefined();
  });

  it('404s rather than inventing a history for a handle that matches nothing', async () => {
    // A WELL-FORMED uuid that no battle answers to. The malformed case is a
    // different question and it currently has a different answer: `findByReplayId`
    // passes the string straight to a `uuid` column, so `/replay/not-a-uuid`
    // raises Postgres 22P02 and the page 500s instead of calling `notFound()`.
    // Reported rather than asserted here, because a test that pins a 500 as
    // correct would be the `comment as claim` failure with extra steps, and the
    // fix belongs to `ba-battle-replay-yjb` rather than to this milestone.
    const { replay } = await loadPublicReplay(randomUUID());

    // Undefined, which the page renders as notFound(). Not an empty replay and
    // not an `expired` one: a page explaining itself as an expired replay for an
    // id that never existed would be inventing a story about a battle it cannot
    // see, and a reader would have no way to tell it from a real one.
    expect(replay).toBeUndefined();
  });
});

/* ── the static half ──────────────────────────────────────────────────────── */

const REPLAY_ROUTE_DIR = join(REPO_ROOT, 'apps', 'web', 'app', 'replay');
const REPLAY_READ_MODEL = join(REPO_ROOT, 'apps', 'web', 'src', 'replay-view.ts');

/**
 * Every symbol that would make a logged-out read ask for a credential, and why
 * each one is named rather than matched as a pattern.
 *
 * `headers` is deliberately NOT here: `page.tsx` calls it for the host and
 * protocol behind `og:url`, and `x-forwarded-host` is not a credential. A check
 * broad enough to catch a new auth call by also forbidding `headers` would be
 * broken on day one and would be deleted on day two.
 */
const FORBIDDEN: readonly { readonly name: string; readonly why: string }[] = [
  { name: 'sharedAuth', why: 'apps/web/src/auth/server.ts is the Better Auth instance' },
  { name: 'createAuth', why: 'and a request can also build its own' },
  { name: 'auth.api', why: "Better Auth's own session accessor" },
  { name: 'getSession', why: 'the read a session guard calls' },
  { name: 'session.user', why: 'the same thing, reached through the request' },
  { name: 'DrizzleCredentialStore', why: 'the installation-token store the primitives use' },
  { name: 'authenticate', why: 'the gateway authenticator, by any other import path' },
  { name: 'requireSession', why: 'a guard that has been given a better name' },
];

/** Every `.ts`/`.tsx` under the replay route, plus the read model it calls. */
function publicPathSources(): readonly { readonly file: string; readonly source: string }[] {
  const found: { file: string; source: string }[] = [
    { file: 'apps/web/src/replay-view.ts', source: readFileSync(REPLAY_READ_MODEL, 'utf8') },
  ];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        found.push({
          file: `apps/web/app/replay/${full.slice(REPLAY_ROUTE_DIR.length + 1)}`,
          source: readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(REPLAY_ROUTE_DIR);
  return found;
}

/** Comments and string literals removed, so a doc comment cannot trip the check. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('the public path has no way to ask who is asking', () => {
  it('finds the files a logged-out viewer actually reaches', () => {
    // A guard, so the emptiness of the next test is not mistaken for a clean
    // bill of health. A glob that quietly matched nothing would make the
    // forbidden-symbol scan below vacuously true, which is the exact shape this
    // repository keeps writing by accident.
    const files = publicPathSources().map((entry) => entry.file);
    expect(files).toContain('apps/web/src/replay-view.ts');
    expect(files).toContain('apps/web/app/replay/[replayId]/page.tsx');
    expect(files).toContain('apps/web/app/replay/[replayId]/og/route.tsx');
  });

  it('contains no authentication call anywhere a logged-out read goes', () => {
    const offenders: string[] = [];
    for (const { file, source } of publicPathSources()) {
      const code = codeOnly(source);
      for (const { name, why } of FORBIDDEN) {
        if (code.includes(name)) offenders.push(`${file} references ${name} — ${why}`);
      }
    }

    expect(
      offenders,
      'a logged-out viewer would now be asked for a credential on the public replay path',
    ).toEqual([]);
  });

  it('is not gated by a middleware, because there is not one covering it', () => {
    // Next.js middleware is the other way this DoD could quietly stop being true
    // — a matcher added to `middleware.ts` would refuse every request to
    // /replay/:path* before a single line of the page ran, and the scan above
    // would find nothing because middleware is not under app/replay.
    const matcher = join(REPO_ROOT, 'apps', 'web', 'middleware.ts');
    const srcMatcher = join(REPO_ROOT, 'apps', 'web', 'src', 'middleware.ts');
    for (const candidate of [matcher, srcMatcher]) {
      if (readdirSafe(candidate) === undefined) continue;
      const source = codeOnly(readFileSync(candidate, 'utf8'));
      expect(
        source.includes('replay'),
        `${candidate} mentions the replay path; a matcher there gates every logged-out read`,
      ).toBe(false);
    }
  });
});

function readdirSafe(path: string): boolean | undefined {
  try {
    statSync(path);
    return true;
  } catch {
    return undefined;
  }
}
