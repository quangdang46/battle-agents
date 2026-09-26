import { defineAction } from '@battle-agents/core';
import type { GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';
import { assertExtensionContract, type ExtensionContract } from '@battle-agents/protocol';

import { readRuns, recordRun, SPEEDRUN_FEATURE_ID, type SpeedrunRun } from './state.js';

/**
 * A third-party game feature, written the way one is actually written: against
 * the two public barrels and nothing else.
 *
 * Read this file as the documentation of the extension surface. Everything
 * below reaches the runtime through `GameFeature` and `RuntimeContext`, and the
 * list of names it imports from `@battle-agents/core` IS the public extension
 * surface. Anything a feature cannot do from here is not part of the contract,
 * and a contributor who needs it has found a real gap rather than a missing
 * trick.
 */

/**
 * What this package was written against, and refuses to run on anything else.
 *
 * `version` is a STRING LITERAL, and it has to be. Writing
 * `EXTENSION_CONTRACT_VERSION` here would compare the SDK's constant with
 * itself: the check could never fail, so it would be a line of code that reads
 * as a guard and enforces nothing. A third party writes the version it was
 * compiled against, and bumps it by hand when the surface it uses changes. That
 * is the only way the self-check below has anything to compare.
 */
export const SPEEDRUN_EXTENSION_CONTRACT = {
  packageName: 'speedrun-mode',
  version: '0.1.0',
} as const;

const SPEEDRUN_CREATE = 'speedrun.create';
const SPEEDRUN_REPORT = 'speedrun.report';
const SPEEDRUN_START = 'speedrun.start';
const SPEEDRUN_STOP = 'speedrun.stop';

/** Bus-only: a run starting is progress, and `speedrun.finished` is the record. */
const RUN_STARTED = 'speedrun.started';
/** Owned by this feature, and the only type it declares as worth a row. */
const RUN_FINISHED = 'speedrun.finished';

/**
 * A capability this feature needs and does not provide.
 *
 * Spelled as a literal, not as an import, and that is the whole point of
 * `requires`: a name crosses the boundary between packages and a module graph
 * does not. The platform is free to stop shipping `bounty.list` in a future
 * release and this package keeps compiling, degrading at runtime into a mode
 * that says which capability is missing. An import would have made the two
 * features share a build, which is the thing the layering rule forbids.
 */
const REQUIRES_BOUNTY_LIST = 'bounty.list';

const MISSING_BOUNTY_LIST =
  'speedrun.create needs bounty.list, which is not installed. A speedrun is started ' +
  'from a bounty, so there is nothing to attach one to. Install the bounty feature or ' +
  'use a different mode.';

/**
 * Whether a `requires` entry is met, read the way a feature is meant to read it.
 *
 * `runtime.capabilities()` rather than a list captured when this module loaded:
 * the answer changes when a feature is installed or uninstalled after this one
 * was composed, and a feature that decided once would keep answering for a
 * composition that no longer exists.
 */
function satisfied(context: RuntimeContext, capability: string): boolean {
  return context.runtime.capabilities().includes(capability);
}

function readInput(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('speedrun input must be an object');
  }
  return input as Record<string, unknown>;
}

function requireString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`speedrun ${field} must be a non-empty string`);
  }
  return value;
}

function eventOf(type: string, run: SpeedrunRun, context: RuntimeContext): GameEvent<SpeedrunRun> {
  return { type, occurredAt: context.now(), actorId: run.challengerId, payload: run };
}

/**
 * Records a run and returns it, without emitting anything.
 *
 * Split from the emission so the command path and the action path produce the
 * same event without one of them emitting twice. A command handler RETURNS its
 * events and the runtime applies them; an action has no return channel for
 * events, so it emits. Two paths, one place where the record is written.
 */
async function openRun(input: unknown, context: RuntimeContext): Promise<SpeedrunRun> {
  if (!satisfied(context, REQUIRES_BOUNTY_LIST)) {
    throw new Error(MISSING_BOUNTY_LIST);
  }
  const fields = readInput(input);
  const run: SpeedrunRun = {
    runId: requireString(fields, 'runId'),
    challengerId: requireString(fields, 'challengerId'),
    startedAt: context.now(),
  };
  await recordRun(context.store, run);
  return run;
}

async function finishRun(runId: string, context: RuntimeContext): Promise<SpeedrunRun> {
  const runs = readRuns(context.store);
  const live = runs.find((run) => run.runId === runId && run.finishedAt === undefined);
  if (live === undefined) {
    throw new Error(`no live speedrun named ${runId}`);
  }
  const finished: SpeedrunRun = { ...live, finishedAt: context.now() };
  await context.store.save<readonly SpeedrunRun[]>(
    SPEEDRUN_FEATURE_ID,
    runs.map((run) => (run.runId === runId ? finished : run)),
  );
  return finished;
}

