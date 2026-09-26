import type { AgentCard, RosterEntry } from '../roster-view.js';

/**
 * The roster and the agent card.
 *
 * ## A character who is not online is still on this list
 *
 * That is the requirement DESIGN.md §4 states twice and it is enforced in the
 * read model, because a component cannot enforce it: this file renders every
 * entry it is given, in the order it is given, and filters nothing. The
 * component that dropped offline characters would be indistinguishable from one
 * that never had them, which is the whole reason
 * `tests/integration/web-ui-surface.test.ts` builds the roster from a real
 * database with a stale session, an ended session and a character with no
 * session at all, and renders THAT.
 *
 * The skill bars obey the same rule from the other direction. DESIGN.md §4 is
 * explicit that stats derive from documented behaviour and never from "model
 * intelligence", so a bar is filled to a level the progression feature awarded,
 * and there is no bar anywhere on this page for a number that came from a
 * harness name.
 */
export function AgentRoster({ agents }: { readonly agents: readonly RosterEntry[] }) {
  if (agents.length === 0) {
    return (
      <section className="state">
        <h2 className="state__title">No characters have been registered</h2>
        <p className="state__body">
          A character is created the first time a coding agent says hello with a credential, so this
          list fills itself as agents connect. Nothing is missing and nothing is broken.
        </p>
      </section>
    );
  }
  return (
    <ul className="roster">
      {agents.map((agent) => (
        <li key={agent.id}>
          <a className="character" href={`/agents/${agent.id}`}>
            <span className="character__head">
              <span className="character__name">{agent.name}</span>
              <span className="character__level">
                Level {String(agent.level)} · {agent.xp} xp
              </span>
            </span>
            {agent.currentQuest === null ? null : (
              <p className="character__quest">On: {agent.currentQuest}</p>
            )}
            <Presence presence={agent.presence} lastSeenLabel={agent.lastSeenLabel} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * One presence, and one dot.
 *
 * The dot marks a state the page actually read — a run that reported inside the
 * window or one that did not — and it is the only coloured dot on the page. It
 * does not pulse: a character whose run is alive is already saying so in the
 * text underneath, and an animation that loops for ever says "something is
 * happening here" whether or not anything is.
 */
function Presence({
  presence,
  lastSeenLabel,
}: {
  readonly presence: RosterEntry['presence'];
  readonly lastSeenLabel: string;
}) {
  const online = presence === 'online';
  return (
    <span className={online ? 'presence presence--online' : 'presence'}>
      <span className="presence__dot" aria-hidden="true" />
      <span>
        {online ? 'online' : 'offline'} · {lastSeenLabel}
      </span>
    </span>
  );
}

export function AgentCardPanel({ card }: { readonly card: AgentCard }) {
  return (
    <article className="card">
      <header className="card__title">
        <h1>{card.name}</h1>
        <span className="character__level">Level {String(card.level)}</span>
      </header>

      <Presence presence={card.presence} lastSeenLabel={card.lastSeenLabel} />

      <dl className="detail__row">
        <dt>Harness</dt>
        <dd>{card.harness}</dd>
        <dt>Build</dt>
        <dd>{card.build}</dd>
        {card.currentQuest === null ? null : (
          <>
            <dt>Quest</dt>
            <dd>{card.currentQuest}</dd>
          </>
        )}
        {card.sessionId === null ? null : (
          <>
            <dt>Session</dt>
            <dd>
              {card.sessionId} ({card.sessionStatus})
            </dd>
          </>
        )}
      </dl>

      {/*
        The empty state is a sentence about the character, not about the chart.
        `progression.read` carries an `exists` flag for exactly this — a sheet of
        zeroed bars would make a week-old veteran of nothing look exactly like
        somebody who signed up this morning.

        Worth saying plainly: in this build the branch is unreachable through the
        storage layer. `DrizzleProgressionRepository.find` synthesises a
        progression row from `agents` when `agent_stats` has none, so every
        character that exists reports `exists: true` and a brand-new one renders
        eight level-1 bars. The flag is honoured because it is part of the
        contract this view reads, and a day when the repository stops
        synthesising, this is the branch that stops a new player looking like a
        veteran.
      */}
      {card.hasProgress ? (
        <section>
          <h2>Skills</h2>
          <SkillBars card={card} />
        </section>
      ) : (
        <p className="notice">
          This character has no recorded outcomes yet, so it has no skills. Skills are awarded from
          work the game can see — a merged pull request, a passed test, a recovered run — and never
          from which harness is driving.
        </p>
      )}

      <section className="counters">
        <p>
          <b>{String(card.battlesWon)}</b> battles won
        </p>
        <p>
          <b>{String(card.battlesLost)}</b> battles lost
        </p>
        <p>
          <b>{String(card.testsPassed)}</b> tests passed
        </p>
        <p>
          <b>{String(card.pullRequestsMerged)}</b> pull requests merged
        </p>
      </section>

      {/*
        The three actions DESIGN.md §4 puts on the card, and what each one
        actually is today. Each says where it goes rather than pretending to be
        a button: the arena and the history are surfaces no bead has built, and
        the guild is M6 (`ba-feature-guild-5g6`). A card whose buttons all
        404 is a card that costs the reader three clicks to discover nothing.
      */}
      <section className="detail__row">
        <p
          className="action action--absent"
          title="The arena surface arrives with ba-game-client-pixijs-riw"
        >
          Enter arena — not built yet
        </p>
        <p
          className="action action--absent"
          title="A character's battle history has no surface yet"
        >
          View history — not built yet
        </p>
        <p className="action action--absent" title="Guilds are M6, owned by ba-feature-guild-5g6">
          Join guild — M6
        </p>
      </section>
    </article>
  );
}

/**
 * One bar per skill, filled to the level the progression feature awarded.
 *
 * The fill is the level against the highest level any skill can reach in this
 * build, so a sheet of level-1s reads as a sheet of level-1s instead of as eight
 * full bars. `describeSkills` returns all eight always, in the plan's order, so
 * the untrained skills are visible — which is the only way "specialisation
 * without maxing everything" can be seen at all.
 */
function SkillBars({ card }: { readonly card: AgentCard }) {
  const highest = card.skills.reduce((top, skill) => Math.max(top, skill.level), 1);
  return (
    <ul className="skills">
      {card.skills.map((skill) => {
        const width = Math.min(100, Math.round((skill.level / highest) * 100));
        return (
          <li key={skill.skill} className="skill">
            <span className="skill__name">{skill.skill}</span>
            <span className="skill__track">
              <span className="skill__fill" style={{ width: `${String(width)}%` }} />
            </span>
            <span className="skill__level">{skill.level}</span>
          </li>
        );
      })}
    </ul>
  );
}
