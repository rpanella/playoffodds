import type { GameInput, TeamInput } from '@playoffodds/standings';

export interface SimGame extends GameInput {
  /** Home win probability for an unplayed game (SportsCrunch). */
  p_home?: number;
  p_source?: 'market' | 'projected';
}

export interface Matchups {
  source: string;
  as_of?: string;
  teams: string[];
  /** home[i][j]: probability that teams[i] beats teams[j] at teams[i]'s home. Diagonal is null. */
  home: (number | null)[][];
  /** neutral[i][j]: probability that teams[i] beats teams[j] at a neutral site. */
  neutral: (number | null)[][];
}

/** `sim-input/1` (01 §2). */
export interface SimInput {
  schema: 'sim-input/1';
  league: string;
  season: number;
  as_of: string;
  /** The week of the next unplayed games; their drift horizon is 0. */
  current_week: number;
  teams: TeamInput[];
  games: SimGame[];
  matchups: Matchups;
  postseason: { state: 'not_started' };
  params: {
    sims: number;
    seed: string;
    tie_rate: number;
    drift: string;
  };
}

export interface TeamOdds {
  p_playoffs: number;
  p_division: number;
  /** One entry per seed, seed 1 first; sums to p_playoffs. */
  p_seed: number[];
  p_round: Record<string, number>;
  wins: { mean: number; p10: number; p50: number; p90: number; hist: Record<string, number> };
}

/** `sim-output/1` (01 §6). */
export interface SimOutput {
  schema: 'sim-output/1';
  engine_version: string;
  /** Version of the bundled @playoffodds/standings package; with rules_id it pins the tiebreak behavior. */
  standings_version: string;
  rules_id: string;
  drift_id: string;
  rng_id: string;
  sims: number;
  seed: string;
  runtime_ms: number;
  teams: Record<string, TeamOdds>;
  diagnostics: {
    tiebreak_draws: { count: number; by_reason: Record<string, number>; by_kind: Record<string, number> };
    drift_clipped: number;
    warnings: string[];
  };
}
