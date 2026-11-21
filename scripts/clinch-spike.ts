// Clinch solver spike (features/14 §3): run both candidate searches on real NFL states, 2020–2025, after
// weeks 12 through 17, for every team, target and question, and compare speed and answers.
//   npx tsx scripts/clinch-spike.ts [--weeks=12-17] [--limit-ms=2000]
import { readFileSync } from 'node:fs';
import highsLoader from 'highs';
import { prepareSeason, type StandingsInput } from '../packages/standings/src';
import { buildProblem, CLINCH_TARGETS } from '../packages/standings/src/clinch/problem';
import { branchAndBound, integerProgram, type LpSolver } from '../packages/standings/src/clinch/solvers';
import { arg } from './lib/sportscrunch';

const [w0, w1] = arg('weeks', '12-17').split('-').map(Number) as [number, number];
const limitMs = Number(arg('limit-ms', '2000'));
const highs = (await highsLoader()) as unknown as LpSolver;
const DAY = 86_400_000;

/** The season state after week `week`: games before the Wednesday after it count; later ones are open. */
function stateAfter(input: StandingsInput, week: number): StandingsInput {
  const starts = input.games.map((g) => Date.parse(g.start!)).sort((a, b) => a - b);
  // Midnight Eastern (05:00 UTC) on the opener's day, then seven days a week, ending on a Wednesday.
  const opener = new Date(starts[0]! - 5 * 3600_000);
  const openerDay = Date.UTC(opener.getUTCFullYear(), opener.getUTCMonth(), opener.getUTCDate()) + 5 * 3600_000;
  const cutoff = openerDay + (7 * week - 1) * DAY;
  return {
    ...input,
    games: input.games.map((g) => {
      if (Date.parse(g.start!) < cutoff || g.status !== 'final') return g;
      const { home_score: _h, away_score: _a, ...rest } = g;
      return { ...rest, status: 'scheduled' as const };
    }),
  };
}

const stat = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return `median ${q(0.5).toFixed(2)} ms, p99 ${q(0.99).toFixed(2)}, max ${q(1).toFixed(2)}`;
};

const bnbMs: number[] = [];
const ipMs: number[] = [];
const sizes: number[] = [];
let problems = 0, disagreements = 0, bnbTimeouts = 0, ipTimeouts = 0;
const proven = { clinched: 0, eliminated: 0 };
const rows: string[] = [];

for (let season = 2020; season <= 2025; season++) {
  const full = JSON.parse(readFileSync(`packages/standings/fixtures/nfl/golden/${season}.input.json`, 'utf8')) as StandingsInput;
  for (let week = w0; week <= w1; week++) {
    const input = stateAfter(full, week);
    const { idx, baseline: s, rules } = prepareSeason(input);
    const open = idx.gameIds.filter((_, g) => s.result[g] === 0).length;
    const found: string[] = [];
    for (let team = 0; team < idx.teamIds.length; team++) {
      for (const target of CLINCH_TARGETS) {
        for (const question of ['clinched', 'eliminated'] as const) {
          const pr = buildProblem(idx, s, rules, team, target, question);
          sizes.push(pr.branch.length);
          let t = performance.now();
          const b = branchAndBound(pr, t + limitMs).found;
          bnbMs.push(performance.now() - t);
          t = performance.now();
          const i = integerProgram(pr, highs, limitMs / 1000).found;
          ipMs.push(performance.now() - t);
          problems++;
          if (b === null) bnbTimeouts++;
          if (i === null) ipTimeouts++;
          if (b !== null && i !== null && b !== i) disagreements++;
          const answer = b ?? i;
          if (answer === false) {
            proven[question]++;
            if (target === 'playoffs' || target === 'division') found.push(`${idx.teamIds[team]!.slice(4).toUpperCase()} ${question === 'clinched' ? '+' : '-'}${target === 'division' ? 'div' : 'po'}`);
          }
        }
      }
    }
    rows.push(`${season} after wk${week} (${open} games open): ${found.filter((f) => f.includes('+')).join(' ')}`);
  }
}

console.log(`${problems} problems (${2025 - 2020 + 1} seasons × weeks ${w0}-${w1} × 32 teams × 3 targets × 2 questions), limit ${limitMs} ms`);
console.log(`branching games after dominance: ${stat(sizes).replace(/ ms/g, '')}`);
console.log(`branch-and-bound: ${stat(bnbMs)}, timeouts ${bnbTimeouts}`);
console.log(`integer program:  ${stat(ipMs)}, timeouts ${ipTimeouts}`);
console.log(`disagreements: ${disagreements}; proven clinched ${proven.clinched}, eliminated ${proven.eliminated}`);
console.log('\nClinched playoff spots (+po) and divisions (+div) by state:');
for (const r of rows) console.log(`  ${r}`);
