import { createRequire } from 'node:module';

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  FORBIDDEN,
  LAYERS,
  classifyPath,
  discoverWorkspacePackages,
  listFeatureInstances,
} = require('./.dependency-cruiser.cjs');

function findLayer(name) {
  const layer = LAYERS.find((candidate) => candidate.name === name);
  if (layer === undefined) {
    throw new Error(`Unknown layer "${name}" in .dependency-cruiser.cjs`);
  }
  return layer;
}

function packageNamesInLayer(packages, layerName) {
  return packages
    .filter((entry) => classifyPath(`${entry.dir}/`).layer === layerName)
    .map((entry) => entry.name)
    .sort();
}

function restrictedImportPatterns(names, message) {
  return names.map((name) => ({ group: [name], message }));
}

// `no-restricted-imports` matches the raw import string, so it sees the declared
// package form but not a relative deep import such as `../../battle/src/index.js`.
// The contract check in `tests/dependency-rules.test.ts` covers both forms.
function buildConfig() {
  const packages = discoverWorkspacePackages(REPO_ROOT);
  const featureNames = listFeatureInstances(REPO_ROOT);
  const featurePackageNames = packageNamesInLayer(packages, 'feature');
  const configs = [];

  for (const rule of FORBIDDEN) {
    const message = `${rule.name}: ${rule.reason}`;

    if (rule.to.differentInstance) {
      for (const feature of featureNames) {
        const forbiddenSiblings = featurePackageNames.filter(
          (name) => name !== `@battle-agents/${feature}`,
        );
        configs.push({
          name: `${rule.name}:${feature}`,
          files: [`packages/features/${feature}/**/*.ts`],
          rules: {
            'no-restricted-imports': [
              'error',
              { patterns: restrictedImportPatterns(forbiddenSiblings, message) },
            ],
          },
        });
      }
      continue;
    }

    const forbiddenNames = rule.to.layers.flatMap((layerName) =>
      packageNamesInLayer(packages, layerName),
    );
    if (forbiddenNames.length === 0) {
      continue;
    }
    configs.push({
      name: rule.name,
      files: findLayer(rule.from.layer).files,
      rules: {
        'no-restricted-imports': [
          'error',
          { patterns: restrictedImportPatterns(forbiddenNames, message) },
        ],
      },
    });
  }

  return configs;
}

export default buildConfig();
