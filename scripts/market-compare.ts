// Compare a spike SimInput's odds with Kalshi futures (playoffs, division, conference, Super Bowl),
// test drift scales, and fit per-team strength offsets that make our sims match the market.
//
//   npx tsx scripts/market-compare.ts [--input=.spike/input.json] [--sims=30000]
// Writes .spike/market-compare.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { DRIFT_MODELS, prepareRun, simulateRange, summarize, type SimInput, type SimOutput } from '../packages/engine/src';
import { fitRatings } from './lib/fit';
import { nflFutures } from './lib/kalshi';

const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base: SimInput = JSON.parse(readFileSync(arg('input', '.spike/input.json'), 'utf8'));
const sims = Number(arg('sims', '30000'));
const L = (p: number) => Math.log(p / (1 - p));
const S = (x: number) => 1 / (1 + Math.exp(-x));
const clampP = (p: number) => Math.min(0.99, Math.max(0.01, p));

const teams = base.teams;
const market = await nflFutures(teams);

// ── our side ──────────────────────────────────────────────────────────────────
/**
 * Run with per-team logit offsets and a drift variance scale. Offsets apply to every remaining
 * game and the matchup matrix, or with `projectedOnly` to projected games and the matrix only.
 */
function run(delta: Map<string, number>, driftScale = 1, projectedOnly = false): SimOutput['teams'] {
  const d = (t: string) => delta.get(t) ?? 0;
  const driftId = `analysis-x${driftScale}`;
  const v2 = DRIFT_MODELS['nfl-line-drift@v2']!;
  DRIFT_MODELS[driftId] = {
    ...v2,
    id: driftId,
    team_increment_var: v2.team_increment_var.map((v) => v * driftScale),
    team_walk_var: v2.team_walk_var * driftScale,
  };
  const input: SimInput = {
    ...base,
    games: base.games.map((g) =>
      g.status === 'scheduled' && (!projectedOnly || g.p_source === 'projected') ? { ...g, p_home: S(L(g.p_home!) + d(g.home) - d(g.away)) } : g,
    ),
    matchups: {
      ...base.matchups,
      home: base.matchups.home.map((row, i) => row.map((p, j) => (p === null ? null : S(L(p) + d(base.matchups.teams[i]!) - d(base.matchups.teams[j]!))))),
      neutral: base.matchups.neutral.map((row, i) => row.map((p, j) => (p === null ? null : S(L(p) + d(base.matchups.teams[i]!) - d(base.matchups.teams[j]!))))),
    },
    params: { ...base.params, sims, seed: 'market-compare', drift: driftId },
  };
  const prepared = prepareRun(input);
  return summarize(prepared, simulateRange(prepared, 0, sims)).teams;
}

const metrics = (ours: SimOutput['teams']) => {
  const rows = teams.map((t) => ({
    team: t.id,
    po: [ours[t.id]!.p_playoffs, market.playoffs.fair.get(t.id)!],
    div: [ours[t.id]!.p_division, market.division.fair.get(t.id)!],
    conf: [ours[t.id]!.p_round.super_bowl!, market.conference.fair.get(t.id)!],
    sb: [ours[t.id]!.p_round.champion!, market.superBowl.fair.get(t.id)!],
  }));
  const mae = (k: 'po' | 'div' | 'conf' | 'sb') => rows.reduce((s, r) => s + Math.abs(r[k][0]! - r[k][1]!), 0) / rows.length;
  // Slope of logit(ours) on logit(market) over teams the market prices between 3% and 97%:
  // > 1 means we spread teams out more than the market, < 1 means we squeeze them together.
  const slope = (k: 'po' | 'div') => {
    const pts = rows.filter((r) => r[k][1]! > 0.03 && r[k][1]! < 0.97).map((r) => [L(r[k][1]!), L(clampP(r[k][0]!))] as const);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  };
  return { rows, mae: { po: mae('po'), div: mae('div'), conf: mae('conf'), sb: mae('sb') }, slope: { po: slope('po'), div: slope('div') } };
};

