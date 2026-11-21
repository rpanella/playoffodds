// node standings.mjs standings [--trace] < standings-input.json > standings-output.json
import { computeStandings, InputError, type StandingsInput } from '@playoffodds/standings';
import { readStdinJson, run } from './io';

const [command, ...flags] = process.argv.slice(2);

await run(async () => {
  if (command !== 'standings') {
    throw new InputError(`unknown command: ${command ?? '(none)'}; expected "standings" (clinch comes with the clinch track)`);
  }
  return computeStandings(await readStdinJson<StandingsInput>(), { trace: flags.includes('--trace') });
});
