/**
 * The session resume grace, in one place, because two features need it.
 *
 * §3.2 gives a session a grace period: a participant that disconnects mid-battle
 * may come back, and only after the window does the session become abandoned.
 * The agent feature owns the handshake that starts a session, and the battle
 * feature owns the match a participant may drop out of — so both need the same
 * number, and neither may own it.
 *
 * It lives here rather than in one of them because BOTH ARE REMOVABLE. The
 * removal test strips each feature in turn and typechecks the tree, so a shared
 * constant held by a feature is a coupling between two things the architecture
 * explicitly keeps apart: removing the agent feature deleted the import and left
 * the battle feature referencing a name that no longer existed. The same reasoning
 * that forbids features importing each other forbids them owning each other's
 * numbers.
 *
 * A duration is not a game concept, so this does not put a word in core. Protocol
 * already owns the session vocabulary these events are written in.
 */

/** Fifteen minutes, the figure §3.2's grace period and §10.3's match length share. */
export const DEFAULT_SESSION_RESUME_GRACE_MS = 15 * 60_000;
