// Two candidate searches for the clinch spike (features/14 §3), plus brute force as the oracle.
import { counts, goal, type ClinchProblem, type SearchResult } from './problem';

/** Every combination of the branching games' results. For tests: 3^k grows fast. */
export function bruteForce(pr: ClinchProblem, maxGames = 14): SearchResult {
  if (pr.branch.length > maxGames) throw new Error(`brute force over ${pr.branch.length} games`);
  const p = [...pr.points];
  const y: boolean[] = new Array(p.length).fill(false);
  let nodes = 0;
  const rec = (g: number): boolean => {
    nodes++;
    if (g === pr.branch.length) {
      for (let k = 0; k < p.length; k++) y[k] = counts(pr, k, p[k]!);
      return goal(pr, y);
    }
    const [h, a] = pr.branch[g]!;
    for (const [dh, da] of OUTCOMES) {
      p[h]! += dh;
      p[a]! += da;
      const hit = rec(g + 1);
      p[h]! -= dh;
      p[a]! -= da;
      if (hit) return true;
    }
    return false;
  };
  return { found: rec(0), nodes };
}

/** Home win, away win, tie: points to [home, away]. */
const OUTCOMES: readonly (readonly [number, number])[] = [[2, 0], [0, 2], [1, 1]];

/**
 * Depth-first search over the branching games with per-team bounds. A team's final points lie between
 * its points so far and that plus 2 per undecided game. The goal is monotone, so if it fails with every
 * possible flag set as favorably as the bounds allow, the subtree is pruned; if it holds with every flag
 * as unfavorably as they allow, any completion of the subtree is a witness.
 */
export function branchAndBound(pr: ClinchProblem, deadline = Infinity): SearchResult {
  const n = pr.points.length;
  const p = [...pr.points];
  const left = new Int32Array(n);
  for (const [h, a] of pr.branch) {
    left[h]!++;
    left[a]!++;
  }
  const yLo: boolean[] = new Array(n);
  const yHi: boolean[] = new Array(n);
  const done = new Uint8Array(pr.branch.length);
  let nodes = 0;
  let gaveUp = false;
  // For a `miss` search, more flags help: optimistic = flags at max points, pessimistic = at min.
  // For a `make` search, fewer flags help: optimistic = at min, pessimistic = at max.
  const miss = pr.mode === 'miss';

  const rec = (remaining: number): boolean => {
    if (gaveUp) return false;
    if ((++nodes & 1023) === 0 && performance.now() > deadline) {
      gaveUp = true;
      return false;
    }
    let undecided = -1;
    let undecidedScore = -1;
    for (let k = 0; k < n; k++) {
      yLo[k] = counts(pr, k, p[k]!);
      yHi[k] = counts(pr, k, p[k]! + 2 * left[k]!);
    }
    if (!goal(pr, miss ? yHi : yLo)) return false; // even the best case fails
    if (goal(pr, miss ? yLo : yHi)) return true; // even the worst case works: any completion is a witness
    if (remaining === 0) return false;

    // Branch on a game with an undecided team, preferring teams with fewer games left (tighter bounds).
    for (let g = 0; g < pr.branch.length; g++) {
      if (done[g]) continue;
      const [h, a] = pr.branch[g]!;
      const open = (yLo[h] !== yHi[h] ? 1 : 0) + (yLo[a] !== yHi[a] ? 1 : 0);
      if (open === 0) continue;
      const score = open * 64 - Math.min(left[h]!, left[a]!);
      if (score > undecidedScore) {
        undecidedScore = score;
        undecided = g;
      }
    }
    if (undecided < 0) {
      // Every team's flag is settled, but the goal is between the bounds: impossible for monotone goals.
      return false;
    }
    const [h, a] = pr.branch[undecided]!;
    done[undecided] = 1;
    left[h]!--;
    left[a]!--;
    for (const [dh, da] of OUTCOMES) {
      p[h]! += dh;
      p[a]! += da;
      const hit = rec(remaining - 1);
      p[h]! -= dh;
      p[a]! -= da;
      if (hit) {
        done[undecided] = 0;
        left[h]!++;
        left[a]!++;
        return true;
      }
    }
    done[undecided] = 0;
    left[h]!++;
    left[a]!++;
    return false;
  };

  const found = rec(pr.branch.length);
  return { found: gaveUp ? null : found, nodes };
}

/** The HiGHS loader's solver, for `integerProgram`. */
export interface LpSolver {
  solve(lp: string, options?: Record<string, unknown>): { Status: string };
}

