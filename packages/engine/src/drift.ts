import nflLineDriftV2 from '../params/nfl-line-drift-v2.json';
import { Purpose, type KeyedRng } from './rng';

export interface DriftParams {
  id: string;
  max_horizon: number;
  /** Index k = variance of the step from horizon k to k-1; index 0 is unused. */
  team_increment_var: number[];
  team_walk_var: number;
  student_t_nu: number;
  clip_logits: number;
}

export const DRIFT_MODELS: Record<string, DriftParams> = {
  [nflLineDriftV2.id]: nflLineDriftV2,
};

/**
 * Per-step standard deviations for horizons 1..maxH of the two pieces of PoolCrunch's team walk
 * (`DriftedWorld._draw`): a coherent walk and a standing term that tops it up to the measured
 * increment. Beyond the fitted range the last increment is held constant (01 §4).
 */
export function stepScales(params: DriftParams, maxH: number): { walk: number; standing: Float64Array } {
  const standing = new Float64Array(maxH + 1);
  const last = params.team_increment_var[params.max_horizon]!;
  for (let k = 1; k <= maxH; k++) {
    const inc = k <= params.max_horizon ? params.team_increment_var[k]! : last;
    standing[k] = Math.sqrt(Math.max(0, inc - params.team_walk_var));
  }
  return { walk: Math.sqrt(params.team_walk_var), standing };
}

/**
 * Fill `out[t * (maxH + 1) + h]` with team t's walk at horizon h (0 at h = 0) for one sim.
 * Each team has its own keyed stream, so its path doesn't depend on any other team or game.
 */
export function drawWalks(
  rng: KeyedRng,
  sim: number,
  teams: number,
  maxH: number,
  params: DriftParams,
  scales: { walk: number; standing: Float64Array },
  out: Float64Array,
): void {
  const width = maxH + 1;
  const nu = params.student_t_nu;
  for (let t = 0; t < teams; t++) {
    const stream = rng.stream(sim, Purpose.drift, t);
    const base = t * width;
    let w = 0;
    out[base] = 0;
    for (let h = 1; h <= maxH; h++) {
      w += scales.walk * stream.studentT(nu);
      const sd = scales.standing[h]!;
      if (sd > 0) w += sd * stream.studentT(nu);
      out[base + h] = w;
    }
  }
}
