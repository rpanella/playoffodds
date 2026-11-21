import {
  AWAY_WIN,
  createSimEvaluator,
  HOME_WIN,
  newTiebreakStats,
  STANDINGS_VERSION,
  TIE,
  type SimEvaluator,
  type TiebreakStats,
} from '@playoffodds/standings';
import { DRIFT_MODELS, drawWalks, stepScales, type DriftParams } from './drift';
import { BRACKETS, regularSeasonWeeks, type BracketFormat } from './leagues';
import { KeyedRng, Purpose, RNG_ID, type Stream } from './rng';
import type { SimInput, SimOutput, TeamOdds } from './types';
import { validateAgainstSeason, validateSimInput } from './validate';
import { ENGINE_VERSION } from './version';

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * NFL outcome from home win credit `m` and uniform `u` (01 §5): a tie takes probability
 * tau = min(tieRate, 2·min(m, 1−m)) split evenly from both sides, so expected credit stays m.
 */
export function outcomeFor(m: number, tieRate: number, u: number): typeof HOME_WIN | typeof AWAY_WIN | typeof TIE {
  const tau = Math.min(tieRate, 2 * Math.min(m, 1 - m));
  return u < m - tau / 2 ? HOME_WIN : u < m + tau / 2 ? TIE : AWAY_WIN;
}

/** Additive counts from a range of sims. Ranges merge exactly, so any split gives the same output. */
export interface Tallies {
  sims: number;
  playoffs: Int32Array;
  divisions: Int32Array;
  seedCount: Int32Array;
  /** Per team, index r: reached round r (0 = made the playoffs); the last index is champion. */
  reached: Int32Array;
  winsHist: Int32Array;
  clipped: number;
  stats: TiebreakStats;
}

/** Everything derived once from the input; each sim range only reads it. */
export interface PreparedRun {
  input: SimInput;
  evaluator: SimEvaluator;
  drift: DriftParams;
  bracket: BracketFormat;
  n: number;
  gameLogit: Float64Array;
  gameH: Int32Array;
  homeLogit: Float64Array;
  neutralLogit: Float64Array;
  roundH: number[];
  maxH: number;
  maxGames: number;
  warnings: string[];
}

export function prepareRun(input: SimInput): PreparedRun {
  validateSimInput(input);
  const evaluator = createSimEvaluator({ league: input.league, season: input.season, teams: input.teams, games: input.games });
  const idx = evaluator.index;
  const remaining = evaluator.remaining;
  validateAgainstSeason(input, idx, remaining, evaluator.rules);

  const drift = DRIFT_MODELS[input.params.drift]!;
  const bracket = BRACKETS[input.league]!;
  const n = idx.teamIds.length;

  // Remaining games: anchor logit and drift horizon.
  const byId = new Map(input.games.map((g) => [g.id, g]));
  const gameLogit = new Float64Array(remaining.length);
  const gameH = new Int32Array(remaining.length);
  remaining.forEach((gi, k) => {
    const g = byId.get(idx.gameIds[gi]!)!;
    gameLogit[k] = logit(g.p_home!);
    gameH[k] = Math.max(0, g.week! - input.current_week);
  });

  // Matchup matrices, re-indexed to the season's team order.
  const homeLogit = new Float64Array(n * n);
  const neutralLogit = new Float64Array(n * n);
  const mi = input.matchups.teams.map((id) => idx.teamIndex.get(id)!);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      homeLogit[mi[i]! * n + mi[j]!] = logit(input.matchups.home[i]![j]!);
      neutralLogit[mi[i]! * n + mi[j]!] = logit(input.matchups.neutral[i]![j]!);
    }
  }

  const lastWeek = regularSeasonWeeks(bracket, input.season)!;
  const roundH = bracket.rounds.map((r) => Math.max(0, lastWeek + r.weeksAfter - input.current_week));
  const maxH = Math.max(0, ...roundH, ...gameH);
  const warnings: string[] = [];
  if (maxH > drift.max_horizon) warnings.push(`drift extrapolated beyond ${drift.max_horizon} weeks (max horizon ${maxH})`);

  return {
    input, evaluator, drift, bracket, n, gameLogit, gameH, homeLogit, neutralLogit, roundH, maxH,
    maxGames: Math.max(...idx.teamGames.map((g) => g.length)),
    warnings,
  };
}

