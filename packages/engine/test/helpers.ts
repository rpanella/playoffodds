import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { StandingsInput } from '@playoffodds/standings';
import { BRACKETS, regularSeasonWeeks, type SimInput } from '../src';

const golden = fileURLToPath(new URL('../../standings/fixtures/nfl/golden/', import.meta.url));

export function goldenStandings(season: number): StandingsInput {
  return JSON.parse(readFileSync(`${golden}${season}.input.json`, 'utf8')) as StandingsInput;
}

export function goldenSeeds(season: number): Record<string, string[]> {
  return (JSON.parse(readFileSync(`${golden}${season}.expected.json`, 'utf8')) as { seeds: Record<string, string[]> }).seeds;
}

/**
 * A SimInput from a finished golden season, with the last `unplayed` games (by start time)
 * turned back into scheduled games at `pHome`, 16 per week ending in the season's last regular week.
 */
export function simInputFrom(season: number, opts: { unplayed?: number; pHome?: number; sims?: number; seed?: string } = {}): SimInput {
  const base = goldenStandings(season);
  const unplayed = opts.unplayed ?? 0;
  const games = base.games
    .filter((g) => g.status !== 'canceled')
    .sort((a, b) => a.start!.localeCompare(b.start!) || a.id.localeCompare(b.id));
  const firstUnplayed = games.length - unplayed;
  const lastWeek = regularSeasonWeeks(BRACKETS.nfl!, season)!;
  const weeksUnplayed = Math.ceil(unplayed / 16);
  const simGames = games.map((g, i) => {
    if (i < firstUnplayed) return { ...g, week: undefined };
    const week = lastWeek - weeksUnplayed + 1 + Math.floor((i - firstUnplayed) / 16);
    const { home_score: _h, away_score: _a, ...rest } = g;
    return { ...rest, status: 'scheduled' as const, week, p_home: opts.pHome ?? 0.57, p_source: 'market' as const };
  });
  const teams = base.teams.map((t) => t.id);
  const grid = (p: number) => teams.map((_, i) => teams.map((__, j) => (i === j ? null : p)));
  return {
    schema: 'sim-input/1',
    league: 'nfl',
    season,
    as_of: '2026-01-01T00:00:00Z',
    current_week: unplayed > 0 ? lastWeek - weeksUnplayed + 1 : lastWeek + 1,
    teams: base.teams,
    games: simGames,
    matchups: { source: 'test', teams, home: grid(0.57), neutral: grid(0.5) },
    postseason: { state: 'not_started' },
    params: { sims: opts.sims ?? 2000, seed: opts.seed ?? 'test-seed', tie_rate: 0.00373, drift: 'nfl-line-drift@v2' },
  };
}
