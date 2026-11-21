// Replays NFL 2020–2025 kickoff by kickoff and writes when each team first clinched (playoff spot, division,
// top seed) or was eliminated under our conservative check (features/14 §4). Compare with official dates
// using scripts/clinch-lag.ts.
//   npx tsx scripts/clinch-replay.ts [--out=path.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { replayClinches, type FirstClinch, type StandingsInput } from '../packages/standings/src';
import { arg } from './lib/sportscrunch';

const result: Record<string, FirstClinch[]> = {};
for (let season = 2020; season <= 2025; season++) {
  const full = JSON.parse(readFileSync(`packages/standings/fixtures/nfl/golden/${season}.input.json`, 'utf8')) as StandingsInput;
  const started = performance.now();
  result[season] = replayClinches(full);
  const byType = (ty: string) => result[season]!.filter((c) => c.type === ty).length;
  console.log(`${season}: ${byType('playoff_berth')} berths, ${byType('division')} divisions, ${byType('top_seed')} top seeds, ${byType('eliminated')} eliminations (${Math.round(performance.now() - started)} ms)`);
}
const out = arg('out', 'our-clinches.json');
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`wrote ${out}`);
