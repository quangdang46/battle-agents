// The `.js` on the first import is not a typo. apps/web compiles with
// moduleResolution NodeNext, next ships no `exports` map, and an extensionless
// subpath into it resolves to a file that does not exist.
import { headers } from 'next/headers.js';
import { notFound } from 'next/navigation.js';

import { BountyDetailPanel } from '@/ui/board.js';
import { gateFor } from '@/ui/viewer-gate.js';
import { resolveViewer } from '@/viewer-view.js';
import { loadBountyDetail } from '@/board-view.js';

/**
 * One bounty.
 *
 * The detail is the second half of DESIGN.md §4's board: repo · issue · reward ·
 * requirements · [ENTER BATTLE] · competitors. Everything there but the
 * competitor count is real and rendered; the reason the count is absent is in
 * `apps/web/src/board-view.ts`, and the reason it is not filled with the number
 * of sponsors is the same one.
 *
 * `[ENTER BATTLE]` is a LINK and the link is this bead's. The view it lands on
 * is `ba-battle-replay-yjb`'s, and this file renders none of it: a replay is a
 * pure function of the event log, and a page that assembled a second copy would
 * be the second source for one fact.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface BountyPageParams {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function BountyDetailPage({ params }: BountyPageParams) {
  const gate = gateFor(await resolveViewer(await headers()));
  if (gate !== null) return <main className="page">{gate}</main>;

  const { id } = await params;
  const bounty = await loadBountyDetail(id);
  // A URL that matches no bounty is a missing page, not a bounty with nothing on
  // it. A page that explained itself as a closed bounty for an id that never
  // existed would be inventing a history for something it cannot see.
  if (bounty === undefined) notFound();

  return (
    <main className="page">
      <BountyDetailPanel bounty={bounty} />
    </main>
  );
}
