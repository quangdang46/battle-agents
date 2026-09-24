import { execFileSync } from 'node:child_process';

import { Client } from 'pg';

/**
 * Proves the pipeline can reach the database it thinks it started.
 *
 * This exists because `docker compose up --wait` reported success while the
 * test database was unusable. Two other projects on the machine already owned
 * the published port, so Compose created the Postgres container, the container
 * reported itself healthy, and the port on the host belonged to somebody
 * else's server. Every later stage then failed on a password error against a
 * database this project never started, three stages removed from the cause.
 *
 * A container being healthy and a container being reachable are different
 * facts. This asserts the second one, against the same DATABASE_URL the
 * migration and seed stages will use, so a broken endpoint is reported where
 * it is caused rather than three stages later as a wrong-looking error.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const CONNECTION_TIMEOUT_MS = 5_000;

/** Whose container is publishing this port, when docker is available to ask. */
function containersPublishing(port: string): string {
  try {
    const output = execFileSync(
      'docker',
      ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return output.trim();
  } catch {
    return '';
  }
}

function explain(connectionString: string, error: unknown): string {
  const port = new URL(connectionString).port || '5432';
  const owners = containersPublishing(port);
  const lines = [
    `Cannot reach Postgres at ${connectionString.replace(/:[^:@/]+@/, ':***@')}.`,
    `  driver error: ${error instanceof Error ? error.message : String(error)}`,
  ];

  if (error instanceof Error && 'code' in error && error.code === '28P01') {
    lines.push(
      '',
      '  A password error here usually means the request reached a DIFFERENT server',
      '  than the one this project started. Postgres refusing credentials is a very',
      '  different problem from Postgres being unreachable, and the first is what a',
      '  port collision looks like from here.',
    );
  }

  if (owners === '') {
    lines.push(
      '',
      `  No container is publishing host port ${port}. Something else on this machine`,
      '  owns it, or Compose could not bind it. Move this project off the port:',
      `    M0_PG_PUBLISHED_PORT=<free port>   (the test database)`,
      '    POSTGRES_PORT=<free port>          (the local dev database)',
    );
  } else {
    lines.push('', `  Containers publishing host port ${port}: ${owners.split('\n').join(', ')}`);
    lines.push(
      '  One of those is holding the port this project wanted. Stop it, or move this',
      '  project elsewhere with M0_PG_PUBLISHED_PORT.',
    );
  }

  return lines.join('\n');
}

async function main(): Promise<number> {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    console.error(`${DATABASE_URL_VARIABLE} is not set; nothing to check.`);
    return 1;
  }

  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  try {
    await client.connect();
    const result = await client.query<{ database: string; user: string }>(
      'select current_database() as database, current_user as user',
    );
    const row = result.rows[0];
    console.log(`postgres reachable: database "${row?.database ?? '?'}" as "${row?.user ?? '?'}".`);
    return 0;
  } catch (error) {
    // Printed rather than thrown: this is a diagnostic for whoever is running
    // the pipeline, and a stack trace under a message that already names the
    // container holding the port is noise.
    console.error(explain(connectionString, error));
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

process.exitCode = await main();
