/**
 * Fusing signals into a presence status.
 *
 * Ported from arcane-agents, `src/server/status/decide.ts` at `edcaf4018ab4`, per
 * plan section 28.1 item 5. The LOGIC is ported, not the framework: the
 * reference is Express/node-pty/tmux shaped and takes a `Worker`, while this
 * takes derived signals and answers with a status. Nothing here opens a pty,
 * reads a pane, or knows what a process is.
 *
 * Three things are worth keeping, and they are the reason this is a module
 * rather than a branch:
 *
 * 1. A decision carries both `reasons` and `facts`. `facts` is the complete
 *    set of derived signals, so the decision is auditable; `reasons` is the
 *    ordered, human-readable why, so a presence view can say "blocked on a
 *    permission prompt" instead of spinning.
 * 2. A detector that returns only a status string cannot answer "why is this
 *    agent idle", and a view that cannot answer that is a spinner.
 * 3. A signal that is detected and deliberately NOT used has to be visible in
 *    `facts`, with the reason in a comment. The reference detects a Codex
 *    `prompt` signal and rejects it as a false-attention trap. Omit the field
 *    silently and the next reader sees a hole and "fixes" it.
 *
 * This axis is NOT the session lifecycle. A session can be active while its
 * agent is blocked on a permission prompt, so this must not collapse into
 * `nextSessionStatus`.
 */

/** What a spectator sees. Distinct from session status, which is a lifecycle. */
export type AgentStatus = 'idle' | 'working' | 'attention' | 'error' | 'stopped';

/** One ordered, human-readable step in the why. */
export interface StatusReason {
  /** Stable identifier, so a view can key on it rather than on the prose. */
  readonly code: string;
  readonly message: string;
  readonly detail?: string;
}

/**
 * Every derived signal the decision had available.
 *
 * The full set, including the ones that were rejected, is the point. A
 * reviewer reading `facts` can see that a signal was detected and why it did
 * not change the answer, which is not the same as the detection being broken.
 */
export interface StatusFacts {
  /** The command the agent last ran, empty when none is known. */
  readonly lastCommand: string;
  /** How long the command has produced nothing, in milliseconds. */
  readonly commandQuietForMs: number;
  /** How long any output has been quiet, in milliseconds. */
  readonly outputQuietForMs: number;
  /** How long since the process was last seen, in milliseconds. */
  readonly runtimeAgeMs: number;
  /** Whether the harness reports a live process at all. */
  readonly hasActiveRuntimeProcess: boolean;
  /** Whether a task is genuinely in flight. */
  readonly hasActiveTask: boolean;
  /** Whether a transcript exists and parses. */
  readonly transcriptReadable: boolean;
  /** Something a permission prompt or a question is waiting on. */
  readonly hasParsedNeedsInput: boolean;
  /** A failure was seen recently. */
  readonly hasParsedError: boolean;
  /** Something strong was seen recently, the working signal. */
  readonly hasParsedStrongSignal: boolean;
  /**
   * A bare prompt-shaped signal was seen.
   *
   * Detected and deliberately NOT used, in every harness. The reference calls
   * this a false-attention trap: harnesses emit a prompt-shaped marker while the
   * agent is working normally, so treating it as "needs input" pins a character
   * to "attention" for the whole run. It is recorded so the rejection is
   * visible rather than looking like a missing detection.
   */
  readonly hasRuntimePromptSignal: boolean;
  /** Whether the process is gone rather than idle. */
  readonly runtimeStopped: boolean;
}

export interface StatusDecision {
  readonly status: AgentStatus;
  readonly reasons: readonly StatusReason[];
  readonly facts: StatusFacts;
}

/**
 * Every timing window, named and overridable.
 *
 * An untestable timeout is a magic number, and the reference keeps these
 * injectable for that reason. A caller with a different harness supplies
 * different values rather than editing this file.
 */
