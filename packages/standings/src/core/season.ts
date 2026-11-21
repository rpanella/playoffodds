import { AWAY_WIN, HOME_WIN, TIE, UNPLAYED, type GameInput, type GameStatus, type Outcome, type StandingsInput } from '../types';

/** Static structure of one league-season: teams, alignment and the regular-season schedule. */
export interface SeasonIndex {
  teamIds: string[];
  teamIndex: Map<string, number>;
  conferenceNames: string[];
  divisionNames: string[];
  confOf: Int32Array;
  divOf: Int32Array;
  confTeams: number[][];
  divTeams: number[][];
  divsOfConf: number[][];
  /** Regular-season games that count or may count (canceled games are dropped). */
  gameIds: string[];
  gameIndex: Map<string, number>;
  home: Int32Array;
  away: Int32Array;
  divisionGame: Uint8Array;
  conferenceGame: Uint8Array;
  teamGames: number[][];
}

export class InputError extends Error {}

const SEASON_TYPES: readonly string[] = ['regular', 'postseason'] satisfies GameInput['season_type'][];
const GAME_STATUSES: readonly string[] = ['final', 'scheduled', 'canceled'] satisfies GameStatus[];

export function buildSeasonIndex(input: StandingsInput, allowedConferences?: readonly string[]): SeasonIndex {
  const teamIds = input.teams.map((t) => t.id);
  const teamIndex = new Map<string, number>();
  teamIds.forEach((id, i) => {
    if (teamIndex.has(id)) throw new InputError(`duplicate team id: ${id}`);
    teamIndex.set(id, i);
  });

  const conferenceNames = [...new Set(input.teams.map((t) => t.conference))].sort();
  const divisionNames = [...new Set(input.teams.map((t) => t.division))].sort();
  if (allowedConferences) {
    for (const c of conferenceNames) {
      if (!allowedConferences.includes(c)) throw new InputError(`unknown conference: ${c}`);
    }
  }

  const n = teamIds.length;
  const confOf = new Int32Array(n);
  const divOf = new Int32Array(n);
  const confTeams: number[][] = conferenceNames.map(() => []);
  const divTeams: number[][] = divisionNames.map(() => []);
  const divConf = new Map<number, number>();
  input.teams.forEach((t, i) => {
    const c = conferenceNames.indexOf(t.conference);
    const d = divisionNames.indexOf(t.division);
    if (divConf.has(d) && divConf.get(d) !== c) {
      throw new InputError(`division ${t.division} spans more than one conference`);
    }
    divConf.set(d, c);
    confOf[i] = c;
    divOf[i] = d;
    confTeams[c]!.push(i);
    divTeams[d]!.push(i);
  });
  const divsOfConf: number[][] = conferenceNames.map(() => []);
  for (const [d, c] of [...divConf.entries()].sort((a, b) => a[0] - b[0])) divsOfConf[c]!.push(d);

  const seen = new Set<string>();
  for (const g of input.games) {
    if (typeof g.id !== 'string' || g.id === '') throw new InputError('every game needs a non-empty string id');
    if (seen.has(g.id)) throw new InputError(`duplicate game id: ${g.id}`);
    seen.add(g.id);
    // Checked before filtering, so a misspelled value fails instead of silently dropping the game.
    if (!SEASON_TYPES.includes(g.season_type)) throw new InputError(`game ${g.id}: unknown season_type ${JSON.stringify(g.season_type)}`);
    if (!GAME_STATUSES.includes(g.status)) throw new InputError(`game ${g.id}: unknown status ${JSON.stringify(g.status)}`);
  }
  const regular = input.games.filter((g) => g.season_type === 'regular' && g.status !== 'canceled');
  const gameIds: string[] = [];
  const gameIndex = new Map<string, number>();
  const home = new Int32Array(regular.length);
  const away = new Int32Array(regular.length);
  const divisionGame = new Uint8Array(regular.length);
  const conferenceGame = new Uint8Array(regular.length);
  const teamGames: number[][] = teamIds.map(() => []);
  regular.forEach((g, i) => {
    const h = teamIndex.get(g.home);
    const a = teamIndex.get(g.away);
    if (h === undefined || a === undefined) throw new InputError(`game ${g.id} references an unknown team`);
    if (h === a) throw new InputError(`game ${g.id} has the same team on both sides`);
    gameIds.push(g.id);
    gameIndex.set(g.id, i);
    home[i] = h;
    away[i] = a;
    divisionGame[i] = divOf[h] === divOf[a] ? 1 : 0;
    conferenceGame[i] = confOf[h] === confOf[a] ? 1 : 0;
    teamGames[h]!.push(i);
    teamGames[a]!.push(i);
  });

  return {
    teamIds, teamIndex, conferenceNames, divisionNames, confOf, divOf, confTeams, divTeams, divsOfConf,
    gameIds, gameIndex, home, away, divisionGame, conferenceGame, teamGames,
  };
}

/**
 * Results of one world (real or simulated) plus the aggregates every tiebreak step reads.
 * Percentages are kept in half-win units: numerator 2W + T over denominator 2G.
 */
