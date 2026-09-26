// The `.js` on these two is not a typo and must not be "fixed". apps/web
// compiles with moduleResolution NodeNext, and next ships no `exports` map, so
// an extensionless subpath into it resolves to a file that does not exist and
// the typecheck fails with "Cannot find module 'next/navigation'". The extension
// is what makes the specifier resolvable here, and it is also what webpack
// wants.
import { headers } from 'next/headers.js';
import { notFound } from 'next/navigation.js';
import type { Metadata } from 'next';

import { loadPublicReplay, replayHeadline, replayShare } from '@/replay-view.js';
import type { PublicReplay } from '@/replay-view.js';

/**
 * The shared replay, readable by anybody with the link.
 *
 * Plan section 27 M4's DoD is one sentence: share this link with a logged-out
 * user and they see the full timeline. Nothing here authenticates, and that is
 * the design rather than an omission — `@/replay-view.js` takes no request and
 * no session, so the page has no credential to check and no branch where one
 * could be forgotten. What a logged-out viewer is ALLOWED to see is a chosen
 * allow-list, written down in `docs/design/public-replay.md` and implemented as
 * a projection in `packages/features/activity/src/replay.ts`; this file renders
 * the projection and decides nothing about it.
 *
 * What this file does not have is the PixiJS arena playback and the og:image
 * generated from the final frame that plan section 22 puts here. Both belong to
 * `ba-game-client-pixijs-riw`, and the frame they would render does not exist
 * yet. The og card below is a scoreboard card, not a frame.
 *
 * `dynamic` is forced because every render reads the database, and a statically
 * optimised version of a page whose whole point is to be current would serve a
 * timeline that finished before it was built.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ReplayParams {
  readonly params: Promise<{ readonly replayId: string }>;
}

export async function generateMetadata({ params }: ReplayParams): Promise<Metadata> {
  const { replayId } = await params;
  const { replay } = await loadPublicReplay(replayId);
  if (replay === undefined) {
    return { title: 'Battle replay not found' };
  }
  const share = replayShare(replay, await requestOrigin());
  return {
    title: share.title,
    description: share.description,
    alternates: { canonical: share.url },
    openGraph: {
      type: 'article',
      url: share.url,
      title: share.title,
      description: share.description,
      // The card route rather than Next's hashed file-convention URL: a stable
      // path is a path somebody can put in a test, and this one is reachable
      // without the page that links it.
      images: [{ url: `/replay/${replayId}/og`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: share.title, description: share.description },
  };
}

/**
 * The origin this request arrived on, so `og:url` and `og:image` are absolute.
 *
 * Read per request rather than configured, because a configured value is one
 * more thing to set per deployment and an unset one produces a share card
 * pointing at localhost. `x-forwarded-proto` first, because behind a proxy the
 * socket protocol is the proxy's.
 */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  if (host === null) return 'http://localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? 'http';
  return `${protocol}://${host}`;
}

export default async function ReplayPage({ params }: ReplayParams) {
  const { replayId } = await params;
  const { replay } = await loadPublicReplay(replayId);
  // A link that matches no battle is a 404, not an empty replay. A page that
  // explained itself as an expired replay for an id that never existed would be
  // inventing a history for a battle it cannot see.
  if (replay === undefined) notFound();

  return (
    <main>
      <ReplayHeader replay={replay} />
      {replay.state === 'expired' ? <ExpiredNotice /> : <Timeline replay={replay} />}
    </main>
  );
}

function ReplayHeader({ replay }: { readonly replay: PublicReplay }) {
  const { title, description } = replayHeadline(replay);
  return (
    <header>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

/**
 * What a viewer sees when the log no longer holds this battle.
 *
 * A stated state rather than an error, and the state is the one the activity
 * feature's retention policy produces: this feature keeps a trail for 365 days
 * because a replay is a link, and this is what the far end of that window looks
 * like. The alternative — a 500, or a page that renders as if the battle never
 * happened — is a dead link that lies about why.
 */
function ExpiredNotice() {
  return (
    <section>
      <h2>This replay is past its retention window</h2>
      <p>
        The timeline is rebuilt from the activity log, and this battle&rsquo;s events are older than
        the 365 days the log keeps them. The result it recorded is still on the scoreboard row; the
        step-by-step story is not kept.
      </p>
    </section>
  );
}

function Timeline({ replay }: { readonly replay: PublicReplay }) {
  return (
    <>
      <Scoreboard replay={replay} />
      <ol>
        {replay.beats.map((beat, index) => (
          // Two events can share an instant, so the index is part of the key.
          // Without it React warns about a duplicate key and reconciliation
          // drops a beat, which on a timeline is a silently missing event.
          <li key={`${beat.at}-${index}`}>
            <time dateTime={beat.at}>{formatOffset(beat.offsetMs)}</time> <span>{beat.beat}</span>
            {beat.fighter === null ? null : <span> &mdash; {beat.fighter}</span>}
            {Object.keys(beat.detail).length === 0 ? null : (
              <span> ({describeDetail(beat.detail)})</span>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function Scoreboard({ replay }: { readonly replay: PublicReplay }) {
  if (replay.fighters.length === 0) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>Fighter</th>
          <th>Harness</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {replay.fighters.map((fighter) => (
          <tr key={fighter.label}>
            <th scope="row">{fighter.label}</th>
            <td>{fighter.harness ?? 'unknown harness'}</td>
            <td>{fighter.won ? `${fighter.total ?? 0} (winner)` : (fighter.total ?? '—')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatOffset(offsetMs: number): string {
  const totalSeconds = Math.floor(offsetMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function describeDetail(detail: Readonly<Record<string, string | number | boolean>>): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(', ');
}
