// Fit logit(p_home) = r_home − r_away + hfa (no hfa at neutral sites) to a set of game
// probabilities: one strength per team, centered on zero, in logit units.
//
// Least squares with a tiny ridge, solved directly. The ridge only matters where the games leave
// ratings undetermined: when the games split into groups that never play each other (week 18
// alone, for example), each group is centered on zero instead of floating to wherever an
// iterative solver happened to stop. `components` reports how many such groups there are.

export interface FitGame { home: string; away: string; neutral?: boolean; p_home: number }

const RIDGE = 1e-6;

export function fitRatings(games: FitGame[], teamIds: string[]): { rating: Map<string, number>; hfa: number; components: number } {
  const n = teamIds.length;
  const index = new Map(teamIds.map((t, i) => [t, i]));
  const m = n + 1; // ratings, then hfa
  const A = Array.from({ length: m }, () => new Float64Array(m));
  const b = new Float64Array(m);
  const parent = teamIds.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const g of games) {
    const h = index.get(g.home), a = index.get(g.away);
    if (h === undefined || a === undefined) throw new Error(`fitRatings: unknown team in ${g.away} at ${g.home}`);
    if (!(g.p_home > 0 && g.p_home < 1)) throw new Error(`fitRatings: p_home ${g.p_home} for ${g.away} at ${g.home} is not in (0, 1)`);
    const y = Math.log(g.p_home / (1 - g.p_home));
    const x: [number, number][] = [[h, 1], [a, -1]];
    if (!g.neutral) x.push([n, 1]);
    for (const [i, xi] of x) {
      b[i]! += xi * y;
      for (const [j, xj] of x) A[i]![j]! += xi * xj;
    }
    parent[find(h)] = find(a);
  }
  for (let i = 0; i < m; i++) A[i]![i]! += RIDGE;
  const x = solve(A, b);
  const mean = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  return {
    rating: new Map(teamIds.map((t, i) => [t, x[i]! - mean])),
    hfa: x[n]!,
    components: new Set(teamIds.map((_, i) => find(i))).size,
  };
}

/** Gaussian elimination with partial pivoting; A is symmetric positive definite here. */
function solve(A: Float64Array[], b: Float64Array): Float64Array {
  const m = b.length;
  const M = A.map((row, i) => Float64Array.from([...row, b[i]!]));
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < m; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f !== 0) for (let k = c; k <= m; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = M[r]![m]!;
    for (let k = r + 1; k < m; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}
