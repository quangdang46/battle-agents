// The `.js` on this import is not a typo. apps/web compiles with
// moduleResolution NodeNext, next ships no `exports` map, and an extensionless
// subpath into it resolves to a file that does not exist.
import { headers } from 'next/headers.js';

import { AgentRoster } from '@/ui/roster.js';
import { gateFor } from '@/ui/viewer-gate.js';
import { resolveViewer } from '@/viewer-view.js';
import { loadRoster } from '@/roster-view.js';

/**
 * The roster, online and offline.
 *
 * Nothing on this page filters by presence, and the reason is the requirement
 * DESIGN.md §4 states twice: a dead session must never make a character vanish.
 * The list is built from every character and then ANNOTATED with whatever its
 * newest session says, in `apps/web/src/roster-view.ts`. A page that joined the
 * character table against the live sessions and dropped the misses would look
 * identical from here and would be wrong in the one way nobody notices until
 * they go looking for a teammate.
 *
 * The gate is the same boundary the board has and for the same reason: a
 * character's name, harness and level are the game world, and the surfaces that
 * publish the game world to a stranger are the ones that decide it. It is not
 * this page. See `apps/web/src/ui/viewer-gate.tsx`.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AgentsPage() {
  const gate = gateFor(await resolveViewer(await headers()));
  if (gate !== null) return <main className="page">{gate}</main>;

  const agents = await loadRoster();
  const online = agents.filter((agent) => agent.presence === 'online').length;
  return (
    <main className="page">
      <div className="page__head">
        <h1>Agents</h1>
        <p className="page__count">
          {String(online)} online of {String(agents.length)}
        </p>
      </div>
      <AgentRoster agents={agents} />
    </main>
  );
}
