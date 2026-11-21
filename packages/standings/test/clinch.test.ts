// The clinch spike's correctness checks (features/14 §4): on random 32-team seasons with a few games left,
// the reduced searches (brute force, branch-and-bound, HiGHS) agree with an unreduced brute force over
// every remaining game, and every clinched or eliminated result holds under the real tiebreakers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import highsLoader from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLINCH_METHOD, computeClinch, computeStandings, prepareSeason, type GameInput, type StandingsInput } from '../src';
import { buildProblem, CLINCH_TARGETS, goal, type ClinchProblem, type ClinchQuestion, type ClinchTarget } from '../src/clinch/problem';
import { branchAndBound, bruteForce, integerProgram, type LpSolver } from '../src/clinch/solvers';
import { fullTeams } from './helpers';

let highs: LpSolver;
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as LpSolver;
});

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random season: every team plays `perTeam` games against random opponents (more often its own
 * conference), all final except `unplayed` games chosen among AFC teams. Ties are rare but present.
 */
function randomSeason(seed: number, perTeam: number, unplayed: number): StandingsInput {
  const r = rng(seed);
  const teams = fullTeams();
  const ids = teams.map((t) => t.id);
  const afc = ids.filter((id) => !id.startsWith('x'));
  const games: GameInput[] = [];
  const count = new Map(ids.map((id) => [id, 0]));
  let guard = 0;
  while ([...count.values()].some((c) => c < perTeam) && guard++ < 10_000) {
    const h = ids[Math.floor(r() * ids.length)]!;
    if (count.get(h)! >= perTeam) continue;
    const pool = r() < 0.75 ? ids.filter((id) => id.startsWith('x') === h.startsWith('x')) : ids;
    const a = pool[Math.floor(r() * pool.length)]!;
    if (a === h || count.get(a)! >= perTeam + 1) continue;
    count.set(h, count.get(h)! + 1);
    count.set(a, count.get(a)! + 1);
    games.push({ id: `g${games.length}`, season_type: 'regular', home: h, away: a, status: 'final', home_score: 0, away_score: 0 });
  }
  for (const g of games) {
    const u = r();
    [g.home_score, g.away_score] = u < 0.02 ? [17, 17] : u < 0.52 ? [24, 17] : [17, 24];
  }
  // Leave `unplayed` AFC games open.
  const open = games.filter((g) => afc.includes(g.home) || afc.includes(g.away));
  for (let k = 0; k < unplayed && open.length; k++) {
    const g = open.splice(Math.floor(r() * open.length), 1)[0]!;
    g.status = 'scheduled';
    delete g.home_score;
    delete g.away_score;
  }
  return { league: 'nfl', season: 2026, teams, games };
}

/**
 * Unreduced oracle: over every completion of every remaining game, does a witness exist? With `winsOut`,
 * the team's own games are fixed as wins first (controls its own destiny).
 */
function oracle(input: StandingsInput, team: number, target: ClinchTarget, question: ClinchQuestion, winsOut = false): boolean {
  const { idx, baseline: s, rules } = prepareSeason(input);
  const mode = question === 'clinched' ? 'miss' : 'make';
  const conf = idx.confOf[team]!;
  const others = idx.confTeams[conf]!.filter((i) => i !== team && (target !== 'division' || idx.divOf[i] === idx.divOf[team]));
  const divIds = [...new Set(others.map((i) => idx.divOf[i]!))];
  const points = idx.teamIds.map((_, i) => 2 * s.w[i]! + s.t[i]!);
  const ownGame = (g: number) => idx.home[g] === team || idx.away[g] === team;
  const open = idx.gameIds.map((_, g) => g).filter((g) => s.result[g] === 0 && !(winsOut && ownGame(g)));
  if (winsOut) points[team]! += 2 * idx.teamGames[team]!.filter((g) => s.result[g] === 0).length;
  const games = idx.teamIds.map((_, i) => idx.teamGames[i]!.length);
  const pr: ClinchProblem = {
    target, mode, wildCards: rules.format.wildCards, teamPoints: 0, teamGames: games[team]!,
    points: others.map(() => 0), games: others.map((i) => games[i]!), division: others.map((i) => divIds.indexOf(idx.divOf[i]!)),
    rival: others.map((i) => idx.divOf[i] === idx.divOf[team]), divisions: divIds.length, branch: [], teams: others,
  };
  const rec = (k: number): boolean => {
    if (k === open.length) {
      const y = others.map((i) => {
        const lhs = points[i]! * games[team]!;
        const rhs = points[team]! * games[i]!;
        return mode === 'miss' ? lhs >= rhs : lhs > rhs;
      });
      return goal(pr, y);
    }
    const g = open[k]!;
    const h = idx.home[g]!;
    const a = idx.away[g]!;
    for (const [dh, da] of [[2, 0], [0, 2], [1, 1]] as const) {
      points[h]! += dh;
      points[a]! += da;
      const hit = rec(k + 1);
      points[h]! -= dh;
      points[a]! -= da;
      if (hit) return true;
    }
    return false;
  };
  return rec(0);
}

