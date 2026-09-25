import { describe, expect, it } from 'vitest';

import {
  decideStatus,
  DEFAULT_STATUS_TUNING,
  type AgentStatus,
  type StatusFacts,
} from './status-fusion.js';

/**
 * The decision table, asserted literally.
 *
 * Every row is (facts, expected status) and the expectation is a value, never a
 * snapshot. A snapshot records whatever the code happened to produce, so a
 * decider that changes behaviour passes on the same run that revealed the
 * change. These are literals because the status a character shows is a
 * product decision, not an implementation detail.
 */

const QUIET_ENOUGH = 60_000;
const JUST_SAID_SOMETHING = 1_000;

/** A quiet, live agent that has nothing to report. The baseline every row changes from. */
function facts(overrides: Partial<StatusFacts> = {}): StatusFacts {
  return {
    lastCommand: '',
    commandQuietForMs: QUIET_ENOUGH,
    outputQuietForMs: QUIET_ENOUGH,
    runtimeAgeMs: QUIET_ENOUGH,
    hasActiveRuntimeProcess: true,
    hasActiveTask: false,
    transcriptReadable: true,
    hasParsedNeedsInput: false,
    hasParsedError: false,
    hasParsedStrongSignal: false,
    hasRuntimePromptSignal: false,
    runtimeStopped: false,
    ...overrides,
  };
}

interface Row {
  readonly name: string;
  readonly given: StatusFacts;
  readonly expected: AgentStatus;
}

const TABLE: readonly Row[] = [
  {
    name: 'nothing has happened for longer than the idle window',
    given: facts(),
    expected: 'idle',
  },
  {
    name: 'a task is genuinely in flight',
    given: facts({ hasActiveTask: true }),
    expected: 'working',
  },
  {
    name: 'a command is running and has not gone quiet past the idle window',
    given: facts({ lastCommand: 'pnpm test', commandQuietForMs: 5_000 }),
    expected: 'working',
  },
  {
    name: 'a command running has been quiet for longer than the idle window',
    given: facts({ lastCommand: 'pnpm test', commandQuietForMs: QUIET_ENOUGH }),
    expected: 'idle',
  },
  {
    name: 'strong evidence inside its window',
    given: facts({ hasParsedStrongSignal: true, outputQuietForMs: JUST_SAID_SOMETHING }),
    expected: 'working',
  },
  {
    name: 'strong evidence, but long enough ago to have expired',
    given: facts({ hasParsedStrongSignal: true, outputQuietForMs: 9_000 }),
    expected: 'idle',
  },
  {
    name: 'a permission prompt, with nothing else going on',
    given: facts({ hasParsedNeedsInput: true }),
    expected: 'attention',
  },
  {
    name: 'a permission prompt WHILE a task is in flight',
    given: facts({ hasParsedNeedsInput: true, hasActiveTask: true }),
    expected: 'attention',
  },
  {
    name: 'a failure inside its window',
    given: facts({ hasParsedError: true, outputQuietForMs: JUST_SAID_SOMETHING }),
    expected: 'error',
  },
  {
    name: 'a failure that has aged out',
    given: facts({ hasParsedError: true, outputQuietForMs: 20_000 }),
    expected: 'idle',
  },
  {
    name: 'the process is gone, while a task still looks in flight',
    given: facts({ runtimeStopped: true, hasActiveTask: true }),
    expected: 'stopped',
  },
  {
    name: 'a bare prompt signal alone changes nothing',
    given: facts({ hasRuntimePromptSignal: true }),
    expected: 'idle',
  },
];

describe('decideStatus', () => {
  it.each(TABLE)('$name', ({ given, expected }) => {
    expect(decideStatus(given).status).toBe(expected);
  });
});

describe('the decision explains itself', () => {
  it('says why for every status it can return', () => {
    for (const { name, given } of TABLE) {
      const decision = decideStatus(given);
      // An empty reasons list is the failure this guards: a status a viewer
      // cannot explain is a spinner with a label on it.
      expect(decision.reasons.length, `${name} produced no reason`).toBeGreaterThan(0);
      for (const reason of decision.reasons) {
        expect(reason.code.length).toBeGreaterThan(0);
        expect(reason.message.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries the facts back untouched, so a decision can be audited', () => {
    const given = facts({ hasParsedNeedsInput: true, hasRuntimePromptSignal: true });
    const decision = decideStatus(given);

    // The rejected signal is still there. A detector that drops the field it
    // decided not to use leaves the next reader looking for a hole.
    expect(decision.facts.hasRuntimePromptSignal).toBe(true);
    expect(decision.facts).toEqual(given);
  });

  it('records why the prompt signal was not acted on', () => {
    const decision = decideStatus(
      facts({ hasParsedNeedsInput: true, hasRuntimePromptSignal: true }),
    );

    expect(decision.reasons.map((reason) => reason.code)).toContain('prompt-signal-not-used');
  });

  it('lists the working reasons in order when several apply', () => {
    const decision = decideStatus(
      facts({
        hasActiveTask: true,
        hasParsedStrongSignal: true,
        outputQuietForMs: JUST_SAID_SOMETHING,
      }),
    );

    expect(decision.status).toBe('working');
    expect(decision.reasons.map((reason) => reason.code)).toEqual([
      'task-in-flight',
      'recent-strong-signal',
    ]);
  });
});

describe('the tuning is a table, not a set of constants baked into the rule', () => {
  it('uses 45 seconds for idle, not the 30 the plan once carried', () => {
    // agent-move's idleTimeoutMs. The 30 was a client-side cosmetic sleep
    // timer and appears in no state machine.
    expect(DEFAULT_STATUS_TUNING.idleAfterMs).toBe(45_000);
  });

  it('lets a caller with a different harness supply its own windows', () => {
    const impatient = { ...DEFAULT_STATUS_TUNING, idleAfterMs: 1_000 };
    // A command quiet for 2s: still running under the 45s window, finished under
    // the 1s one. That one input answering differently is the point of keeping
    // the numbers in a table rather than in the rule.
    const given = facts({ hasActiveRuntimeProcess: true, commandQuietForMs: 2_000 });

    expect(decideStatus(given).status).toBe('working');
    expect(decideStatus(given, impatient).status).toBe('idle');
  });
});
