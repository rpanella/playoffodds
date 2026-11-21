// node standings.mjs standings [--trace] < standings-input.json > standings-output.json
// node standings.mjs clinch < standings-input.json > clinch-output.json
import { computeClinch, computeStandings, InputError, type StandingsInput } from '@playoffodds/standings';
import { readStdinJson, run } from './io';

const [command, ...flags] = process.argv.slice(2);

await run(async () => {
  if (command === 'standings') return computeStandings(await readStdinJson<StandingsInput>(), { trace: flags.includes('--trace') });
  if (command === 'clinch') return computeClinch(await readStdinJson<StandingsInput>());
  throw new InputError(`unknown command: ${command ?? '(none)'}; expected "standings" or "clinch"`);
});
