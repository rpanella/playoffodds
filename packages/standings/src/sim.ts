import type { TieKind, TieResolver } from './core/context';
import type { RulesModule } from './core/rules';
import { SeasonState, type SeasonIndex } from './core/season';
import { computeSeeding } from './core/seeding';
import { prepareSeason } from './standings';
import { UNPLAYED, type Outcome, type StandingsInput, type TieReason } from './types';

/** Draws an integer in [0, n). Supplied by the simulator from its keyed random stream. */
export type DrawInt = (n: number) => number;

export interface TiebreakStats {
  draws: number;
  byReason: Record<TieReason, number>;
  byKind: Record<TieKind, number>;
}

export function newTiebreakStats(): TiebreakStats {
  return {
    draws: 0,
    byReason: { coin_toss: 0, no_scores: 0, no_touchdowns: 0 },
    byKind: { division_title: 0, division_order: 0, seeding: 0, wild_card: 0, conference_order: 0 },
  };
}

export interface SeedResult {
  /** Per conference (index order of `index.conferenceNames`), team indices, seed 1 first. */
  seeds: number[][];
  divisionWinner: Uint8Array;
}

export interface SimWorld {
  readonly state: SeasonState;
  /** Back to the played-games baseline. */
  reset(): void;
  apply(gameIndex: number, outcome: Outcome): void;
  resolve(draw: DrawInt, stats?: TiebreakStats): SeedResult;
}

export interface SimEvaluator {
  readonly rules: RulesModule;
  readonly index: SeasonIndex;
  readonly baseline: SeasonState;
  /** Game indices with no counted result yet, in schedule order. */
  readonly remaining: number[];
  newWorld(): SimWorld;
}

/**
 * Fast path for simulations: prepare once, then evaluate many worlds. Simulated games carry no
 * scores, so points-based steps fall back to `draw` (and are counted) in any world that has one.
 */
export function createSimEvaluator(input: StandingsInput): SimEvaluator {
  const { rules, idx, baseline } = prepareSeason(input);
  const remaining: number[] = [];
  for (let g = 0; g < idx.gameIds.length; g++) if (baseline.result[g] === UNPLAYED) remaining.push(g);

  return {
    rules,
    index: idx,
    baseline,
    remaining,
    newWorld(): SimWorld {
      const state = new SeasonState(idx);
      state.copyFrom(baseline);
      return {
        state,
        reset: () => state.copyFrom(baseline),
        apply: (g, outcome) => state.apply(g, outcome),
        resolve(draw, stats) {
          const resolver: TieResolver = {
            decide(clubs, reason, ctx) {
              if (stats) {
                stats.draws++;
                stats.byReason[reason]++;
                stats.byKind[ctx.kind]++;
              }
              return clubs[draw(clubs.length)]!;
            },
          };
          const { seeds, divisionWinner } = computeSeeding(state, rules, resolver, null, false);
          return { seeds, divisionWinner };
        },
      };
    },
  };
}
