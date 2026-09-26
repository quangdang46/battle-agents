// The `.js` on this import is not a typo. apps/web compiles with
// moduleResolution NodeNext, next ships no `exports` map, and an extensionless
// subpath into it resolves to a file that does not exist.
import { headers } from 'next/headers.js';
import { notFound } from 'next/navigation.js';

import { AgentCardPanel } from '@/ui/roster.js';
import { gateFor } from '@/ui/viewer-gate.js';
import { resolveViewer } from '@/viewer-view.js';
import { loadAgentCard } from '@/roster-view.js';

/**
 * One character.
 *
 * DESIGN.md §4: level · current quest and session · skill bars · [Enter Arena]
 * [View History] [Join Guild]. The first three are real and rendered; the three
 * actions say where they are going rather than pretending to be buttons, for
 * the reason written beside them in `apps/web/src/ui/roster.tsx`.
 *
 * The level, the experience and the skill bars all come from
 * `progression.read`, and the list this card was reached from asks the same
 * command for the same two. Reading the row directly would be one query fewer
 * and a second definition of a character sheet that could drift from the one the
 * CLI and the MCP tool read.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AgentCardParams {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function AgentPage({ params }: AgentCardParams) {
  const gate = gateFor(await resolveViewer(await headers()));
  if (gate !== null) return <main className="page">{gate}</main>;

  const { id } = await params;
  const card = await loadAgentCard(id);
  if (card === undefined) notFound();

  return (
    <main className="page">
      <AgentCardPanel card={card} />
    </main>
  );
}
