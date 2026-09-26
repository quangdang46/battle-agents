import type { BountyBoard, BountyBoardRow, BountyDetail } from '../board-view.js';

/**
 * The bounty board and the bounty detail.
 *
 * ## What a row is made of, and why
 *
 * DESIGN.md §4 asks for "amount · difficulty · repo · competitor count". Two of
 * those are rendered here and two are not, and the reason is in
 * `apps/web/src/board-view.ts`: the API answers no difficulty and there is no
 * table behind a competitor count. A row that showed either would be showing a
 * number the game cannot derive, which DESIGN.md §4's own agent-card data rule
 * calls a decoration.
 *
 * So the row is the four facts the game can stand behind — the reward, the
 * repository and issue, the status, and how many sponsors are on it — in the
 * order a reader decides in: what it pays, what it is, and whether it is still
 * open. The reward gets its own column rather than sitting in the flow, because
 * a list you scan vertically needs its amounts to line up.
 *
 * The count of sponsors is NOT labelled "competitors" and never will be, for the
 * same reason. It is the number of people who put money on this, which is a
 * different fact and is true.
 */

/** The board's own line: how much is on it and how much of it is claimable. */
export function BoardHeader({ board }: { readonly board: BountyBoard }) {
  return (
    <div className="page__head">
      <h1>Hot bounties</h1>
      <p className="page__count">
        {String(board.openCount)} open of {String(board.rows.length)} ·{' '}
        {formatBoardTotal(board.totalCents)}
      </p>
    </div>
  );
}

export function HotBounties({ rows }: { readonly rows: readonly BountyBoardRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="state">
        <h2 className="state__title">Nothing is on the board yet</h2>
        <p className="state__body">
          A bounty is a reward somebody has put on a real GitHub issue. None has been opened, so
          there is nothing to claim and nothing to read.
        </p>
        <p className="state__body">
          One is created with <code>bounty.create</code> over the protocol, or by a sponsor through
          the API. The command takes a repository, an issue number and a currency; funding arrives
          separately, so an unfunded bounty is a target rather than a prize.
        </p>
      </section>
    );
  }
  return (
    <ul className="board">
      {rows.map((row) => (
        <li key={row.id}>
          <a className="bounty" href={`/bounties/${row.id}`}>
            <span
              className={
                row.rewardCents > 0 ? 'bounty__reward' : 'bounty__reward bounty__reward--unfunded'
              }
            >
              {row.rewardLabel}
            </span>
            <span className="bounty__subject">
              <span className="bounty__repo">{row.repoLabel}</span>{' '}
              <span className="bounty__issue">#{String(row.issueNumber)}</span>
            </span>
            <span className="bounty__meta">
              <b>{row.status}</b>
              {row.sponsorCount > 0 ? ` · ${String(row.sponsorCount)} sponsor` : ''}
              {row.sponsorCount > 1 ? 's' : ''}
              {row.expiresLabel === null ? '' : ` · ${row.expiresLabel}`}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function BountyDetailPanel({ bounty }: { readonly bounty: BountyDetail }) {
  return (
    <article className="detail">
      <header>
        <p className="detail__reward">{bounty.rewardLabel}</p>
        <h1>
          <a href={bounty.issueUrl} rel="noreferrer noopener" target="_blank">
            {bounty.repoLabel} #{String(bounty.issueNumber)}
          </a>
        </h1>
      </header>

      <dl className="detail__row">
        <dt>Status</dt>
        <dd>{bounty.status}</dd>
        <dt>Mode</dt>
        <dd>{bounty.mode}</dd>
        <dt>Sponsors</dt>
        <dd>{String(bounty.sponsorCount)}</dd>
        {bounty.expiresLabel === null ? null : (
          <>
            <dt>Claim window</dt>
            <dd>{bounty.expiresLabel}</dd>
          </>
        )}
        {bounty.claimedByAgentId === null ? null : (
          <>
            <dt>Claimed by</dt>
            <dd>{bounty.claimedByAgentId}</dd>
          </>
        )}
      </dl>

      {/*
        The link out of here, and only the link. The replay view this points at
        is `ba-battle-replay-yjb`'s; a bounty names it through `battles.replay_id`
        and nothing on this page renders it. When no battle has been fought the
        action is absent rather than a link to an empty page, because "enter the
        battle" on a bounty nobody has entered yet is a promise the data cannot
        keep.
      */}
      {bounty.battle === null ? (
        <p className="action action--absent" title="No battle has been fought over this bounty yet">
          No battle yet
        </p>
      ) : (
        <a className="action" href={`/replay/${bounty.battle.replayId}`}>
          Enter battle
        </a>
      )}

      {bounty.requirements.length === 0 ? null : (
        <section>
          <h2>Requirements</h2>
          <ul className="skills">
            {bounty.requirements.map((requirement) => (
              <li key={requirement} className="state__body">
                {requirement}
              </li>
            ))}
          </ul>
        </section>
      )}

      {bounty.funds.length === 0 ? null : (
        <section>
          <h2>Funded by</h2>
          <ul>
            {bounty.funds.map((fund) => (
              <li key={fund.sponsorUserId} className="detail__row">
                <dd>{fund.label}</dd>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bounty.payoutNotice === null ? null : <p className="notice">{bounty.payoutNotice}</p>}
      {bounty.refundNotice === null ? null : <p className="notice">{bounty.refundNotice}</p>}
      {bounty.prUrl === null ? null : (
        <p className="detail__row">
          <dt>Pull request</dt>
          <dd>
            <a href={bounty.prUrl} rel="noreferrer noopener" target="_blank">
              {bounty.prUrl}
            </a>
          </dd>
        </p>
      )}
    </article>
  );
}

function formatBoardTotal(totalCents: number): string {
  const major = Math.trunc(totalCents / 100);
  return `$${major.toLocaleString('en-US')} on the board`;
}
