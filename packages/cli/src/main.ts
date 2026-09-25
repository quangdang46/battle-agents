#!/usr/bin/env node
import { parseArgv, run } from './commands.js';
import { HttpApiClient } from './api-client.js';
import { readSession } from './session.js';

/**
 * The `agent-battle` entry point.
 *
 * Assembles a client from what is on this machine and hands the invocation to
 * the dispatcher. Everything else lives in those three modules, so the only
 * thing decided here is which client the verbs talk to.
 */
async function main(): Promise<number> {
  const invocation = parseArgv(process.argv.slice(2));
  const session = readSession();

  if (session === undefined) {
    process.stderr.write(
      'not logged in. Run `agent-battle login <server-url> <token>`, or pass an ' +
        'ApplicationApi in-process when embedding the CLI.\n',
    );
    return 1;
  }

  const result = await run(new HttpApiClient(session), invocation);
  if (result.stdout !== '') process.stdout.write(`${result.stdout}\n`);
  if (result.stderr !== '') process.stderr.write(`${result.stderr}\n`);
  return result.exitCode;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