/**
 * The same question as a feasibility integer program in CPLEX LP format: one binary per game outcome,
 * one per contender ("counts against the team"), one per division ("has a team that counts").
 */
export function integerProgram(pr: ClinchProblem, highs: LpSolver, timeLimitSeconds = 5): SearchResult {
  const lp = toLp(pr);
  const status = highs.solve(lp, { time_limit: timeLimitSeconds, output_flag: false }).Status;
  if (status === 'Optimal') return { found: true, nodes: 0 };
  if (status === 'Infeasible') return { found: false, nodes: 0 };
  return { found: null, nodes: 0 };
}

export function toLp(pr: ClinchProblem): string {
  const n = pr.points.length;
  const rows: string[] = [];
  const binaries: string[] = [];
  // Points each contender gains from branching games, as linear terms.
  const terms: string[][] = Array.from({ length: n }, () => []);
  pr.branch.forEach(([h, a], g) => {
    binaries.push(`h${g}`, `a${g}`, `t${g}`);
    rows.push(`g${g}: h${g} + a${g} + t${g} = 1`);
    terms[h]!.push(`2 h${g}`, `1 t${g}`);
    terms[a]!.push(`2 a${g}`, `1 t${g}`);
  });

  const sum = (vars: string[]) => (vars.length ? vars.join(' + ') : '0 h_none');
  for (let k = 0; k < n; k++) {
    binaries.push(`y${k}`);
    // Compare final percentages: points_k / games_k against the team's, cross-multiplied.
    const scaled = terms[k]!.map((t) => t.replace(/^(\d+) /, (_, c) => `${Number(c) * pr.teamGames} `));
    const base = pr.points[k]! * pr.teamGames - pr.teamPoints * pr.games[k]!; // value with no branching points
    const m = 2 * terms[k]!.length * pr.teamGames + Math.abs(base) + 1;
    if (pr.mode === 'miss') {
      // y = 1 only if level or better: base + scaled - m(1 - y) >= 0.
      rows.push(`c${k}: ${[...scaled, `-${m} y${k}`].join(' + ').replace(/\+ -/g, '- ')} >= ${-base - m}`);
    } else {
      // y = 0 only if not strictly better: base + scaled - m y <= 0.
      rows.push(`c${k}: ${[...scaled, `-${m} y${k}`].join(' + ').replace(/\+ -/g, '- ')} <= ${-base}`);
    }
  }
  const all = Array.from({ length: n }, (_, k) => `y${k}`);
  const rivals = all.filter((_, k) => pr.rival[k]);
  for (let d = 0; d < pr.divisions; d++) binaries.push(`w${d}`);
  const inDivision = (d: number) => all.filter((_, k) => pr.division[k] === d);
  const wildCardTerms = [...all, ...Array.from({ length: pr.divisions }, (_, d) => `-1 w${d}`)].join(' + ').replace(/\+ -1 /g, '- ');

  if (pr.mode === 'miss') {
    if (pr.target === 'division') rows.push(`goal: ${sum(rivals)} >= 1`);
    else if (pr.target === 'top_seed') rows.push(`goal: ${sum(all)} >= 1`);
    else {
      rows.push(`rival: ${sum(rivals)} >= 1`);
      for (let d = 0; d < pr.divisions; d++) for (const y of inDivision(d)) rows.push(`wd${d}${y}: w${d} - ${y} >= 0`);
      rows.push(`goal: ${wildCardTerms} >= ${pr.wildCards}`);
    }
  } else if (pr.target === 'division') {
    rows.push(`goal: ${sum(rivals)} <= 0`);
  } else if (pr.target === 'top_seed') {
    rows.push(`goal: ${sum(all)} <= 0`);
  } else {
    // In unless a rival is above (then it isn't the division winner) and enough teams outrank it for a wild card.
    binaries.push('u');
    const big = n + 1;
    for (let d = 0; d < pr.divisions; d++) rows.push(`wd${d}: w${d} - ${sum(inDivision(d)).replace(/ \+ /g, ' - ')} <= 0`);
    rows.push(`rival: ${sum(rivals)} - ${big} u <= 0`);
    rows.push(`goal: ${wildCardTerms} + ${big} u <= ${pr.wildCards - 1 + big}`);
  }

  return ['Minimize', ' obj: 0 h_none', 'Subject To', ...rows.map((r) => ` ${r}`), 'Bounds', ' h_none = 0', 'Binary', ` ${binaries.join(' ')}`, 'End', ''].join('\n');
}
