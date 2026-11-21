// Compares our conservative clinch dates with the official ones and reports how far behind the league we are
// (features/14 §4). Replays every season with our check, then matches the official fixture.
//   npx tsx scripts/clinch-lag.ts [--official=packages/standings/fixtures/nfl/clinch-official/2020-2025.json]
import { readFileSync } from 'node:fs';
import { replayClinches, type FirstClinch, type StandingsInput } from '../packages/standings/src';
import { arg } from './lib/sportscrunch';

type OurClinch = FirstClinch;
interface Official { team_id: string; type: OurClinch['type']; after_week: number }

const official = JSON.parse(readFileSync(arg('official', 'packages/standings/fixtures/nfl/clinch-official/2020-2025.json'), 'utf8')) as { seasons: Record<string, Official[]> };
const ours: Record<string, OurClinch[]> = {};

const lags = new Map<OurClinch['type'], number[]>();
const never: string[] = [];
const early: string[] = [];
const extra: string[] = [];
const perSeason: string[] = [];

for (const [season, list] of Object.entries(official.seasons)) {
  const fixture = JSON.parse(readFileSync(`packages/standings/fixtures/nfl/golden/${season}.input.json`, 'utf8')) as StandingsInput;
  ours[season] = replayClinches(fixture);
  const ids = new Set(fixture.teams.map((t) => t.id));
  const idOf = (o: Official) => (ids.has(o.team_id) ? o.team_id : (() => { throw new Error(`${season}: unknown team ${o.team_id}`); })());
  const mine = new Map((ours[season] ?? []).map((c) => [`${c.team}|${c.type}`, c]));
  const matched = new Set<string>();
  let n = 0, onTime = 0;
  for (const o of list) {
    const key = `${idOf(o)}|${o.type}`;
    const c = mine.get(key);
    n++;
    if (!c) {
      never.push(`${season} ${key} (official after week ${o.after_week})`);
      continue;
    }
    matched.add(key);
    const lag = c.after_week - o.after_week;
    if (!lags.has(o.type)) lags.set(o.type, []);
    lags.get(o.type)!.push(lag);
    if (lag === 0) onTime++;
    if (lag < 0) early.push(`${season} ${key}: ours after week ${c.after_week} (${c.date}, ${c.after_games.join(', ')}), official after week ${o.after_week}`);
  }
  for (const [key, c] of mine) {
    if (!matched.has(key) && list.some((o) => o.type === c.type)) extra.push(`${season} ${key} after week ${c.after_week}`);
  }
  perSeason.push(`${season}: ${n} official entries, ${onTime} same week`);
}

console.log('Per season:');
for (const line of perSeason) console.log(`  ${line}`);
console.log('\nLag in weeks (ours minus official), by type:');
for (const [type, xs] of lags) {
  const hist = new Map<number, number>();
  for (const x of xs) hist.set(x, (hist.get(x) ?? 0) + 1);
  console.log(`  ${type.padEnd(14)} n=${xs.length}  ${[...hist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k >= 0 ? '+' : ''}${k}: ${v}`).join(', ')}`);
}
console.log(`\nEarlier than official (should be none; each is a bug or a gap in the official data): ${early.length}`);
for (const x of early) console.log(`  ${x}`);
console.log(`\nOfficial but never proven by us (tiebreaker-only clinches, e.g. decided on the last day): ${never.length}`);
for (const x of never) console.log(`  ${x}`);
console.log(`\nProven by us but not in the official list (check the official coverage): ${extra.length}`);
for (const x of extra.slice(0, 30)) console.log(`  ${x}`);
