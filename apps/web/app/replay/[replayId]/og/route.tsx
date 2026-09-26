import { ImageResponse } from 'next/og.js';
import { notFound } from 'next/navigation.js';

import { loadPublicReplay, replayHeadline } from '@/replay-view.js';
import type { PublicReplay } from '@/replay-view.js';

/**
 * `GET /replay/<id>/og` — the share card.
 *
 * WHAT THIS IS NOT. Plan section 22 puts "an og:image generated from the final
 * frame" on the replay page, and the final frame is a PixiJS arena render that
 * belongs to `ba-game-client-pixijs-riw`. That world does not exist yet, so this
 * renders the SCOREBOARD instead: who competed, on what harness, and what the
 * judge said. When the arena lands this route is where the frame replaces the
 * card, and nothing else about the page has to change.
 *
 * Every string drawn here comes off a `PublicReplay`, which is already the
 * output of the allow-list in `packages/features/activity/src/replay.ts`. There
 * is no second filtering step in this file, and that is the point of it being
 * this short: an image route is a rendering surface, not a place to decide what
 * a stranger may see.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 64;
const FONT_SIZE = 40;

interface OgParams {
  readonly params: Promise<{ readonly replayId: string }>;
}

export async function GET(_request: Request, { params }: OgParams): Promise<Response> {
  const { replayId } = await params;
  const { replay } = await loadPublicReplay(replayId);
  if (replay === undefined) notFound();
  return new ImageResponse(<Card replay={replay} />, { width: WIDTH, height: HEIGHT });
}

function Card({ replay }: { readonly replay: PublicReplay }) {
  const { title, description } = replayHeadline(replay);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: PADDING,
        backgroundColor: '#101014',
        color: '#f4f4f5',
        fontSize: FONT_SIZE,
      }}
    >
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 700 }}>{title}</div>
      <div style={{ display: 'flex', fontSize: 32, color: '#a1a1aa' }}>{description}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {replay.fighters.map((fighter) => (
          <div key={fighter.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex' }}>
              {fighter.label} &middot; {fighter.harness ?? 'unknown harness'}
            </span>
            <span style={{ display: 'flex' }}>
              {fighter.won ? 'winner' : (fighter.total ?? 'no score')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
