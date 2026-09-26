/**
 * Zones: where a tool or an event puts an agent on the map.
 *
 * Plan section 25 asks for a config-driven `{tool|event -> zone}` mapping, and
 * the bead tightens it in the way that matters: the client must CONSUME the one
 * zone set rather than define a second. `TOOL_ZONE_MAP` and `getZoneForTool`
 * live in `@battle-agents/protocol` (ported by `ba-tool-map-port-89a`) and are
 * the only tool→zone table in this repository. A second copy here would be a
 * table that agrees with the first until the day someone adds a harness tool to
 * one of them, and the client would then route it somewhere the server does
 * not. So `zoneForTool` below is a re-export, not an implementation.
 *
 * What IS ours is the second half: the zone→(scene, tile) placement. The
 * protocol has no business choosing where the `files` zone is drawn, and
 * DESIGN.md section 4 is explicit that a zone added to the config must land in
 * a place the design document already describes. That constraint is enforced
 * below by `ZoneId` being a closed union: adding a zone to the protocol makes
 * this table a typecheck error until someone decides where it goes, rather than
 * an agent that walks to coordinates nobody chose.
 *
 * Config-driven means config-driven: there is no `if (tool === 'Bash')`
 * anywhere in this package, and the test that proves it adds a tool to the
 * SHARED table and watches the client route it with no file in this package
 * changed.
 */

import { getZoneForTool, type ZoneId } from '@battle-agents/protocol';

/** A place on the map a zone occupies. */
export interface ZonePlacement {
  /** Which scene the zone belongs to. DESIGN.md section 4 names three. */
  readonly scene: 'city' | 'arena' | 'guild-hall';
  /** Tile coordinates within that scene's grid. */
  readonly gx: number;
  readonly gy: number;
  /** Shown on the zone marker. */
  readonly label: string;
}

/**
 * The zone→placement table.
 *
 * `Record<ZoneId, ZonePlacement>` rather than `Partial<Record<...>>`, and that
 * is the point of the annotation: a zone added to the protocol's `ZoneId` makes
 * this object fail to typecheck, so the failure is a missing placement decision
 * surfaced at build time rather than an agent standing at (0,0) forever.
 *
 * The coordinates are the Coding City landmarks of DESIGN.md section 4 —
 * Guild Hall, Research Lab, Arena, Workshop, Quest Board — plus the tool zones
 * that hang off them. They are placeholders on a grid this client defines; the
 * layout is not a design decision being made here, it is a table the design
 * document already describes.
 */
export const ZONE_PLACEMENT: Readonly<Record<ZoneId, ZonePlacement>> = Object.freeze({
  files: { scene: 'city', gx: 18, gy: 14, label: 'Workshop' },
  terminal: { scene: 'city', gx: 10, gy: 20, label: 'Terminal' },
  search: { scene: 'city', gx: 26, gy: 20, label: 'Search' },
  web: { scene: 'city', gx: 26, gy: 12, label: 'Network' },
  thinking: { scene: 'city', gx: 18, gy: 8, label: 'Research Lab' },
  messaging: { scene: 'city', gx: 10, gy: 12, label: 'Comms' },
  tasks: { scene: 'city', gx: 18, gy: 26, label: 'Quest Board' },
  spawn: { scene: 'city', gx: 10, gy: 8, label: 'Rally' },
  idle: { scene: 'city', gx: 18, gy: 18, label: 'Plaza' },
  'bounty-board': { scene: 'city', gx: 30, gy: 18, label: 'Bounty Board' },
  'battle-arena': { scene: 'arena', gx: 12, gy: 12, label: 'Arena' },
  'guild-hall': { scene: 'guild-hall', gx: 12, gy: 10, label: 'Guild Hall' },
});

/**
 * Event types that mean a place, for the events that carry no tool name.
 *
 * Separate from `TOOL_ZONE_MAP` because these are not tools: `bounty.claimed`
 * is an event about a game concept, and the protocol has no opinion on where a
 * bounty is claimed because the protocol does not know what a map is. Adding a
 * key here is a client change, which is correct — a new EVENT meaning a new
 * place is the client's business, whereas a new TOOL mapping to an existing
 * zone is the protocol's and needs no client change at all.
 */
export const ZONE_FOR_EVENT: Readonly<Record<string, ZoneId>> = Object.freeze({
  'bounty.claimed': 'bounty-board',
  'bounty.created': 'bounty-board',
  'battle.joined': 'battle-arena',
  'battle.finished': 'battle-arena',
  'guild.joined': 'guild-hall',
});

/**
 * The zone a tool belongs to.
 *
 * A re-export, deliberately. Everything this package knows about tool→zone is
 * the protocol's answer, so there is no line here that could disagree with it.
 */
export const zoneForTool: (toolName: string) => ZoneId = getZoneForTool;

/** Where a zone is drawn, or the plaza for a zone this build does not place. */
export function placementFor(zone: ZoneId): ZonePlacement {
  return ZONE_PLACEMENT[zone] ?? ZONE_PLACEMENT.idle;
}
