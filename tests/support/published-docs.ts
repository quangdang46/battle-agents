import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads the published protocol documents, and the routes the application
 * actually mounts.
 *
 * Two consumers, one reader, because the second thing here is as much a claim
 * as the first: the documents name endpoints, and whether an endpoint is
 * reachable is decided by which files exist under `apps/web/app/api`. Reading
 * the tree rather than a hand-written list is what lets a route appear in the
 * tree and fail a check until the documents say so — the failure mode this
 * repository keeps paying for is a document that is confidently, smoothly
 * wrong.
 *
 * WHY THIS LIVES HERE AND NOT IN A TEST FILE. Both the unit gate and the
 * integration conformance test need it, and the two stages cannot share a
 * `*.test.ts` without one of them running the other's dependencies. It is not a
 * test, so `tests/unit/no-orphan-tests.test.ts` — which claims files by stage
 * glob — has nothing to say about it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It reads `apps/web/public` and
 * `apps/web/app`, neither of which is a feature package, so
 * `scripts/removal-test.sh` — which moves a feature directory aside and then
 * runs the unit suite — cannot break anything here. Nothing below names a
 * feature, and nothing imports one.
 */

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PUBLIC_DIR = join(REPO_ROOT, 'apps', 'web', 'public');
export const APP_DIR = join(REPO_ROOT, 'apps', 'web', 'app');

/** The five files the bead publishes, by the name the documents use. */
export const PUBLISHED_DOCS = ['skill.md', 'heartbeat.md', 'messaging.md', 'events.md'] as const;
export type PublishedDoc = (typeof PUBLISHED_DOCS)[number];

export const SKILL_MANIFEST = 'skill.json';

export function readPublishedFile(name: string): string {
  return readFileSync(join(PUBLIC_DIR, name), 'utf8');
}

export function publishedDocExists(name: string): boolean {
  return existsSync(join(PUBLIC_DIR, name));
}

/**
 * The JSON block that follows a `<!-- protocol:NAME -->` marker.
 *
 * The marker is the addressing scheme, and it is load-bearing in a way a
 * heading is not: a heading's text can be reworded, a link to it can die, and
 * nothing notices. A marker followed by a fenced json block is a contract —
 * exactly one per marker, and it must parse, or the caller is told which
 * marker failed.
 *
 * The trailing "exactly one" is the part that stops this being a search that
 * finds whatever comes first. A second block under the same marker would be
 * picked arbitrarily, and the one that gets checked is the one that happens to
 * sort first, which is not a check.
 */
export function readProtocolBlock(documentText: string, marker: string): Record<string, unknown> {
  const pattern = new RegExp(
    `<!--\\s*protocol:${marker}\\s*-->[\\s\\S]*?\\x60\\x60\\x60json\\n([\\s\\S]*?)\\n\x60\x60\x60`,
    'g',
  );
  const matches = [...documentText.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one json block after the "protocol:${marker}" marker, found ${matches.length}`,
    );
  }
  const body = matches[0]?.[1];
  if (body === undefined) {
    throw new Error(`the "protocol:${marker}" block matched but captured nothing`);
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`the "protocol:${marker}" block is not a json object`);
  }
  return parsed as Record<string, unknown>;
}

/** Every `/api/...` path that appears inside a code span in a document. */
export function apiPathsNamedIn(documentText: string): string[] {
  const found = new Set<string>();
  // Backtick-delimited, so a path in running prose is not a claim — a doc that
  // mentions /api/act while explaining that it is NOT mounted would otherwise
  // be read as claiming it.
  for (const match of documentText.matchAll(/`(\/api\/[^`\s]*)`/g)) {
    const path = match[1];
    if (path !== undefined) {
      found.add(path);
    }
  }
  return [...found].sort();
}

export interface MountedRoute {
  /** The path Next.js will match, with `[param]` rendered as `{param}`. */
  readonly path: string;
  /** The HTTP verbs the route file exports, lower-cased. */
  readonly methods: readonly string[];
  /** True for `[...catchAll]`, which matches a prefix rather than a whole path. */
  readonly catchAll: boolean;
}

const ROUTE_METHOD = /^export const (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/m;

/**
 * Every route the Next.js application tree mounts, read off the filesystem.
 *
 * Read rather than listed, because a list here would be a second inventory of
 * the HTTP surface and the two would drift. Reading the tree also means a
 * route cannot be documented as mounted when it was deleted, or documented as
 * absent when it was added.
 */
export function mountedRoutes(): readonly MountedRoute[] {
  const apiRoot = join(APP_DIR, 'api');
  const routes: MountedRoute[] = [];
  walk(apiRoot, apiRoot, routes);
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

function walk(directory: string, apiRoot: string, into: MountedRoute[]): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      walk(full, apiRoot, into);
      continue;
    }
    if (entry !== 'route.ts') continue;
    into.push(toRoute(full, apiRoot));
  }
}

function toRoute(file: string, apiRoot: string): MountedRoute {
  const relativeDir = relative(apiRoot, file)
    .replace(/route\.ts$/, '')
    .split(/[\\/]/);
  const segments = relativeDir
    .join('/')
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) =>
      segment.startsWith('[...')
        ? `{${segment.slice(4, -1)}}`
        : segment.startsWith('[') && segment.endsWith(']')
          ? `{${segment.slice(1, -1)}}`
          : segment,
    );
  const source = readFileSync(file, 'utf8');
  const methods = [...source.matchAll(new RegExp(ROUTE_METHOD.source, 'gm'))]
    .map((match) => (match[1] ?? '').toLowerCase())
    .filter((method) => method !== '');
  return {
    path: `/api/${segments.join('/')}`,
    methods: [...new Set(methods)].sort(),
    catchAll: segments.some((segment) => segment.startsWith('{')),
  };
}

/** Whether a path the documents name is served by the application tree. */
export function isMounted(path: string, routes: readonly MountedRoute[]): boolean {
  return routes.some((route) => route.path === path);
}