export interface StatusTuning {
  /**
   * How long before silence means idle.
   *
   * 45 seconds, from agent-move's `idleTimeoutMs`. The 30 seconds that appears
   * in the plan and in an earlier version of this bead is a client-side
   * cosmetic sleep timer and plays no part in any state machine. Getting this
   * wrong makes every character look busy a third longer than the reference,
   * which is the difference between "working" and "stuck".
   */
  readonly idleAfterMs: number;
  /** A strong signal keeps a character working this long after it appears. */
  readonly strongEvidenceWindowMs: number;
  /** An error keeps a character in error this long after it appears. */
  readonly recentErrorWindowMs: number;
  /** A freshly started command is not yet treated as silent. */
  readonly commandWarmupMs: number;
}

export const DEFAULT_STATUS_TUNING: StatusTuning = {
  idleAfterMs: 45_000,
  strongEvidenceWindowMs: 8_000,
  recentErrorWindowMs: 15_000,
  commandWarmupMs: 2_250,
};

/**
 * Decide, most severe first.
 *
 * The order IS the decision. `stopped` outranks everything, because a viewer
 * showing "working" for a departed agent is the one wrong answer that costs a
 * person their attention. `attention` outranks `working`, because being blocked
 * is the state a spectator can act on, and it is invisible when a working
 * signal masks it.
 */
export function decideStatus(
  facts: StatusFacts,
  tuning: StatusTuning = DEFAULT_STATUS_TUNING,
): StatusDecision {
  const reasons: StatusReason[] = [];

  if (facts.runtimeStopped) {
    reasons.push({
      code: 'runtime-stopped',
      message: 'the process is gone',
      detail: 'nothing can be working, so the character is stopped rather than idle',
    });
    return { status: 'stopped', reasons, facts };
  }

  if (facts.hasParsedNeedsInput) {
    reasons.push({
      code: 'needs-input',
      message: 'waiting on a permission prompt or a question',
      detail: 'the most actionable state for a spectator, so it outranks working',
    });
    if (facts.hasRuntimePromptSignal) {
      reasons.push({
        code: 'prompt-signal-not-used',
        message: 'a prompt-shaped signal was present and was not treated as a reason to stop',
        detail:
          'harnesses emit this while working normally; treating it as attention pins ' +
          'the character there for the whole run',
      });
    }
    return { status: 'attention', reasons, facts };
  }

  if (facts.hasParsedError && facts.outputQuietForMs < tuning.recentErrorWindowMs) {
    reasons.push({
      code: 'recent-error',
      message: 'a failure was seen recently',
      detail: `${String(facts.outputQuietForMs)}ms quiet, window is ${String(tuning.recentErrorWindowMs)}ms`,
    });
    return { status: 'error', reasons, facts };
  }

  const recentlyStrong =
    facts.hasParsedStrongSignal && facts.outputQuietForMs < tuning.strongEvidenceWindowMs;
  const commandRunning =
    facts.hasActiveRuntimeProcess && facts.commandQuietForMs < tuning.idleAfterMs;

  if (recentlyStrong || commandRunning || facts.hasActiveTask) {
    if (facts.hasActiveTask) {
      reasons.push({ code: 'task-in-flight', message: 'a task is genuinely in flight' });
    }
    if (recentlyStrong) {
      reasons.push({
        code: 'recent-strong-signal',
        message: 'strong evidence within the window',
        detail: `${String(facts.outputQuietForMs)}ms quiet, window is ${String(tuning.strongEvidenceWindowMs)}ms`,
      });
    }
    if (commandRunning) {
      reasons.push({
        code: 'command-running',
        message: 'the last command has not gone quiet past the idle window',
        detail: `${String(facts.commandQuietForMs)}ms quiet, idle is ${String(tuning.idleAfterMs)}ms`,
      });
    }
    return { status: 'working', reasons, facts };
  }

  reasons.push({
    code: 'quiet',
    message: 'nothing has happened for long enough',
    detail: `${String(facts.outputQuietForMs)}ms quiet, idle is ${String(tuning.idleAfterMs)}ms`,
  });
  return { status: 'idle', reasons, facts };
}
