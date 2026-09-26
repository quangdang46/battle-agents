// The `.js` on the first import is not a typo. apps/web compiles with
// moduleResolution NodeNext, next ships no `exports` map, and an extensionless
// subpath into it resolves to a file that does not exist.
import { headers } from 'next/headers.js';

import { BoardHeader, HotBounties } from '@/ui/board.js';
import { gateFor } from '@/ui/viewer-gate.js';
import { resolveViewer } from '@/viewer-view.js';
import { loadBountyBoard } from '@/board-view.js';

/**
 * The bounty board, and the first screen.
 *
 * DESIGN.md §3 settles this over §8's pixel-city landing: the plan's own defence
 * against the gimmick trap is to ship M2's real utility before heavy game art,
 * and a pixel city on the landing page inverts that defence exactly. The Coding
 * City arrives at M5 as a second view reached from here.
 *
 * The gate comes BEFORE the read, and that order is the boundary rather than a
 * style choice. A gate after the read would still put the board in the streamed
 * RSC payload; see `apps/web/src/ui/viewer-gate.tsx`.
 *
 * `force-dynamic` because every render reads the database through the bounty
 * list command, and a statically optimised board would be a board of bounties as
 * they were at build time — which for a page whose whole content is "what is
 * claimable right now" is a page that is wrong in the way that costs money.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function BountiesPage() {
  const gate = gateFor(await resolveViewer(await headers()));
  if (gate !== null) return <main className="page">{gate}</main>;

  const board = await loadBountyBoard();
  return (
    <main className="page">
      <BoardHeader board={board} />
      <HotBounties rows={board.rows} />
    </main>
  );
}
