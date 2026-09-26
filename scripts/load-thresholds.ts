/**
 * The two numbers the load harness is a GATE on, and the arithmetic that picked
 * them. Plan §17.2 and §7.2.
 *
 * ## Why the scenario and the pass criterion are different numbers
 *
 * §17.2 names the scenario: "add load test simulating 100x20 ev/s before M4".
 * That is what the harness DOES — 100 agents, 20 events each per second — and it
 * is not a threshold, because running at that rate says nothing about whether the
 * design works. §7.2 is the claim the numbers are FOR: "100 agents x 20 ev/s =
 * 2000 DB writes/s — Neon must NEVER see this", with the architecture drawn as
 * agents -> gateway -> {realtime, batched/important -> Neon} and "Transient
 * (cursor/streaming/thinking/frames/heartbeat) never INSERTs".
 *
 * So the pass criterion is on the RATIO, and the rate is a second, separate
 * assertion with a different job: proving the harness actually exercised the
 * scenario. Without it, a harness that quietly ran at 5 events/s and found a
 * 5% write ratio would pass, and it would be reporting a throughput problem
 * dressed as a result.
 *
 * ## The row-ratio number, and where 5% comes from
 *
 * `KEY_EVENT_PERIOD` is the harness's own event mix: one event in twenty is a
 * key event (`test.passed`), and the other nineteen are transient chatter the
 * policy is meant to drop before they touch the store. That makes 5% the floor
 * this scenario can produce — a perfect persistence filter writes exactly the
 * key events and nothing else. The measured value is 5.0%, so the filter is at
 * its floor today.
 *
 * The threshold is 10%, twice the floor. The headroom is deliberate and bounded
 * in both directions, and both bounds are asserted in
 * `tests/m4/load-threshold.test.ts`:
 *
 *   - ABOVE the floor, so adding a genuinely key event type to the policy does
 *     not immediately turn the gate red. A threshold pinned to 5% would make the
 *     next honest change to the event taxonomy a merge conflict with a gate.
 *   - FAR BELOW 100%, so disabling the filter — the failure this exists to catch
 *     — is not a near miss. Every event becoming a row is 5x over the line, and
 *     so is anything approaching it.
 *
 * A quarter is the ceiling asserted on it. Anything looser than that and a
 * filter that let half the chatter through would still be green, which is the
 * same gate-at-a-nice-round-number mistake in the other direction.
 *
 * ## The rate number
 *
 * The floor is the scenario itself: 100 agents x 20 ev/s. The harness replays
 * simulated agent-time as fast as the process will push it, so anything at or
 * above the scenario rate means the batch and persistence arithmetic was
 * exercised at the rate the plan asks about. Measured on a laptop it is ~63x
 * that, because the harness is in-memory and has no socket in the way — which is
 * also why this one is the fragile of the two: on a heavily loaded machine it is
 * the threshold most likely to be a nuisance, and it is a floor on the SCENARIO
 * rather than on the machine's peak, so there is a long way to fall.
 */

/** The plan's scenario, and therefore the rate floor. §17.2's "100x20 ev/s". */
export const SCENARIO_AGENTS = 100;
export const SCENARIO_EVENTS_PER_SECOND = 20;
export const SCENARIO_EVENTS_PER_SECOND_TOTAL = SCENARIO_AGENTS * SCENARIO_EVENTS_PER_SECOND;

/** One key event in twenty: the harness's mix, and so the ratio's floor. */
export const KEY_EVENT_PERIOD = 20;

/** See the header. Twice the floor, and hard-capped a quarter by the test. */
export const MAX_ROW_RATIO_PERCENT = (100 / KEY_EVENT_PERIOD) * 2;

/** See the header: the floor is the scenario, not a number picked to be easy. */
export const MIN_GENERATED_EVENTS_PER_SECOND = SCENARIO_EVENTS_PER_SECOND_TOTAL;

export interface LoadThresholds {
  /** rows written / events generated, as a percentage. */
  readonly maxRowRatioPercent: number;
  /** generated events divided by wall-clock seconds. */
  readonly minGeneratedEventsPerSecond: number;
}

/** What the harness enforces with no environment override in play. */
export const DEFAULT_THRESHOLDS: LoadThresholds = {
  maxRowRatioPercent: MAX_ROW_RATIO_PERCENT,
  minGeneratedEventsPerSecond: MIN_GENERATED_EVENTS_PER_SECOND,
};

export interface LoadMeasurement {
  readonly generated: number;
  readonly rows: number;
  readonly elapsedSeconds: number;
}

export type LoadGate = 'row-ratio' | 'event-rate';

export interface ThresholdBreach {
  readonly gate: LoadGate;
  readonly message: string;
}

/**
 * Every gate the measurement failed, named.
 *
 * A list rather than a boolean so the harness can print all of them: a run that
 * quietly reported only the first would leave the second to be found later, on
 * a machine nobody remembers.
 */
export function thresholdBreaches(
  measurement: LoadMeasurement,
  thresholds: LoadThresholds = DEFAULT_THRESHOLDS,
): readonly ThresholdBreach[] {
  const breaches: ThresholdBreach[] = [];
  const rowRatioPercent = (measurement.rows / Math.max(1, measurement.generated)) * 100;
  if (rowRatioPercent > thresholds.maxRowRatioPercent) {
    breaches.push({
      gate: 'row-ratio',
      message:
        `FAIL: ${measurement.rows} of ${measurement.generated} events became rows ` +
        `(${rowRatioPercent.toFixed(1)}%), over the ${thresholds.maxRowRatioPercent}% ceiling. ` +
        'Plan section 7.2 requires the number reaching the database to be a small ' +
        'fraction of the number crossing the wire; this run says it is not one.',
    });
  }
  const achieved = measurement.generated / Math.max(measurement.elapsedSeconds, 0.001);
  if (achieved < thresholds.minGeneratedEventsPerSecond) {
    breaches.push({
      gate: 'event-rate',
      message:
        `FAIL: generated ${measurement.generated} events in ` +
        `${measurement.elapsedSeconds.toFixed(2)}s (${Math.round(achieved)} ev/s), under the ` +
        `${thresholds.minGeneratedEventsPerSecond} ev/s the scenario requires. A harness that ` +
        'quietly ran slower than the load it names proves nothing about that load.',
    });
  }
  return breaches;
}

/**
 * Thresholds from the environment, falling back to the published numbers.
 *
 * The override exists so `tests/m4/load-threshold.test.ts` can watch each gate
 * go red without editing this file, and so a machine that genuinely cannot hold
 * the scenario can be diagnosed rather than silently reported as passing. It is
 * a deliberate hole and it is closed the only way it can be: the self-test
 * asserts the DEFAULT values, and the stage runs the harness with no override.
 */
export function thresholdsFromEnv(env: NodeJS.ProcessEnv): LoadThresholds {
  return {
    maxRowRatioPercent:
      positiveNumber(env['LOAD_MAX_ROW_RATIO_PERCENT']) ?? DEFAULT_THRESHOLDS.maxRowRatioPercent,
    minGeneratedEventsPerSecond:
      positiveNumber(env['LOAD_MIN_EVENTS_PER_SECOND']) ??
      DEFAULT_THRESHOLDS.minGeneratedEventsPerSecond,
  };
}

function positiveNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