export function emptyTallies(run: PreparedRun): Tallies {
  const { n, bracket, maxGames } = run;
  return {
    sims: 0,
    playoffs: new Int32Array(n),
    divisions: new Int32Array(n),
    seedCount: new Int32Array(n * bracket.seedsPerConference),
    reached: new Int32Array(n * (bracket.rounds.length + 1)),
    winsHist: new Int32Array(n * (maxGames + 1)),
    clipped: 0,
    stats: newTiebreakStats(),
  };
}

export function mergeTallies(into: Tallies, from: Tallies): Tallies {
  into.sims += from.sims;
  for (const key of ['playoffs', 'divisions', 'seedCount', 'reached', 'winsHist'] as const) {
    const a = into[key];
    const b = from[key];
    for (let i = 0; i < a.length; i++) a[i]! += b[i]!;
  }
  into.clipped += from.clipped;
  into.stats.draws += from.stats.draws;
  for (const k of Object.keys(into.stats.byReason) as (keyof TiebreakStats['byReason'])[]) into.stats.byReason[k] += from.stats.byReason[k];
  for (const k of Object.keys(into.stats.byKind) as (keyof TiebreakStats['byKind'])[]) into.stats.byKind[k] += from.stats.byKind[k];
  return into;
}

/** Simulate sims [from, to) (01 §3). Sim i draws the same numbers whatever range it runs in. */
export function simulateRange(run: PreparedRun, from: number, to: number): Tallies {
  const { input, evaluator, drift, bracket, n, gameLogit, gameH, homeLogit, neutralLogit, roundH, maxH, maxGames } = run;
  const idx = evaluator.index;
  const remaining = evaluator.remaining;
  const tieRate = input.params.tie_rate;
  const conferences = idx.conferenceNames.length;
  const S = bracket.seedsPerConference;
  const R = bracket.rounds.length;
  const tallies = emptyTallies(run);

  const width = maxH + 1;
  const scales = stepScales(drift, maxH);
  const walks = new Float64Array(n * width);
  const clip = drift.clip_logits;
  const driftBetween = (a: number, b: number, h: number): number => {
    const d = walks[a * width + h]! - walks[b * width + h]!;
    if (d > clip) { tallies.clipped++; return clip; }
    if (d < -clip) { tallies.clipped++; return -clip; }
    return d;
  };

  const rng = new KeyedRng(input.params.seed);
  const world = evaluator.newWorld();

  for (let sim = from; sim < to; sim++) {
    world.reset();
    drawWalks(rng, sim, n, maxH, drift, scales, walks);

    for (let k = 0; k < remaining.length; k++) {
      const g = remaining[k]!;
      const m = sigmoid(gameLogit[k]! + driftBetween(idx.home[g]!, idx.away[g]!, gameH[k]!));
      world.apply(g, outcomeFor(m, tieRate, rng.uniform(sim, Purpose.outcome, g)));
    }

    let tiebreaks: Stream | null = null;
    const result = world.resolve((k) => (tiebreaks ??= rng.stream(sim, Purpose.tiebreak, 0)).int(k), tallies.stats);

    const champions: number[] = [];
    for (let c = 0; c < conferences; c++) {
      const seeds = result.seeds[c]!;
      seeds.forEach((team, i) => {
        tallies.playoffs[team]!++;
        tallies.seedCount[team * S + i]!++;
        tallies.reached[team * (R + 1)]!++;
      });
      // Alive teams as 0-based seed numbers, kept in seed order; the bracket reseeds every round.
      let alive = seeds.map((_, i) => i);
      for (let r = 0; r < R - 1; r++) {
        const playing = r === 0 ? alive.slice(bracket.byes) : alive;
        const next = r === 0 ? alive.slice(0, bracket.byes) : [];
        for (let i = 0; i < playing.length / 2; i++) {
          const hi = seeds[playing[i]!]!;
          const lo = seeds[playing[playing.length - 1 - i]!]!;
          const p = sigmoid(homeLogit[hi * n + lo]! + driftBetween(hi, lo, roundH[r]!));
          const won = rng.uniform(sim, Purpose.playoff, c * 16 + r * 4 + i) < p;
          next.push(won ? playing[i]! : playing[playing.length - 1 - i]!);
        }
        alive = next.sort((a, b) => a - b);
        for (const s of alive) tallies.reached[seeds[s]! * (R + 1) + r + 1]!++;
      }
      champions.push(seeds[alive[0]!]!);
    }

    // Final between the two conference champions.
    const [a, b] = champions as [number, number];
    const final = R - 1;
    const base = bracket.rounds[final]!.neutral ? neutralLogit[a * n + b]! : homeLogit[a * n + b]!;
    const pa = sigmoid(base + driftBetween(a, b, roundH[final]!));
    const champion = rng.uniform(sim, Purpose.playoff, conferences * 16) < pa ? a : b;
    tallies.reached[champion * (R + 1) + R]!++;

    const w = world.state.w;
    for (let t = 0; t < n; t++) {
      tallies.winsHist[t * (maxGames + 1) + w[t]!]!++;
      tallies.divisions[t]! += result.divisionWinner[t]!;
    }
  }
  tallies.sims = to - from;
  return tallies;
}

