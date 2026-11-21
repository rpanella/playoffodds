// Replays NFL 2020–2025 kickoff by kickoff and records the first moment each team clinched (playoff spot,
// division, top seed) or was eliminated from the playoffs under our conservative check (features/14 §4).
//   npx tsx scripts/clinch-replay.ts [--out=path.json]
// The moment is the kickoff slot after which the status first holds (all games starting at the same time
// count together), with its NFL week by date. It also fails loudly if a proven status ever reverts.
import { readFileSync, writeFileSync } from 'node:fs';
import { computeClinch, type StandingsInput } from '../packages/standings/src';
import { arg } from './lib/sportscrunch';

const DAY = 86_400_000;
const ET = 5 * 3600_000; // close enough for day boundaries; DST only shifts by an hour

export interface OurClinch {
  team: string;
  type: 'playoff_berth' | 'division' | 'top_seed' | 'eliminated';
  after_week: number;
  date: string; // Eastern date of the slot's kickoff
  after_games: string[];
}

export function weekOf(opener: number, t: number): number {
  const openerDay = Math.floor((opener - ET) / DAY) * DAY + ET; // midnight Eastern on the opener's day
  return Math.floor((t - (openerDay - DAY)) / (7 * DAY)) + 1; // weeks run Wednesday to Tuesday
}

export function replaySeason(full: StandingsInput): OurClinch[] {
  const games = [...full.games].filter((g) => g.status === 'final').sort((a, b) => a.start!.localeCompare(b.start!));
  const opener = Date.parse(games[0]!.start!);
  const slots = [...new Set(games.map((g) => g.start!))];
  const first = new Map<string, OurClinch>();
  const last = new Map<string, string>(); // team|target -> status at the previous slot

  for (const slot of slots) {
    const t = Date.parse(slot);
    const input: StandingsInput = {
      ...full,
      games: full.games.map((g) => (g.status === 'final' && Date.parse(g.start!) <= t ? g : { ...g, status: 'scheduled' as const, home_score: null, away_score: null })),
    };
    const out = computeClinch(input, { destiny: false });
    for (const st of out.statuses) {
      const key = `${st.team}|${st.target}`;
      const before = last.get(key);
      if ((before === 'clinched' || before === 'eliminated') && st.status !== before) {
        throw new Error(`${full.season} ${key}: ${before} after an earlier slot but ${st.status} after ${slot}`);
      }
      last.set(key, st.status);
      const type = st.status === 'clinched' ? ({ playoffs: 'playoff_berth', division: 'division', top_seed: 'top_seed' } as const)[st.target]
        : st.status === 'eliminated' && st.target === 'playoffs' ? 'eliminated' : null;
      if (type === null) continue;
      const id = `${st.team}|${type}`;
      if (!first.has(id)) {
        first.set(id, {
          team: st.team,
          type,
          after_week: weekOf(opener, t),
          date: new Date(t - ET).toISOString().slice(0, 10),
          after_games: games.filter((g) => g.start === slot).map((g) => `${g.away}@${g.home}`),
        });
      }
    }
  }
  return [...first.values()];
}

if (import.meta.url === `file://${process.argv[1]!.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1]?.endsWith('clinch-replay.ts')) {
  const result: Record<string, OurClinch[]> = {};
  for (let season = 2020; season <= 2025; season++) {
    const full = JSON.parse(readFileSync(`packages/standings/fixtures/nfl/golden/${season}.input.json`, 'utf8')) as StandingsInput;
    const started = performance.now();
    result[season] = replaySeason(full);
    const byType = (ty: string) => result[season]!.filter((c) => c.type === ty).length;
    console.log(`${season}: ${byType('playoff_berth')} berths, ${byType('division')} divisions, ${byType('top_seed')} top seeds, ${byType('eliminated')} eliminations (${Math.round(performance.now() - started)} ms)`);
  }
  const out = arg('out', 'C:/Users/rpane/AppData/Local/Temp/claude/C--Users-rpane-projects-playoffodds/73cfb5b1-f4b4-4ad7-8a2e-e72f41becc47/scratchpad/our-clinches.json');
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`wrote ${out}`);
}