const SEASONS = Array.from({ length: 12 }, (_, i) => ({ seed: 1000 + i, perTeam: 10 + (i % 4), unplayed: 6 + (i % 4) }));

describe('clinch searches', () => {
  it.each(SEASONS)('agree with the unreduced brute force (seed $seed, $unplayed open games)', ({ seed, perTeam, unplayed }) => {
    const input = randomSeason(seed, perTeam, unplayed);
    const { idx, baseline: s, rules } = prepareSeason(input);
    let proven = 0;
    for (const team of idx.confTeams[idx.conferenceNames.indexOf('AFC')]!) {
      for (const target of CLINCH_TARGETS) {
        for (const question of ['clinched', 'eliminated'] as const) {
          const expected = oracle(input, team, target, question);
          const pr = buildProblem(idx, s, rules, team, target, question);
          const label = `${idx.teamIds[team]} ${target} ${question}`;
          expect(bruteForce(pr).found, `${label} reduced brute force`).toBe(expected);
          expect(branchAndBound(pr).found, `${label} branch-and-bound`).toBe(expected);
          expect(integerProgram(pr, highs).found, `${label} integer program`).toBe(expected);
          if (!expected) proven++;
          if (question === 'clinched') {
            const destiny = buildProblem(idx, s, rules, team, target, question, true);
            expect(branchAndBound(destiny).found, `${label} if it wins out`).toBe(oracle(input, team, target, question, true));
          }
        }
      }
    }
    expect(proven).toBeGreaterThan(0); // the seasons should produce some clinches or eliminations
  });

  it.each([2020, 2021, 2022, 2023, 2024, 2025])('%i, replayed week by week: every claim holds in the final standings', (season) => {
    const full = JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/nfl/golden/${season}.input.json`, import.meta.url)), 'utf8')) as StandingsInput;
    const final = computeStandings(full);
    const finalSeeds = Object.values(final.seeds);
    const reached = (id: string, target: ClinchTarget) => target === 'playoffs'
      ? finalSeeds.some((s) => s.includes(id))
      : target === 'division' ? final.teams.find((t) => t.id === id)!.division_winner : finalSeeds.some((s) => s[0] === id);
    const starts = full.games.map((g) => Date.parse(g.start!)).sort((a, b) => a - b);
    let claims = 0;
    // One state per week, cut on the Wednesday after each week's games (six days after the Thursday opener).
    for (let cutoff = starts[0]! + 6 * 86_400_000; cutoff < starts.at(-1)!; cutoff += 7 * 86_400_000) {
      const input: StandingsInput = {
        ...full,
        games: full.games.map((g) => (Date.parse(g.start!) < cutoff ? g : { ...g, status: 'scheduled' as const, home_score: null, away_score: null })),
      };
      const { idx, baseline: s, rules } = prepareSeason(input);
      for (let team = 0; team < idx.teamIds.length; team++) {
        for (const target of CLINCH_TARGETS) {
          for (const question of ['clinched', 'eliminated'] as const) {
            if (branchAndBound(buildProblem(idx, s, rules, team, target, question)).found !== false) continue;
            claims++;
            const id = idx.teamIds[team]!;
            expect(reached(id, target), `${id} ${target} ${question} as of ${new Date(cutoff).toISOString().slice(0, 10)}`).toBe(question === 'clinched');
          }
        }
      }
    }
    expect(claims).toBeGreaterThan(100);
  });

  it('computeClinch reports 2020 after week 14 consistently', () => {
    const full = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/nfl/golden/2020.input.json', import.meta.url)), 'utf8')) as StandingsInput;
    const starts = full.games.map((g) => Date.parse(g.start!)).sort((a, b) => a - b);
    const cutoff = starts[0]! + (7 * 14 - 1) * 86_400_000; // the Wednesday after week 14
    const out = computeClinch({ ...full, games: full.games.map((g) => (Date.parse(g.start!) < cutoff ? g : { ...g, status: 'scheduled' as const, home_score: null, away_score: null })) });

    expect(out).toMatchObject({ schema: 'clinch-output/1', rules_id: 'nfl@2020', method: CLINCH_METHOD, targets: ['playoffs', 'division', 'top_seed'] });
    expect(out.statuses).toHaveLength(32 * 3);
    const status = (team: string, target: ClinchTarget) => out.statuses.find((x) => x.team === team && x.target === target)!;
    expect(status('nfl-kc', 'division').status).toBe('clinched');
    expect(status('nfl-gb', 'division').status).toBe('clinched');
    expect(status('nfl-no', 'playoffs').status).toBe('clinched');
    expect(status('nfl-nyj', 'playoffs').status).toBe('eliminated'); // 0-13
    for (const team of new Set(out.statuses.map((x) => x.team))) {
      const [po, div, top] = (['playoffs', 'division', 'top_seed'] as const).map((t) => status(team, t));
      if (div!.status === 'clinched' || top!.status === 'clinched') expect(po!.status).toBe('clinched');
      if (po!.status === 'eliminated') expect([div!.status, top!.status]).toEqual(['eliminated', 'eliminated']);
      if (po!.status === 'clinched') expect(po!.controls_destiny).toBe(true);
      if (po!.status === 'eliminated') expect(po!.controls_destiny).toBe(false);
    }
    expect(out.statuses.some((x) => x.status === 'alive' && x.controls_destiny)).toBe(true);
    expect(out.statuses.every((x) => !x.timed_out)).toBe(true);
  });

  it('never contradicts the real tiebreakers', () => {
    for (const { seed, perTeam, unplayed } of SEASONS) {
      const input = randomSeason(seed, perTeam, unplayed);
      const { idx, baseline: s, rules } = prepareSeason(input);
      const afc = idx.confTeams[idx.conferenceNames.indexOf('AFC')]!;
      const claims: { team: string; target: ClinchTarget; clinched: boolean }[] = [];
      for (const team of afc) {
        for (const target of CLINCH_TARGETS) {
          for (const question of ['clinched', 'eliminated'] as const) {
            if (branchAndBound(buildProblem(idx, s, rules, team, target, question)).found === false) {
              claims.push({ team: idx.teamIds[team]!, target, clinched: question === 'clinched' });
            }
          }
        }
      }
      // Random completions with random scores, through the full NFL procedure.
      const r = rng(seed * 7);
      for (let trial = 0; trial < 40; trial++) {
        const done: StandingsInput = {
          ...input,
          games: input.games.map((g) => {
            if (g.status !== 'scheduled') return g;
            const u = r();
            const [hs, as] = u < 0.05 ? [20, 20] : u < 0.5 ? [10 + Math.floor(r() * 30), 3 + Math.floor(r() * 7)] : [3 + Math.floor(r() * 7), 10 + Math.floor(r() * 30)];
            return { ...g, status: 'final' as const, home_score: hs, away_score: as };
          }),
        };
        const out = computeStandings(done);
        const seeds = out.seeds.AFC!;
        for (const c of claims) {
          const standing = out.teams.find((t) => t.id === c.team)!;
          const reached = c.target === 'playoffs' ? seeds.includes(c.team) : c.target === 'division' ? standing.division_winner : seeds[0] === c.team;
          expect(reached, `${c.team} ${c.target} ${c.clinched ? 'clinched' : 'eliminated'} (seed ${seed}, trial ${trial})`).toBe(c.clinched);
        }
      }
    }
  });
});
