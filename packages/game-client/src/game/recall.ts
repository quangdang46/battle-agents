/**
 * Memory retrieval: what an agent brings to the thing it is about to do.
 *
 * Ported from agent-world-smallville
 * `reverie/backend_server/persona/cognitive_modules/retrieve.py` (Apache-2.0,
 * see THIRD-PARTY-NOTICES.md) -- 284 lines, and the one module in that cognitive
 * loop with ZERO calls into the LLM, which is why it is worth taking.
 *
 * ## Why this module and not its four siblings
 *
 * The loop is perceive, retrieve, plan, execute, reflect, converse. `plan` has 17
 * prompt calls in it, `reflect` has 8, `perceive` has 3, and all three buy
 * GENERATED PLANS. This game already has a better version of that: `tool.started`
 * and `tool.completed` are a deterministic, observable record of an agent
 * actually working, and swapping one for the other is going backwards.
 *
 * `retrieve` is different because its idea survives without a model. The
 * original scores every remembered node on three axes and returns the most
 * relevant few: RECENCY (a decaying function of when it was last touched),
 * IMPORTANCE (the node's own weight), and RELEVANCE (cosine similarity to
 * what the agent is doing right now). That is a scoring function, not a
 * generation, and it ports as one.
 *
 * ## What it is for here
 *
 * An agent in this city has a history -- the event log, filtered to its own
 * sessions. This is how the next thing it does can be informed by the last few
 * things it did, which is the difference between a character that walks to a
 * zone and a character that knows why it is going there.
 */

/** One remembered moment, as far as retrieval is concerned. */
export interface MemoryNode {
  /** Stable id; the event's own id. */
  readonly id: string;
  /** When it happened, ISO 8601. Recency is measured from here. */
  readonly at: string;
  /**
   * How much this mattered, 0..1. Sourced from what the event WAS -- a completed
   * bounty outranks a started tool, a failed tool sits between.
   */
  readonly importance: number;
  /** The words this node is indexed on, for the relevance term. */
  readonly terms: readonly string[];
}

/** What an agent is doing now -- the focal point everything is scored against. */
export interface FocalPoint {
  readonly terms: readonly string[];
}

/** The weights. Sum to 1, so the score is a weighted mean and not a sum. */
export interface RetrievalWeights {
  readonly recency: number;
  readonly importance: number;
  readonly relevance: number;
}

/**
 * Generative Agents' defaults, which are the ones the paper used.
 *
 * Recency leads because a recent thing is usually the relevant thing;
 * relevance is last because it is the noisiest of the three.
 */
export const DEFAULT_RETRIEVAL_WEIGHTS: RetrievalWeights = {
  recency: 0.4,
  importance: 0.35,
  relevance: 0.25,
};

/**
 * Recency, decaying.
 *
 * `0.995^age` is the original's curve, and it is kept because the shape is the
 * point: linear decay says a thing from an hour ago is half as relevant as one
 * from half an hour ago, which is wrong at both ends -- nothing is that sharp,
 * and a very old thing is not merely half relevant. The constant 0.995 means
 * the score halves every ~139 events.
 *
 * The AGE IS IN EVENTS, not seconds, and that is the original's choice too. An
 * agent's history is a sequence, and what matters is how many other things
 * happened since -- not whether the wall clock moved.
 */
export function recency(ageInEvents: number): number {
  return 0.995 ** ageInEvents;
}

/** Cosine similarity of two term bags, 0..1, with no term vector needed. */
export function cosine(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = (bag: readonly string[]): Map<string, number> => {
    const out = new Map<string, number>();
    for (const term of bag) out.set(term, (out.get(term) ?? 0) + 1);
    return out;
  };
  const left = counts(a);
  const right = counts(b);
  let dot = 0;
  for (const [term, value] of left) dot += value * (right.get(term) ?? 0);
  if (dot === 0) return 0;
  let leftNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  let rightNorm = 0;
  for (const value of right.values()) rightNorm += value * value;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/** A scored node, with the three terms left separate so a caller can show why. */
export interface ScoredMemory {
  readonly node: MemoryNode;
  readonly recency: number;
  readonly importance: number;
  readonly relevance: number;
  readonly score: number;
}

/**
 * Ranks a history against what the agent is about to do.
 *
 * There is NO `now`. Recency is the distance from the FRONT of the ordered
 * history, not seconds ago, so a clock never enters this and a log that arrives
 * out of order cannot produce a different answer. The parameter existed and was
 * unused, and the compiler is what pointed that out.
 */
export function retrieve(
  history: readonly MemoryNode[],
  focal: FocalPoint,
  count: number,
  weights: RetrievalWeights = DEFAULT_RETRIEVAL_WEIGHTS,
): readonly ScoredMemory[] {
  if (history.length === 0 || count <= 0) return [];
  // Newest first, so "age in events" is the distance from the front.
  const ordered = [...history].sort((a, b) => b.at.localeCompare(a.at));

  const scored: ScoredMemory[] = ordered.map((node, index) => {
    const r = recency(index);
    const i = Math.max(0, Math.min(1, node.importance));
    const v = cosine(node.terms, focal.terms);
    return {
      node,
      recency: r,
      importance: i,
      relevance: v,
      score: r * weights.recency + i * weights.importance + v * weights.relevance,
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, count);
}
