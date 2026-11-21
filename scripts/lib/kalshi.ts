// Kalshi public market data for the analysis scripts: NFL futures (overround removed) and season
// win-total ladders. No auth needed.
import type { TeamInput } from '../../packages/standings/src';

const L = (p: number) => Math.log(p / (1 - p));
const S = (x: number) => 1 / (1 + Math.exp(-x));

interface KMarket { ticker: string; yes_bid_dollars: string; yes_ask_dollars: string; last_price_dollars: string }
async function markets(series: string): Promise<KMarket[]> {
  const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=${series}&status=open&limit=1000`);
  if (!res.ok) throw new Error(`Kalshi ${series}: ${res.status}`);
  return ((await res.json()) as { markets: KMarket[] }).markets;
}
// Kalshi uses LAR and LAC (a bare LA would be ambiguous), WAS and JAC.
const CODE: Record<string, string> = { WAS: 'wsh', JAC: 'jax' };
const teamId = (code: string) => `nfl-${CODE[code] ?? code.toLowerCase()}`;
/** Mid of bid/ask when the spread is tight, else the last trade. */
function price(m: KMarket): number {
  const bid = Number(m.yes_bid_dollars), ask = Number(m.yes_ask_dollars), last = Number(m.last_price_dollars);
  const p = ask > 0 && ask - bid <= 0.05 ? (bid + ask) / 2 : last;
  return Math.max(0.003, Math.min(0.997, p));
}
/** Remove the overround: shift all logits in a group equally so the group sums to `total`. */
function devig(raw: Map<string, number>, total: number): Map<string, number> {
  let lo = -5, hi = 5;
  for (let i = 0; i < 60; i++) {
    const c = (lo + hi) / 2;
    const sum = [...raw.values()].reduce((s, p) => s + S(L(p) + c), 0);
    if (sum > total) hi = c; else lo = c;
  }
  return new Map([...raw].map(([t, p]) => [t, S(L(p) + (lo + hi) / 2)]));
}

async function group(teams: TeamInput[], series: string[], groupBy: (team: string) => string, total: number, requireAll = true) {
  const raw = new Map<string, number>();
  const sums = new Map<string, number>();
  for (const s of series) for (const m of await markets(s)) raw.set(teamId(m.ticker.split('-').pop()!), price(m));
  for (const t of teams) {
    if (raw.has(t.id)) continue;
    // Title markets skip extreme longshots; price them at the floor.
    if (requireAll) throw new Error(`no Kalshi price for ${t.id} in ${series.join(',')}`);
    raw.set(t.id, 0.003);
  }
  const fair = new Map<string, number>();
  for (const g of new Set(teams.map((t) => groupBy(t.id)))) {
    const members = new Map([...raw].filter(([t]) => groupBy(t) === g));
    sums.set(g, [...members.values()].reduce((a, b) => a + b, 0));
    for (const [t, p] of devig(members, total)) fair.set(t, p);
  }
  return { fair, overround: Object.fromEntries(sums) };
}

/** Playoff, division, conference and Super Bowl futures, each group de-vigged to its total. */
export async function nflFutures(teams: TeamInput[]) {
  const conf = new Map(teams.map((t) => [t.id, t.conference]));
  const div = new Map(teams.map((t) => [t.id, t.division]));
  const divisions = ['AFCEAST', 'AFCNORTH', 'AFCSOUTH', 'AFCWEST', 'NFCEAST', 'NFCNORTH', 'NFCSOUTH', 'NFCWEST'].map((d) => `KXNFL${d}`);
  return {
    playoffs: await group(teams, ['KXNFLPLAYOFF'], (t) => conf.get(t)!, 7),
    division: await group(teams, divisions, (t) => div.get(t)!, 1),
    conference: await group(teams, ['KXNFLAFCCHAMP', 'KXNFLNFCCHAMP'], (t) => conf.get(t)!, 1, false),
    superBowl: await group(teams, ['KXSB'], () => 'all', 1, false),
  };
}

/** Market season-win distribution per team from the KXNFLWINS "k+ wins" ladders (see `ladderAtLeast`). */
export async function nflSeasonWins(currentWins: Map<string, number>): Promise<Map<string, number[]>> {
  const ladders = new Map<string, Map<number, number>>();
  for (const m of await markets('KXNFLWINS')) {
    const [, teamPart, k] = m.ticker.split('-');                 // KXNFLWINS-27BAL-11
    const team = teamId(teamPart!.replace(/^\d+/, ''));
    if (!ladders.has(team)) ladders.set(team, new Map());
    // One-sided quotes at the ends of a ladder (0/4¢, 95¢/1.00) are tick-size bounds, not prices:
    // take a quarter of the way in from the boundary instead of the mid.
    const bid = Number(m.yes_bid_dollars), ask = Number(m.yes_ask_dollars);
    ladders.get(team)!.set(Number(k), bid <= 0 ? ask / 4 : ask >= 0.995 ? 1 - (1 - bid) / 4 : price(m));
  }
  return new Map([...ladders].map(([team, rungs]) => [team, ladderAtLeast(rungs, currentWins.get(team) ?? 0)]));
}

/**
 * [P(W ≥ 0), P(W ≥ 1), …, P(W ≥ maxWins)] from priced "k+ wins" rungs: P = 1 for wins already banked
 * and below the lowest rung, 0 above the top rung, a missing rung inside the ladder interpolated
 * linearly between its neighbours (as SportsCrunch's port does), and each rung at most the one below.
 * E[W] = Σ_{k≥1} P(W ≥ k).
 */
export function ladderAtLeast(rungs: Map<number, number>, have: number, maxWins = 17): number[] {
  const ks = [...rungs.keys()].filter((k) => k >= 1 && k <= maxWins).sort((a, b) => a - b);
  if (ks.length === 0) throw new Error('ladderAtLeast: no rungs');
  const priceAt = (k: number): number => {
    if (rungs.has(k)) return rungs.get(k)!;
    const below = ks.filter((x) => x < k).at(-1)!, above = ks.find((x) => x > k)!;
    return rungs.get(below)! + ((k - below) / (above - below)) * (rungs.get(above)! - rungs.get(below)!);
  };
  const atLeast = [1];
  for (let k = 1; k <= maxWins; k++) {
    atLeast.push(k <= have || k < ks[0]! ? 1 : k > ks.at(-1)! ? 0 : Math.min(atLeast[k - 1]!, priceAt(k)));
  }
  return atLeast;
}

/** Mean and standard deviation of a win distribution given as P(W ≥ k). */
export function winMoments(atLeast: number[]): { mean: number; sd: number } {
  let mean = 0, second = 0;
  for (let k = 1; k < atLeast.length; k++) { mean += atLeast[k]!; second += (2 * k - 1) * atLeast[k]!; }
  return { mean, sd: Math.sqrt(Math.max(0, second - mean * mean)) };
}
