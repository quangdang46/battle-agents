/**
 * The two strings a read model has to decide for itself.
 *
 * Both are here rather than in a component because a component that formats its
 * own values is a component whose formatting no test can reach without a DOM,
 * and both of these have an edge that a test should be able to state: money in
 * integer cents, and a last-seen that has to be true for a session that has
 * never reported a heartbeat.
 */

/** The only currency the schema has ever held, spelled out rather than assumed. */
const DOLLAR_CURRENCIES = new Set(['USD']);

/**
 * A reward as the board shows it: `$2,000`, or `2,000 SEK` for anything else.
 *
 * Integer cents, always. A float would make `$0.10` and `$0.1` two different
 * bounties depending on which arithmetic produced them, and the feature's whole
 * reason for storing cents is that there is no rounding rule to remember.
 *
 * The symbol map is one entry rather than a currency table, because
 * `Intl.NumberFormat` throws on a currency code it does not recognise and a
 * sponsor may name one this build has never heard of. Falling back to the code
 * renders a value; throwing takes the board down over a code that only affects
 * how it looks.
 */
export function rewardLabel(amountCents: number, currency: string): string {
  if (!Number.isFinite(amountCents)) {
    // Not a number the caller can display, and a page that prints "NaN" as a
    // price is worse than one that says the amount is unknown.
    return `${currency} —`;
  }
  const major = Math.trunc(amountCents / 100);
  const grouped = major.toLocaleString('en-US');
  return DOLLAR_CURRENCIES.has(currency) ? `$${grouped}` : `${grouped} ${currency}`;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * How long ago, in the words the plan's own example uses.
 *
 * `12m`, `3h`, `2d`, and `just now` inside the first minute. The seconds are
 * deliberately absent: a presence list that ticks every second is a list nobody
 * can read, and the minute is the resolution a human actually needs to decide
 * whether to go looking for somebody.
 *
 * `now` is a parameter because a caller that reached for the clock inside this
 * function would make the label untestable — a last-seen that is correct only
 * when you look at it at the right moment is a last-seen nobody can assert.
 */
export function elapsedLabel(from: string, now: string): string {
  const elapsed = Date.parse(now) - Date.parse(from);
  // A timestamp this code cannot read is a timestamp it must not do arithmetic
  // on. `NaN` compares false against every threshold below, so without this the
  // answer would be "just now" — the one label that asserts something happened.
  if (Number.isNaN(elapsed)) return 'at an unknown time';
  if (elapsed < MS_PER_MINUTE) return 'just now';
  if (elapsed < MS_PER_HOUR) return `${String(Math.floor(elapsed / MS_PER_MINUTE))}m ago`;
  if (elapsed < MS_PER_DAY) return `${String(Math.floor(elapsed / MS_PER_HOUR))}h ago`;
  return `${String(Math.floor(elapsed / MS_PER_DAY))}d ago`;
}

/** The reverse: a duration in words, for a deadline rather than an age. */
export function remainingLabel(until: string, now: string): string {
  const left = Date.parse(until) - Date.parse(now);
  if (Number.isNaN(left)) return 'at an unknown time';
  if (left <= 0) return 'closed';
  return `${elapsedLabel(now, until)} left`;
}
