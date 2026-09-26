#!/usr/bin/env node
/**
 * `agent-battle-claude` — the long-lived process that runs the Claude adapter.
 *
 * WHY A BIN ON THE ADAPTER, which is the decision
 * docs/design/extension-surface.md records and this file is the first thing to
 * act on. A host that held the ledger would have to know where each harness
 * writes its files, what its record format is, and which tool names it uses —
 * which is exactly the knowledge adapters exist to isolate. The adapter is the
 * only thing that knows the file layout, so the adapter is the only thing that can
 * hold the ledger.
 *
 * A bin is a PROCESS ENTRY POINT, not an installer. It reads files the harness
 * already wrote and writes nothing to the user's configuration, which is what
 * keeps §29.2 intact: the consent-gated installer is a separate, separate-
 * decision path and this does not touch it.
 *
 * IT EXITS NON-ZERO WITHOUT A CREDENTIAL, rather than starting and failing
 * quietly. A process that cannot post its events is worse than one that never
 * starts, because the symptom — an adapter that runs and an empty stream — looks
 * like the product being idle.
 *
 * The version handshake is a startup check rather than a courtesy: PROTOCOL_VERSION
 * is pinned on ingest, and a mismatch answers 400 naming both values. Finding that
 * out after a session has been running for an hour is the wrong time.
 */

import type { AgentEvent } from '@battle-agents/protocol';

import { transcriptsDirectory } from '../parsers/jsonl.js';
import { ClaudeWatcher } from '../watcher.js';
import { createIngestSender, IngestRefusedError } from '@battle-agents/protocol';

interface Options {
  readonly root?: string | undefined;
  readonly endpoint?: string | undefined;
  readonly token: string;
  readonly pollMs: number;
  readonly once: boolean;
  readonly help: boolean;
}

const USAGE = `agent-battle-claude — run the Claude adapter until interrupted

  --endpoint <url>    where to POST batches   (default http://127.0.0.1:3000)
  --token <bearer>    installation credential  (required; or AGENT_BATTLE_TOKEN)
  --root <dir>        Claude projects dir     (default ~/.claude/projects)
  --poll <ms>         poll interval           (default 500)
  --once              run one tick and exit, for a test or a health probe
  --help              this text

Writes nothing to Claude's configuration. The consent-gated installer is a
different command and makes a different promise.
`;

/**
 * Parsed by hand rather than with a parser, and the reason is that a flag this
 * small does not justify a dependency in a package the M7 proof is measuring. A
 * typo is a USAGE line and exit 2, never a silently ignored argument.
 */
function parse(argv: readonly string[]): Options {
  let root: string | undefined;
  let endpoint: string | undefined;
  let token = process.env['AGENT_BATTLE_TOKEN'] ?? '';
  let pollMs = 500;
  let once = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) usage(`${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--endpoint':
        endpoint = next();
        break;
      case '--token':
        token = next();
        break;
      case '--root':
        root = next();
        break;
      case '--poll':
        pollMs = Number(next());
        break;
      case '--once':
        once = true;
        break;
      case '--help':
        help = true;
        break;
      default:
        usage(`unknown argument ${String(arg)}`);
    }
  }

  if (!Number.isFinite(pollMs) || pollMs <= 0)
    usage('--poll must be a positive number of milliseconds');
  return { root, endpoint, token, pollMs, once, help };
}

function usage(problem: string): never {
  process.stderr.write(`agent-battle-claude: ${problem}\n\n${USAGE}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (options.token === '') {
    usage('no credential: pass --token or set AGENT_BATTLE_TOKEN');
  }

  const endpoint =
    options.endpoint ?? process.env['AGENT_BATTLE_ENDPOINT'] ?? 'http://127.0.0.1:3000';
  // A refusal is REPORTED AND SURVIVED rather than fatal, because the sender
  // throws and an unhandled rejection in a poll loop takes the process down —
  // which presents as an adapter that has stopped, when the truth is a server
  // that will not take its batches. Those are fixed by opposite actions, so the
  // message says which one this is. The sender already applies its own backoff,
  // including halving on a 413 because waiting alone cannot fix a size refusal.
  const sender = createIngestSender({ baseUrl: endpoint, token: options.token });
  let refusals = 0;
  const send = async (batch: readonly AgentEvent[]): Promise<void> => {
    try {
      await sender(batch);
    } catch (error) {
      if (error instanceof IngestRefusedError) {
        refusals += 1;
        process.stderr.write(
          `agent-battle-claude: batch refused (${refusals} so far): ${error.detail}\n`,
        );
        return;
      }
      throw error;
    }
  };

  const watcher = new ClaudeWatcher({
    send,
    transcriptsRoot: options.root ?? transcriptsDirectory(),
    pollIntervalMs: options.pollMs,
  });

  await watcher.start();
  process.stderr.write(`agent-battle-claude: watching, posting to ${endpoint}\n`);

  if (options.once) {
    await watcher.stop();
    return;
  }

  // SIGINT is what a supervisor sends, and the second one is what a person sends
  // when the first did not work. stop() is awaited, so the final flush is not
  // fire-and-forget: a process killed mid-batch ends with events that were
  // buffered and never delivered, which is exactly the crash the JSONL tail
  // exists to survive on the next run — but only if the tail is what recovers it.
  let stopping = false;
  const stop = (): void => {
    if (stopping) {
      process.stderr.write('agent-battle-claude: exiting now\n');
      process.exit(130);
    }
    stopping = true;
    process.stderr.write('agent-battle-claude: flushing\n');
    void watcher.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        process.stderr.write(`agent-battle-claude: ${String(error)}\n`);
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// The catch is not decoration. An unhandled rejection here exits with a stack
// trace that says nothing about which harness or which endpoint, which is the
// failure mode of every daemon that has ever been hard to operate.
main().catch((error: unknown) => {
  process.stderr.write(
    `agent-battle-claude: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
