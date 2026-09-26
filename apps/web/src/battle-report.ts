import { harnessSchema, sessionEndReasonSchema } from '@battle-agents/protocol';

/**
 * The public replay, as a report a person can read.
 *
 * ## What this is: a VIEW, and the word is load-bearing
 *
 * `/replay/<id>` already publishes everything a report could want, projected for
 * somebody who is not logged in. This turns that into sentences. It mints
 * nothing, stores nothing, and is a pure function of the projection — no I/O, no
 * clock, no database, no React. Which is also what makes it testable: the
 * security claim below is settled by calling a function and reading what it
 * returned.
 *
 * ## Why it declares its own input types rather than importing them
 *
 * `PublicReplay` lives in `packages/features/activity`. This file imports no
 * feature, and `docs/design/public-event-stream.md` gives the reason in one
 * sentence: the public types are "separate types, not the protocol types with
 * fields omitted, so a later field added to a protocol event cannot silently
 * appear on the wire." The same holds one layer out. A field added to
 * `PublicReplay` later is a change to what is PUBLISHED, and it must be a
 * decision somebody makes — not something this report starts printing because a
 * type grew. So the shapes below are written out, and the page hands a
 * `PublicReplay` to them structurally.
 *
 * The cost of writing them out is that a RENAME is a compile error at the one
 * call site (the page), which is the cheap direction. The benefit is that an
 * added field is invisible here until this file chooses to speak it.
 *
 * ## The security boundary, which is the whole point
 *
 * `docs/design/public-replay.md` decides what a logged-out viewer may see. A
 * logged-out viewer sees WHICH HARNESSES competed, WHEN each step happened and
 * HOW THE RUBRIC SCORED — and nothing about who the agents are or what they were
 * working on. No session id, no agent id, no repository, no file path, no
 * command, no prompt.
 *
 * `PublicBeat.beat`, `PublicBeat.fighter` and every value inside
 * `PublicBeat.detail` are typed `string`. "Typed string" is not a promise about
 * content: the projection is what makes them safe, and this file is the last
 * thing between that projection and a permanent public page. So every string
 * this report prints comes off a CLOSED LIST:
 *
 * - a beat is narrated by a phrase looked up in {@link PHRASES}, keyed by a beat
 *   name this file owns. A name it has no phrase for produces a step that says
 *   so, and does not repeat the name.
 * - a fighter is named only when the beat's `fighter` is one of the labels the
 *   SAME replay published in `fighters`. That is a membership test against this
 *   input rather than a vocabulary, so it cannot drift — and it is what stops a
 *   session id, which is by construction not a published label, from reaching a
 *   page.
 * - a harness, an end reason, a criterion, a mode, an outcome and every other
 *   value is validated against a list before it is written into a sentence. A
 *   value that is not on the list is dropped and the sentence says less.
 *
 * That last clause is the one worth arguing about, because several of these
 * lists are COPIES of a taxonomy that lives in a feature. The copies are
 * deliberate, and they are safe in one direction only:
 *
 * - A feature's list widened and this file's copy did not: the report says less
 *   than it could. A gap in a document, visible, recoverable, and it fails
 *   closed.
 * - This file trusted the projection and the projection's list was widened by a
 *   row carrying something else: an unbounded string lands on a permanent public
 *   page. Not recoverable by editing this file, because the page is cached and
 *   re-shared.
 *
 * The import is used wherever the definition is reachable without crossing into a
 * feature. `harnessSchema` and `sessionEndReasonSchema` come from
 * `@battle-agents/protocol`, the same schema `replay.ts` narrows with, so there
 * is one definition rather than two. The lists the battle feature owns cannot be
 * imported without breaking the removal gate — `scripts/removal-test.sh` strips a
 * feature's dependency from `apps/web/package.json` before typechecking, and the
 * battle feature IS removable — so they are written out here and the asymmetry
 * above is the argument for it.
 *
 * ## What it deliberately does NOT do
 *
 * It does not read the log, so it cannot widen the boundary by reaching for a
 * field the projection does not carry. Two fields the projection does not narrow
 * are named in `docs/design/public-replay.md` as a finding; this file narrows
 * them itself rather than reaching into the private event.
 */

