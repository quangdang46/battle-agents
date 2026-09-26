import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  AGENT_EVENT_TYPES,
  agentEventSchemas,
  DEFAULT_BATCH_LIMITS,
  DEFAULT_SESSION_RESUME_GRACE_MS,
  PROTOCOL_VERSION,
  REGISTERED_ACTION_IDS,
} from '@battle-agents/protocol';
import { describe, expect, it } from 'vitest';

import {
  apiPathsNamedIn,
  isMounted,
  mountedRoutes,
  PUBLIC_DIR,
  PUBLISHED_DOCS,
  publishedDocExists,
  readProtocolBlock,
  readPublishedFile,
  SKILL_MANIFEST,
} from '../support/published-docs.js';

/**
 * The published protocol documents, checked against the code they describe.
 *
 * WHAT THIS IS NOT. It is not a check that the documents are well written, and
 * it is not a check that they are complete. It is one thing: every identifier,
 * endpoint and number the four documents state as fact is a fact about this
 * tree. A document that names an action id this build does not register, an
 * event type outside the frozen union, a batching limit that has been
 * retuned, or an endpoint that is not mounted is a document an agent will
 * follow and fail on, and the failure will look like the platform being broken
 * rather than the prose being stale.
 *
 * WHY EACH PIECE IS DERIVED RATHER THAN LISTED. The action ids come from the
 * generated union, which is itself generated from every feature's manifest, so
 * a new action cannot leave this test green. The event types come from the
 * frozen zod union. The batching numbers come from the same module the client
 * uses, not from the numbers in the prose. The route list comes from walking
 * `apps/web/app/api`. A check that listed any of these by hand would be a
 * second inventory, and a second inventory is wrong the day after it is
 * written — which is the defect this repository has already been bitten by
 * twice, in the action-id generator and in the five-primitive tool list.
 *
 * THE LIMITATION, STATED RATHER THAN HIDDEN. `REGISTERED_ACTION_IDS` describes
 * the BUILD, not the composition. A deployment that installs fewer features
 * registers fewer actions, and `act()` refuses the rest at runtime — the
 * documents say so, and the running server is the authority. What this test
 * can catch is drift between the prose and the build, which is the failure that
 * is invisible until an agent follows the prose.
 *
 * IT ALSO CANNOT CATCH A DOCUMENT THAT IS MERELY ADEQUATE. The integration
 * conformance test drives a real server from these files; this one only checks
 * that the files agree with the code. Clarity is the product and neither test
 * certifies it.
 */

/**
 * Nothing below is read at module scope, and that is the fix for a failure
 * mode this file had on its first run.
 *
 * The first version read all four documents, parsed the manifest and extracted
 * the four marked blocks in the module body. Emptying `skill.md` — mutation
 * M7 — made the module body throw, vitest reported "no tests", and the stage
 * went red for a reason that has nothing to do with the assertion a reader
 * would look for. "No tests" is the exact signal
 * `vitest.unit.config.ts` warns about: a contributor reads it as a broken
 * glob rather than a broken document, and a check nobody can read the failure
 * of is a check that gets deleted.
 *
 * Reading lazily turns the same mutation into a named failure on the assertion
 * that caused it, and leaves every other assertion still running — which is the
 * point of a gate, since one missing document should not stop the other
 * twenty-five checks from reporting.
 */
function doc(name: string): string {
  if (!publishedDocExists(name)) {
    throw new Error(`${name} is not published in apps/web/public`);
  }
  return readPublishedFile(name);
}

/** The document's markdown with emphasis stripped. See `plain` below. */
function prose(name: string): string {
  return plain(doc(name));
}

function block(documentName: string, marker: string): Record<string, unknown> {
  return readProtocolBlock(doc(documentName), marker);
}

