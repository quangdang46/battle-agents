/**
 * Type-level tests for the frozen action contract.
 *
 * They live in tests/types rather than beside the source for one reason: they
 * have no assertions to run, and vitest executes anything matching the unit
 * globs. A file of `@ts-expect-error` directives called straight through at
 * load time either throws on the line that is only supposed to be a type error,
 * or passes without having checked anything. The check that matters here is
 * done by `tsc`, through the root typecheck, whose include covers this folder.
 *
 * `@ts-expect-error` fails in both directions, which is the property that
 * keeps this honest. If the line really does error, the directive is satisfied
 * and the build passes. If the error ever stops happening — if the contract
 * loosens by accident — the unused directive becomes an error itself, so this
 * cannot rot into a comment asserting something the compiler no longer
 * believes. Verified by making one of these lines valid and watching the build
 * fail with TS2578.
 */
import { defineAction } from '@battle-agents/core';
import type { ActionDef, Runtime, RuntimeContext } from '@battle-agents/core';

interface ClaimInput {
  readonly questId: string;
}

interface ClaimOutput {
  readonly claimed: boolean;
}

declare const context: RuntimeContext;

const claim = defineAction({
  id: 'quest.claim',
  permissions: ['quest.claim'],
  run: async (input: ClaimInput): Promise<ClaimOutput> => ({ claimed: input.questId.length > 0 }),
});

export const actionTyping = {
  // The output shape is carried through rather than widened to unknown.
  output: { claimed: true } satisfies ClaimOutput,

  // @ts-expect-error the input is ClaimInput, so an unrelated shape is refused
  wrongInput: () => claim.run({ wrongField: 1 }, context),

  // Bound to the action, not to a bare object-vs-string comparison: asserting
  // that an object is not a string holds whatever ActionDef becomes, including
  // `any`, so it would keep passing if the contract stopped typing run at all.
  wrongOutput: async () => {
    // @ts-expect-error the action resolves to ClaimOutput, so a string is refused
    const wrong: string = await claim.run({ questId: 'q1' }, context);
    return wrong;
  },

  // @ts-expect-error permissions is required to be present, even when empty
  missingPermissions: () => defineAction({ id: 'quest.list', run: async () => null }),

  // @ts-expect-error an action is not a bare function
  notAnAction: (async () => ({ claimed: true })) satisfies ActionDef<ClaimInput, ClaimOutput>,
};

/**
 * The boundary the typed registry does NOT cover, pinned as a fact.
 *
 * `Runtime.runAction` takes the caller's own I and O. With no contextual type
 * the result is `unknown`; with one it is whatever the caller wrote, and in
 * neither case is either checked against the action that will actually run. A
 * misspelled action id compiles, a wrong input shape compiles, and a wrong
 * expected output compiles. Measured with a probe rather than assumed.
 *
 * Asserted rather than described, so it stays true. The moment someone gives
 * `runAction` real typing — which needs a codegen step, because the set of
 * registered actions is decided at runtime by independently built packages —
 * the directive below becomes an unused `@ts-expect-error` and the build fails.
 * That is the point: the day the limitation is fixed, this file has to be
 * rewritten rather than left quietly claiming a gap that no longer exists.
 */
declare const runtime: Runtime;

export const boundaryIsNotTyped = {
  unannotatedResolvesToUnknown: async () => {
    const result = await runtime.runAction('quest.claim', { questId: 'q1' });
    // @ts-expect-error nothing constrains O, so the result is unknown. This is
    // the only type feedback a caller gets, and it describes the caller's
    // annotation rather than the action's real signature.
    const wrong: number = result;
    return wrong;
  },

  // A caller-supplied expectation is believed rather than checked, which is the
  // same gap wearing a different hat.
  wrongExpectationIsBelieved: async () => {
    const wrong: number = await runtime.runAction('quest.claim', { questId: 'q1' });
    return wrong;
  },

  // A misspelled id and a wrong input shape both compile clean. There is no
  // directive to write for something that does not error, so these two are here
  // to be read: if either ever starts failing, runAction gained type safety and
  // the comment above needs rewriting rather than quietly expiring.
  misspelledIdCompiles: () => runtime.runAction('quest.cliam', { questId: 'q1' }),
  wrongInputCompiles: () => runtime.runAction('quest.claim', { totally: 'wrong' }),
};
