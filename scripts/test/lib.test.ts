import { describe, expect, it } from 'vitest';
import { fitRatings } from '../lib/fit';
import { ladderAtLeast, winMoments } from '../lib/kalshi';

const S = (x: number) => 1 / (1 + Math.exp(-x));

describe('fitRatings', () => {
  it('recovers known ratings and home advantage from a round robin', () => {
    const truth = new Map([['a', 0.9], ['b', 0.3], ['c', 0], ['d', -0.2], ['e', -0.4], ['f', -0.6]]);
    const ids = [...truth.keys()];
    const games = ids.flatMap((h) => ids.filter((a) => a !== h).map((a) => ({ home: h, away: a, p_home: S(truth.get(h)! - truth.get(a)! + 0.25) })));
    const { rating, hfa, components } = fitRatings(games, ids);
    expect(components).toBe(1);
    expect(hfa).toBeCloseTo(0.25, 5);
    for (const [t, r] of truth) expect(rating.get(t)!).toBeCloseTo(r, 5); // truth is already centered
  });

  it('gives the same answer in any team order when the games split into separate groups', () => {
    const games = [
      { home: 'a', away: 'b', neutral: true, p_home: 0.8 },
      { home: 'c', away: 'd', neutral: true, p_home: 0.6 },
    ];
    const one = fitRatings(games, ['a', 'b', 'c', 'd']);
    const two = fitRatings(games, ['b', 'a', 'd', 'c']);
    expect(one.components).toBe(2);
    for (const t of ['a', 'b', 'c', 'd']) expect(two.rating.get(t)!).toBeCloseTo(one.rating.get(t)!, 9);
    // Each group is centered on zero: a and b sit ±logit(0.8)/2.
    expect(one.rating.get('a')!).toBeCloseTo(Math.log(4) / 2, 5);
    expect(one.rating.get('c')! + one.rating.get('d')!).toBeCloseTo(0, 9);
  });
});

describe('ladderAtLeast', () => {
  it('interpolates a missing rung inside the ladder', () => {
    const atLeast = ladderAtLeast(new Map([[8, 0.8], [10, 0.6], [11, 0.4]]), 5);
    expect(atLeast.slice(0, 13)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0.8, expect.closeTo(0.7, 12), 0.6, 0.4, 0]);
    expect(winMoments(atLeast).mean).toBeCloseTo(9.5, 12);
  });

  it('banks current wins, and keeps each rung at most the one below', () => {
    const atLeast = ladderAtLeast(new Map([[6, 0.9], [7, 0.5], [8, 0.6], [9, 0.1]]), 6);
    expect(atLeast.slice(0, 11)).toEqual([1, 1, 1, 1, 1, 1, 1, 0.5, 0.5, 0.1, 0]);
  });
});
