import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * One feature's source must not contain another's domain vocabulary.
 *
 * WHY THIS EXISTS, and it is a real incident rather than a hypothetical. While
 * two agents worked on sibling features concurrently, a byte-identical copy of
 * packages/features/progression/src/feature.ts was written over
 * packages/features/reputation/src/feature.ts. The two files had the same md5.
 * Nothing failed. The architecture check does not catch it, because a copy
 * carries no import — `no-feature-cross-import` is a rule about specifiers, and a
 * pasted file has none. Typecheck did not catch it, because the pasted code
 * happened to still typecheck against reputation's own types.
 *
 * That is the most expensive shape of mistake available here: a whole feature's
 * behaviour silently replaced by a sibling's, with every gate green, discovered
 * by a human noticing that reputation's numbers were wrong. The cost was not the
 * bad file, it was that nobody would have found it.
 *
 * WHAT IT IS NOT. It is a backstop, not the boundary. The real rule is that
 * features never import each other, and that is machine-checked by
 * architecture-rules.cjs. This catches the case the import rule cannot see: a
 * file that arrives wholesale.
 *
 * COMMENTS AND STRING LITERALS ARE STRIPPED, for the reason
 * tests/unit/scaffold.test.ts records: a comment saying "unlike reputation, this
 * is progression rather than trust" is a comment this repository wants, and a
 * guard that fires on it is a guard that gets switched off. The vocabulary below
 * is the set of exported identifiers each feature owns, which is what a copy
 * would drag with it — a prose mention would not.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const featuresDir = join(repoRoot, 'packages/features');

/**
 * Identifiers each feature OWNS. A sibling carrying one of these in executable
 * code is carrying the other's implementation with it.
 *
 * Not a word list. `reputation` on its own is English and appears in prose; these
 * are the exported names, which only exist inside their own package.
 */
const OWNED: Readonly<Record<string, readonly string[]>> = {
  progression: ['classifyBuild', 'xpForLevel', 'levelForXp', 'PROGRESSION_ACTION_IDS', 'meetsGate'],
  reputation: [
    'trustScore',
    'BOUNTY_TIERS',
    'REPUTATION_ACTION_IDS',
    'mayAcceptBounty',
    'tierForTrust',
  ],
  bounty: ['BOUNTY_ACTION_IDS', 'BOUNTY_CREATE', 'bountyLifecycle', 'describePayout'],
  quest: ['QUEST_ACTION_IDS', 'whyQuestIsRejected', 'CreatableQuestDraft'],
  agent: ['AGENT_ACTION_IDS', 'whyAgentIsRejected', 'sweepStaleSessions'],
  social: ['SOCIAL_ACTION_IDS', 'whySocialIsRejected'],
  guild: ['GUILD_ACTION_IDS'],
};

/** Same technique as scaffold.test.ts, and the same reason for it. */
function stripCommentsAndLiterals(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (literal) => literal.replace(/[^\r\n]/g, ' '));
}

function featureNames(): string[] {
  if (!existsSync(featuresDir)) return [];
  return readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(featuresDir, entry.name, 'src')))
    .map((entry) => entry.name);
}

function sourceFilesIn(feature: string): string[] {
  const src = join(featuresDir, feature, 'src');
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) found.push(full);
    }
  };
  walk(src);
  return found;
}

describe('feature packages do not carry each other', () => {
  it('has features to compare, so an empty scan cannot pass', () => {
    // A glob matching nothing and a repository with no features are the same
    // observation, and only one of them is a pass.
    expect(featureNames().length).toBeGreaterThan(0);
    expect(Object.keys(OWNED).length).toBeGreaterThan(0);
  });

  it('keeps each feature out of its siblings’ identifiers', () => {
    const offenders: string[] = [];

    for (const [feature] of Object.entries(OWNED)) {
      const foreign = Object.entries(OWNED)
        .filter(([name]) => name !== feature)
        .flatMap(([, ids]) => ids);
      if (foreign.length === 0) continue;

      for (const file of sourceFilesIn(feature)) {
        const stripped = stripCommentsAndLiterals(readFileSync(file, 'utf8'));
        for (const identifier of foreign) {
          if (new RegExp(`\\b${identifier}\\b`).test(stripped)) {
            offenders.push(
              `${file.replace(`${repoRoot}/`, '')} carries "${identifier}", owned by another feature`,
            );
          }
        }
      }
    }

    expect(
      offenders,
      'A feature package contains a sibling’s exported identifier in executable code. ' +
        'That is what a whole-file copy looks like: no import for the architecture check to ' +
        'see, and code that still typechecks. The owning feature is the one that should hold it.',
    ).toEqual([]);
  });

  it('is not fooled by a comment naming a sibling, which is the whole point of stripping', () => {
    // The guard asserting it is not the guard it replaces. A comment comparing
    // progression to reputation is a comment this codebase wants.
    const comment = [
      "import { levelForXp } from './rules.js';",
      '// unlike reputation, this is progression rather than trust: XP is a level, not a score',
      "const reason = 'trustScore';",
    ].join('\n');

    expect(stripCommentsAndLiterals(comment)).not.toMatch(/\btrustScore\b/);
    expect(stripCommentsAndLiterals(comment)).toMatch(/\blevelForXp\b/);
  });
});
