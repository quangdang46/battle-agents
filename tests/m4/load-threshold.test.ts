import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THRESHOLDS,
  KEY_EVENT_PERIOD,
  MAX_ROW_RATIO_PERCENT,
  MIN_GENERATED_EVENTS_PER_SECOND,
  SCENARIO_AGENTS,
  SCENARIO_EVENTS_PER_SECOND,
  SCENARIO_EVENTS_PER_SECOND_TOTAL,
  thresholdBreaches,
  thresholdsFromEnv,
} from '../../scripts/load-thresholds.js';

/**
 * The load gate, watched failing.
 *
 * `scripts/load-test-events.ts` is a `pnpm test:m4` stage and exits non-zero when
 * the batching does not hold. That sentence is only worth anything if the
 * thresholds are real, and the cheapest way to find out is to ask the harness to
 * fail on purpose. This file spawns the REAL harness — not a copy of its
 * arithmetic, and not a stub of the function — with the thresholds set so the
 * measurement it will take cannot satisfy them, and asserts both runs go red.
 *
 * ## Why spawning beats importing
 *
 * An earlier version of these gates read as a bug, not as a no-op, for a reason
 * worth recording: `thresholdBreaches` was called WITHOUT the thresholds the
 * harness had read from the environment, so the printed thresholds line said
 * `rows <= 1%` while the gate checked the published 10%. Both mutations exited
 * 0 and printed OK. Neither a unit test over the pure function nor reading the
 * source would have caught it: the function was correct, the wiring was not, and
 * the only thing that could tell was the process a real operator runs. So the
 * assertions here are about the process's EXIT CODE and its output, which is the
 * thing the M4 stage consumes.
 *
 * ## No database
 *
 * The harness is in-memory on purpose — see its own header — so this suite is
 * the one file in tests/m4 that does not need the compose Postgres. It is named
 * and run as its own stage so that the load gate's self-test is not waiting on a
 * database to start in order to prove a gate can fail.
 */

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HARNESS = join(REPO_ROOT, 'scripts', 'load-test-events.ts');
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

interface HarnessRun {
  readonly status: number;
  readonly output: string;
}

