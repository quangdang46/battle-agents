import type { ReactNode } from 'react';

/**
 * The dashboard shell: a top bar and the tab strip the M2 milestone has.
 *
 * DESIGN.md §4 names both. The tab SET is a function of the milestone, and §4
 * settles the M2 set as QUESTS · AGENTS · ARENA · PROFILE with GUILD arriving at
 * M6. Two of those four have nowhere to go yet, and the strip says so in the tab
 * itself rather than linking to a page that does not exist: a tab that looks
 * live and 404s is worse than no tab, because a reader who pressed it concludes
 * the product is broken rather than that it is early.
 *
 * BOUNTIES leads, and that is a departure from §8's list rather than an
 * addition to it. DESIGN.md §3 makes the bounty board the FIRST SCREEN, so a tab
 * strip whose first item did not lead to the landing would be describing a
 * product that is not this one.
 *
 * ## The strip is a pure function, and one wrapper knows the path
 *
 * A layout cannot see its children's props and `headers()` does not carry the
 * pathname, so "which tab is lit" is a question the router answers. The strip
 * takes the answer as a prop so it stays a pure function of its inputs and can
 * be rendered in a test; `CurrentTabs` is the one client component that reads
 * the path. A context provider or a path header invented for this would be two
 * more places the answer could be wrong.
 */
export type TabId = 'bounties' | 'agents' | 'quests' | 'arena' | 'profile';

interface TabDefinition {
  readonly id: TabId;
  readonly label: string;
  readonly href: string | null;
}

const TABS: readonly TabDefinition[] = [
  { id: 'bounties', label: 'Bounties', href: '/bounties' },
  { id: 'agents', label: 'Agents', href: '/agents' },
  // The three DESIGN.md §4 puts in the M2 set that no surface owns yet. A null
  // href is the honest encoding of "not built", and the tab renders as text.
  { id: 'quests', label: 'Quests', href: null },
  { id: 'arena', label: 'Arena', href: null },
  { id: 'profile', label: 'Profile', href: null },
];

export function TabStrip({ active }: { readonly active: TabId }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((tab) => (
        <Tab key={tab.id} tab={tab} active={tab.id === active} />
      ))}
    </nav>
  );
}

function Tab({ tab, active }: { readonly tab: TabDefinition; readonly active: boolean }) {
  if (tab.href === null) {
    return (
      <span className="tab tab--absent" title="Arrives with its milestone">
        {tab.label}
      </span>
    );
  }
  return (
    <a className="tab" href={tab.href} aria-current={active ? 'page' : undefined}>
      {tab.label}
    </a>
  );
}

export interface DashboardShellProps {
  /** The signed-in person's GitHub login, or null when the session has none. */
  readonly viewerLogin: string | null;
  readonly children: ReactNode;
}

export function DashboardShell({ viewerLogin, children }: DashboardShellProps) {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar__brand">Agent Battle</span>
        <span className="topbar__viewer">
          {viewerLogin === null ? 'signed in' : `signed in as ${viewerLogin}`}
        </span>
      </header>
      {children}
    </div>
  );
}

/**
 * The gate, for a page that has to say why it is not showing its content.
 *
 * `children` rather than a `notice` string because every caller of this is a
 * refusal and a refusal always has to name the cause AND the next action. A
 * refusal that only says "no" leaves the reader to guess whether they are
 * signed out, not allowed, or looking at a broken build.
 */
export function Gate({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <main className="page">
      <section className="state">
        <h1 className="state__title">{title}</h1>
        {children}
      </section>
    </main>
  );
}
