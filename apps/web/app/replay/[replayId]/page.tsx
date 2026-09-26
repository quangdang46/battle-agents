// The `.js` on these two is not a typo and must not be "fixed". apps/web
// compiles with moduleResolution NodeNext, and next ships no `exports` map, so
// an extensionless subpath into it resolves to a file that does not exist and
// the typecheck fails with "Cannot find module 'next/navigation'". The extension
// is what makes the specifier resolvable here, and it is also what webpack
// wants.
import { headers } from 'next/headers.js';
import { notFound } from 'next/navigation.js';
import type { Metadata } from 'next';

import { renderReport, UNKNOWN_HARNESS_LABEL, WITHHELD_CRITERION_LABEL } from '@/battle-report.js';
import type { BattleReport } from '@/battle-report.js';
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
      <BattleReportView replay={replay} />
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
 * What a viewer sees when the log holds nothing for this battle.
 *
 * A stated state rather than an error. The alternative — a 500, or a page that
 * renders as if the battle never happened — is a dead link that lies about why.
 *
 * The wording was changed by `ba-battle-reporter-good-first-rxz` and the change
 * is a correction, not a rewording. This used to say the events "are older than
 * the 365 days the log keeps them", which is the retention inference, and
 * `docs/design/public-replay.md` is explicit that `expired` may claim only "no
 * events for this battle are present" — whether they were pruned or never
 * written is not answerable from the log. `buildPublicReplay` gives a battle
 * with no beats the same state whatever the reason, and running the reporter
 * against a real database found a `running` battle that was never joined being
 * told it had aged out. It is not aged out; it has no rows.
 */
function ExpiredNotice() {
  return (
    <section>
      <h2>No timeline for this battle</h2>
      <p>
        A timeline is rebuilt from the activity log, and the log holds no events for this battle.
        The log keeps a trail for 365 days because a replay is a link, so this is usually the far
        end of that window — but the log cannot say whether the events were pruned or were never
        written, and this page will not guess.
      </p>
    </section>
  );
}

/**
 * The report, and the states that suppress it.
 *
 * Everything a viewer reads is rendered from `renderReport`, which is a pure
 * function of the projection. That is a security decision and not a tidiness
 * one: `docs/design/public-replay.md` publishes an allow-list, and a page that
 * assembled sentences itself would be a second place deciding what a public
 * page may say — the exact shape of failure the projection exists to prevent,
 * one layer out. This file holds no vocabulary; the one string it substitutes
 * for a withheld value comes from `@/battle-report.js` rather than being
 * written here.
 */
function BattleReportView({ replay }: { readonly replay: PublicReplay }) {
  const report = renderReport(replay);
  if (replay.state === 'expired') {
    return (
      <>
        <p>{report.summary}</p>
        <ExpiredNotice />
      </>
    );
  }
  return (
    <>
      <p>{report.summary}</p>
      <Scoreboard report={report} />
      <Breakdown report={report} />
      <Steps steps={report.steps} />
    </>
  );
}

function Scoreboard({ report }: { readonly report: BattleReport }) {
  if (report.fighters.length === 0) return null;
  return (
    <section>
      <h2>Who competed</h2>
      <table>
        <thead>
          <tr>
            <th>Fighter</th>
            <th>Harness</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {report.fighters.map((fighter) => (
            <tr key={fighter.label}>
              <th scope="row">{fighter.label}</th>
              <td>{fighter.harness ?? UNKNOWN_HARNESS_LABEL}</td>
              <td>{fighter.won ? `${fighter.total ?? 0} (winner)` : (fighter.total ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * The published weights and the scores they produced.
 *
 * Both halves or neither. A total with no rubric beside it is a number a reader
 * has to take on trust, and the rubric is the one claim on this page they cannot
 * check for themselves — which is why `docs/design/public-replay.md` publishes
 * it in the first place.
 */
function Breakdown({ report }: { readonly report: BattleReport }) {
  if (report.rubric.length === 0 && report.fighters.length === 0) return null;
  return (
    <section>
      <h2>How it was scored</h2>
      {report.rubric.length === 0 ? null : (
        <table>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {report.rubric.map((entry) => (
              <tr key={entry.criterion ?? String(entry.weight)}>
                <th scope="row">{entry.criterion ?? WITHHELD_CRITERION_LABEL}</th>
                <td>{entry.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.fighters.map((fighter) => (
        <table key={fighter.label}>
          <caption>
            {fighter.label} &mdash; {fighter.harness ?? UNKNOWN_HARNESS_LABEL}
          </caption>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Weight</th>
              <th>Score</th>
              <th>Weighted</th>
            </tr>
          </thead>
          <tbody>
            {fighter.criteria.map((row, index) => (
              <tr key={row.criterion ?? `withheld-${index}`}>
                <th scope="row">{row.criterion ?? WITHHELD_CRITERION_LABEL}</th>
                <td>{row.weight}</td>
                <td>{row.score}</td>
                <td>{row.weighted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}

function Steps({ steps }: { readonly steps: BattleReport['steps'] }) {
  if (steps.length === 0) return null;
  return (
    <section>
      <h2>What happened, in order</h2>
      <ol>
        {steps.map((step, index) => (
          // Two events can share an instant, so the index is part of the key.
          // Without it React warns about a duplicate key and reconciliation
          // drops a step, which on a timeline is a silently missing event.
          <li key={`${step.at}-${index}`}>
            <time dateTime={step.at}>{step.label}</time> <span>{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
