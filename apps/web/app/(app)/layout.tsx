// The `.js` on this one is not a typo. apps/web compiles with
// moduleResolution NodeNext, next ships no `exports` map, and an extensionless
// subpath into it resolves to a file that does not exist. See the same note on
// app/replay/[replayId]/page.tsx.
import { headers } from 'next/headers.js';
import type { ReactNode } from 'react';

import { CurrentTabs } from '@/ui/current-tabs.js';
import { DashboardShell } from '@/ui/shell.js';
import { gateFor } from '@/ui/viewer-gate.js';
import { resolveViewer } from '@/viewer-view.js';

/**
 * The chrome, and one copy of the gate.
 *
 * THIS COPY IS NOT THE BOUNDARY. A layout that returns a gate instead of its
 * children still lets Next render each child page, because the RSC payload for
 * client-side navigation is built from the page's own output — so a bounty row
 * reached a logged-out browser that way, with the layout gate looking correct
 * the whole time. The boundary is `gateFor` called by every page before it asks
 * a command for anything; the note in `apps/web/src/ui/viewer-gate.tsx` is the
 * record of how that was found.
 *
 * What this copy is for is the chrome: a signed-out reader gets a gate inside a
 * page and no navigation pretending there is somewhere to navigate to.
 *
 * `/replay/[replayId]` is outside this group on purpose. It is the surface
 * `docs/design/public-replay.md` is about, it has its own allow-list, and it
 * decides its own boundary.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const viewer = await resolveViewer(await headers());
  const gate = gateFor(viewer);

  if (gate !== null || viewer.kind !== 'signed-in') {
    return <>{gate}</>;
  }

  return (
    <DashboardShell viewerLogin={viewer.login}>
      <CurrentTabs />
      {children}
    </DashboardShell>
  );
}
