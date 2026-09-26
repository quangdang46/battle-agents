'use client';

import { usePathname } from 'next/navigation.js';

import { TabStrip } from './shell.js';
import type { TabId } from './shell.js';

/**
 * The one client component in the shell.
 *
 * It exists because a layout cannot see the pathname and `headers()` does not
 * carry it, and everything else about the strip is a pure function of which tab
 * is lit. Keeping the knowledge to one `usePathname()` call means the strip
 * itself stays renderable in a test, and adding a third surface is a change to
 * this file rather than a hunt.
 */
export function CurrentTabs() {
  const pathname = usePathname() ?? '/bounties';
  return <TabStrip active={tabFor(pathname)} />;
}

/** The tab a path belongs to. Unlisted paths fall back to the board, which is the landing. */
function tabFor(pathname: string): TabId {
  return pathname.startsWith('/agents') ? 'agents' : 'bounties';
}
