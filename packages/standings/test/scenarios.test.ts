import { describe, expect, it } from 'vitest';
import { AWAY_WIN, computeStandings, createSimEvaluator, InputError, newTiebreakStats } from '../src';
import { nfcLosses, nfcWins, scenario } from './helpers';

const wildCards = (input: ReturnType<typeof scenario>) => computeStandings(input).seeds.AFC!.slice(4);
const repeat = (spec: string, n: number) => Array.from({ length: n }, () => spec);

describe('wild card, three or more clubs', () => {
  it('a head-to-head sweep wins even with a worse conference record', () => {
    const input = scenario([
      'n2>e2', 'n2>s2', 'w1>n2', 'e1>n2', // n2 2-2, swept e2 and s2, conference 2-2
      'e2>s2', 'e2>w2', ...nfcLosses('e2', 1), // e2 2-2, conference 2-1
      ...nfcWins('s2', 2), // s2 2-2, conference 0-2
      ...nfcWins('e1', 4), ...nfcWins('n1', 5), ...nfcWins('s1', 5), ...nfcWins('w1', 4),
    ]);
    // Conference record alone would put e2 first.
    expect(wildCards(input)).toEqual(['n2', 'e2', 's2']);
  });

  it('a club that lost to each of the others is eliminated, and the rest restart at two clubs', () => {
    const input = scenario([
      'e2>s2', 'n2>s2', 's2>w2', 's2>e1', 's2>n1', 's2>w1', // s2 4-2, conference 4-2 (.667)
      'w1>e2', ...nfcWins('e2', 3), ...nfcLosses('e2', 1), // e2 4-2, conference 1-1 (.500)
      'w1>n2', 'e1>n2', ...nfcWins('n2', 3), // n2 4-2, conference 1-2 (.333)
      ...nfcWins('e1', 6), ...nfcWins('n1', 6), ...nfcWins('s1', 6), ...nfcWins('w1', 4),
    ]);
    // Without the sweep step s2 would go first on conference record. Instead s2 goes out; e2
    // and n2 never met, so their two-club restart is decided by conference record; then n2
    // beats s2 head-to-head for the last spot.
    expect(wildCards(input)).toEqual(['e2', 'n2', 's2']);
  });
});

describe('wild card, two clubs', () => {
  it('skips common games with fewer than four and goes to strength of victory', () => {
    const input = scenario([
      'e2>xe1', 'e2>xe2', 'w1>e2', 'xw1>e2', // e2 2-2; common games vs xe1, xe2, w1: 2-1
      'n2>xe1', 'xe2>n2', 'n2>xw2', 'w1>n2', // n2 2-2; common games: 1-2
      'xs1>xe2', 'xs2>xe2', // xe2 1-3: weak win for e2
      'xw2>xs1', 'xw2>xs2', 'xw2>xn2', // xw2 3-1: strong win for n2
      's2<xn2', 'w2<xn2', 'w2<xs2',
      ...repeat('e1>xn1', 3), ...repeat('n1>xn1', 3), ...repeat('s1>xn1', 3), 'w1>xn1',
    ]);
    expect(wildCards(input)).toEqual(['n2', 'e2', 's2']);
  });
});

describe('percentages', () => {
  it('counts a tie as half a win and half a loss', () => {
    const out = computeStandings(scenario(['e1>xn1', 'e1=xn2', 'e2>xs1', 'e2>xs2', 'e2<xw1']));
    const e1 = out.teams.find((t) => t.id === 'e1')!;
    expect(e1.record).toEqual({ w: 1, l: 0, t: 1 });
    expect(e1.pct).toBe(0.75);
    expect(e1.division_rank).toBe(1);
    expect(out.teams.find((t) => t.id === 'e2')!.division_rank).toBe(2);
  });

  it('ignores canceled games', () => {
    const input = scenario(['e1>e2', 'e2>e1']);
    input.games.push({ id: 'canceled', season_type: 'regular', home: 'e1', away: 'e2', status: 'canceled' });
    const e1 = computeStandings(input).teams.find((t) => t.id === 'e1')!;
    expect(e1.record).toEqual({ w: 1, l: 1, t: 0 });
  });
});

describe('ties the procedure cannot settle', () => {
  const mirror = ['e1>e2', 'e2>e1']; // identical records, points and opponents

  it('deterministic standings flag the tie at net touchdowns instead of guessing', () => {
    const out = computeStandings(scenario(mirror));
    expect(out.unresolved).toContainEqual({ context: 'AFC East division', clubs: ['e1', 'e2'], reason: 'no_touchdowns' });
  });

  it('simulations draw and count it', () => {
    const evaluator = createSimEvaluator(scenario(mirror));
    const stats = newTiebreakStats();
    evaluator.newWorld().resolve(() => 1, stats);
    expect(stats.byReason.no_touchdowns).toBeGreaterThan(0);
  });

  it('a simulated game makes points-based steps a draw', () => {
    const evaluator = createSimEvaluator(scenario([...mirror, '?xn1>xn2']));
    expect(evaluator.remaining).toHaveLength(1);
    const world = evaluator.newWorld();
    world.apply(evaluator.remaining[0]!, AWAY_WIN);
    const stats = newTiebreakStats();
    world.resolve(() => 0, stats);
    expect(stats.byReason.no_scores).toBeGreaterThan(0);
    expect(stats.byKind.division_title).toBeGreaterThan(0);
  });
});

describe('input handling', () => {
  it('counts only games that started before as_of', () => {
    const input = scenario(['e1>e2', 'e2>e1'], { as_of: new Date(Date.UTC(2026, 8, 1, 12)).toISOString() });
    const e1 = computeStandings(input).teams.find((t) => t.id === 'e1')!;
    expect(e1.record).toEqual({ w: 1, l: 0, t: 0 });
  });

  it('rejects a final game without scores', () => {
    const input = scenario(['e1>e2']);
    delete input.games[0]!.home_score;
    expect(() => computeStandings(input)).toThrow(InputError);
  });

  it('rejects an unknown season type or status instead of dropping the game', () => {
    const badType = scenario(['e1>e2', 'e2>e1']);
    (badType.games[0] as { season_type: string }).season_type = 'Regular';
    expect(() => computeStandings(badType)).toThrow(/unknown season_type "Regular"/);
    const badStatus = scenario(['e1>e2']);
    (badStatus.games[0] as { status: string }).status = 'in_progress';
    expect(() => computeStandings(badStatus)).toThrow(/unknown status "in_progress"/);
  });

  it('rejects unknown teams and conferences', () => {
    expect(() => computeStandings(scenario(['e1>zz']))).toThrow(InputError);
    const input = scenario([]);
    input.teams[0]!.conference = 'XFL';
    expect(() => computeStandings(input)).toThrow(InputError);
  });

  it('rejects a season no rules module covers', () => {
    expect(() => computeStandings(scenario([], { season: 2019 }))).toThrow(/rules module/);
  });
});
