/**
 * Writing into a harness's own configuration, with consent.
 *
 * An adapter that hooks a CLI has to edit that CLI's settings file. That file
 * belongs to the user, it is on their machine, and it is not this project's
 * repo. Two rules follow and they are not negotiable:
 *
 * 1. **Ask first.** A first write to a settings file is a consent gate, not an
 *    install step. The user has to see what will be written, where, and how to
 *    undo it, and say yes, before anything is written.
 * 2. **Never touch the user's project.** Global agent config only. An installer
 *    that edits a repository is editing code the user is working in, and the
 *    plan forbids it outright.
 *
 * The shape below is the one pixel-agents uses, and the reason it is shaped
 * this way is in the failure it prevents: a hook entry that points at a script
 * which was never copied spawns a dead process on every event, and the install
 * reported success while leaving it there.
 */

export interface InstallTarget {
  /** The global config file, e.g. ~/.claude/settings.json. */
  readonly configPath: string;
  /** The executable the harness should run, as a path. */
  readonly hookCommand: string;
  /** Event names the harness dispatches, e.g. `PreToolUse`. */
  readonly eventNames: readonly string[];
}

export interface ConsentDisclosure {
  readonly headline: string;
  /** What is written where, what data moves, how to undo. Paragraphs on blank lines. */
  readonly body: string;
}

export type ConsentChoice = 'granted' | 'declined';

export interface InstallerEffects {
  /** Write the entries. Returns whether the file on disk now agrees. */
  readonly write: (target: InstallTarget) => Promise<boolean>;
  /** Remove our entries and leave everything else alone. */
  readonly remove: (target: InstallTarget) => Promise<boolean>;
  /** Record the answer so the user is not asked twice. */
  readonly record: (choice: ConsentChoice) => Promise<void>;
}

/**
 * Apply a consent answer.
 *
 * The answer is a state command, not an event: choosing again replaces what the
 * first choice did. That is why the two effects are ordered, and why the
 * preference is recorded only after the effect settled and the file agrees.
 * Recording first strands the user when the write fails: the entries are not
 * there, but the preference says they are, so the next start skips the gate.
 */
export async function applyConsentChoice(
  choice: ConsentChoice,
  target: InstallTarget,
  effects: InstallerEffects,
): Promise<{ installed: boolean }> {
  if (choice === 'declined') {
    const removed = await effects.remove(target);
    if (!removed) {
      // Leave the record alone. A decline that could not remove the entries
      // would persist as "declined" over hooks that are still firing, and the
      // user would have no way back through the UI.
      return { installed: false };
    }
    await effects.record(choice);
    return { installed: false };
  }

  const written = await effects.write(target);
  if (!written) return { installed: false };
  await effects.record(choice);
  return { installed: true };
}