/* ───────────────────────────── the input ───────────────────────────── */

/**
 * What this report can be built from.
 *
 * Structural, and narrower than `PublicReplay` in the one direction that
 * matters: `replayId` is absent because a report has no use for a handle, and a
 * report that carried one would be a second place a public identifier travels.
 */
export interface ReportableReplay {
  readonly state: string;
  readonly mode: string | null;
  readonly outcome: string | null;
  readonly reason: string | null;
  readonly rubric: Readonly<Record<string, number>> | null;
  readonly fighters: readonly ReportableFighter[];
  readonly beats: readonly ReportableBeat[];
  readonly durationMs: number | null;
}

export interface ReportableFighter {
  readonly label: string;
  readonly harness: string | null;
  readonly score: readonly ReportableCriterion[] | null;
  readonly total: number | null;
  readonly won: boolean;
}

export interface ReportableCriterion {
  readonly criterion: string;
  readonly weight: number;
  readonly score: number;
  readonly weighted: number;
}

export interface ReportableBeat {
  readonly at: string;
  readonly offsetMs: number;
  readonly beat: string;
  readonly fighter: string | null;
  readonly detail: Readonly<Record<string, string | number | boolean>>;
}

/* ───────────────────────────── the output ───────────────────────────── */

/** One readable line of the account. */
export interface ReportStep {
  /** The beat's own `at`, verbatim, for a `<time dateTime>`. */
  readonly at: string;
  /** Milliseconds since the first step, from the projection. */
  readonly offsetMs: number;
  /** `mm:ss`, so the page does not own the format. */
  readonly label: string;
  /** A sentence. Every word in it came off a closed list in this file. */
  readonly text: string;
}

export interface ReportCriterionRow {
  /**
   * The criterion's published name, or null when this report does not publish
   * it. Null is not a formatting state — it means the name was not on
   * {@link PUBLISHED_CRITERIA}, and the row still carries its weight and score
   * so the rubric's shape survives even where the label does not.
   */
  readonly criterion: string | null;
  readonly weight: number;
  readonly score: number;
  readonly weighted: number;
}

export interface ReportFighter {
  readonly label: string;
  readonly harness: string | null;
  readonly won: boolean;
  readonly total: number | null;
  readonly criteria: readonly ReportCriterionRow[];
}

export interface ReportRubricEntry {
  /** As above: the published name, or null when it is not one this report knows. */
  readonly criterion: string | null;
  readonly weight: number;
}

export interface BattleReport {
  /** The whole account in one paragraph: who ran, how it ended, on what. */
  readonly summary: string;
  /** The rubric as published, in the order the projection published it. */
  readonly rubric: readonly ReportRubricEntry[];
  readonly fighters: readonly ReportFighter[];
  readonly steps: readonly ReportStep[];
}

/** Shown where a fighter's harness is null. The projection already nulls an
 *  unrecognised one, so null means "the log never said a harness this build
 *  recognises" rather than "unknown to us" — and the page should not have to
 *  invent a word for it. */
export const UNKNOWN_HARNESS_LABEL = 'unknown harness';

/** Shown where a criterion's name is withheld. Named rather than left to the
 *  page so the sentence explaining the withholding is written next to the
 *  withholding. */
export const WITHHELD_CRITERION_LABEL = 'another criterion';

/* ───────────────────────────── the render ───────────────────────────── */

export function renderReport(replay: ReportableReplay): BattleReport {
  // Built once and read per beat. Derived from this input rather than from a
  // vocabulary, which is what makes the membership test in `stepOf` incapable
  // of drifting: there is no second list to fall out of date.
  const published = new Set(replay.fighters.map((fighter) => fighter.label));

  return {
    summary: summaryOf(replay),
    rubric: rubricOf(replay.rubric),
    fighters: replay.fighters.map(fighterOf),
    steps: replay.beats.map((beat) => stepOf(beat, published)),
  };
}