/**
 * The factory, and the self-check.
 *
 * A third party cannot change the host, so the check has to live on this side
 * of the boundary: an extension that knows it was written against a different
 * contract refuses to be built rather than loading and failing later somewhere
 * nobody can trace back to a version. On its own this is a convention — a
 * package that omitted the line would load clean — which is why
 * `assertExtensionContracts` exists for a host to run over the list it was
 * handed, and why both directions are exercised in
 * `tests/unit/out-of-tree-extension.test.ts`.
 *
 * `contract` is a parameter, defaulting to what this package declares, because
 * a fork and a vendored copy each declare their own and neither can edit this
 * file. It is the same shape the host's `assertExtensionContracts` takes, so the
 * two sides cannot drift into disagreeing about what a contract is.
 *
 * The parameter is also what makes the self-check observable. Asserting that the
 * factory CALLS the check is a claim about the source; asserting that it REFUSES
 * a contract the SDK does not implement is a claim about the behaviour, and only
 * the second one can fail when someone deletes the call.
 */
export function speedrunMode(
  contract: ExtensionContract = SPEEDRUN_EXTENSION_CONTRACT,
): GameFeature {
  assertExtensionContract(contract);

  return {
    id: SPEEDRUN_FEATURE_ID,
    // A command produces events and never applies anything itself, so the
    // event trail is the record of what happened. An external feature gets the
    // same split as an internal one because it is the same interface.
    commands: [
      {
        type: SPEEDRUN_START,
        handle: async (command, context) => {
          const run = await openRun(command.payload, context);
          return [eventOf(RUN_STARTED, run, context)];
        },
      },
      {
        type: SPEEDRUN_STOP,
        handle: async (command, context) => {
          const runId = requireString(readInput(command.payload), 'runId');
          return [eventOf(RUN_FINISHED, await finishRun(runId, context), context)];
        },
      },
    ],
    // Reacts to a platform event type without importing whatever emits it.
    // `session.ended` is in core's own `PERSISTED_EVENT_TYPES`, which is also
    // the proof that a core-owned type is not owned by a feature: the
    // single-owner rule is about `persistedEvents` DECLARATIONS, and
    // subscribing to one is how every feature in this repository already works.
    eventHandlers: [
      {
        on: 'session.ended',
        handle: async () => {},
      },
    ],
    // The spread is not decoration. `defineAction`'s PARAMETER type carries
    // `id`, `permissions` and `run` and nothing else, while the `ActionDef` it
    // returns has an optional `description` — so an action written through
    // `defineAction` cannot be given one, and passing it in is a type error
    // rather than a silent drop. `description` is load-bearing: `inspect` has to
    // describe an operation without running it, and an undescribed action is
    // reported as undescribed.
    //
    // Core is frozen, so the fix is a one-line widening of a parameter type in
    // `packages/core/src/actions.ts` and this package cannot make it. What it
    // can do is show the shape a third party uses until it is made, and
    // `docs/design/extension-surface.md` records the gap. `out-of-tree-
    // extension.test.ts` asserts the descriptions survive, so the workaround is
    // checked rather than merely written down.
    actionDefs: [
      {
        ...defineAction({
          id: SPEEDRUN_CREATE,
          permissions: [SPEEDRUN_CREATE],
          run: async (input, context) => {
            const run = await openRun(input, context);
            await context.runtime.emit(eventOf(RUN_STARTED, run, context));
            return run;
          },
        }),
        description: 'Open a speedrun against a bounty.',
      },
      {
        ...defineAction({
          id: SPEEDRUN_REPORT,
          permissions: [SPEEDRUN_REPORT],
          run: async (input, context) => {
            const run = await finishRun(requireString(readInput(input), 'runId'), context);
            await context.runtime.emit(eventOf(RUN_FINISHED, run, context));
            return run;
          },
        }),
        description: 'Stop a live speedrun and record the wall-clock time.',
      },
    ],
    capabilities: [
      { name: SPEEDRUN_CREATE, description: 'Open a speedrun against a bounty.' },
      { name: SPEEDRUN_REPORT, description: 'Record the wall-clock time a speedrun took.' },
    ],
    requires: [REQUIRES_BOUNTY_LIST],
    // One owned type, and the reason it is a fresh name: an event type has
    // exactly one owner in this registry, and the second feature to claim one
    // is rejected at install rather than at read.
    persistedEvents: [RUN_FINISHED],
  };
}
