import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeStandings, createSimEvaluator, newTiebreakStats, type StandingsInput } from '../src';

const dir = fileURLToPath(new URL('../fixtures/nfl/golden/', import.meta.url));
const load = <T>(name: string): T => JSON.parse(readFileSync(dir + name, 'utf8')) as T;

interface Expected {
  season: number;
  sources: string[];
  seeds: Record<string, string[]>;
  records: Record<string, string>;
}

const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

describe.each(SEASONS)('NFL %i (official seeds)', (season) => {
  const input = load<StandingsInput>(`${season}.input.json`);
  const expected = load<Expected>(`${season}.expected.json`);

  it('reproduces seeds 1-7 in both conferences', () => {
    const out = computeStandings(input);
    expect(out.rules_id).toBe('nfl@2020');
    expect(out.seeds).toEqual(expected.seeds);
    expect(out.unresolved).toEqual([]);
  });

  it('matches the official records of every playoff team', () => {
    const out = computeStandings(input);
    for (const [team, record] of Object.entries(expected.records)) {
      const t = out.teams.find((x) => x.id === team)!;
      expect(`${t.record.w}-${t.record.l}-${t.record.t}`, team).toBe(record);
    }
  });

  it('simulation fast path agrees when every game is final', () => {
    const evaluator = createSimEvaluator(input);
    expect(evaluator.remaining).toEqual([]);
    const stats = newTiebreakStats();
    const result = evaluator.newWorld().resolve(() => 0, stats);
    const names = evaluator.index.conferenceNames;
    const seeds = Object.fromEntries(result.seeds.map((list, c) => [names[c], list.map((t) => evaluator.index.teamIds[t])]));
    expect(seeds).toEqual(expected.seeds);
    expect(stats.draws).toBe(0);
  });
});