function stepOf(beat: ReportableBeat, published: ReadonlySet<string>): ReportStep {
  // The membership test, and the only place a beat can name anybody. A `fighter`
  // that is not a label this replay published is not rendered at all — which is
  // the difference between a report and a session-id disclosure.
  const who = beat.fighter !== null && published.has(beat.fighter) ? beat.fighter : null;
  const phrase = PHRASES[beat.beat];
  return {
    at: beat.at,
    offsetMs: beat.offsetMs,
    label: formatOffset(beat.offsetMs),
    text: phrase === undefined ? UNNARRATED_STEP : phrase({ who, detail: beat.detail }),
  };
}

/** What a step says when this build has no sentence for the beat it was given. */
const UNNARRATED_STEP = 'The log recorded a step this report does not describe.';

function fighterOf(fighter: ReportableFighter): ReportFighter {
  return {
    label: fighter.label,
    harness: publishHarness(fighter.harness),
    won: fighter.won,
    total: finite(fighter.total),
    criteria: (fighter.score ?? []).map(criterionRowOf),
  };
}

function criterionRowOf(criterion: ReportableCriterion): ReportCriterionRow {
  return {
    criterion: publishedCriterion(criterion.criterion),
    weight: finite(criterion.weight) ?? 0,
    score: finite(criterion.score) ?? 0,
    weighted: finite(criterion.weighted) ?? 0,
  };
}

function rubricOf(rubric: Readonly<Record<string, number>> | null): readonly ReportRubricEntry[] {
  if (rubric === null) return [];
  return Object.entries(rubric).map(([criterion, weight]) => ({
    criterion: publishedCriterion(criterion),
    weight: finite(weight) ?? 0,
  }));
}

/* ───────────────────────────── the summary ───────────────────────────── */

/**
 * The account in one paragraph.
 *
 * Assembled from parts that are each independently optional, because the states
 * it has to cover are genuinely different: a battle that never started, one that
 * is still running, one whose rows have aged out, and one with a verdict. A
 * summary written for the common case and patched for the others is a summary
 * that says "it ran for 0s and nobody won" about a battle that never happened.
 */
function summaryOf(replay: ReportableReplay): string {
  const parts: string[] = [openingOf(replay)];

  if (replay.state === 'expired') {
    // Exactly what `docs/design/public-replay.md` says the state may claim, and
    // not one word more: "no events for this battle are present. Whether they
    // were pruned or never written is not answerable from the log alone, and a
    // page that asserted otherwise would be making a claim it cannot vouch
    // for." The first draft of this line said the events were "older than the
    // activity log keeps", which is the retention inference — and running the
    // report against a real database showed a battle that is `running`, has
    // never been joined and has no rows at all, being told exactly that.
    parts.push(
      'The activity log holds no events for this battle, so there is no step-by-step account to read.',
    );
  } else if (replay.state === 'in-progress') {
    parts.push('It is still running. Everything recorded so far is below.');
  } else {
    const winner = replay.fighters.find((fighter) => fighter.won);
    const lasted =
      replay.durationMs === null ? null : `It ran for ${describeDuration(replay.durationMs)}.`;
    if (lasted !== null) parts.push(lasted);
    const why = outcomeClause(replay.outcome, replay.reason);
    if (winner === undefined) {
      parts.push(`It ended without a winner${why === null ? '.' : `, ${why}.`}`);
    } else {
      parts.push(`${nameOf(winner)} won it${why === null ? '.' : `, ${why}.`}`);
    }
  }

  const scored = scoredClause(replay);
  if (scored !== null) parts.push(scored);
  return parts.join(' ');
}

