import type { TieReason, TraceEntry } from '../types';
import type { SeasonIndex, SeasonState } from './season';

/** Why a tie is being broken; simulations count draws by kind. */
export type TieKind = 'division_title' | 'division_order' | 'seeding' | 'wild_card' | 'conference_order';

/** Settles ties the procedure can't: coin tosses, and steps whose data is missing. */
export interface TieResolver {
  decide(clubs: number[], reason: TieReason, ctx: TieContext): number;
}

export interface TieContext {
  idx: SeasonIndex;
  s: SeasonState;
  resolver: TieResolver;
  trace: TraceEntry[] | null;
  /** Label for traces and unresolved ties, e.g. "AFC East division". */
  label: string;
  kind: TieKind;
  /** Position within a club's division (0 = winner); filled on demand for wild-card pruning. */
  divisionRank: (team: number) => number;
}

export function ids(ctx: TieContext, clubs: readonly number[]): string[] {
  return clubs.map((c) => ctx.idx.teamIds[c]!);
}