export class SeasonState {
  readonly n: number;
  readonly result: Int8Array;
  readonly homeScore: Int16Array;
  readonly awayScore: Int16Array;
  readonly w: Int16Array;
  readonly l: Int16Array;
  readonly t: Int16Array;
  readonly dw: Int16Array;
  readonly dl: Int16Array;
  readonly dt: Int16Array;
  readonly cw: Int16Array;
  readonly cl: Int16Array;
  readonly ct: Int16Array;
  /** h2hW[a * n + b]: wins of a over b. h2hT is symmetric. */
  readonly h2hW: Int16Array;
  readonly h2hT: Int16Array;
  readonly pf: Int32Array;
  readonly pa: Int32Array;
  /** Applied games without scores (simulated). Points-based steps need this to be zero. */
  unscored = 0;

  constructor(readonly idx: SeasonIndex) {
    const n = idx.teamIds.length;
    const g = idx.gameIds.length;
    this.n = n;
    this.result = new Int8Array(g);
    this.homeScore = new Int16Array(g).fill(-1);
    this.awayScore = new Int16Array(g).fill(-1);
    this.w = new Int16Array(n);
    this.l = new Int16Array(n);
    this.t = new Int16Array(n);
    this.dw = new Int16Array(n);
    this.dl = new Int16Array(n);
    this.dt = new Int16Array(n);
    this.cw = new Int16Array(n);
    this.cl = new Int16Array(n);
    this.ct = new Int16Array(n);
    this.h2hW = new Int16Array(n * n);
    this.h2hT = new Int16Array(n * n);
    this.pf = new Int32Array(n);
    this.pa = new Int32Array(n);
  }

  copyFrom(o: SeasonState): void {
    this.result.set(o.result);
    this.homeScore.set(o.homeScore);
    this.awayScore.set(o.awayScore);
    this.w.set(o.w);
    this.l.set(o.l);
    this.t.set(o.t);
    this.dw.set(o.dw);
    this.dl.set(o.dl);
    this.dt.set(o.dt);
    this.cw.set(o.cw);
    this.cl.set(o.cl);
    this.ct.set(o.ct);
    this.h2hW.set(o.h2hW);
    this.h2hT.set(o.h2hT);
    this.pf.set(o.pf);
    this.pa.set(o.pa);
    this.unscored = o.unscored;
  }

  /** Record a result. Scores are optional; a game without them makes points-based steps unavailable. */
  apply(g: number, outcome: Outcome, homeScore?: number, awayScore?: number): void {
    if (this.result[g] !== UNPLAYED) throw new Error(`game ${this.idx.gameIds[g]} already has a result`);
    const { home, away, divisionGame, conferenceGame } = this.idx;
    const h = home[g]!;
    const a = away[g]!;
    const n = this.n;
    this.result[g] = outcome;
    if (outcome === HOME_WIN) {
      this.w[h]++; this.l[a]++; this.h2hW[h * n + a]++;
      if (divisionGame[g]) { this.dw[h]++; this.dl[a]++; }
      if (conferenceGame[g]) { this.cw[h]++; this.cl[a]++; }
    } else if (outcome === AWAY_WIN) {
      this.w[a]++; this.l[h]++; this.h2hW[a * n + h]++;
      if (divisionGame[g]) { this.dw[a]++; this.dl[h]++; }
      if (conferenceGame[g]) { this.cw[a]++; this.cl[h]++; }
    } else if (outcome === TIE) {
      this.t[h]++; this.t[a]++; this.h2hT[h * n + a]++; this.h2hT[a * n + h]++;
      if (divisionGame[g]) { this.dt[h]++; this.dt[a]++; }
      if (conferenceGame[g]) { this.ct[h]++; this.ct[a]++; }
    } else {
      throw new Error(`bad outcome ${outcome}`);
    }
    if (homeScore !== undefined && awayScore !== undefined) {
      this.homeScore[g] = homeScore;
      this.awayScore[g] = awayScore;
      this.pf[h] += homeScore; this.pa[h] += awayScore;
      this.pf[a] += awayScore; this.pa[a] += homeScore;
    } else {
      this.unscored++;
    }
  }

  get scoresComplete(): boolean {
    return this.unscored === 0;
  }

  /** Winning percentage numerator (2W + T) and denominator (2G). */
  pctNum(team: number): number {
    return 2 * this.w[team]! + this.t[team]!;
  }

  pctDen(team: number): number {
    return 2 * (this.w[team]! + this.l[team]! + this.t[team]!);
  }

  /** Points for/against in one game from `team`'s side, or null when unscored. */
  gameNet(g: number, team: number): number | null {
    const hs = this.homeScore[g]!;
    if (hs < 0) return null;
    const as = this.awayScore[g]!;
    return this.idx.home[g] === team ? hs - as : as - hs;
  }

  /** +1 win, 0 tie, -1 loss for `team` in game g; NaN when unplayed. */
  gameResultFor(g: number, team: number): number {
    const r = this.result[g];
    if (r === UNPLAYED) return NaN;
    if (r === TIE) return 0;
    const homeWon = r === HOME_WIN;
    return (this.idx.home[g] === team) === homeWon ? 1 : -1;
  }
}

export function outcomeFromScores(homeScore: number, awayScore: number): Outcome {
  if (homeScore > awayScore) return HOME_WIN;
  if (homeScore < awayScore) return AWAY_WIN;
  return TIE;
}
