import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The credential-hygiene gate, proved to bite.
 *
 * This gate has been dead twice. It matched a pattern drizzle does not emit,
 * and then a repair matched a pattern drizzle also does not emit, and both times
 * it reported green while checking nothing. A gate that has only ever passed is
 * not a gate, and the repo's own history is the evidence.
 *
 * So the gate is run here against planted violations, on a COPY of the tree in
 * a temporary directory. Planting into the real tree would be the mistake the
 * bead's author warned about — a test that damages the checkout to prove a
 * point about the checkout. Everything below is discarded.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const GATE_RELATIVE = 'scripts/check-schema-hygiene.sh';
const SCHEMA_RELATIVE = 'packages/db/src/schema';

/**
 * A throwaway copy of the tree the gate reads.
 *
 * The gate resolves its roots from the SCRIPT's own location rather than from
 * the working directory, so the script is copied in as well. Running the real
 * one with a different cwd was the first version of this and it silently read
 * the real tree — which would have made every test below assert nothing while
 * reporting green, the exact failure this gate has already produced twice.
 */
function scratchTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'schema-hygiene-'));
  const schemaDir = join(root, SCHEMA_RELATIVE);
  mkdirSync(schemaDir, { recursive: true });
  mkdirSync(join(root, 'packages/db/migrations'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });

  copyFileSync(join(REPO_ROOT, GATE_RELATIVE), join(root, GATE_RELATIVE));
  for (const name of ['platform.ts', 'auth.ts', 'index.ts', 'ownership.ts']) {
    const source = join(REPO_ROOT, SCHEMA_RELATIVE, name);
    try {
      copyFileSync(source, join(schemaDir, name));
    } catch {
      // A file the real tree does not have is not needed for the fixture.
    }
  }
  return root;
}

interface GateResult {
  readonly status: number;
  readonly output: string;
}

function runGate(root: string): GateResult {
  try {
    const output = execFileSync('bash', [GATE_RELATIVE], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

describe('the credential-hygiene gate', () => {
  it('passes on a tree that has not been tampered with', () => {
    const root = scratchTree();
    try {
      const result = runGate(root);
      expect(result.status, result.output).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('catches a plaintext credential planted in a guarded table', () => {
    // The original defect this whole gate exists for.
    const root = scratchTree();
    try {
      const path = join(root, SCHEMA_RELATIVE, 'platform.ts');
      const source = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        source.replace(
          "tokenHash: text('token_hash').notNull(),",
          "tokenHash: text('token_hash').notNull(),\n    apiKey: text('api_key'),",
        ),
      );

      const result = runGate(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('api_key');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('catches a new credential column beside the exempt ones', () => {
    // The failure mode the table-scoped exemptions could have had: exempting
    // the table wholesale, so anything added next to the exempted columns sails
    // through. They are exempt by table:column precisely so this stays red.
    const root = scratchTree();
    try {
      const path = join(root, SCHEMA_RELATIVE, 'auth.ts');
      const source = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        source.replace(
          "    scope: text('scope'),",
          "    scope: text('scope'),\n    botSecret: text('bot_secret'),",
        ),
      );

      const result = runGate(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('bot_secret');
      expect(result.output).toContain("'account'");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('catches a credential added to a guarded table by a later migration', () => {
    // The second scanner branch. A gate that only reads the schema source
    // misses a column added directly to a migration, and a migration is the
    // artefact that actually reaches a database.
    const root = scratchTree();
    try {
      writeFileSync(
        join(root, 'packages/db/migrations', '0001_planted.sql'),
        'ALTER TABLE "agent_credentials" ADD COLUMN "planted_secret" text;\n',
      );

      const result = runGate(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('planted_secret');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('catches a credential in a schema file one directory down', () => {
    // The source scanner walked packages/db/src/schema/*.ts and stopped. Every
    // feature's tables live in schema/features/, so a credential column planted
    // there was invisible and the gate printed its pass line having checked
    // nothing about it. This test is the difference between the recursive scan
    // and the flat one: it fails against the flat scan and passes against the
    // recursive one, which is the only kind of test that pins the fix.
    const root = scratchTree();
    try {
      const featuresDir = join(root, SCHEMA_RELATIVE, 'features');
      mkdirSync(featuresDir, { recursive: true });
      writeFileSync(
        join(featuresDir, 'github.ts'),
        [
          'export const githubDeliveryClaims = pgTable(',
          "  'github_delivery_claims',",
          '  {',
          "    id: uuid('id').primaryKey(),",
          "    deliveryId: text('delivery_id').notNull(),",
          "    installationToken: text('installation_token'),",
          '  },',
          ');',
          '',
        ].join('\n'),
      );

      const result = runGate(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain('installation_token');
      expect(result.output).toContain("'github_delivery_claims'");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still refuses the exempted columns themselves, in a table that earns them', () => {
    // The mirror of the previous test, and the one that stops the exemptions
    // rotting into a general allowlist: access_token is exempt in `account` and
    // nowhere else.
    const root = scratchTree();
    try {
      const path = join(root, SCHEMA_RELATIVE, 'platform.ts');
      const source = readFileSync(path, 'utf8');
      const planted = source.replace(
        "    tokenHash: text('token_hash').notNull(),",
        "    tokenHash: text('token_hash').notNull(),\n    bearerToken: text('access_token'),",
      );
      // Asserted rather than assumed. A replace that finds no anchor plants
      // nothing, the gate passes, and the test fails for a reason that has
      // nothing to do with the gate — which is exactly what happened the first
      // time this was written.
      expect(planted, 'the fixture must actually plant a column').not.toBe(source);
      writeFileSync(path, planted);

      const result = runGate(root);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("'agent_credentials'");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
