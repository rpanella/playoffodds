import { AWAY_WIN, HOME_WIN, InputError, STANDINGS_VERSION, TIE } from '@playoffodds/standings';
import { describe, expect, it } from 'vitest';
import { DRIFT_MODELS, drawWalks, ENGINE_VERSION, KeyedRng, mergeTallies, prepareRun, simulate, simulateRange, stepScales, summarize } from '../src';
import { outcomeFor } from '../src/simulate';
import { goldenSeeds, simInputFrom } from './helpers';

describe('all games final', () => {
  it.each([2020, 2023, 2025])('%i: every seed has probability 1 and matches the official seeds', (season) => {
    const out = simulate(simInputFrom(season, { sims: 200 }));
    const seeds = goldenSeeds(season);
    for (const conference of Object.values(seeds)) {
      conference.forEach((team, i) => {
        expect(out.teams[team]!.p_seed[i], `${team} seed ${i + 1}`).toBe(1);
      });
    }
    const inPlayoffs = Object.values(out.teams).filter((t) => t.p_playoffs === 1).length;
    expect(inPlayoffs).toBe(14);
    expect(Object.values(out.teams).every((t) => t.p_playoffs === 0 || t.p_playoffs === 1)).toBe(true);
  });
});

describe('a season with games left', () => {
  const input = simInputFrom(2024, { unplayed: 48, sims: 3000 });
  const out = simulate(input);
  const teams = Object.entries(out.teams);
  const conferenceOf = new Map(input.teams.map((t) => [t.id, t.conference]));
  const divisionOf = new Map(input.teams.map((t) => [t.id, t.division]));
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

  it('is deterministic for the same input and seed', () => {
    expect(simulate(input)).toEqual(out);
  });

  it('gives identical output however the sims are split (thread ranges)', () => {
    const run = prepareRun(input);
    const merged = mergeTallies(
      mergeTallies(simulateRange(run, 0, 700), simulateRange(run, 700, 1900)),
      simulateRange(run, 1900, input.params.sims),
    );
    expect(summarize(run, merged)).toEqual(out);
  });

  it('changes with the seed', () => {
    expect(simulate({ ...input, params: { ...input.params, seed: 'other' } })).not.toEqual(out);
  });

  it('a team’s seed probabilities sum to its playoff probability', () => {
    for (const [, t] of teams) close(t.p_seed.reduce((a, b) => a + b, 0), t.p_playoffs);
  });

  it('each seed is assigned exactly once per conference, and each division has one winner', () => {
    for (const conf of ['AFC', 'NFC']) {
      for (let k = 0; k < 7; k++) {
        close(teams.filter(([id]) => conferenceOf.get(id) === conf).reduce((s, [, t]) => s + t.p_seed[k]!, 0), 1);
      }
    }
    for (const div of new Set(divisionOf.values())) {
      close(teams.filter(([id]) => divisionOf.get(id) === div).reduce((s, [, t]) => s + t.p_division, 0), 1);
    }
  });

  it('round probabilities never increase, and there is one champion per sim', () => {
    for (const [, t] of teams) {
      const r = t.p_round;
      expect(t.p_playoffs).toBeGreaterThanOrEqual(r.divisional!);
      expect(r.divisional!).toBeGreaterThanOrEqual(r.conference!);
      expect(r.conference!).toBeGreaterThanOrEqual(r.super_bowl!);
      expect(r.super_bowl!).toBeGreaterThanOrEqual(r.champion!);
    }
    close(teams.reduce((s, [, t]) => s + t.p_round.champion!, 0), 1);
    close(teams.reduce((s, [, t]) => s + t.p_round.super_bowl!, 0), 2);
  });

  it('reports diagnostics', () => {
    expect(out.rules_id).toBe('nfl@2020');
    expect(out.drift_id).toBe('nfl-line-drift@v2');
    expect(out.diagnostics.warnings).toEqual([]);
  });
});

describe('outcome sampling', () => {
  it('ties take tie_rate from both sides and keep the expected home credit', () => {
    const m = 0.62, tieRate = 0.00373, n = 400_000;
    const counts = { [HOME_WIN]: 0, [TIE]: 0, [AWAY_WIN]: 0 };
    for (let i = 0; i < n; i++) counts[outcomeFor(m, tieRate, (i + 0.5) / n)]++;
    expect(counts[TIE] / n).toBeCloseTo(tieRate, 4);
    expect((counts[HOME_WIN] + counts[TIE] / 2) / n).toBeCloseTo(m, 4);
  });

  it('near-certain games cap the tie so no probability goes negative', () => {
    // m = 0.999: tau = 2(1 - m) = 0.002, so home 0.998, tie 0.002, away 0.
    expect(outcomeFor(0.999, 0.00373, 0.9979)).toBe(HOME_WIN);
    expect(outcomeFor(0.999, 0.00373, 0.9985)).toBe(TIE);
    expect(outcomeFor(0.999, 0.00373, 0.99999)).toBe(TIE);
  });
});

