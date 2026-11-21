// node simulate.mjs [--threads=N] < sim-input.json > sim-output.json
//
// Splits sims across worker threads. Draws are keyed per sim, so the output is identical for
// any thread count. Default threads: PODDS_SIM_THREADS, else min(available cores, 8).
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { InputError } from '@playoffodds/standings';
import { emptyTallies, mergeTallies, prepareRun, simulateRange, summarize, type SimInput, type Tallies } from '@playoffodds/engine';
import { readStdinJson, run } from './io';

interface Job {
  input: SimInput;
  from: number;
  to: number;
}

function threadCount(): number {
  const flag = process.argv.find((a) => a.startsWith('--threads='))?.slice('--threads='.length);
  const value = flag ?? process.env.PODDS_SIM_THREADS;
  if (value === undefined) return Math.min(availableParallelism(), 8);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new InputError(`bad thread count: ${value}`);
  return n;
}

function runInWorker(job: Job): Promise<Tallies> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: job });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`simulation worker exited with code ${code}`));
    });
  });
}

if (isMainThread) {
  await run(async () => {
    const input = await readStdinJson<SimInput>();
    const threads = threadCount();
    const started = performance.now();
    const prepared = prepareRun(input); // validates before any worker starts
    const sims = input.params.sims;
    const parts = Math.min(threads, Math.ceil(sims / 1000));
    let tallies: Tallies;
    if (parts <= 1) {
      tallies = simulateRange(prepared, 0, sims);
    } else {
      const size = Math.ceil(sims / parts);
      const jobs: Job[] = [];
      for (let from = 0; from < sims; from += size) jobs.push({ input, from, to: Math.min(sims, from + size) });
      const results = await Promise.all(jobs.map(runInWorker));
      tallies = results.reduce(mergeTallies, emptyTallies(prepared));
    }
    return { ...summarize(prepared, tallies), runtime_ms: Math.round(performance.now() - started) };
  });
} else {
  const job = workerData as Job;
  parentPort!.postMessage(simulateRange(prepareRun(job.input), job.from, job.to));
}