// 1. As-is, and with drift variance scaled.
const zero = new Map<string, number>();
const asIs = metrics(run(zero));
const driftScan = [0, 0.5, 1, 1.5, 2].map((k) => ({ scale: k, ...metrics(run(zero, k)) }));

// 2. Fit per-team offsets to the market's playoff and division odds (common random numbers make
//    successive runs comparable, so a damped fixed-point iteration converges quickly).
const delta = new Map<string, number>(teams.map((t) => [t.id, 0]));
const history: number[] = [];
for (let iter = 0; iter < 14; iter++) {
  const m = metrics(run(delta));
  history.push((m.mae.po + m.mae.div) / 2);
  for (const r of m.rows) {
    const gap = 0.5 * (L(clampP(r.po[1]!)) - L(clampP(r.po[0]!))) + 0.5 * (L(clampP(r.div[1]!)) - L(clampP(r.div[0]!)));
    delta.set(r.team, delta.get(r.team)! + 0.3 * gap);
  }
  const mean = [...delta.values()].reduce((a, b) => a + b, 0) / delta.size;
  for (const [t, v] of delta) delta.set(t, v - mean);
}
const fitted = metrics(run(delta));

// What each offset means in remaining expected wins, and team context for spotting patterns.
const context = teams.map((t) => {
  let w = 0, l = 0, tie = 0, pf = 0, pa = 0, gp = 0, dWins = 0, baseWins = 0;
  for (const g of base.games) {
    if (g.home !== t.id && g.away !== t.id) continue;
    const home = g.home === t.id;
    if (g.status === 'final') {
      const us = home ? g.home_score! : g.away_score!, them = home ? g.away_score! : g.home_score!;
      pf += us; pa += them; gp++;
      if (us > them) w++; else if (us < them) l++; else tie++;
    } else if (g.status === 'scheduled') {
      const p = home ? g.p_home! : 1 - g.p_home!;
      const opp = home ? g.away : g.home;
      baseWins += p;
      dWins += S(L(p) + delta.get(t.id)! - delta.get(opp)!) - p;
    }
  }
  return { team: t.id, record: `${w}-${l}-${tie}`, winPct: (w + tie / 2) / gp, pointDiffPerGame: (pf - pa) / gp, projectedRemainingWins: baseWins, delta: delta.get(t.id)!, deltaWins: dWins };
});
const corr = (xs: number[], ys: number[]) => {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
  return sxy / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
};
const deltas = context.map((c) => c.delta);
const correlations = {
  delta_vs_pointDiffPerGame: corr(deltas, context.map((c) => c.pointDiffPerGame)),
  delta_vs_winPct: corr(deltas, context.map((c) => c.winPct)),
  delta_vs_projectedRemainingWinRate: corr(deltas, context.map((c) => c.projectedRemainingWins)),
};

// 3. Regression to the mean? Team ratings implied by the projected games, then shrink them toward
//    average by beta on projected games and the matchup matrix only (market-line games untouched).
const projectedGames = base.games.filter((g) => g.status === 'scheduled' && g.p_source === 'projected');
const { rating, hfa } = fitRatings(projectedGames.map((g) => ({ home: g.home, away: g.away, neutral: g.neutral, p_home: g.p_home! })), teams.map((t) => t.id));
const rs = teams.map((t) => rating.get(t.id)!);
const varR = rs.reduce((s, r) => s + r * r, 0) / rs.length;
const impliedBeta = -teams.reduce((s, t, i) => s + delta.get(t.id)! * rs[i]!, 0) / rs.length / varR;
const r2 = corr(deltas, rs) ** 2;
const shrinkScan = [0, 0.1, 0.2, 0.3, 0.4].flatMap((beta) =>
  [1, 1.5].map((k) => ({ beta, drift: k, ...metrics(run(new Map(teams.map((t) => [t.id, -beta * rating.get(t.id)!])), k, true)) })),
);

