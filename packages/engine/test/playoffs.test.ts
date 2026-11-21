// Playoff bracket checks with near-certain, distinct matchup probabilities, so each simulated
// bracket goes the same way and every round probability is exactly 0 or 1.
import { describe, expect, it } from 'vitest';
import { prepareRun, simulate, type SimInput } from '../src';
import { goldenSeeds, simInputFrom } from './helpers';

const EPS = 1e-9;

function withMatrix(input: SimInput, home: (a: string, b: string) => number, neutral: (a: string, b: string) => number, order?: string[]): SimInput {
  const teams = order ?? input.teams.map((t) => t.id);
  const grid = (p: (a: string, b: string) => number) => teams.map((a) => teams.map((b) => (a === b ? null : p(a, b))));
  return { ...input, matchups: { source: 'test', teams, home: grid(home), neutral: grid(neutral) } };
}

describe('playoff bracket', () => {
  // 2024, all games final, so the seeds are the official ones.
  const seeds = goldenSeeds(2024);
  const [A1, A2, A3, A4, A5, A6, A7] = seeds.AFC! as [string, string, string, string, string, string, string];
  const [N1, N2, N3, N4] = seeds.NFC! as [string, string, string, string];
  // The home team always wins, except AFC seed 7, which beats everyone anywhere. At the neutral
  // Super Bowl, NFC seed 1 beats AFC seed 7 (the home matrix would say the opposite).
  const home = (a: string, b: string) => (a === A7 ? 1 - EPS : b === A7 ? EPS : 1 - EPS);
  const neutral = (a: string, b: string) => (a === N1 && b === A7 ? 1 - EPS : a === A7 && b === N1 ? EPS : 0.5);
  const input = withMatrix(simInputFrom(2024, { sims: 200 }), home, neutral);
  const out = simulate(input);
  const reached = (team: string) => out.teams[team]!.p_round;

  it('the higher seed hosts, and the bracket reseeds after an upset', () => {
    // Wild card: 7 wins at 2; 3 and 4 win at home. Reseeded, 1 hosts the lowest seed left (7) and
    // loses; 3 beats 4. A fixed bracket would have sent 1 to play 4 instead, and 1 would have won.
    expect(reached(A2).divisional).toBe(0);
    expect(reached(A5).divisional).toBe(0);
    expect(reached(A6).divisional).toBe(0);
    expect(reached(A1)).toMatchObject({ divisional: 1, conference: 0 });
    expect(reached(A4)).toMatchObject({ divisional: 1, conference: 0 });
    expect(reached(A3)).toMatchObject({ divisional: 1, conference: 1, super_bowl: 0 });
    expect(reached(A7)).toMatchObject({ divisional: 1, conference: 1, super_bowl: 1, champion: 0 });
    // NFC: home teams win every game, so 1 beats 4 and then 2.
    expect(reached(N3)).toMatchObject({ divisional: 1, conference: 0 });
    expect(reached(N4)).toMatchObject({ divisional: 1, conference: 0 });
    expect(reached(N2)).toMatchObject({ conference: 1, super_bowl: 0 });
  });

  it('the Super Bowl uses the neutral matrix', () => {
    expect(reached(N1)).toMatchObject({ super_bowl: 1, champion: 1 });
  });

  it('the matrix team order is independent of the input team order', () => {
    const reversed = [...input.matchups.teams].reverse();
    const again = simulate(withMatrix(input, home, neutral, reversed));
    expect(again.teams).toEqual(out.teams);
  });
});

describe('playoff weeks', () => {
  // Drift horizon of each round: weeks from current_week to the round's week.
  it('2020 had a 17-week regular season, so its playoffs start a week earlier', () => {
    expect(prepareRun(simInputFrom(2020, { sims: 10 })).roundH).toEqual([0, 1, 2, 4]); // current week 18
    expect(prepareRun(simInputFrom(2020, { unplayed: 16, sims: 10 })).roundH).toEqual([1, 2, 3, 5]); // week 17 left
  });

  it('from 2021 the regular season is 18 weeks', () => {
    expect(prepareRun(simInputFrom(2024, { sims: 10 })).roundH).toEqual([0, 1, 2, 4]); // current week 19
    expect(prepareRun(simInputFrom(2024, { unplayed: 16, sims: 10 })).roundH).toEqual([1, 2, 3, 5]); // week 18 left
  });
});
