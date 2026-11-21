// Probe how SportsCrunch's projections treat a team whose starter is out but expected back:
//   1. the team's model rating (fitted to the projected games) and its market lines at weekly instants;
//   2. sims with the pre-injury rating restored on projected games from a return week, against Kalshi;
//   3. every team's expected season wins against Kalshi's win-total ladders, as a per-team offset.
//
//   npx tsx scripts/injury-probe.ts [--team=bal] [--from=2026-09-08] [--before=2026-09-29] [--sims=30000] [--env-file=path]
// Reads the spike snapshot (.spike/input.json); writes .spike/injury-probe.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { prepareRun, simulateRange, summarize, type SimInput, type SimOutput } from '../packages/engine/src';
import { fitRatings } from './lib/fit';
import { nflFutures, nflSeasonWins, winMoments } from './lib/kalshi';
import { arg, get, isoSeconds, type ScGame, type ScOdds, type ScSeason, type ScTeam } from './lib/sportscrunch';

const base: SimInput = JSON.parse(readFileSync(arg('input', '.spike/input.json'), 'utf8'));
const team = `nfl-${arg('team', 'bal')}`;
const sims = Number(arg('sims', '30000'));
const L = (p: number) => Math.log(p / (1 - p));
const S = (x: number) => 1 / (1 + Math.exp(-x));
const teams = base.teams;
const ids = teams.map((t) => t.id);
const upper = (id: string) => id.slice(4).toUpperCase();

// ── 1. Rating history ─────────────────────────────────────────────────────────
// At each instant: fit ratings to the projected games (the model's view), then compare the team's
// market-priced games with that fit. Model rating + mean residual = what the market lines say.
const season = (await get<ScSeason[]>('/seasons?league=nfl')).find((s) => s.year === base.season);
if (!season) throw new Error(`no NFL ${base.season} season`);
const [scTeams, scGames] = await Promise.all([get<ScTeam[]>(`/seasons/${season.id}/teams`), get<ScGame[]>(`/seasons/${season.id}/games`)]);
const key = new Map(scTeams.map((t) => [t.id, `nfl-${t.shortname.toLowerCase()}`]));
const regular = scGames.filter((g) => g.season_type === 'regular' && g.status !== 'canceled');

const instants: Date[] = [];
for (let d = new Date(`${arg('from', '2026-09-08')}T16:00:00Z`); d < new Date(base.as_of); d = new Date(d.getTime() + 7 * 86_400_000)) instants.push(d);
instants.push(new Date(base.as_of));

const history = [];
for (const at of instants) {
  const odds = new Map((await get<ScOdds[]>(`/seasons/${season.id}/historical-odds?at=${encodeURIComponent(isoSeconds(at))}`)).map((o) => [o.id, o]));
  const open = regular
    .filter((g) => new Date(g.start_time) > at && odds.get(g.id)?.home_win_probability != null)
    .map((g) => ({
      week: g.week!, home: key.get(g.home_team.id)!, away: key.get(g.away_team.id)!, neutral: !!g.neutral_location,
      p_home: odds.get(g.id)!.home_win_probability!, projected: odds.get(g.id)!.is_projected,
    }));
  // Early on, look-ahead lines can cover every game, leaving nothing projected to fit.
  if (!open.some((g) => g.projected && (g.home === team || g.away === team))) {
    console.log(`  ${isoSeconds(at).slice(0, 10)}: no projected ${upper(team)} games (all lined), skipped`);
    continue;
  }
  const { rating, hfa } = fitRatings(open.filter((g) => g.projected), ids);
  const lines = open
    .filter((g) => !g.projected && (g.home === team || g.away === team))
    .map((g) => {
      const residual = L(g.p_home) - (rating.get(g.home)! - rating.get(g.away)! + (g.neutral ? 0 : hfa));
      const home = g.home === team;
      return { week: g.week, opponent: upper(home ? g.away : g.home), home, p_win: home ? g.p_home : 1 - g.p_home, residual: home ? residual : -residual };
    });
  const r = rating.get(team)!;
  const meanResidual = lines.length ? lines.reduce((s, x) => s + x.residual, 0) / lines.length : 0;
  history.push({
    at: isoSeconds(at), rating: r, rank: 1 + ids.filter((t) => rating.get(t)! > r).length,
    marketRating: r + meanResidual, lines,
  });
}

// Pre-injury instant: given, or the one before the largest one-week drop in what the market lines say.
const beforeArg = arg('before', '');
let pre = 0;
if (beforeArg) pre = Math.max(0, history.filter((h) => h.at < beforeArg).length - 1);
else {
  let drop = 0;
  for (let i = 1; i < history.length; i++) {
    const d = history[i - 1]!.marketRating - history[i]!.marketRating;
    if (d > drop) { drop = d; pre = i - 1; }
  }
}
const now = history.at(-1)!;
const boost = history[pre]!.rating - now.rating;

