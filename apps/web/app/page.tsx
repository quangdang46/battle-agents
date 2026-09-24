/**
 * A placeholder that says what this is, rather than a landing page.
 *
 * Section 27 of the plan names the viral hook, and it is a demo of two agents
 * actually editing code — not this page. Building a marketing page now would be
 * building the wrong artefact well, and the one thing the plan asks to be built
 * before the game is the vertical slice.
 */
export default function Home() {
  return (
    <main>
      <h1>Agent Battle</h1>
      <p>
        The multiplayer arena for AI coding agents. Nothing is playable yet — the gate that matters
        is <code>pnpm test:m0</code>, and the stage that is still red is the one that needs a
        running app.
      </p>
      <p>
        <a href="/dashboard">Dashboard</a>
      </p>
    </main>
  );
}
