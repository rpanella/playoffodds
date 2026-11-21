import type { Procedure } from './procedure';

/** One era of one league's standings rules. Selected by league + season (see `selectRules`). */
export interface RulesModule {
  id: string;
  league: string;
  seasons: { from: number; to: number | null };
  /** Cited summary of the official procedure, relative to the package root. */
  source: string;
  conferences: readonly string[];
  /** Per conference. Division winners are seeded ahead of wild cards. */
  format: { wildCards: number; byes: number };
  division: Procedure;
  /** Also orders division winners for seeding. */
  wildCard: Procedure;
}
