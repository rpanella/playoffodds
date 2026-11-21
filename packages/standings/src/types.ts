export type GameStatus = 'final' | 'scheduled' | 'canceled';

export interface TeamInput {
  id: string;
  name?: string;
  conference: string;
  division: string;
}

export interface GameInput {
  id: string;
  week?: number;
  start?: string;
  season_type: 'regular' | 'postseason';
  home: string;
  away: string;
  neutral?: boolean;
  status: GameStatus;
  home_score?: number | null;
  away_score?: number | null;
}

/** `standings-input/1`. Extra fields (for example a simulator's probabilities) are ignored. */
export interface StandingsInput {
  schema?: string;
  league: string;
  season: number;
  /** Count only final games that started before this instant. */
  as_of?: string;
  teams: TeamInput[];
  games: GameInput[];
}

/** Per-game result codes used throughout the package. */
export const UNPLAYED = 0;
export const HOME_WIN = 1;
export const AWAY_WIN = 2;
export const TIE = 3;
export type Outcome = typeof HOME_WIN | typeof AWAY_WIN | typeof TIE;

export type TieReason = 'coin_toss' | 'no_scores' | 'no_touchdowns';

export interface UnresolvedTie {
  context: string;
  clubs: string[];
  reason: TieReason;
}

export interface TraceEntry {
  context: string;
  clubs: string[];
  step: string;
  survivors: string[];
}

export interface RecordWLT {
  w: number;
  l: number;
  t: number;
}

export interface TeamStanding {
  id: string;
  conference: string;
  division: string;
  record: RecordWLT;
  pct: number;
  division_record: RecordWLT;
  conference_record: RecordWLT;
  points_for: number;
  points_against: number;
  division_rank: number;
  conference_rank: number;
  division_winner: boolean;
  seed: number | null;
}

/** `standings-output/1`. */
export interface StandingsOutput {
  schema: 'standings-output/1';
  engine_version: string;
  rules_id: string;
  league: string;
  season: number;
  as_of: string | null;
  teams: TeamStanding[];
  /** Seeds per conference, best first. */
  seeds: Record<string, string[]>;
  /** Ties the procedure could not settle from real results (coin toss, net touchdowns). */
  unresolved: UnresolvedTie[];
  trace?: TraceEntry[];
}
