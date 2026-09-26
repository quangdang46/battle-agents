/**
 * What a base is made of, and what standing in it lets a character do.
 *
 * ## Where this table comes from
 *
 * §10.2, in its own words: "progression always unlocks something (Workshop tiers
 * -> larger projects; Lab -> benchmarks; Arena -> PvP; Guild Hall -> teams;
 * Command Center -> subagent orchestration). Buildings unlock capability." The
 * capability on the right of each row is that clause's, and the level on the
 * left is the gate that unlocks it.
 *
 * ## Why the gate lives here and not in progression
 *
 * It does not, and that is the point. `meetsGate` and the level curve belong to
 * progression, this feature CONSUMES them, and a second copy of a comparison
 * would be a second answer to "has this character reached level 10" — the same
 * defect the event-name duplication was, one layer down. So the levels below
 * are DATA, and the only arithmetic in the feature is a call into progression.
 *
 * ## What is deliberately absent
 *
 * No resources, no crafting, no territory, no housing. §17.8's risk 8 bans
 * MMO-shaped features from the MVP and this is the single easiest place to
 * smuggle one in, so the scope is a base, this table, and continuity. A row
 * above that added a resource column would be the moment this stopped being M5.
 */

/** A building, and the capability it stands for. */
export interface Building {
  readonly id: string;
  readonly name: string;
  /**
   * The level a character must REACH to use what this building unlocks.
   *
   * A gate and not a build cost: progression decides what a level means, and
   * this feature decides which buildings a character has earned the right to.
   */
  readonly requiredLevel: number;
  /** The capability this building unlocks, spelled as the registry spells it. */
  readonly unlocks: string;
  /**
   * Whether the capability is a hard gate or a hint.
   *
   * Only true where the plan makes access rather than decoration: PvP and teams
   * are access, and a client that ignores the refusal still works, it just does
   * not get the thing. Kept as a field so adding a gated building later is data
   * rather than a second code path, and so the refusal can name which it was.
   */
  readonly gated: boolean;
}

export const BUILDINGS: readonly Building[] = [
  {
    id: 'workshop',
    name: 'Workshop',
    requiredLevel: 1,
    unlocks: 'larger projects',
    gated: false,
  },
  {
    id: 'lab',
    name: 'Lab',
    requiredLevel: 5,
    unlocks: 'benchmarks',
    gated: false,
  },
  {
    id: 'arena',
    name: 'Arena',
    requiredLevel: 10,
    unlocks: 'PvP',
    gated: true,
  },
  {
    id: 'guild-hall',
    name: 'Guild Hall',
    requiredLevel: 20,
    unlocks: 'guild creation',
    gated: true,
  },
  {
    id: 'command-center',
    name: 'Command Center',
    requiredLevel: 30,
    unlocks: 'subagent orchestration',
    gated: false,
  },
];

/** The building with this id, or undefined. */
export function buildingFor(id: string): Building | undefined {
  return BUILDINGS.find((building) => building.id === id);
}

/** The building that unlocks this capability, or undefined. */
export function buildingUnlocking(capability: string): Building | undefined {
  return BUILDINGS.find((building) => building.unlocks === capability);
}

/**
 * Whether a level clears a gate.
 *
 * Delegates rather than compares, and the delegation is the whole reason this
 * file has no arithmetic in it. progression owns what a level means; a copy of
 * `level >= requiredLevel` here would be a second answer to the same question
 * and would keep answering it after progression retuned the curve.
 *
 * The port is a function rather than an import because features never import
 * each other — world is a sibling of progression, not a dependant of it. The
 * composition root supplies the real one, and a test supplies a real comparison
 * too, so no test is asserting against a stub that agrees with itself.
 */
export type LevelGate = (level: number, requiredLevel: number) => boolean;

/**
 * The gate a character below this level is refused, in the words a client shows.
 *
 * `undefined` when the level clears. The two are different answers and the
 * difference is the point: a gate that only ever grants is not a gate, and a
 * caller that cannot tell "you may" from "you may not" will treat the first as
 * the second and hide the feature from everybody.
 */
export function gateRefusal(
  gate: LevelGate,
  level: number,
  requiredLevel: number,
): string | undefined {
  return gate(level, requiredLevel)
    ? undefined
    : `that unlocks at level ${String(requiredLevel)}, and this character is level ${String(level)}`;
}
