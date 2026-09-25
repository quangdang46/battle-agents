import type { AgentEvent } from '@battle-agents/protocol';
import { normalizeToolName } from '@battle-agents/protocol';

/**
 * Translating one harness's vocabulary into ours.
 *
 * This is the whole job of an adapter that watches a file: the harness writes
 * its own shape, and everything downstream of here expects `AgentEvent`. The
 * two rules that are easy to miss are in the reference implementation and are
 * reproduced here because the template is the thing every new adapter is
 * copied from.
 *
 * Copy this file, delete what does not apply, and keep the two normalisations.
 */

/** One parsed line, or null when the line is not worth emitting. */
export type ParsedLine = AgentEvent | null;

/** The identity a harness stamps on its own records, before we namespace it. */
export interface RawSessionRef {
  /** The harness's own session id, exactly as it appears in its files. */
  readonly sessionId: string;
  /** The harness's name, lowercase and namespaced: `vendor.some-cli`. */
  readonly providerId: string;
}

/**
 * Tool names are per-harness, the event is not.
 *
 * `shell_command`, `exec_command` and `Bash` are the same activity, and the
 * activity log, the zone map and the game client all key on the canonical
 * name. Skipping this normalisation produces a stream that is correct and
 * unreadable, because every one of those names becomes a separate thing.
 */
export function canonicalToolName(harnessName: string): string {
  return normalizeToolName(harnessName);
}

/**
 * The events an adapter must be able to emit.
 *
 * A harness that cannot supply one of these should still emit the rest. The
 * stream is the activity log a replay and a dispute are settled from, so a
 * missing event is a gap in the record, not a reason to drop the session.
 */
export const REQUIRED_EVENT_TYPES: readonly string[] = [
  'session.started',
  'session.ended',
  'tool.started',
  'tool.completed',
];
