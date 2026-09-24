import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';

/**
 * Run the architecture rule engine over the real tree.
 *
 * Why this exists separately from tests/unit/dependency-rules.test.ts. That test
 * exercises the engine against a synthetic fixture, which is the right way to
 * prove each rule fires, but it proves nothing about the repository as it
 * stands. Meanwhile the engine could be deleted along with its test and nothing
 * would notice, because the file that used to look like a dependency-cruiser
 * config could not be run by the real dependency-cruiser CLI either.
 *
 * So the real-tree run lives here, in a script the pipeline invokes as its own
 * stage. Deleting a test file does not delete this, and the config it reads is
 * architecture-rules.cjs, whose header says plainly what it is.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

interface LayerContract {
  checkImports: (input: {
    files: readonly { path: string; source: string }[];
    packages: readonly { dir: string; name: string }[];
  }) => readonly { rule: string; from: string; to: string; specifier: string | null }[];
  discoverWorkspacePackages: (repoRoot: string) => readonly { dir: string; name: string }[];
  formatReport: (violations: readonly { rule: string; from: string; to: string; specifier: string | null }[]) => string;
  listSourceFiles: (repoRoot: string) => readonly { path: string; source: string }[];
}

function loadContract(): LayerContract {
  const loaded = require(join(REPO_ROOT, 'architecture-rules.cjs')) as LayerContract;
  for (const name of ['checkImports', 'discoverWorkspacePackages', 'formatReport', 'listSourceFiles'] as const) {
    if (typeof loaded[name] !== 'function') {
      throw new Error(`architecture-rules.cjs must export ${name}`);
    }
  }
  return loaded;
}

function main(): void {
  const contract = loadContract();
  const packages = contract.discoverWorkspacePackages(REPO_ROOT);
  const sourceFiles = contract.listSourceFiles(REPO_ROOT);
  const violations = contract.checkImports({ files: sourceFiles, packages });

  if (violations.length === 0) {
    console.log(
      `architecture: ${packages.length} package(s), ${sourceFiles.length} source file(s), no violations.`,
    );
    return;
  }

  console.error(`architecture FAILED with ${violations.length} violation(s):`);
  console.error(contract.formatReport(violations));
  console.error(
    '\nThese are layering rules from the plan: features never import another feature, adapters and core stay at the bottom, and an import that resolves to nothing is reported rather than skipped.',
  );
  process.exitCode = 1;
}

main();
