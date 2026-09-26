/**
 * Waypoint routing: Dijkstra over a graph of building doors and crossroads.
 *
 * Mirrored from age-of-agents `packages/client/src/game/pathfind.ts` (MIT,
 * see THIRD-PARTY-NOTICES.md), with the theme replaced by a plain graph spec.
 *
 * The reference builds its graph from a `ThemeDef`, which carries buildings with
 * door coordinates, crossroads and edges. Ours takes those three lists directly
 * and nothing else, because a pathfinder that knows what a "theme" is has a
 * rendering concern in its routing path. The algorithm, the cost metric (Euclid
 * on the grid) and the failure behaviour are all unchanged.
 *
 * Waypoints rather than A* over every cell: at the ambient scale this world runs
 * — tens of agents on a few hundred tiles — a waypoint graph is a handful of
 * nodes, and a full-grid A* over a map that is mostly walkable grass is more
 * code for a path nobody can see the difference between.
 */

export interface PathNode {
  readonly id: string;
  readonly gx: number;
  readonly gy: number;
}

export interface GraphSpec {
  readonly nodes: readonly PathNode[];
  readonly edges: readonly (readonly [string, string])[];
}

interface Edge {
  readonly to: string;
  readonly cost: number;
}

export class WaypointGraph {
  readonly #nodes = new Map<string, PathNode>();
  readonly #adjacency = new Map<string, Edge[]>();

  constructor(spec: GraphSpec) {
    for (const node of spec.nodes) this.addNode(node);
    for (const [from, to] of spec.edges) this.addEdge(from, to);
  }

  private addNode(node: PathNode): void {
    this.#nodes.set(node.id, node);
    if (!this.#adjacency.has(node.id)) this.#adjacency.set(node.id, []);
  }

  /**
   * Adds an undirected edge, cost being the grid distance between the doors.
   *
   * A throw on an unknown endpoint rather than a silent skip: an edge naming a
   * node that was never added is a config error, and skipping it produces a
   * world where one route is mysteriously missing and nothing says why.
   */
  private addEdge(a: string, b: string): void {
    const from = this.#nodes.get(a);
    const to = this.#nodes.get(b);
    if (from === undefined || to === undefined) {
      throw new Error(`Edge to unknown node: ${a} - ${b}`);
    }
    const cost = Math.hypot(from.gx - to.gx, from.gy - to.gy);
    this.#adjacency.get(a)?.push({ to: b, cost });
    this.#adjacency.get(b)?.push({ to: a, cost });
  }

  node(id: string): PathNode | undefined {
    return this.#nodes.get(id);
  }

  get nodeCount(): number {
    return this.#nodes.size;
  }

  /** The graph node nearest any grid position. */
  nearest(gx: number, gy: number): PathNode | undefined {
    let best: PathNode | undefined;
    let bestDistance = Infinity;
    for (const node of this.#nodes.values()) {
      const distance = Math.hypot(node.gx - gx, node.gy - gy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    return best;
  }

  /**
   * The node list from `fromId` to `toId`, inclusive.
   *
   * An unreachable target returns just the target, which is where the agent
   * stands rather than nowhere. Returning an empty path would make the caller
   * decide what "no path" means, and a caller that forgets produces a unit that
   * silently stops moving.
   */
  route(fromId: string, toId: string): PathNode[] {
    const target = this.#nodes.get(toId);
    if (fromId === toId) {
      const from = this.#nodes.get(fromId);
      return from === undefined ? [] : [from];
    }
    if (target === undefined) return [];

    const distance = new Map<string, number>();
    const previous = new Map<string, string>();
    const open = new Set(this.#nodes.keys());
    distance.set(fromId, 0);

    while (open.size > 0) {
      let current: string | undefined;
      let currentDistance = Infinity;
      for (const id of open) {
        const candidate = distance.get(id) ?? Infinity;
        if (candidate < currentDistance) {
          currentDistance = candidate;
          current = id;
        }
      }
      if (current === undefined || current === toId || currentDistance === Infinity) break;
      open.delete(current);

      for (const edge of this.#adjacency.get(current) ?? []) {
        const candidate = currentDistance + edge.cost;
        if (candidate < (distance.get(edge.to) ?? Infinity)) {
          distance.set(edge.to, candidate);
          previous.set(edge.to, current);
        }
      }
    }

    if (!previous.has(toId)) return [target];

    const path: PathNode[] = [];
    let cursor: string | undefined = toId;
    while (cursor !== undefined) {
      const node = this.#nodes.get(cursor);
      if (node === undefined) break;
      path.unshift(node);
      cursor = previous.get(cursor);
    }
    return path;
  }
}