export function summarize(run: PreparedRun, tallies: Tallies): Omit<SimOutput, 'runtime_ms'> {
  const { evaluator, bracket, drift, maxGames, input } = run;
  const sims = tallies.sims;
  const S = bracket.seedsPerConference;
  const R = bracket.rounds.length;
  const roundNames = [...bracket.rounds.slice(1).map((r) => r.name), 'champion'];

  const teams: Record<string, TeamOdds> = {};
  evaluator.index.teamIds.forEach((id, t) => {
    const hist: Record<string, number> = {};
    let mean = 0;
    const cut = { p10: -1, p50: -1, p90: -1 };
    let cumulative = 0;
    for (let w = 0; w <= maxGames; w++) {
      const count = tallies.winsHist[t * (maxGames + 1) + w]!;
      if (count === 0) continue;
      hist[String(w)] = count / sims;
      mean += (w * count) / sims;
      cumulative += count;
      if (cut.p10 < 0 && cumulative >= 0.1 * sims) cut.p10 = w;
      if (cut.p50 < 0 && cumulative >= 0.5 * sims) cut.p50 = w;
      if (cut.p90 < 0 && cumulative >= 0.9 * sims) cut.p90 = w;
    }
    const p_round: Record<string, number> = {};
    roundNames.forEach((name, i) => {
      p_round[name] = tallies.reached[t * (R + 1) + i + 1]! / sims;
    });
    teams[id] = {
      p_playoffs: tallies.playoffs[t]! / sims,
      p_division: tallies.divisions[t]! / sims,
      p_seed: Array.from({ length: S }, (_, i) => tallies.seedCount[t * S + i]! / sims),
      p_round,
      wins: { mean, ...cut, hist },
    };
  });

  return {
    schema: 'sim-output/1',
    engine_version: ENGINE_VERSION,
    standings_version: STANDINGS_VERSION,
    rules_id: evaluator.rules.id,
    drift_id: drift.id,
    rng_id: RNG_ID,
    sims,
    seed: input.params.seed,
    teams,
    diagnostics: {
      tiebreak_draws: { count: tallies.stats.draws, by_reason: { ...tallies.stats.byReason }, by_kind: { ...tallies.stats.byKind } },
      drift_clipped: tallies.clipped,
      warnings: [...run.warnings],
    },
  };
}

/** Simulate the rest of the season and the playoffs `params.sims` times. Pure: the caller does I/O and timing. */
export function simulate(input: SimInput): Omit<SimOutput, 'runtime_ms'> {
  const run = prepareRun(input);
  return summarize(run, simulateRange(run, 0, input.params.sims));
}
