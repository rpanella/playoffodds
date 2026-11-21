import { InputError, type RulesModule, type SeasonIndex } from '@playoffodds/standings';
import { DRIFT_MODELS } from './drift';
import { BRACKETS, regularSeasonWeeks } from './leagues';
import type { SimInput } from './types';

const isProb = (p: unknown): p is number => typeof p === 'number' && p > 0 && p < 1;

/** Checks that don't need the season index. */
export function validateSimInput(input: SimInput): void {
  if (input.schema !== 'sim-input/1') throw new InputError(`unsupported schema: ${input.schema}`);
  if (!BRACKETS[input.league]) throw new InputError(`no bracket format for league ${input.league}`);
  if (!Number.isInteger(input.current_week) || input.current_week < 1) throw new InputError('current_week must be a positive integer');
  const p = input.params;
  if (!p || !Number.isInteger(p.sims) || p.sims < 1 || p.sims > 10_000_000) throw new InputError('params.sims must be an integer in 1..10,000,000');
  if (typeof p.seed !== 'string' || p.seed.length === 0) throw new InputError('params.seed must be a non-empty string');
  if (typeof p.tie_rate !== 'number' || p.tie_rate < 0 || p.tie_rate > 0.05) throw new InputError('params.tie_rate must be in [0, 0.05]');
  if (!DRIFT_MODELS[p.drift]) throw new InputError(`unknown drift model: ${p.drift}`);
  if (input.postseason?.state !== 'not_started') throw new InputError('postseason resume is not supported yet (M4)');
  for (const g of input.games) {
    if (g.season_type === 'postseason') throw new InputError(`postseason game ${g.id}: not supported yet (M4)`);
  }
}

/**
 * Checks against the prepared season: an alignment the bracket can seed, probabilities and weeks on
 * every unplayed game, a complete matchup matrix.
 */
export function validateAgainstSeason(input: SimInput, idx: SeasonIndex, remaining: number[], rules: RulesModule): void {
  const bracket = BRACKETS[input.league]!;
  if (rules.format.byes !== bracket.byes) throw new InputError(`rules ${rules.id} give ${rules.format.byes} byes; the ${input.league} bracket has ${bracket.byes}`);
  if (idx.conferenceNames.length !== bracket.conferences) {
    throw new InputError(`the ${input.league} bracket needs ${bracket.conferences} conferences; the teams are in ${idx.conferenceNames.length}`);
  }
  // Seeds are the division winners plus the wild cards, so the division count is fixed by the bracket.
  const divisions = bracket.seedsPerConference - rules.format.wildCards;
  idx.conferenceNames.forEach((conf, c) => {
    const d = idx.divsOfConf[c]!.length;
    if (d !== divisions) {
      throw new InputError(`${conf} has ${d} divisions; ${bracket.seedsPerConference} seeds with ${rules.format.wildCards} wild cards need ${divisions}`);
    }
    for (const dv of idx.divsOfConf[c]!) {
      const size = idx.divTeams[dv]!.length;
      if (size !== bracket.teamsPerDivision) {
        throw new InputError(`${idx.divisionNames[dv]} has ${size} teams; ${input.league} divisions have ${bracket.teamsPerDivision}`);
      }
    }
  });

  const lastWeek = regularSeasonWeeks(bracket, input.season);
  if (lastWeek === null) throw new InputError(`no ${input.league} calendar covers season ${input.season}`);
  const byId = new Map(input.games.map((g) => [g.id, g]));
  for (const gi of remaining) {
    const g = byId.get(idx.gameIds[gi]!)!;
    if (g.status !== 'scheduled') throw new InputError(`game ${g.id} is neither final, scheduled nor canceled`);
    if (!isProb(g.p_home)) throw new InputError(`scheduled game ${g.id} needs p_home in (0, 1)`);
    if (!Number.isInteger(g.week) || g.week! < 1 || g.week! > lastWeek) {
      throw new InputError(`scheduled game ${g.id} needs an integer week in 1..${lastWeek}`);
    }
  }

  const m = input.matchups;
  const n = idx.teamIds.length;
  if (!m || !Array.isArray(m.teams) || m.teams.length !== n) throw new InputError('matchups.teams must list every team once');
  const seen = new Set<string>();
  for (const id of m.teams) {
    if (!idx.teamIndex.has(id) || seen.has(id)) throw new InputError(`matchups.teams: unknown or repeated team ${id}`);
    seen.add(id);
  }
  for (const name of ['home', 'neutral'] as const) {
    const grid = m[name];
    if (!Array.isArray(grid) || grid.length !== n) throw new InputError(`matchups.${name} must be ${n}x${n}`);
    grid.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== n) throw new InputError(`matchups.${name} must be ${n}x${n}`);
      row.forEach((p, j) => {
        if (i === j ? p !== null : !isProb(p)) {
          throw new InputError(`matchups.${name}[${i}][${j}] must be ${i === j ? 'null' : 'a probability in (0, 1)'}`);
        }
      });
    });
  }
}
