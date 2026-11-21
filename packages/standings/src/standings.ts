import type { TieResolver } from './core/context';
import { ids } from './core/context';
import { buildSeasonIndex, InputError, outcomeFromScores, SeasonState, type SeasonIndex } from './core/season';
import { computeSeeding } from './core/seeding';
import type { RulesModule } from './core/rules';
import { selectRules } from './leagues';
import type { StandingsInput, StandingsOutput, TeamStanding, TraceEntry, UnresolvedTie } from './types';
import { STANDINGS_VERSION } from './version';

export interface PreparedSeason {
  rules: RulesModule;
  idx: SeasonIndex;
  /** Final games (before `as_of`) applied with their scores. */
  baseline: SeasonState;
}

/** Validate the input, pick the rules era and apply every counted final game. */
export function prepareSeason(input: StandingsInput): PreparedSeason {
  if (typeof input?.league !== 'string' || !Number.isInteger(input.season) || !Array.isArray(input.teams) || !Array.isArray(input.games)) {
    throw new InputError('input needs league, integer season, teams[] and games[]');
  }
  const rules = selectRules(input.league, input.season);
  const idx = buildSeasonIndex(input, rules.conferences);
  const baseline = new SeasonState(idx);
  const cutoff = input.as_of ? Date.parse(input.as_of) : null;
  if (cutoff !== null && Number.isNaN(cutoff)) throw new InputError(`bad as_of: ${input.as_of}`);
  for (const game of input.games) {
    if (game.season_type !== 'regular' || game.status !== 'final') continue;
    if (cutoff !== null) {
      if (!game.start) throw new InputError(`game ${game.id} has no start time but as_of was given`);
      if (Date.parse(game.start) >= cutoff) continue;
    }
    const hs = game.home_score;
    const as = game.away_score;
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs! < 0 || as! < 0) {
      throw new InputError(`final game ${game.id} needs non-negative integer scores`);
    }
    baseline.apply(idx.gameIndex.get(game.id)!, outcomeFromScores(hs!, as!), hs!, as!);
  }
  return { rules, idx, baseline };
}

/** Deterministic standings from real results. Coin tosses and missing data are reported, never guessed. */
export function computeStandings(input: StandingsInput, opts: { trace?: boolean } = {}): StandingsOutput {
  const { rules, idx, baseline: s } = prepareSeason(input);
  const unresolved: UnresolvedTie[] = [];
  const trace: TraceEntry[] | null = opts.trace ? [] : null;
  const resolver: TieResolver = {
    decide(clubs, reason, ctx) {
      // Placeholder order so the output stays complete; the tie is flagged for display as "tied".
      unresolved.push({ context: ctx.label, clubs: ids(ctx, clubs), reason });
      return [...clubs].sort((a, b) => idx.teamIds[a]!.localeCompare(idx.teamIds[b]!))[0]!;
    },
  };
  const seeding = computeSeeding(s, rules, resolver, trace, true);

  const seedOf = new Map<number, number>();
  seeding.seeds.forEach((list) => list.forEach((t, i) => seedOf.set(t, i + 1)));
  const divRank = new Map<number, number>();
  seeding.divisionOrders.forEach((order) => order.forEach((t, i) => divRank.set(t, i + 1)));
  const confRank = new Map<number, number>();
  seeding.conferenceOrders.forEach((order) => order.forEach((t, i) => confRank.set(t, i + 1)));

  const teams: TeamStanding[] = idx.teamIds.map((id, t) => ({
    id,
    conference: idx.conferenceNames[idx.confOf[t]!]!,
    division: idx.divisionNames[idx.divOf[t]!]!,
    record: { w: s.w[t]!, l: s.l[t]!, t: s.t[t]! },
    pct: s.pctDen(t) === 0 ? 0 : Math.round((s.pctNum(t) / s.pctDen(t)) * 1000) / 1000,
    division_record: { w: s.dw[t]!, l: s.dl[t]!, t: s.dt[t]! },
    conference_record: { w: s.cw[t]!, l: s.cl[t]!, t: s.ct[t]! },
    points_for: s.pf[t]!,
    points_against: s.pa[t]!,
    division_rank: divRank.get(t)!,
    conference_rank: confRank.get(t)!,
    division_winner: seeding.divisionWinner[t] === 1,
    seed: seedOf.get(t) ?? null,
  }));

  const seeds: Record<string, string[]> = {};
  idx.conferenceNames.forEach((conf, c) => {
    seeds[conf] = seeding.seeds[c]!.map((t) => idx.teamIds[t]!);
  });

  const out: StandingsOutput = {
    schema: 'standings-output/1',
    engine_version: STANDINGS_VERSION,
    rules_id: rules.id,
    league: input.league,
    season: input.season,
    as_of: input.as_of ?? null,
    teams,
    seeds,
    unresolved,
  };
  if (trace) out.trace = trace;
  return out;
}