function openingOf(replay: ReportableReplay): string {
  const mode = publishedMode(replay.mode);
  const kind = mode === null ? 'A battle' : `A ${mode} battle`;
  const named = replay.fighters.map(nameOf);
  if (named.length === 0) return `${kind} with no fighters recorded.`;
  if (named.length === 1) return `${kind}, fought by ${named[0]}.`;
  return `${kind} between ${joinWithAnd(named)}.`;
}

function scoredClause(replay: ReportableReplay): string | null {
  const criteria = Object.keys(replay.rubric ?? {}).length;
  if (criteria === 0) return null;
  return `It was scored on a published rubric of ${criteria} ${
    criteria === 1 ? 'criterion' : 'criteria'
  }, frozen before the battle finished.`;
}

function nameOf(fighter: ReportableFighter): string {
  const harness = publishHarness(fighter.harness);
  return harness === null ? fighter.label : `${fighter.label} (${harness})`;
}

/* ───────────────────────────── the phrases ───────────────────────────── */

/**
 * What this report is willing to say about a beat.
 *
 * `detail` is passed whole, and a phrase reads only the keys it names. That is
 * the allow-list, and it is structural rather than a filter: there is no code
 * path that iterates `detail`, so a key nobody anticipated is not rendered by
 * omission — it is never read.
 */
interface BeatPhrase {
  readonly who: string | null;
  readonly detail: Readonly<Record<string, string | number | boolean>>;
}

type Phrase = (phrase: BeatPhrase) => string;

const PHRASES: Readonly<Record<string, Phrase | undefined>> = {
  'battle.opened': ({ detail }) => {
    const mode = publishedMode(text(detail['mode']));
    return mode === null ? 'The battle opened.' : `The battle opened as a ${mode} battle.`;
  },
  'fighter.joined': ({ who }) => `${subject(who)} joined the battle.`,
  'fighter.join_refused': ({ who, detail }) => {
    const why = joinRefusalClause(text(detail['why']));
    return why === null
      ? `${subject(who)} was refused a place.`
      : `${subject(who)} was refused a place: ${why}.`;
  },
  'fighter.paused': ({ who }) => `${subject(who)} paused.`,
  'fighter.resumed': ({ who }) => `${subject(who)} resumed.`,
  'session.started': ({ who, detail }) => {
    const harness = publishHarness(text(detail['harness']));
    return harness === null
      ? `${subject(who)} started a session.`
      : `${subject(who)} started a session on ${harness}.`;
  },
  'session.ended': ({ who, detail }) => {
    const reason = sessionEndClause(text(detail['reason']));
    return reason === null
      ? `${possessive(who)} session ended.`
      : `${possessive(who)} session ended — ${reason}.`;
  },
  'session.resumed': ({ who }) => `${possessive(who)} session resumed.`,
  'test.passed': ({ who, detail }) => {
    const suite = publishedSuite(text(detail['suite']));
    const passed = count(detail['count']);
    const ran = suite === null ? 'a test suite' : `the ${suite} suite`;
    if (passed === null) return `${subject(who)} ran ${ran} and it passed.`;
    return `${subject(who)} ran ${ran} and ${passed} ${
      passed === 1 ? 'test passed' : 'tests passed'
    }.`;
  },
  'test.failed': ({ who, detail }) => {
    const suite = publishedSuite(text(detail['suite']));
    return suite === null
      ? `${subject(who)} failed a test.`
      : `${subject(who)} failed a test in the ${suite} suite.`;
  },
  'battle.finished': ({ detail }) => {
    const why = outcomeClause(text(detail['outcome']), text(detail['reason']));
    return why === null ? 'The battle finished.' : `The battle finished — ${why}.`;
  },
  'battle.expired': ({ detail }) =>
    lifecycleStep('The battle expired.', 'The battle expired', detail),
  'battle.abandoned': ({ detail }) =>
    lifecycleStep('The battle was abandoned.', 'The battle was abandoned', detail),
};

