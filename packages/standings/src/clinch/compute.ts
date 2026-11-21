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
  /**
   * For an alive team: whether winning every remaining game clinches the target regardless of other results.
   * Null once the team has clinched or been eliminated, where it would only restate the status.
   */
  controls_destiny: boolean | null;
  /** A search hit its time limit: an `alive` status makes no claim, or `controls_destiny` is undecided (null). */
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

export interface ClinchOptions {
  /** Per clinch or elimination search. These are fast all season; the limit is a safety net. */
  timeLimitMs?: number;
  /**
   * Per controls-own-destiny search. Early in the season proving it for weak teams can take millions of
   * steps (week 2–4: up to seconds), and the answer is nearly always yes and uninformative, so it gets a short
   * budget; an undecided one is reported as null with `timed_out`.
   */
  destinyTimeLimitMs?: number;
  /** Skip controls-own-destiny entirely (all null), e.g. for history replays. */
  destiny?: boolean;
}

/**
 * Clinched, eliminated or alive for every team and target as of the input's results (features/14 §2–3).
 * Conservative: a claim is always true under the real tiebreakers, but can come later than the league's.
 */
export function computeClinch(input: StandingsInput, opts: ClinchOptions = {}): ClinchOutput {
  const started = performance.now();
  const { rules, idx, baseline: s } = prepareSeason(input);
  const limit = opts.timeLimitMs ?? 1000;
  const destinyLimit = opts.destinyTimeLimitMs ?? 50;
  const targets: ClinchTarget[] = ['playoffs', 'division', ...(rules.format.byes > 0 ? (['top_seed'] as const) : [])];
  // A search that gives up (null) proves nothing.
  const proven = (found: boolean | null) => found === false;

  const statuses: ClinchStatus[] = [];
  idx.teamIds.forEach((id, team) => {
    for (const target of targets) {
      const miss = branchAndBound(buildProblem(idx, s, rules, team, target, 'clinched'), performance.now() + limit).found;
      const make = miss === false ? true : branchAndBound(buildProblem(idx, s, rules, team, target, 'eliminated'), performance.now() + limit).found;
      const status: ClinchState = proven(miss) ? 'clinched' : proven(make) ? 'eliminated' : 'alive';
      let destiny: boolean | null = null;
      let timedOut = miss === null || make === null;
      if (status === 'alive' && opts.destiny !== false) {
        const ifWinsOut = branchAndBound(buildProblem(idx, s, rules, team, target, 'clinched', true), performance.now() + destinyLimit).found;
        destiny = ifWinsOut === null ? null : !ifWinsOut;
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