// ── 2. Restore the rating from a return week ──────────────────────────────────
function run(fromWeek: number | null): SimOutput['teams'] {
  const d = (t: string) => (fromWeek !== null && t === team ? boost : 0);
  const shift = (p: number, home: string, away: string) => S(L(p) + d(home) - d(away));
  const input: SimInput = {
    ...base,
    games: base.games.map((g) =>
      g.status === 'scheduled' && g.p_source === 'projected' && fromWeek !== null && g.week! >= fromWeek ? { ...g, p_home: shift(g.p_home!, g.home, g.away) } : g,
    ),
    matchups: {
      ...base.matchups,
      home: base.matchups.home.map((row, i) => row.map((p, j) => (p === null ? null : shift(p, base.matchups.teams[i]!, base.matchups.teams[j]!)))),
      neutral: base.matchups.neutral.map((row, i) => row.map((p, j) => (p === null ? null : shift(p, base.matchups.teams[i]!, base.matchups.teams[j]!)))),
    },
    params: { ...base.params, sims, seed: 'injury-probe' },
  };
  const prepared = prepareRun(input);
  return summarize(prepared, simulateRange(prepared, 0, sims)).teams;
}

const currentWins = new Map(ids.map((t) => [t, 0]));
for (const g of base.games) {
  if (g.status !== 'final' || g.home_score === g.away_score) continue;
  const winner = g.home_score! > g.away_score! ? g.home : g.away;
  currentWins.set(winner, currentWins.get(winner)! + 1);
}
const [futures, ladders] = await Promise.all([nflFutures(teams), nflSeasonWins(currentWins)]);
const marketWins = new Map([...ladders].map(([t, atLeast]) => [t, winMoments(atLeast)]));
const division = teams.find((t) => t.id === team)!.division;
const focus = teams.filter((t) => t.division === division).map((t) => t.id);
const mae = (ours: SimOutput['teams'], k: 'p_playoffs' | 'p_division') =>
  ids.reduce((s, t) => s + Math.abs(ours[t]![k] - (k === 'p_playoffs' ? futures.playoffs : futures.division).fair.get(t)!), 0) / ids.length;
const firstProjectedWeek = Math.min(...base.games.filter((g) => g.p_source === 'projected').map((g) => g.week!));
const scenarios = [null, firstProjectedWeek, firstProjectedWeek + 1, firstProjectedWeek + 2].map((fromWeek) => {
  const ours = run(fromWeek);
  return {
    fromWeek,
    mae: { playoffs: mae(ours, 'p_playoffs'), division: mae(ours, 'p_division') },
    teams: Object.fromEntries(focus.map((t) => [t, { wins: ours[t]!.wins.mean, playoffs: ours[t]!.p_playoffs, division: ours[t]!.p_division }])),
    all: ours,
  };
});

// ── 3. Season wins vs Kalshi, as implied per-team offsets on the remaining games ───────────────────
// Solve for offsets δ so Σ S(logit p + δ_team − δ_opp) over remaining games matches the market's
// expected remaining wins (market total scaled to the number of games first).
const remaining = base.games.filter((g) => g.status === 'scheduled');
const target = new Map(ids.map((t) => [t, marketWins.get(t)!.mean - currentWins.get(t)!]));
const excess = ([...target.values()].reduce((a, b) => a + b, 0) - remaining.length) / ids.length;
for (const t of ids) target.set(t, target.get(t)! - excess);
const winsOffset = new Map(ids.map((t) => [t, 0]));
for (let iter = 0; iter < 300; iter++) {
  const expected = new Map(ids.map((t) => [t, 0])), info = new Map(ids.map((t) => [t, 0]));
  for (const g of remaining) {
    const p = S(L(g.p_home!) + winsOffset.get(g.home)! - winsOffset.get(g.away)!);
    expected.set(g.home, expected.get(g.home)! + p);
    expected.set(g.away, expected.get(g.away)! + 1 - p);
    info.set(g.home, info.get(g.home)! + p * (1 - p));
    info.set(g.away, info.get(g.away)! + p * (1 - p));
  }
  for (const t of ids) winsOffset.set(t, winsOffset.get(t)! + 0.5 * (target.get(t)! - expected.get(t)!) / info.get(t)!);
  const mean = [...winsOffset.values()].reduce((a, b) => a + b, 0) / ids.length;
  for (const t of ids) winsOffset.set(t, winsOffset.get(t)! - mean);
}
const asIs = scenarios[0]!.all;
const sdOf = (hist: Record<string, number>, mean: number) => Math.sqrt(Object.entries(hist).reduce((s, [w, p]) => s + p * Number(w) ** 2, 0) - mean * mean);
const winsRows = ids.map((t) => ({
  team: t, record: currentWins.get(t)!, ours: asIs[t]!.wins.mean, market: marketWins.get(t)!.mean, offset: winsOffset.get(t)!,
  oursSd: sdOf(asIs[t]!.wins.hist, asIs[t]!.wins.mean), marketSd: marketWins.get(t)!.sd,
}));
// Same signal as the futures fit? (market-compare's per-team offsets, if that report exists)
let futuresCorr: number | null = null;
if (existsSync('.spike/market-compare.json')) {
  const report = JSON.parse(readFileSync('.spike/market-compare.json', 'utf8')) as { teams: { team: string; delta: number }[] };
  const fut = new Map(report.teams.map((x) => [x.team, x.delta]));
  const xs = ids.map((t) => winsOffset.get(t)!), ys = ids.map((t) => fut.get(t)!);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  futuresCorr = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) /
    Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
}

