import type { ReactNode } from 'react';

import { Gate } from './shell.js';
import { SIGN_IN_PATH, type Viewer } from '../viewer-view.js';

/**
 * The page-level gate, and the reason the layout's one is not enough.
 *
 * ## A layout gate does not gate
 *
 * This started as a check in `app/(app)/layout.tsx` and it did not work. The
 * layout returned the "sign in" state instead of rendering its children, the
 * page was never displayed, and the bounty was still in the HTML: Next renders
 * the child page anyway to build the RSC payload it streams for client-side
 * navigation, so the repository, the issue number and the reward reached a
 * logged-out browser inside `self.__next_f.push`. Reading the response is what
 * found it — `curl /bounties | grep local-dojo` on a build whose layout gate was
 * correct and whose page was not.
 *
 * That is the same boundary `bounty-routes.ts` draws for HTTP, undone by a
 * component that looks like it enforces it. So the check is repeated where the
 * READ is: every page asks before it asks the command, and a page that forgot
 * would show a board rather than a gate — which is the kind of mistake a test
 * looking for a gate would not catch.
 *
 * The layout keeps its own copy because it also decides the chrome, and a
 * signed-out reader should not see a top bar with a sign-in state inside it.
 */
export function gateFor(viewer: Viewer): ReactNode | null {
  if (viewer.kind === 'signed-in') return null;

  if (viewer.kind === 'auth-unconfigured') {
    return (
      <Gate title="Sign-in is not configured on this deployment">
        <p className="state__body">
          These environment variables are empty: <code>{viewer.missing.join(', ')}</code>. Copy{' '}
          <code>.env.example</code> to <code>.env</code>, fill them in, and restart the web
          container. The board sits behind this check on purpose, so it stays empty until it is
          answered.
        </p>
      </Gate>
    );
  }

  return (
    <Gate title="Sign in to see the board">
      <p className="state__body">
        A bounty names a repository and an issue number, so the board is not public. The replay of a
        finished battle is — share one of those links and it opens without a sign-in.
      </p>
      <a className="state__action" href={SIGN_IN_PATH}>
        Sign in with GitHub
      </a>
    </Gate>
  );
}