function lifecycleStep(
  plain: string,
  stem: string,
  detail: Readonly<Record<string, string | number | boolean>>,
): string {
  const reason = lifecycleReasonClause(text(detail['reason']));
  return reason === null ? plain : `${stem} — ${reason}.`;
}

/** `Fighter A`, or a phrase that works without one. */
function subject(who: string | null): string {
  return who ?? 'A fighter';
}

/** `Fighter A` already possessive, or the same fallback. */
function possessive(who: string | null): string {
  return who === null ? 'A fighter’s' : `${who}’s`;
}

/* ───────────────────────────── the closed lists ───────────────────────────── */

/**
 * The harnesses, and the session-end reasons, validated with the protocol's own
 * schemas rather than a copy of the values.
 *
 * `replay.ts` narrows both the same way, and `docs/design/public-replay.md`
 * names the import as the reason this surface cannot be widened by accident:
 * widening it is a reviewed change to the protocol. Copying the eight strings
 * here would be a second place a build could add a harness, which is the drift
 * the same paragraph warns about.
 */
function publishHarness(value: string | null): string | null {
  if (value === null) return null;
  return harnessSchema.safeParse(value).success ? value : null;
}

function sessionEndClause(value: string | null): string | null {
  if (value === null) return null;
  const parsed = sessionEndReasonSchema.safeParse(value);
  if (!parsed.success) return null;
  return { completed: 'it completed', abandoned: 'it was abandoned', crashed: 'it crashed' }[
    parsed.data
  ];
}

/**
 * The battle modes, copied.
 *
 * `BATTLE_MODES` is exported by `packages/features/battle` and is the definition
 * of the list. It is copied because importing it would put a removable feature
 * behind `apps/web/src`, which `scripts/removal-test.sh` forbids — and the copy
 * fails safe, as the file header argues: a mode added to the feature and not
 * here produces "A battle" rather than a leak.
 */
const PUBLISHED_MODES: ReadonlySet<string> = new Set([
  'speed',
  'quality',
  'survival',
  'boss',
  'team',
  'tournament',
]);

function publishedMode(value: string | null): string | null {
  return value !== null && PUBLISHED_MODES.has(value) ? value : null;
}

/**
 * The judge's criteria, copied from `JUDGE_CRITERIA`.
 *
 * Same reason and same direction as {@link PUBLISHED_MODES}, and this one is
 * load-bearing rather than cosmetic: `criteriaOf` in `replay.ts` checks that a
 * criterion is a string and nothing else, so a criterion name reaches the
 * projection un-narrowed. The judge refuses to record an unknown one, so the
 * name is sound by provenance — but a report printed from a durable log cannot
 * check provenance, and this is the last place before a permanent page. A name
 * this report does not know is withheld and the row keeps its weight and score.
 */
const PUBLISHED_CRITERIA: ReadonlySet<string> = new Set([
  'correctness',
  'tests',
  'regression',
  'quality',
  'efficiency',
]);

function publishedCriterion(value: string | null): string | null {
  return value !== null && PUBLISHED_CRITERIA.has(value) ? value : null;
}

/**
 * The suite-name shape, copied from `SUITE_PATTERN` in `replay.ts`, plus one
 * check the shape cannot do.
 *
 * Letters, digits, dot, underscore, dash; no slash, no space, no backslash; at
 * most 64 characters. That is the projection's narrowing and it does its job: it
 * refuses `pnpm test packages/db/src/verify.test.ts`, which is a repository
 * path and the reason the pattern exists.
 *
 * It is NOT a handle guard, and the first draft of this file assumed it was. A
 * uuid — `11111111-1111-4111-8111-111111111111` — is letters, digits and dashes
 * under 64 characters, so it passes. The suite name is the one field this report
 * guards by SHAPE rather than by vocabulary, and a shape cannot tell a name from
 * an identifier. So the shape is kept for what it is good at and the one thing
 * it cannot do is done by name: every id in this repository is a `uuid` column
 * (`packages/db/src/schema/platform.ts`), so a value that parses as a uuid is an
 * internal handle by definition rather than by resemblance, and a suite named
 * like one is withheld. That is a fact about the schema rather than a guess about
 * what suite names look like, which is the whole difference between a guard and
 * a filter nobody can reason about.
 */