function runHarness(env: Readonly<Record<string, string>> = {}): HarnessRun {
  const result = spawnSync(TSX, [HARNESS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (result.error !== undefined) throw result.error;
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

describe('the load harness is a gate and not a printout', () => {
  it('runs the scenario and passes at the published thresholds', () => {
    const run = runHarness();

    expect(run.status, `the harness failed at its own defaults:\n${run.output}`).toBe(0);
    // The three numbers the plan's claim rests on, present in the output. Not
    // asserted against values here — that is the harness's business and the
    // ratio gate below is the one that judges them — but asserted to be PRINTED,
    // because a run whose numbers are not in the log cannot be read by whoever
    // is trying to work out why a gate went red on a shared runner.
    expect(run.output).toMatch(/events generated\s+\d+/);
    expect(run.output).toMatch(/rows written\s+\d+/);
  });

  it('prints the thresholds it is actually enforcing, which are the published ones', () => {
    const run = runHarness();

    // The regression described in this file's header, as an assertion. The
    // printed line is what an operator reads; if it and the gate disagree, the
    // operator is reading a lie, and the run is still green.
    expect(run.output).toContain(
      `rows <= ${MAX_ROW_RATIO_PERCENT}% of generated, generated >= ${MIN_GENERATED_EVENTS_PER_SECOND} ev/s`,
    );
    expect(DEFAULT_THRESHOLDS.maxRowRatioPercent).toBe(MAX_ROW_RATIO_PERCENT);
    expect(DEFAULT_THRESHOLDS.minGeneratedEventsPerSecond).toBe(MIN_GENERATED_EVENTS_PER_SECOND);
  });

  it('goes red when the write ratio breaches the ceiling', () => {
    // A ceiling the measurement cannot meet. The scenario puts one key event in
    // KEY_EVENT_PERIOD, so the measured ratio is 100/KEY_EVENT_PERIOD; asking for
    // less than one row in a hundred is asking for fewer writes than key events
    // exist, which is the same demand as "the filter stopped filtering", stated
    // the other way round.
    const run = runHarness({ LOAD_MAX_ROW_RATIO_PERCENT: '1' });

    expect(run.status, `the row-ratio gate did not bite:\n${run.output}`).not.toBe(0);
    expect(run.output).toContain('over the 1% ceiling');
    expect(run.output).toContain('section 7.2');
    // The catastrophic case is a DIFFERENT claim and a different message, and it
    // must still be reachable: a retune of the ratio ceiling is not allowed to
    // delete the "the persistence filter is not filtering" line.
    expect(run.output).not.toContain('the persistence filter is not filtering');
  });

  it('goes red when the harness did not reach the rate the scenario names', () => {
    const run = runHarness({ LOAD_MIN_EVENTS_PER_SECOND: '1000000000' });

    expect(run.status, `the event-rate gate did not bite:\n${run.output}`).not.toBe(0);
    expect(run.output).toContain('the scenario requires');
  });

  it('stays green when a loosened ceiling still covers what the filter actually writes', () => {
    // The other direction, and the one that decides whether the gate is a
    // measurement or a tripwire. A ceiling of 90% is absurd as a design and must
    // not be red here, because the point being asserted is the RATIO, not the
    // policy. Asserted so a future edit that hardcodes the default — ignoring the
    // environment entirely — fails here as well as in the two tests above.
    const run = runHarness({ LOAD_MAX_ROW_RATIO_PERCENT: '90' });

    expect(run.status, `a 90% ceiling turned a healthy run red:\n${run.output}`).toBe(0);
  });
});

describe('the published numbers, and the arithmetic that chose them', () => {
  it('states the plan’s scenario as the rate floor, rather than a convenient number', () => {
    // §17.2: "add load test simulating 100x20 ev/s before M4". The floor is that
    // arithmetic, so the floor cannot drift away from the scenario it is meant to
    // hold the harness to. Written out rather than imported-and-reused, because a
    // constant asserted against itself proves nothing.
    expect(SCENARIO_EVENTS_PER_SECOND_TOTAL).toBe(100 * 20);
    expect(SCENARIO_AGENTS).toBe(100);
    expect(SCENARIO_EVENTS_PER_SECOND).toBe(20);
    expect(MIN_GENERATED_EVENTS_PER_SECOND).toBe(2000);
  });

  it('leaves headroom above the key-event floor, and far below a filter that stopped filtering', () => {
    const keyEventFloor = 100 / KEY_EVENT_PERIOD;

    // Above the floor: a persistence filter doing its job writes exactly the key
    // events, so a ceiling at or below that number would report a correct system
    // as broken — and the first honest addition to the event taxonomy would then
    // be a red gate rather than a reviewable change.
    expect(MAX_ROW_RATIO_PERCENT).toBeGreaterThan(keyEventFloor);
    // At most a quarter. Everything-becomes-a-row is 100%, five times over the
    // line, and so is anything approaching half the chatter getting through —
    // which is the leak this gate exists to catch, and which a ceiling of "well
    // under 100%" would wave through.
    expect(MAX_ROW_RATIO_PERCENT).toBeLessThanOrEqual(25);
  });

  it('names every gate a measurement misses, rather than the first one', () => {
    const breaches = thresholdBreaches({
      generated: 10_000,
      rows: 5_000,
      elapsedSeconds: 10,
    });

    // Both, not one. A harness that reported only the first failure would let the
    // second be discovered on a machine nobody remembers.
    expect(breaches.map((breach) => breach.gate).sort()).toEqual(['event-rate', 'row-ratio']);
  });

  it('falls back to the published numbers, and refuses a nonsense override', () => {
    expect(thresholdsFromEnv({})).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFromEnv({ LOAD_MAX_ROW_RATIO_PERCENT: '  ' })).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFromEnv({ LOAD_MIN_EVENTS_PER_SECOND: 'quickly' })).toEqual(
      DEFAULT_THRESHOLDS,
    );
    expect(thresholdsFromEnv({ LOAD_MAX_ROW_RATIO_PERCENT: '-5' })).toEqual(DEFAULT_THRESHOLDS);
    // A real override is honoured, which is what makes the two spawns above
    // possible in the first place.
    expect(thresholdsFromEnv({ LOAD_MAX_ROW_RATIO_PERCENT: '1' }).maxRowRatioPercent).toBe(1);
  });
});

describe('the harness the stage runs is the harness this file spawns', () => {
  it('exists at the path the assertions above execute', () => {
    // A guard, not a claim about the code. Without it every spawn above would
    // throw a module-not-found, which is a red test and NOT evidence that the
    // gates bite — and this file's entire value is that its red is meaningful.
    expect(existsSync(HARNESS), `the load harness is not at ${HARNESS}`).toBe(true);
    expect(existsSync(TSX), `tsx is not at ${TSX}`).toBe(true);
  });
});
