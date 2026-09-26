/**
 * The version of the EXTENSION contract, which is a different thing from the
 * version of the wire protocol, and conflating the two is the mistake this file
 * exists to prevent.
 *
 * `PROTOCOL_VERSION` names the `AgentEvent` union and the batch shape on the
 * telemetry plane. It changes when the wire changes, which is often, and it is
 * enforced on ingest because a server can see the number an agent sent.
 *
 * This constant names the `GameFeature` shape and the `createRuntime`
 * composition in `@battle-agents/core` that an external package is written
 * against. That surface is FROZEN, so it changes rarely and on purpose. Nobody
 * can enforce it for a third party — core has no idea an extension exists, and
 * adding a check to the registry would mean editing a contract three packages
 * of features are already written against, which is exactly the change
 * `AGENTS.md` calls an architecture failure.
 *
 * So the check is opt-in on the only side that has a lever. An extension
 * declares the contract version it was written against; the host compares it
 * with the SDK it is loading into. Both are in this file, so the policy is one
 * function and a host that wants a different policy changes one function rather
 * than hunting for comparisons scattered across extensions.
 *
 * WHY IT LIVES HERE AND NOT IN `core`, stated because it looks wrong. The
 * contract it versions is declared in `core/src/contracts.ts`, and the natural
 * home for its version is `core`'s barrel beside the contract. `core` is frozen
 * and `core` has zero dependencies by design, so the constant is here instead —
 * in the package that already carries the other version string, is not frozen,
 * and is the one a third party installs first. When the freeze on `core` is
 * lifted, moving this constant is a one-line change and this comment is what a
 * reader needs to make it correctly.
 */

/**
 * Bumped when `GameFeature`, `RuntimeContext`, `Runtime` or `createRuntime`
 * changes in a way an already-written extension would notice.
 *
 * Pre-1.0 and exact-matched, for the same reason `parseEventBatch` exact-matches
 * `PROTOCOL_VERSION`: this surface is frozen rather than versioned, so a change
 * to it is a breaking change to every extension in existence, and the useful
 * comparison is equality rather than a range that would have to encode guesses.
 */
export const EXTENSION_CONTRACT_VERSION = '0.1.0';

/** What an external package publishes about itself, so a host can check it. */
export interface ExtensionContract {
  /** The package's own name, so the message names who is incompatible. */
  readonly packageName: string;
  /** The contract version this package was written against. */
  readonly version: string;
}

/**
 * Thrown when an extension was written against a contract this SDK does not
 * implement.
 *
 * Carries both versions, because the only useful thing a caller can do with the
 * failure is decide whether to upgrade the host or pin the extension, and
 * neither is possible without knowing which side is behind.
 */
export class ExtensionContractMismatch extends Error {
  readonly packageName: string;
  readonly declared: string;
  readonly expected: string;

  constructor(packageName: string, declared: string, expected: string) {
    super(
      `extension ${packageName} was written against extension contract ${declared}, ` +
        `and this SDK implements ${expected}. They are not the same contract, so the ` +
        'extension was not installed.',
    );
    this.name = 'ExtensionContractMismatch';
    this.packageName = packageName;
    this.declared = declared;
    this.expected = expected;
  }
}

/** Whether the SDK can host this extension. False rather than a throw. */
export function isExtensionContractCompatible(declared: ExtensionContract): boolean {
  return declared.version === EXTENSION_CONTRACT_VERSION;
}

/**
 * The one comparison, and the only place the policy lives.
 *
 * Exact match, and deliberately unforgiving. An extension declares a version
 * because it was compiled against a `GameFeature` shape; a host on a different
 * shape may satisfy it in ways neither side wrote down, and a compatibility
 * range here would be a guess dressed as a guarantee. A host that decides to be
 * lenient changes this function and nothing else.
 */
export function assertExtensionContract(declared: ExtensionContract): void {
  if (declared.version !== EXTENSION_CONTRACT_VERSION) {
    throw new ExtensionContractMismatch(
      declared.packageName,
      declared.version,
      EXTENSION_CONTRACT_VERSION,
    );
  }
}

/**
 * Check a whole extension list before composing a runtime from it.
 *
 * Exists because a self-check inside an extension is a convention and a
 * convention is exactly what this repository keeps being wrong about: a
 * package that forgot to call `assertExtensionContract` would load cleanly onto
 * a host it was never written for, and the failure would surface later as an
 * extension reading a `RuntimeContext` field that is not there. A host that
 * composes third-party features calls this over the list it was handed, and the
 * extension that skipped the self-check is caught by the host instead.
 *
 * The whole list is checked before anything is reported as a problem, so a
 * caller sees every incompatible package rather than the first one.
 */
export function assertExtensionContracts(declared: readonly ExtensionContract[]): void {
  for (const contract of declared) {
    assertExtensionContract(contract);
  }
}