const SUITE_SHAPE = /^[A-Za-z0-9._-]{1,64}$/;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publishedSuite(value: string | null): string | null {
  if (value === null) return null;
  if (UUID_SHAPE.test(value)) return null;
  return SUITE_SHAPE.test(value) ? value : null;
}

/**
 * The reasons a battle ended, as clauses rather than as tokens.
 *
 * Written as English because that is the bead: `outscored` on a public page is
 * the machine's word, and the report's whole job is to replace it. A reason not
 * in this map yields no clause, so the sentence is shorter rather than wrong.
 */
const OUTCOME_REASON_CLAUSES: Readonly<Record<string, string>> = {
  outscored: 'the weighted score was higher',
  'fastest-valid': 'the tie went to the earliest valid submission',
  shared: 'the top score was tied and the mode shares ties',
  'no-valid-submission': 'nobody submitted anything valid',
  'no-participants': 'nobody took part',
};

const LIFECYCLE_REASON_CLAUSES: Readonly<Record<string, string>> = {
  'match-duration-elapsed': 'the match ran out of time',
  'resume-grace-expired': 'the window to come back had closed',
};

const JOIN_REFUSAL_CLAUSES: Readonly<Record<string, string>> = {
  'not-found': 'the battle was not found',
  'not-running': 'the battle was not running',
  full: 'the battle was full',
  'already-in-it': 'that fighter was already in it',
};

/**
 * The clause for a token this file knows, or null.
 *
 * `Object.hasOwn` rather than a truthiness read, because these maps are typed
 * as records and a lookup that misses returns `undefined` — which a bare
 * `&&` would let through as a clause. A prototype key is a non-issue here (the
 * records are literals and the tokens come off a log row), but the read is
 * explicit so the null case is the only one that can reach a sentence.
 */
function clauseOf(clauses: Readonly<Record<string, string>>, token: string | null): string | null {
  if (token === null) return null;
  return Object.hasOwn(clauses, token) ? (clauses[token] ?? null) : null;
}

/**
 * What the judge recorded, as a clause. The outcome is a closed pair and the
 * reason is one of five, so there are two outcomes and five ways to be
 * unsuccessful — and an outcome this build does not know yields no clause at
 * all rather than the token.
 */
function outcomeClause(outcome: string | null, reason: string | null): string | null {
  return clauseOf(OUTCOME_REASON_CLAUSES, reason) ?? outcomeVerdict(outcome);
}

function outcomeVerdict(outcome: string | null): string | null {
  if (outcome === 'won') return 'with a winner';
  if (outcome === 'no-winner') return 'with no winner';
  return null;
}

function lifecycleReasonClause(reason: string | null): string | null {
  return clauseOf(LIFECYCLE_REASON_CLAUSES, reason);
}

function joinRefusalClause(why: string | null): string | null {
  return clauseOf(JOIN_REFUSAL_CLAUSES, why);
}

/* ───────────────────────────── formatting ───────────────────────────── */

function text(value: string | number | boolean | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: string | number | boolean | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

function describeDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

/** `mm:ss`, past an hour, so a long battle does not read as `61:00`. */
function formatOffset(offsetMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(offsetMs / 1000));
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const rest = totalSeconds % SECONDS_PER_HOUR;
  const minutes = Math.floor(rest / SECONDS_PER_MINUTE);
  const seconds = rest % SECONDS_PER_MINUTE;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** `a, b and c`. Two items join with `and` and no comma, which is the reading a
 *  sentence wants; the list is a roster of two in every real battle. */
function joinWithAnd(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
