import { describe, expect, it } from 'vitest';

import { cosine, recency, retrieve, type MemoryNode } from './recall.js';

/**
 * Memory retrieval, ported from agent-world-smallville's `retrieve.py`.
 *
 * The tests are about the two things that make it a scoring function rather
 * than a lookup: the DECAY, and the fact that relevance is only one of three
 * terms. A retrieval that ignores relevance is a "most recent N" and would pass
 * a test that only ever looked at recency.
 */

const at = (day: number): string => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

function node(day: number, importance: number, terms: string[]): MemoryNode {
  return { id: `n${day}-${terms.join('-')}`, at: at(day), importance, terms };
}

describe('recency', () => {
  it('decays, and decays faster than linearly at first', () => {
    expect(recency(0)).toBe(1);
    expect(recency(1)).toBeLessThan(1);
    // A linear curve would halve at one event. This one barely moves there,
    // which is the point: nothing is that sharp.
    expect(recency(1)).toBeGreaterThan(0.5);
  });

  it('never reaches zero, so an old thing is faint rather than gone', () => {
    expect(recency(10_000)).toBeGreaterThan(0);
  });
});

describe('cosine', () => {
  it('is 1 for identical bags and 0 for disjoint ones', () => {
    expect(cosine(['read', 'edit'], ['read', 'edit'])).toBeCloseTo(1, 6);
    expect(cosine(['read'], ['write'])).toBe(0);
  });

  it('is 0 when either side is empty, rather than NaN', () => {
    expect(cosine([], ['read'])).toBe(0);
    expect(cosine(['read'], [])).toBe(0);
  });
});

describe('retrieve', () => {
  it('prefers a relevant thing over a merely recent one', () => {
    // The whole reason relevance is a term. Without it this is "latest N".
    const history = [
      node(1, 0.5, ['read']),
      node(2, 0.5, ['test', 'ci', 'build']),
      node(3, 0.5, ['read']),
    ];
    const ranked = retrieve(history, { terms: ['test', 'ci', 'build'] }, 1);
    expect(ranked[0]?.node.terms).toEqual(['test', 'ci', 'build']);
  });

  it('prefers an important thing when relevance ties', () => {
    const history = [node(1, 0.1, ['read']), node(2, 0.9, ['read'])];
    const ranked = retrieve(history, { terms: ['read'] }, 1);
    expect(ranked[0]?.node.importance).toBe(0.9);
  });

  it('reports the three terms separately, so a caller can say WHY', () => {
    const ranked = retrieve([node(1, 0.7, ['edit'])], { terms: ['edit'] }, 1);
    expect(ranked[0]?.recency).toBe(1);
    expect(ranked[0]?.importance).toBeCloseTo(0.7, 6);
    expect(ranked[0]?.relevance).toBeCloseTo(1, 6);
  });

  it('clamps importance rather than trusting the caller', () => {
    const ranked = retrieve([node(1, 4.2, ['read'])], { terms: [] }, 1);
    expect(ranked[0]?.importance).toBe(1);
  });

  it('is empty for an empty history or a zero count, and does not throw', () => {
    expect(retrieve([], { terms: ['read'] }, 5)).toEqual([]);
    expect(retrieve([node(1, 1, ['read'])], { terms: ['read'] }, 0)).toEqual([]);
  });

  it('is stable for the same history, whatever order it arrives in', () => {
    const history = [node(1, 0.5, ['read']), node(2, 0.5, ['edit']), node(3, 0.5, ['test'])];
    const forward = retrieve(history, { terms: ['edit'] }, 2).map((s) => s.node.id);
    const reversed = retrieve([...history].reverse(), { terms: ['edit'] }, 2).map((s) => s.node.id);
    expect(forward).toEqual(reversed);
  });
});
