// Bundles each CLI entry point into one dependency-free file for plain `node` (04 §8).
import { build } from 'esbuild';

await build({
  entryPoints: {
    simulate: 'packages/cli/src/simulate.ts',
    standings: 'packages/cli/src/standings.ts',
  },
  outdir: 'packages/cli/dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  logLevel: 'info',
});
