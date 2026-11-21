// Clinch and elimination as a search over the remaining games (features/14 §3), with conservative
// tiebreaks: proving a clinch, every percentage tie involving the team goes against it and ties among
// others go however hurts it; proving elimination, all of that goes its way. A clinched or eliminated
// result is therefore always true under the real tiebreakers; it may only come later than the league's.
//
// The search looks for a witness:
// - "clinched?" searches for a completion in which the team misses the target (`miss`); none means clinched.
// - "eliminated?" searches for a completion in which it reaches the target (`make`); none means eliminated.
//
// Before searching, dominance fixes most games. Both conditions are monotone in the other teams' points,
// so in a `miss` search the team loses all its remaining games and every contender beats every
// non-contender, and in a `make` search the reverse. Only games between two contenders branch.

import type { RulesModule } from '../core/rules';
import type { SeasonIndex, SeasonState } from '../core/season';

export type ClinchTarget = 'playoffs' | 'division' | 'top_seed';
export type ClinchQuestion = 'clinched' | 'eliminated';
export const CLINCH_TARGETS: readonly ClinchTarget[] = ['playoffs', 'division', 'top_seed'];

/** The search core after dominance fixing. Contenders are indexed locally 0..n-1. */
export interface ClinchProblem {
  target: ClinchTarget;
  /** `miss`: is there a completion where the team misses? `make`: one where it gets in? */
  mode: 'miss' | 'make';
  wildCards: number;
  /** The team's final points (2 per win, 1 per tie) and games, fixed by dominance. */
  teamPoints: number;
  teamGames: number;
  /** Per contender: points fixed so far (before branching games), total games, local division, same division as the team. */
  points: number[];
  games: number[];
  division: number[];
  rival: boolean[];
  divisions: number;
  /** Games between two contenders: [home, away] in local indices. Each ends home win, away win or tie. */
  branch: [number, number][];
  /** Season team index of each contender, for witnesses and debugging. */
  teams: number[];
}

/**
 * @param winsOut  Fix the team's remaining games as wins instead of the dominant choice, for "controls its own
 *                 destiny" (a clinch search in which the team wins every remaining game).
 */
export function buildProblem(
  idx: SeasonIndex,
  s: SeasonState,
  rules: RulesModule,
  team: number,
  target: ClinchTarget,
  question: ClinchQuestion,
  winsOut = false,
): ClinchProblem {
  const mode = question === 'clinched' ? 'miss' : 'make';
  const points = (i: number) => 2 * s.w[i]! + s.t[i]!;
  const gamesOf = (i: number) => idx.teamGames[i]!.length;
  const unplayed = (i: number) => idx.teamGames[i]!.filter((g) => s.result[g] === 0);
  const other = (g: number, i: number) => (idx.home[g] === i ? idx.away[g]! : idx.home[g]!);

  // The team's own remaining games: lost in a `miss` search, won in a `make` search (or won, for `winsOut`).
  let teamPoints = points(team);
  const fromTeam = new Map<number, number>();
  for (const g of unplayed(team)) {
    if (mode === 'make' || winsOut) teamPoints += 2;
    else fromTeam.set(other(g, team), (fromTeam.get(other(g, team)) ?? 0) + 2);
  }
  const teamGames = gamesOf(team);

  // Who can matter: conference teams (only division rivals for the division title) that can reach the
  // threshold: level or better in a `miss` search, strictly better in a `make` search.
  const conf = idx.confOf[team]!;
  const candidates = idx.confTeams[conf]!.filter((i) => i !== team && (target !== 'division' || idx.divOf[i] === idx.divOf[team]));
  const contender = new Set<number>();
  for (const i of candidates) {
    const max = points(i) + (fromTeam.get(i) ?? 0) + 2 * unplayed(i).filter((g) => other(g, i) !== team).length;
    const lhs = max * teamGames;
    const rhs = teamPoints * gamesOf(i);
    if (mode === 'miss' ? lhs >= rhs : lhs > rhs) contender.add(i);
  }

  const teams = [...contender];
  const local = new Map(teams.map((t, k) => [t, k]));
  const divIds = [...new Set(teams.map((t) => idx.divOf[t]!))];
  const fixed = teams.map((i) => points(i) + (fromTeam.get(i) ?? 0));
  const branch: [number, number][] = [];
  teams.forEach((i, k) => {
    for (const g of unplayed(i)) {
      const o = other(g, i);
      if (o === team) continue;
      const ko = local.get(o);
      if (ko === undefined) {
        if (mode === 'miss') fixed[k]! += 2; // beats a team that can't matter
      } else if (idx.home[g] === i) {
        branch.push([k, ko]); // each contender game once, from its home side
      }
    }
  });

  return {
    target,
    mode,
    wildCards: rules.format.wildCards,
    teamPoints,
    teamGames,
    points: fixed,
    games: teams.map(gamesOf),
    division: teams.map((t) => divIds.indexOf(idx.divOf[t]!)),
    rival: teams.map((t) => idx.divOf[t] === idx.divOf[team]),
    divisions: divIds.length,
    branch,
    teams,
  };
}

/** Whether contender `k` with final points `p` counts against the team: level or better (`miss`), strictly better (`make`). */
export function counts(pr: ClinchProblem, k: number, p: number): boolean {
  const lhs = p * pr.teamGames;
  const rhs = pr.teamPoints * pr.games[k]!;
  return pr.mode === 'miss' ? lhs >= rhs : lhs > rhs;
}

/**
 * Whether flags `y` (contenders counting against the team) satisfy the search's goal. Monotone: more flags
 * can only help a `miss` search and only hurt a `make` search.
 */
export function goal(pr: ClinchProblem, y: ArrayLike<boolean>): boolean {
  let rivals = 0;
  let total = 0;
  const perDivision = new Int32Array(pr.divisions);
  for (let k = 0; k < pr.points.length; k++) {
    if (!y[k]) continue;
    total++;
    perDivision[pr.division[k]!]!++;
    if (pr.rival[k]) rivals++;
  }
  // Teams that count, minus one division winner from each division that has any.
  let aboveAsWildCards = total;
  for (const n of perDivision) if (n > 0) aboveAsWildCards--;

  if (pr.mode === 'miss') {
    if (pr.target === 'division') return rivals > 0;
    if (pr.target === 'top_seed') return total > 0;
    return rivals > 0 && aboveAsWildCards >= pr.wildCards;
  }
  if (pr.target === 'division') return rivals === 0;
  if (pr.target === 'top_seed') return total === 0;
  return rivals === 0 || aboveAsWildCards <= pr.wildCards - 1;
}

/** A solver's answer: whether a witness exists, or null when it gave up (time limit). */
export interface SearchResult {
  found: boolean | null;
  nodes: number;
}
