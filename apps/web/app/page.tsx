import { redirect } from 'next/navigation.js';

/**
 * The landing, which is the board.
 *
 * DESIGN.md §3 settles it: the bounty board is the first screen, and the Coding
 * City arrives at M5 as a second view reached from the board rather than as the
 * landing. This page was a placeholder that said so; the thing it pointed at now
 * exists, so it points at that instead of describing the state of the build to
 * whoever arrived first.
 *
 * A redirect rather than a render, so there is exactly one `/bounties` in the
 * app and a link to the root and a link to the board cannot drift apart.
 */
export default function Home() {
  redirect('/bounties');
}
