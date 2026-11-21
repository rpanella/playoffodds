import type { TieReason } from '../types';
import { ids, type TieContext } from './context';
import type { SeasonState } from './season';
import type { Step } from './steps';

export interface Procedure {
  name: string;
  /** Wild card, three or more clubs: keep only the highest-ranked club of each division first. */
  pruneToDivisionLeaders: boolean;
  twoClub: Step[];
  multiClub: Step[];
}

const NEEDS_REASON: Record<NonNullable<Step['needs']>, TieReason> = {
  scores: 'no_scores',
  touchdowns: 'no_touchdowns',
  coin: 'coin_toss',
};

function pruneToDivisionLeaders(clubs: number[], ctx: TieContext): number[] {
  const best = new Map<number, number>();
  for (const c of clubs) {
    const d = ctx.idx.divOf[c]!;
    const current = best.get(d);
    if (current === undefined || ctx.divisionRank(c) < ctx.divisionRank(current)) best.set(d, c);
  }
  const kept = clubs.filter((c) => best.get(ctx.idx.divOf[c]!) === c);
  if (ctx.trace && kept.length < clubs.length) {
    ctx.trace.push({ context: ctx.label, clubs: ids(ctx, clubs), step: 'division_pruning', survivors: ids(ctx, kept) });
  }
  return kept;
}

/**
 * The one club that wins the tie among `clubs` (all with the same percentage). Any reduction
 * restarts the procedure with the remaining clubs: two clubs go to the two-club steps, three or
 * more to the multi-club steps.
 */
export function pickWinner(clubs: number[], proc: Procedure, ctx: TieContext): number {
  let set = clubs;
  if (proc.pruneToDivisionLeaders && set.length > 2) set = pruneToDivisionLeaders(set, ctx);
  if (set.length === 1) return set[0]!;
  if (proc.pruneToDivisionLeaders && set.length === 2 && ctx.idx.divOf[set[0]!] === ctx.idx.divOf[set[1]!]) {
    // Two wild-card clubs from the same division: the division tiebreaker already ranked them.
    return ctx.divisionRank(set[0]!) < ctx.divisionRank(set[1]!) ? set[0]! : set[1]!;
  }
  const steps = set.length === 2 ? proc.twoClub : proc.multiClub;
  for (const step of steps) {
    if (step.needs && !(step.needs === 'scores' && ctx.s.scoresComplete)) {
      const winner = ctx.resolver.decide(set, NEEDS_REASON[step.needs], ctx);
      ctx.trace?.push({ context: ctx.label, clubs: ids(ctx, set), step: `${step.id} (${NEEDS_REASON[step.needs]})`, survivors: ids(ctx, [winner]) });
      return winner;
    }
    const survivors = step.apply!(set, ctx);
    if (ctx.trace && survivors.length < set.length) {
      ctx.trace.push({ context: ctx.label, clubs: ids(ctx, set), step: step.id, survivors: ids(ctx, survivors) });
    }
    if (survivors.length === 1) return survivors[0]!;
    if (survivors.length < set.length) return pickWinner(survivors, proc, ctx);
  }
  throw new Error(`${proc.name} procedure ended without a winner`);
}

/** Clubs grouped by winning percentage, best first; order within a group follows the input. */
export function groupByPct(clubs: readonly number[], s: SeasonState): number[][] {
  const sorted = [...clubs].sort((a, b) => s.pctNum(b) * s.pctDen(a) - s.pctNum(a) * s.pctDen(b) || pctDenZero(s, a, b));
  const groups: number[][] = [];
  for (const c of sorted) {
    const last = groups[groups.length - 1];
    if (last && samePct(s, last[0]!, c)) last.push(c);
    else groups.push([c]);
  }
  return groups;
}

// Teams with no games have pct 0/0; treat them as tied with each other and below everyone.
function pctDenZero(s: SeasonState, a: number, b: number): number {
  return (s.pctDen(a) === 0 ? 1 : 0) - (s.pctDen(b) === 0 ? 1 : 0);
}

function samePct(s: SeasonState, a: number, b: number): boolean {
  const da = s.pctDen(a);
  const db = s.pctDen(b);
  if (da === 0 || db === 0) return da === db;
  return s.pctNum(a) * db === s.pctNum(b) * da;
}

/**
 * An ordering of clubs by percentage, with ties broken one place at a time and only as deep as
 * asked. Each pick restarts the procedure for the clubs left in the tie ("only one club advances
 * in any tie-breaking step"), and earlier picks never change.
 */
export class LazyOrder {
  readonly order: number[] = [];
  private readonly groups: number[][];

  constructor(clubs: readonly number[], s: SeasonState) {
    this.groups = groupByPct(clubs, s);
  }

  ensure(depth: number, proc: Procedure, ctx: TieContext): number[] {
    while (this.order.length < depth && this.groups.length > 0) {
      const group = this.groups[0]!;
      const winner = group.length === 1 ? group[0]! : pickWinner(group, proc, ctx);
      this.order.push(winner);
      group.splice(group.indexOf(winner), 1);
      if (group.length === 0) this.groups.shift();
    }
    return this.order;
  }

  get size(): number {
    return this.order.length + this.groups.reduce((n, g) => n + g.length, 0);
  }
}
