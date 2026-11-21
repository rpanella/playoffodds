import type { GameInput, StandingsInput, TeamInput } from '../src';

/**
 * A 16-team test league that the `nfl@2020` rules accept: AFC and NFC, four two-team divisions
 * each. AFC ids: e1 e2 (East), n1 n2 (North), s1 s2 (South), w1 w2 (West); NFC ids get an `x`
 * prefix (xe1 … xw2) and mostly serve as non-conference opponents.
 */
const DIVISIONS = ['East', 'North', 'South', 'West'];

export function testTeams(): TeamInput[] {
  const teams: TeamInput[] = [];
  for (const [conf, prefix] of [['AFC', ''], ['NFC', 'x']] as const) {
    for (const div of DIVISIONS) {
      for (const k of [1, 2]) {
        teams.push({ id: `${prefix}${div[0]!.toLowerCase()}${k}`, conference: conf, division: `${conf} ${div}` });
      }
    }
  }
  return teams;
}

/**
 * A full 32-team league: AFC and NFC, four four-team divisions each. AFC ids: e1–e4 (East),
 * n1–n4 (North), s1–s4 (South), w1–w4 (West); NFC ids get an `x` prefix (xe1 … xw4).
 */
export function fullTeams(): TeamInput[] {
  const teams: TeamInput[] = [];
  for (const [conf, prefix] of [['AFC', ''], ['NFC', 'x']] as const) {
    for (const div of DIVISIONS) {
      for (const k of [1, 2, 3, 4]) {
        teams.push({ id: `${prefix}${div[0]!.toLowerCase()}${k}`, conference: conf, division: `${conf} ${div}` });
      }
    }
  }
  return teams;
}

/**
 * Games as strings: `a>b` (home a beats b, 20-10), `a<b` (b wins at a, 10-20), `a=b` (17-17),
 * or explicit scores `a 24-17 b`. Prefix `?` for a scheduled (unplayed) game.
 */
export function scenario(games: string[], extra: Partial<StandingsInput> = {}): StandingsInput {
  return { league: 'nfl', season: 2026, teams: testTeams(), games: parseGames(games), ...extra };
}

/** `scenario` in the full 32-team league (`fullTeams`). */
export function fullScenario(games: string[], extra: Partial<StandingsInput> = {}): StandingsInput {
  return { league: 'nfl', season: 2026, teams: fullTeams(), games: parseGames(games), ...extra };
}

function parseGames(games: string[]): GameInput[] {
  return games.map((spec, i) => {
    const scheduled = spec.startsWith('?');
    const body = scheduled ? spec.slice(1) : spec;
    const explicit = body.match(/^(\w+) (\d+)-(\d+) (\w+)$/);
    let home: string, away: string, hs: number, as: number;
    if (explicit) {
      [home, hs, as, away] = [explicit[1]!, Number(explicit[2]), Number(explicit[3]), explicit[4]!];
    } else {
      const m = body.match(/^(\w+)([<>=])(\w+)$/);
      if (!m) throw new Error(`bad game spec: ${spec}`);
      home = m[1]!;
      away = m[3]!;
      [hs, as] = m[2] === '>' ? [20, 10] : m[2] === '<' ? [10, 20] : [17, 17];
    }
    const game: GameInput = {
      id: `g${i + 1}`,
      start: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
      season_type: 'regular',
      home,
      away,
      status: scheduled ? 'scheduled' : 'final',
    };
    if (!scheduled) {
      game.home_score = hs;
      game.away_score = as;
    }
    return game;
  });
}

/** `n` wins for `team` over distinct-enough NFC opponents, so they only move its overall record. */
export function nfcWins(team: string, n: number): string[] {
  const opponents = ['xe1', 'xe2', 'xn1', 'xn2', 'xs1', 'xs2', 'xw1', 'xw2'];
  return Array.from({ length: n }, (_, i) => `${team}>${opponents[i % opponents.length]}`);
}

export function nfcLosses(team: string, n: number): string[] {
  const opponents = ['xw2', 'xw1', 'xs2', 'xs1', 'xn2', 'xn1', 'xe2', 'xe1'];
  return Array.from({ length: n }, (_, i) => `${team}<${opponents[i % opponents.length]}`);
}