function manifest(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(doc(SKILL_MANIFEST));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${SKILL_MANIFEST} is not a json object`);
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  expect(Array.isArray(value)).toBe(true);
  return (value as unknown[]).map((entry) => {
    expect(typeof entry).toBe('string');
    return entry as string;
  });
}

/**
 * Markdown emphasis stripped, so a prose assertion is not a formatting
 * assertion.
 *
 * Not cosmetic. A document that writes `experience **from** token counts`
 * makes every naive regex miss it, and the lint below exists precisely to
 * catch a claim somebody wrote badly rather than a claim somebody meant.
 * Emphasis is not content, and a check that can be defeated by a pair of
 * asterisks is not a check.
 */
function plain(text: string): string {
  return text.replaceAll('*', '');
}

const ALL_DOCUMENTS: readonly string[] = [...PUBLISHED_DOCS];

/** The three fields every event carries, so a per-type list is about the rest. */
const BASE_FIELDS: readonly string[] = ['type', 'sessionId', 'at'];

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

/**
 * Which fields of one event type the union demands, and which it tolerates
 * without.
 *
 * The probe is `safeParse(undefined)`: a field that accepts `undefined` is one
 * the union does not require, and one that refuses it is required. That works
 * for every field in this union — a `z.string()`, a `z.literal()`, a
 * `z.number()` and a `z.unknown().optional()` all answer correctly — and it is
 * the reason this file does not import zod. The test stages resolve modules
 * from the importing file's location and zod is not a dependency of the root
 * workspace, so an import here would fail to resolve; a re-export from the
 * protocol package would be a second place the union's shape is described,
 * which is the exact thing being checked here.
 *
 * THE ONE FIELD TYPE THIS PROBE WOULD MISREAD. A bare `z.unknown()` accepts
 * `undefined` and is nevertheless required, so it would be filed as optional.
 * No field in the union is one — the only `z.unknown()` is explicitly
 * `.optional()` — and if somebody adds a required one, this classifies it
 * wrongly rather than failing loudly. Recorded because a check whose blind
 * spot is undocumented is a check somebody will rely on inside its blind spot.
 */
function splitFields(shape: Record<string, unknown>): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];
  for (const [field, validator] of Object.entries(shape)) {
    if (BASE_FIELDS.includes(field)) continue;
    const acceptsUndefined =
      typeof validator === 'object' &&
      validator !== null &&
      'safeParse' in validator &&
      (validator as { safeParse(value: unknown): { success: boolean } }).safeParse(undefined)
        .success;
    (acceptsUndefined ? optional : required).push(field);
  }
  return { required, optional };
}

describe('the published documents exist, and are documents', () => {
  it('publishes all four plus the manifest', () => {
    for (const name of [...PUBLISHED_DOCS, SKILL_MANIFEST]) {
      expect(publishedDocExists(name), `${name} is not in apps/web/public`).toBe(true);
    }
  });

  it('gives each document enough substance to be read', () => {
    // The floor is what stops four empty files satisfying "published". A
    // reviewer reading a 60-line document can tell whether it answers the
    // question; a machine cannot, so the machine is given a floor and the
    // reviewer is given the rest.
    for (const name of ALL_DOCUMENTS) {
      const text = doc(name);
      const lines = text.split('\n').filter((line) => line.trim() !== '');
      expect(lines.length, `${name} is a stub`).toBeGreaterThan(40);
      expect(text, `${name} has no headings`).toMatch(/^#{1,3} /m);
    }
  });

  it('cross-links the three documents a reader needs from skill.md', () => {
    for (const other of ['heartbeat.md', 'messaging.md', 'events.md']) {
      expect(doc('skill.md'), `skill.md does not link to ${other}`).toContain(`./${other}`);
    }
    for (const name of ALL_DOCUMENTS) {
      for (const link of [...doc(name).matchAll(/\]\((\.\/[\w.-]+\.md)\)/g)].map((m) => m[1])) {
        const target = join(PUBLIC_DIR, link as string);
        expect(existsSync(target), `${name} links to ${link}, which does not exist`).toBe(true);
      }
    }
  });
});

describe('the version pin, which is the half that rots', () => {
  it('advertises exactly the protocol this build speaks', () => {
    // The second clause of the bead's first success criterion, and the one
    // that matters: a doc set can be complete and still advertise a version
    // the server no longer speaks, and nothing about the files themselves
    // would catch it.
    expect(manifest()['version']).toBe(PROTOCOL_VERSION);
    const protocol = manifest()['protocol'] as Record<string, unknown>;
    expect(protocol['version']).toBe(PROTOCOL_VERSION);
  });

  it('says the pin is enforced server-side and not by a client check', () => {
    // The Moltbook shape carries a version pin that is a client-side string
    // compare against a moving branch, so CONFIRMED-as-a-compatibility-
    // mechanism is UNVERIFIED (docs/research/moltbook.md, C11). Shipping a pin
    // that looks load-bearing and is not is the failure this asserts against:
    // a client that trusts it will not notice a protocol change until it fails
    // in a confusing way.
    const protocol = manifest()['protocol'] as Record<string, unknown>;
    expect(protocol['enforcedBy']).toBe('server');
    expect(String(protocol['note'])).toMatch(/nothing reads this file for you/i);
    expect(prose('skill.md')).toMatch(/Nothing reads `?skill\.json`? for you/i);
  });

  it('records the batching version as the same exact-match string', () => {
    expect(block('events.md', 'ingest')['protocolVersion']).toBe(PROTOCOL_VERSION);
    expect(
      (block('events.md', 'ingest')['ingest'] as Record<string, unknown>)['versionMatch'],
    ).toBe('exact');
  });
});

describe('every action id the documents name is one this build registers', () => {
  it('holds for the vocabulary skill.md publishes', () => {
    const actions = block('skill.md', 'actions')['actions'] as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(actions.length).toBeGreaterThan(10);
    for (const action of actions) {
      const id = action['id'] as string;
      expect(REGISTERED_ACTION_IDS, `skill.md names ${id}, which is not registered`).toContain(id);
      // A misspelled `required` field is the same class of failure as a
      // misspelled id: the action resolves and then refuses the payload, and
      // the agent reports that as the platform being broken.
      for (const field of [
        ...stringArray(action['required'] ?? []),
        ...stringArray(action['optional'] ?? []),
      ]) {
        expect(field, `${id} names the field "${field}" with a space in it`).toMatch(
          /^[a-z][A-Za-z0-9]*$/,
        );
      }
    }
  });

  it('holds for the vocabulary messaging.md publishes', () => {
    for (const action of block('messaging.md', 'messaging')['actions'] as ReadonlyArray<
      Record<string, unknown>
    >) {
      const id = action['id'] as string;
      expect(REGISTERED_ACTION_IDS, `messaging.md names ${id}, which is not registered`).toContain(
        id,
      );
    }
  });

  it('holds for the one action heartbeat.md names', () => {
    const action = block('heartbeat.md', 'heartbeat')['action'] as Record<string, unknown>;
    expect(REGISTERED_ACTION_IDS).toContain(action['id'] as string);
  });
});

describe('events.md describes the frozen union and nothing else', () => {
  it('names every type in the union, and no type outside it', () => {
    const named = stringArray(block('events.md', 'ingest')['agentEventTypes']);
    // Both directions. A one-way check passes when the union grows a type the
    // document never mentions, which is precisely how an adapter starts
    // emitting something no reader has been told about.
    expect([...named].sort()).toEqual([...AGENT_EVENT_TYPES].sort());
  });

  it('states the harness values the union accepts, including the escape hatch', () => {
    const named = stringArray(block('events.md', 'ingest')['harnesses']);
    // 'other' is what lets a new coding agent ship an adapter before this enum
    // grows an entry, so a document that omits it teaches an agent to lie about
    // which harness it is rather than to send the honest value.
    expect(named).toContain('other');
    expect(prose('events.md')).toContain('`other`');
  });

  it('names every field of every type, with the same required and optional split', () => {
    // The field lists are what a client author types a payload from, and a
    // wrong one produces a 400 naming a zod issue rather than the field the
    // author misspelled. Both halves are checked, and the expected values are
    // read out of the union's own schemas — so a field the union makes
    // required fails this the day it is added, and no list is written here.
    const documented = block('events.md', 'ingest')['agentEventFields'] as Record<
      string,
      { required: string[]; optional: string[] }
    >;
    const mismatches: string[] = [];
    for (const schema of agentEventSchemas) {
      const type = schema.shape.type.value as string;
      const { required, optional } = splitFields(schema.shape);
      const entry = documented[type];
      if (entry === undefined) {
        mismatches.push(`${type}: the document lists no fields for it`);
        continue;
      }
      if (!sameSet(entry.required, required)) {
        mismatches.push(
          `${type} required: doc [${entry.required.join(', ')}] vs union [${required.join(', ')}]`,
        );
      }
      if (!sameSet(entry.optional, optional)) {
        mismatches.push(
          `${type} optional: doc [${entry.optional.join(', ')}] vs union [${optional.join(', ')}]`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('states the batching numbers the client actually obeys', () => {
    expect(block('events.md', 'ingest')['batching']).toEqual({ ...DEFAULT_BATCH_LIMITS });
    // And says which of the four are enforced here, because a client that treats
    // all four as server refusals will retry a late batch that was never
    // refused, and a client that treats none as refusals will hammer the 413.
    for (const pattern of [
      /250\s*ms/i,
      /\b50\b/,
      /\b100\b/,
      /413/,
      /one session|one `?sessionId`?|sessions per batch/i,
    ]) {
      expect(prose('events.md'), `events.md does not mention ${String(pattern)}`).toMatch(pattern);
    }
  });
});

describe('heartbeat.md states the numbers the sweeper uses', () => {
  it('states the resume grace this build shares with the battle feature', () => {
    // DEFAULT_SESSION_RESUME_GRACE_MS lives in the protocol package because
    // two removable features need it; the composition root writes the same
    // figure out by hand so a stripped feature does not orphan an import. The
    // number an agent reads has to be that one.
    const minutes = block('heartbeat.md', 'heartbeat')['resumeGraceMinutes'] as number;
    expect(minutes * 60_000).toBe(DEFAULT_SESSION_RESUME_GRACE_MS);
  });

  it('calls a heartbeat voluntary rather than required', () => {
    // "Required" is the word that would change the architecture. A heartbeat is
    // a courtesy that keeps a run resumable; the grace window is what gives it
    // meaning. A document calling it required describes a held-open socket.
    expect(block('heartbeat.md', 'heartbeat')['heartbeatRequired']).toBe(false);
    expect(prose('heartbeat.md')).toMatch(/voluntary return cadence/i);
  });

  it('says the sweep is not scheduled in a live deployment', () => {
    // The route that would trigger the sweep exists and is tested; nothing
    // mounts it. A document that implied a server-side timer is enforcing the
    // 5-minute threshold would send an agent to debug a deadline nobody has.
    expect(prose('heartbeat.md')).toMatch(
      /does not currently run\s+one against a live deployment/i,
    );
  });
});

describe('messaging.md describes the degradation rather than the aspiration', () => {
  it('marks the writing actions refused and the reading ones available', () => {
    const actions = block('messaging.md', 'messaging')['actions'] as ReadonlyArray<
      Record<string, unknown>
    >;
    const byId = new Map(actions.map((action) => [action['id'] as string, action['status']]));
    for (const id of ['social.send', 'social.broadcast']) {
      expect(byId.get(id), `${id} is not marked refused`).toBe('refused');
    }
    for (const id of ['social.inbox', 'social.profile', 'social.leaderboard', 'social.poke']) {
      expect(byId.get(id), `${id} is not marked available`).toBe('available');
    }
  });

  it('names the capability that is missing and says it has no provider', () => {
    expect(block('messaging.md', 'messaging')['requiredCapability']).toBe(
      'guild.messaging.authorize',
    );
    expect(block('messaging.md', 'messaging')['capabilityProvided']).toBe(false);
    expect(prose('messaging.md')).toMatch(/no feature provides/i);
  });

  it('keeps the AgentEvent message pair separate from social messaging', () => {
    // Two things called "message" in one protocol, and an agent that conflates
    // them will wait forever for a reply to something that was never sent.
    expect(prose('messaging.md')).toMatch(/are not the social messaging/i);
    // events.md, not skill.md: that is where the `message.sent` row of the
    // union is listed, so that is where the reader meets it and needs telling.
    expect(prose('events.md')).toMatch(/not\s+the social messaging/i);
  });
});

describe('the endpoints the documents name are the endpoints that exist', () => {
  const routes = mountedRoutes();

  it('mounts the routes it claims are mounted', () => {
    const endpoints = block('skill.md', 'actions')['endpoints'] as Record<string, unknown>;
    for (const path of stringArray(endpoints['mounted'])) {
      expect(isMounted(path, routes), `skill.md claims ${path} is mounted; it is not`).toBe(true);
    }
  });

  it('does not claim a route is unmounted when the tree has mounted it', () => {
    const endpoints = block('skill.md', 'actions')['endpoints'] as Record<string, unknown>;
    for (const path of stringArray(endpoints['notMounted'])) {
      // Two-sided on purpose. The half that matters is this one: a deployment
      // that mounts /api/act and leaves the document saying otherwise is the
      // failure a one-way check would never report, because the document is
      // still consistently wrong.
      expect(
        isMounted(path, routes),
        `${path} is listed as not mounted, but the tree mounts it`,
      ).toBe(false);
    }
  });

  it('accounts for every route in the application tree', () => {
    const endpoints = block('skill.md', 'actions')['endpoints'] as Record<string, unknown>;
    const claimed = new Set([
      ...stringArray(endpoints['mounted']),
      ...stringArray(endpoints['notMounted']),
    ]);
    // Catch-all segments are excluded: `/api/auth/{...}` is a human
    // authentication surface that is not part of the agent protocol and is not
    // something an agent document should claim.
    const missing = routes
      .filter((route) => !route.catchAll)
      .map((route) => route.path)
      .filter((path) => !claimed.has(path));
    expect(missing, 'these routes are mounted and no document accounts for them').toEqual([]);
  });

  it('names only mounted paths, or paths the document explicitly calls unmounted', () => {
    const endpoints = block('skill.md', 'actions')['endpoints'] as Record<string, unknown>;
    const notMounted = new Set(stringArray(endpoints['notMounted']));
    for (const name of ALL_DOCUMENTS) {
      for (const path of apiPathsNamedIn(doc(name))) {
        // A path inside a code span is a claim. Either the application serves
        // it, or the document has to have declared it unmounted — otherwise an
        // agent reads a backticked path as something to call.
        if (isMounted(path, routes)) continue;
        expect(
          notMounted.has(path),
          `${name} names ${path} as if it were usable; nothing serves it and no document says so`,
        ).toBe(true);
      }
    }
  });
});

describe('no document contradicts a locked decision', () => {
  /**
   * The one the brief names, and the one that would actually cost something: an
   * agent that believes experience comes from token counts will try to earn it,
   * and the platform's whole defence is a closed table of outcomes with no
   * arithmetic on anything but literal amounts.
   */
  it('never claims experience comes from tokens', () => {
    const banned = [
      /xp[^.]{0,60}from[^.]{0,20}token/i,
      /experience[^.]{0,60}from[^.]{0,20}token/i,
      /rewarded[^.]{0,40}for[^.]{0,20}tokens?/i,
      /paid[^.]{0,40}for[^.]{0,20}tokens?/i,
      /token count[^.]{0,40}(experience|xp)/i,
    ];
    for (const name of ALL_DOCUMENTS) {
      const text = prose(name);
      for (const pattern of banned) {
        expect(pattern.test(text), `${name} contains a token-count claim: ${String(pattern)}`).toBe(
          false,
        );
      }
    }
  });

  it('states the positive rule, because a lint that only forbids is not a rule', () => {
    expect(prose('skill.md')).toMatch(/never comes from token counts/i);
  });

  it('keeps the three identities apart', () => {
    // Human, character, run. An agent that keys anything on "who is logged in"
    // has collapsed the first two and lost the ability to have two characters
    // and a progression record that survives a restart.
    expect(prose('skill.md')).toMatch(/never.{0,30}agent identity/i);
    expect(prose('skill.md')).toMatch(/a session is one (execution|run)/i);
  });

  it('tells the agent to prefer the server over the document', () => {
    // A document that is right about the reference deployment and wrong about
    // yours is a trap, and the trap is only sprung if the document tells the
    // agent to believe it. `discover` is the authority.
    expect(prose('skill.md')).toMatch(/Trust `?discover`? over this file/i);
  });
});