const report = {
  as_of: base.as_of, sims, overround: { playoffs: market.playoffs.overround, division: market.division.overround },
  asIs: { mae: asIs.mae, slope: asIs.slope },
  driftScan: driftScan.map((d) => ({ scale: d.scale, mae: d.mae, slope: d.slope })),
  fit: { history, mae: fitted.mae, slope: fitted.slope },
  correlations,
  shrink: { hfa, impliedBeta, r2, ratingSd: Math.sqrt(varR), scan: shrinkScan.map((s) => ({ beta: s.beta, drift: s.drift, mae: s.mae, slope: s.slope })) },
  teams: teams.map((t, i) => ({ ...context[i]!, rating: rs[i]!, asIs: asIs.rows[i], fitted: fitted.rows[i] })),
};
writeFileSync('.spike/market-compare.json', JSON.stringify(report, null, 2));

const pct = (p: number) => (100 * p).toFixed(1).padStart(5);
console.log(`market overround: playoffs ${JSON.stringify(report.overround.playoffs)}  division sums ${Object.values(report.overround.division).map((x) => x.toFixed(2)).join(' ')}`);
console.log(`\nas-is MAE (pp): playoffs ${pct(asIs.mae.po)} division ${pct(asIs.mae.div)} conference ${pct(asIs.mae.conf)} SB ${pct(asIs.mae.sb)} · logit slope playoffs ${asIs.slope.po.toFixed(2)} division ${asIs.slope.div.toFixed(2)}`);
console.log('\ndrift variance scale scan (no offsets):');
for (const d of driftScan) console.log(`  x${d.scale}: MAE playoffs ${pct(d.mae.po)} division ${pct(d.mae.div)} conf ${pct(d.mae.conf)} SB ${pct(d.mae.sb)} · slope playoffs ${d.slope.po.toFixed(2)} division ${d.slope.div.toFixed(2)}`);
console.log(`\nfitted offsets: MAE history ${history.map((h) => (100 * h).toFixed(1)).join(' → ')}`);
console.log(`  after fit MAE: playoffs ${pct(fitted.mae.po)} division ${pct(fitted.mae.div)} · out of sample: conference ${pct(fitted.mae.conf)} SB ${pct(fitted.mae.sb)}`);
console.log(`  correlations: ${Object.entries(correlations).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')}`);
console.log(`\nprojected-game ratings: sd ${Math.sqrt(varR).toFixed(3)} logit, hfa ${hfa.toFixed(3)} · fitted offsets ≈ -${impliedBeta.toFixed(2)} × rating (R² ${r2.toFixed(2)})`);
for (const s of shrinkScan) console.log(`  shrink β=${s.beta} drift x${s.drift}: MAE playoffs ${pct(s.mae.po)} division ${pct(s.mae.div)} conf ${pct(s.mae.conf)} SB ${pct(s.mae.sb)} · slope playoffs ${s.slope.po.toFixed(2)} division ${s.slope.div.toFixed(2)}`);
console.log('\nteam   record  ptdiff/g | playoffs ours  mkt   Δ | division ours  mkt   Δ | conf ours mkt | offset  =wins');
for (const r of [...report.teams].sort((a, b) => b.asIs!.po[1]! - a.asIs!.po[1]!)) {
  const a = r.asIs!;
  console.log(`${r.team.slice(4).toUpperCase().padEnd(5)} ${r.record.padStart(6)} ${r.pointDiffPerGame.toFixed(1).padStart(8)} |      ${pct(a.po[0]!)} ${pct(a.po[1]!)} ${pct(a.po[0]! - a.po[1]!)} |      ${pct(a.div[0]!)} ${pct(a.div[1]!)} ${pct(a.div[0]! - a.div[1]!)} | ${pct(a.conf[0]!)} ${pct(a.conf[1]!)} | ${r.delta.toFixed(2).padStart(6)} ${r.deltaWins.toFixed(2).padStart(6)}`);
}