writeFileSync('.spike/injury-probe.json', JSON.stringify({
  as_of: base.as_of, team, sims, history, pre: history[pre]!.at, boost,
  scenarios: scenarios.map(({ all, ...s }) => s), wins: winsRows, winsVsFuturesOffsetCorr: futuresCorr,
}, null, 2));

// ── report ────────────────────────────────────────────────────────────────────
const pct = (p: number) => (100 * p).toFixed(1).padStart(5);
const sgn = (x: number, d = 2) => (x >= 0 ? '+' : '') + x.toFixed(d);
console.log(`${upper(team)} model rating (projected games) and what its market lines say, logit vs league average:`);
for (const h of history) {
  console.log(`  ${h.at.slice(0, 10)}  model ${sgn(h.rating)} (#${String(h.rank).padStart(2)})  lines ${h.lines.length ? sgn(h.marketRating) : '  —  '}  ${h.lines.map((x) => `wk${x.week} ${x.home ? 'vs' : '@'} ${x.opponent} ${pct(x.p_win)}% (${sgn(x.residual)})`).join(' · ')}`);
}
console.log(`\npre-injury instant ${history[pre]!.at.slice(0, 10)}: restoring adds ${sgn(boost)} logit to ${upper(team)} on projected games from the return week and in the playoff matrix`);
console.log(`\n${'return week'.padEnd(12)} ${focus.map((t) => `${upper(t).padEnd(4)} wins  po%  div%`.padEnd(22)).join(' ')} | MAE playoffs division`);
for (const s of scenarios) {
  console.log(`${(s.fromWeek === null ? 'as is' : `from wk ${s.fromWeek}`).padEnd(12)} ${focus.map((t) => `${upper(t).padEnd(4)} ${s.teams[t]!.wins.toFixed(1).padStart(4)} ${pct(s.teams[t]!.playoffs)} ${pct(s.teams[t]!.division)}`.padEnd(22)).join(' ')} | ${pct(s.mae.playoffs)} ${pct(s.mae.division)}`);
}
console.log(`${'Kalshi'.padEnd(12)} ${focus.map((t) => `${upper(t).padEnd(4)} ${marketWins.get(t)!.mean.toFixed(1).padStart(4)} ${pct(futures.playoffs.fair.get(t)!)} ${pct(futures.division.fair.get(t)!)}`.padEnd(22)).join(' ')}`);
console.log(`\nseason wins, ours (sim mean) vs Kalshi ladders, and the offset on remaining games that matches the market (sum excess ${excess.toFixed(2)}/team removed):`);
for (const r of [...winsRows].sort((a, b) => b.offset - a.offset)) {
  console.log(`  ${upper(r.team).padEnd(4)} ${String(r.record).padStart(2)} W  ours ${r.ours.toFixed(1).padStart(4)} ±${r.oursSd.toFixed(2)}  market ${r.market.toFixed(1).padStart(4)} ±${r.marketSd.toFixed(2)}  Δ ${sgn(r.ours - r.market, 1).padStart(5)}  offset ${sgn(r.offset)}`);
}
const absMean = winsRows.reduce((s, r) => s + Math.abs(r.ours - r.market), 0) / winsRows.length;
const sdRatio = winsRows.reduce((s, r) => s + r.marketSd / r.oursSd, 0) / winsRows.length;
console.log(`  mean |Δ wins| ${absMean.toFixed(2)} · market sd / ours sd ${sdRatio.toFixed(2)} on average · corr(wins offset, futures offset) ${futuresCorr === null ? 'n/a' : futuresCorr.toFixed(2)}`);