describe('drift (PoolCrunch team walk)', () => {
  it('walk variance at each horizon matches the measured curve', () => {
    const params = DRIFT_MODELS['nfl-line-drift@v2']!;
    const maxH = 20;
    const scales = stepScales(params, maxH);
    const rng = new KeyedRng('drift-variance');
    const sims = 20_000;
    const teams = 4;
    const walks = new Float64Array(teams * (maxH + 1));
    const sq = new Float64Array(maxH + 1);
    for (let sim = 0; sim < sims; sim++) {
      drawWalks(rng, sim, teams, maxH, params, scales, walks);
      for (let t = 0; t < teams; t++) for (let h = 0; h <= maxH; h++) sq[h]! += walks[t * (maxH + 1) + h]! ** 2;
    }
    const inc = (k: number) => params.team_increment_var[Math.min(k, params.max_horizon)]!;
    for (const h of [1, 2, 4, 8, 12, 17, 20]) {
      let expected = 0;
      for (let k = 1; k <= h; k++) expected += inc(k);
      const observed = sq[h]! / (sims * teams);
      expect(Math.abs(observed / expected - 1), `h=${h}: ${observed} vs ${expected}`).toBeLessThan(0.04);
    }
    // About 0.40 log-odds standard deviation per team eight weeks out (01 §4).
    expect(Math.sqrt(sq[8]! / (sims * teams))).toBeCloseTo(0.40, 1);
  });
});

describe('validation', () => {
  it('rejects a scheduled game without a probability', () => {
    const input = simInputFrom(2024, { unplayed: 16, sims: 10 });
    delete input.games[input.games.length - 1]!.p_home;
    expect(() => simulate(input)).toThrow(InputError);
  });

  it('rejects an incomplete matchup matrix', () => {
    const input = simInputFrom(2024, { unplayed: 16, sims: 10 });
    input.matchups.home[0]![1] = null;
    expect(() => simulate(input)).toThrow(/matchups.home/);
  });

  it('rejects an alignment the bracket cannot seed', () => {
    // One division per conference would give 4 qualifiers each, not 7.
    const oneDivision = simInputFrom(2024, { sims: 10 });
    oneDivision.teams = oneDivision.teams.map((t) => ({ ...t, division: t.conference }));
    expect(() => simulate(oneDivision)).toThrow(/AFC has 1 divisions; 7 seeds with 3 wild cards need 4/);

    // Buffalo listed in the AFC North: 3 teams in the East, 5 in the North.
    const moved = simInputFrom(2024, { sims: 10 });
    moved.teams = moved.teams.map((t) => (t.id === 'nfl-buf' ? { ...t, division: 'AFC North' } : t));
    expect(() => simulate(moved)).toThrow(/AFC East has 3 teams; nfl divisions have 4/);

    // 31 teams: the Jets, their games and their matrix row and column removed.
    const missing = simInputFrom(2024, { sims: 10 });
    const keep = missing.matchups.teams.map((id) => id !== 'nfl-nyj');
    const trim = (grid: (number | null)[][]) => grid.filter((_, i) => keep[i]).map((row) => row.filter((_, j) => keep[j]));
    missing.teams = missing.teams.filter((t) => t.id !== 'nfl-nyj');
    missing.games = missing.games.filter((g) => g.home !== 'nfl-nyj' && g.away !== 'nfl-nyj');
    missing.matchups = { ...missing.matchups, teams: missing.matchups.teams.filter((_, i) => keep[i]), home: trim(missing.matchups.home), neutral: trim(missing.matchups.neutral) };
    expect(() => simulate(missing)).toThrow(/AFC East has 3 teams/);

    const oneConference = simInputFrom(2024, { sims: 10 });
    oneConference.teams = oneConference.teams.map((t) => ({ ...t, conference: 'AFC', division: `AFC ${t.division}` }));
    expect(() => simulate(oneConference)).toThrow(/needs 2 conferences/);
  });

  it('rejects a scheduled game after the last regular-season week', () => {
    const input = simInputFrom(2020, { unplayed: 16, sims: 10 });
    input.games[input.games.length - 1]!.week = 18; // 2020 ended in week 17
    expect(() => simulate(input)).toThrow(/integer week in 1\.\.17/);
  });
});

describe('output identity', () => {
  it('records the engine, standings and rules versions', () => {
    const out = simulate(simInputFrom(2024, { sims: 10 }));
    expect(out).toMatchObject({ engine_version: ENGINE_VERSION, standings_version: STANDINGS_VERSION, rules_id: 'nfl@2020' });
  });
});
