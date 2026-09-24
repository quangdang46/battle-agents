/**
 * Types for the architecture rule engine, which is plain CommonJS.
 *
 * The engine is deliberately not a dependency-cruiser config, so it has no
 * types of its own. Declaring the surface here keeps the caller typechecked
 * without loosening noImplicitAny for the whole project.
 */
export interface ArchitectureViolation {
  readonly rule: string;
  readonly from: string;
  readonly to: string;
  readonly specifier: string | null;
  readonly message: string;
}

export interface ArchitecturePackage {
  readonly dir: string;
  readonly name: string;
}

export interface ArchitectureSourceFile {
  readonly path: string;
  readonly source: string;
}

export const FORBIDDEN: readonly { readonly name: string; readonly reason: string }[];
export const UNRESOLVED_RULE: { readonly name: string; readonly reason: string };

export function checkImports(input: {
  files: readonly ArchitectureSourceFile[];
  packages: readonly ArchitecturePackage[];
}): readonly ArchitectureViolation[];

export function classifyPath(path: string): { layer: string; instance: string | null };
export function discoverWorkspacePackages(repoRoot: string): readonly ArchitecturePackage[];
export function formatReport(violations: readonly ArchitectureViolation[]): string;
export function listFeatureInstances(repoRoot: string): readonly string[];
export function listSourceFiles(repoRoot: string): readonly ArchitectureSourceFile[];
