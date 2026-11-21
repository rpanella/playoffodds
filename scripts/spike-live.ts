// M0 spike (throwaway): pull the live NFL season from SportsCrunch, build a SimInput, run the
// bundled simulate CLI and print a table. Needs SPORTSCRUNCH_API_KEY (and optionally
// SPORTSCRUNCH_API_URL) from the environment or an env file (.env, or --env-file=path).
// Writes input/output to .spike/.
//
//   npm run build:cli && npm run spike -- [--year=2026] [--sims=100000] [--env-file=path]
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { computeStandings, type TeamInput } from '../packages/standings/src';
import type { SimGame, SimInput, SimOutput } from '../packages/engine/src';
import { fitRatings } from './lib/fit';
import { arg, get, isoSeconds, type ScGame, type ScOdds, type ScSeason, type ScTeam } from './lib/sportscrunch';

const year = Number(arg('year', '2026'));
const sims = Number(arg('sims', '100000'));

const season = (await get<ScSeason[]>('/seasons?league=nfl')).find((s) => s.year === year);
if (!season) throw new Error(`no NFL ${year} season`);
const asOf = isoSeconds(new Date(Date.now() - 60_000));
const [scTeams, scGames, scOdds] = await Promise.all([
  get<ScTeam[]>(`/seasons/${season.id}/teams`),
  get<ScGame[]>(`/seasons/${season.id}/games`),
  get<ScOdds[]>(`/seasons/${season.id}/historical-odds?at=${encodeURIComponent(asOf)}`),
]);

const teamKey = new Map(scTeams.map((t) => [t.id, `nfl-${t.shortname.toLowerCase()}`]));
const teams: TeamInput[] = scTeams.map((t) => ({
  id: teamKey.get(t.id)!,
  name: `${t.location} ${t.name}`,
  conference: t.division.slice(0, 3),
  division: t.division,
}));
const odds = new Map(scOdds.map((o) => [o.id, o]));

const games: SimGame[] = [];
let projected = 0;
for (const g of scGames.filter((g) => g.season_type === 'regular')) {
  const common = {
    id: `sc-${g.id}`, week: g.week ?? undefined, start: g.start_time, season_type: 'regular' as const,
    home: teamKey.get(g.home_team.id)!, away: teamKey.get(g.away_team.id)!, neutral: !!g.neutral_location,
  };
  if (g.status === 'final') games.push({ ...common, status: 'final', home_score: g.home_score, away_score: g.away_score });
  else if (g.status === 'canceled') games.push({ ...common, status: 'canceled' });
  else {
    const o = odds.get(g.id);
    const p = o?.home_win_probability ?? g.home_win_probability;
    if (p == null) throw new Error(`no probability for game ${g.id} (${common.away} at ${common.home}, week ${g.week})`);
    if (o?.is_projected) projected++;
    games.push({ ...common, status: 'scheduled', p_home: p, p_source: o?.is_projected ? 'projected' : 'market' });
  }
}
const unplayed = games.filter((g) => g.status === 'scheduled');
const currentWeek = Math.min(...unplayed.map((g) => g.week!));

// Fallback until SportsCrunch's matchup-odds endpoint exists (03 §4): fit
// logit(p_home) = r_home - r_away + hfa to the remaining games and build the matrices from it.
const { rating, hfa, components } = fitRatings(unplayed.map((g) => ({ home: g.home, away: g.away, neutral: g.neutral, p_home: g.p_home! })), teams.map((t) => t.id));
if (components > 1) console.warn(`warning: the remaining games split into ${components} groups that never meet; each group's ratings are centered on zero`);
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const grid = (withHfa: boolean) => teams.map((a) => teams.map((b) => (a === b ? null : sig(rating.get(a.id)! - rating.get(b.id)! + (withHfa ? hfa : 0)))));

const input: SimInput = {
  schema: 'sim-input/1', league: 'nfl', season: year, as_of: asOf, current_week: currentWeek, teams, games,
  matchups: { source: 'fit', as_of: asOf, teams: teams.map((t) => t.id), home: grid(true), neutral: grid(false) },
  postseason: { state: 'not_started' },
  params: { sims, seed: `spike-${asOf}`, tie_rate: 0.00373, drift: 'nfl-line-drift@v2' },
};

mkdirSync('.spike', { recursive: true });
writeFileSync('.spike/input.json', JSON.stringify(input));
const proc = spawnSync('node', ['packages/cli/dist/simulate.mjs'], { input: JSON.stringify(input), maxBuffer: 64 << 20 });
if (proc.status !== 0) throw new Error(`simulate failed: ${proc.stderr.toString()}`);
writeFileSync('.spike/output.json', proc.stdout);
const out = JSON.parse(proc.stdout.toString()) as SimOutput;

const standings = computeStandings(input);
const pct = (p: number) => (p >= 0.9995 && p < 1 ? '>99.9' : p > 0 && p < 0.0005 ? '<0.1' : (100 * p).toFixed(1)).padStart(6);
console.log(`NFL ${year} as of ${asOf} · week ${currentWeek} next · ${unplayed.length} games left (${projected} projected) · ${out.sims} sims in ${out.runtime_ms} ms`);
console.log(`fit: hfa ${hfa.toFixed(3)} logit · tiebreak draws ${out.diagnostics.tiebreak_draws.count} · drift clipped ${out.diagnostics.drift_clipped} · ${out.diagnostics.warnings.join('; ') || 'no warnings'}\n`);
for (const conf of ['AFC', 'NFC']) {
  console.log(`${conf}   team   W-L-T   seed   wins  playoffs  division  1st seed   conf    SB win`);
  const rows = standings.teams.filter((t) => t.conference === conf).sort((a, b) => out.teams[b.id]!.p_playoffs - out.teams[a.id]!.p_playoffs);
  for (const t of rows) {
    const o = out.teams[t.id]!;
    const rec = `${t.record.w}-${t.record.l}-${t.record.t}`;
    console.log(`      ${t.id.slice(4).toUpperCase().padEnd(4)} ${rec.padStart(7)}  ${String(t.seed ?? '').padStart(4)}  ${o.wins.mean.toFixed(1).padStart(5)}    ${pct(o.p_playoffs)}    ${pct(o.p_division)}    ${pct(o.p_seed[0]!)} ${pct(o.p_round.super_bowl!)}  ${pct(o.p_round.champion!)}`);
  }
  console.log('');
}
