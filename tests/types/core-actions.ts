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
import type { ActionDef, RuntimeContext } from '@battle-agents/core';

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
