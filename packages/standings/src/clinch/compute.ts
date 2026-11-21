import { prepareSeason } from '../standings';
import type { StandingsInput } from '../types';
import { STANDINGS_VERSION } from '../version';
import { buildProblem, type ClinchTarget } from './problem';
import { branchAndBound } from './solvers';

/** Bump when the clinch method changes; snapshots record it with each status (features/14 §3). */
export const CLINCH_METHOD = 'conservative-bnb@1';

export type ClinchState = 'clinched' | 'eliminated' | 'alive';

export interface ClinchStatus {
  team: string;
  target: ClinchTarget;
  status: ClinchState;
  /** Wins every remaining game, it clinches regardless of other results. */
  controls_destiny: boolean;
  /** A search hit the time limit, so `alive` makes no claim either way. */
  timed_out: boolean;
}

/** `clinch-output/1`. */
export interface ClinchOutput {
  schema: 'clinch-output/1';
  engine_version: string;
  rules_id: string;
  method: string;
  league: string;
  season: number;
  as_of: string | null;
  targets: ClinchTarget[];
  statuses: ClinchStatus[];
  runtime_ms: number;
}

/**
 * Clinched, eliminated or alive for every team and target as of the input's results (features/14 §2–3).
 * Conservative: a claim is always true under the real tiebreakers, but can come later than the league's.
 */
export function computeClinch(input: StandingsInput, opts: { timeLimitMs?: number } = {}): ClinchOutput {
  const started = performance.now();
  const { rules, idx, baseline: s } = prepareSeason(input);
  const limit = opts.timeLimitMs ?? 2000;
  const targets: ClinchTarget[] = ['playoffs', 'division', ...(rules.format.byes > 0 ? (['top_seed'] as const) : [])];
  // A search that gives up (null) proves nothing.
  const proven = (found: boolean | null) => found === false;

  const statuses: ClinchStatus[] = [];
  idx.teamIds.forEach((id, team) => {
    for (const target of targets) {
      const miss = branchAndBound(buildProblem(idx, s, rules, team, target, 'clinched'), performance.now() + limit).found;
      const make = miss === false ? true : branchAndBound(buildProblem(idx, s, rules, team, target, 'eliminated'), performance.now() + limit).found;
      const status: ClinchState = proven(miss) ? 'clinched' : proven(make) ? 'eliminated' : 'alive';
      let destiny = status === 'clinched';
      let timedOut = miss === null || make === null;
      if (status === 'alive') {
        const ifWinsOut = branchAndBound(buildProblem(idx, s, rules, team, target, 'clinched', true), performance.now() + limit).found;
        destiny = proven(ifWinsOut);
        timedOut ||= ifWinsOut === null;
      }
      statuses.push({ team: id, target, status, controls_destiny: destiny, timed_out: timedOut });
    }
  });

  return {
    schema: 'clinch-output/1',
    engine_version: STANDINGS_VERSION,
    rules_id: rules.id,
    method: CLINCH_METHOD,
    league: input.league,
    season: input.season,
    as_of: input.as_of ?? null,
    targets,
    statuses,
    runtime_ms: Math.round(performance.now() - started),
  };
}
