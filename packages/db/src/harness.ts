/**
 * The stored harness, narrowed — the one place in this package that knows the
 * list.
 *
 * ## Why this exists rather than living in a repository
 *
 * `agents.ts` and `social.ts` each carried their own `HARNESSES` set and their
 * own `toHarness`, character for character, and the two had never been compared.
 * They agree today. They are two copies of the same fact, which is the shape
 * that stops agreeing: adding a harness to one and not the other is not a
 * compile error and not a test failure, it is a character who reads as one
 * harness on the profile and another on the leaderboard.
 *
 * ## Why the list is not imported from the agent feature
 *
 * It is spelled out rather than imported for the reason every other repository
 * in this package spells its shapes out: infrastructure may not import the layer
 * that consumes it. This is the price of the layering rule, and the reason it
 * was worth paying ONCE here rather than twice in two files that were already
 * going to drift.
 *
 * `packages/features/agent/src/domain.ts` carries its own copy for the same
 * reason, and the two agree by spelling. A test reads both so that agreement is
 * checked rather than assumed — see `tests/unit/harness-narrowing.test.ts`.
 */

/** The harnesses this build knows how to name. Anything else reads as 'other'. */
export const HARNESSES = ['claude', 'codex', 'opencode', 'cursor', 'pi', 'gemini', 'amp'] as const;

export type Harness = (typeof HARNESSES)[number];

/** The value a stored harness that is not in the list narrows to. */
export const UNKNOWN_HARNESS = 'other';

const KNOWN = new Set<string>(HARNESSES);

/**
 * A stored harness, narrowed rather than cast.
 *
 * The column is a plain `text`, so a row written by an adapter this build does
 * not have can name a harness no reader here has heard of. `toHarness` is what
 * turns that into `other` on the way out, so nothing above this layer has to
 * carry a second copy of the same list to guard its switch.
 */
export function toHarness(stored: string): string {
  return KNOWN.has(stored) ? stored : UNKNOWN_HARNESS;
}
