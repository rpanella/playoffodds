import type { TraceEntry } from '../types';
import type { TieContext, TieKind, TieResolver } from './context';
import { LazyOrder } from './procedure';
import type { RulesModule } from './rules';
import type { SeasonState } from './season';

export interface Seeding {
  /** Per division, best first. Fully ordered only in `full` mode or where wild-card pruning needed it. */
  divisionOrders: number[][];
  /** Per conference: division winners in seed order, then the other clubs (all of them in `full` mode). */
  conferenceOrders: number[][];
  /** Per conference, seed 1 first. */
  seeds: number[][];
  divisionWinner: Uint8Array;
}

/**
 * Division winners, seeds and (in `full` mode) complete division and conference orders.
 * Simulations use `full = false` so only ties that decide a title, a seed or a playoff spot are broken.
 */
export function computeSeeding(
  s: SeasonState,
  rules: RulesModule,
  resolver: TieResolver,
  trace: TraceEntry[] | null,
  full: boolean,
): Seeding {
  const idx = s.idx;
  const divOrders = idx.divTeams.map((teams) => new LazyOrder(teams, s));

  const ctx: TieContext = {
    idx, s, resolver, trace,
    label: '',
    kind: 'division_title',
    divisionRank: (team) => {
      const d = idx.divOf[team]!;
      let pos = divOrders[d]!.order.indexOf(team);
      if (pos < 0) {
        ensureDivision(d, idx.divTeams[d]!.length, 'division_order');
        pos = divOrders[d]!.order.indexOf(team);
      }
      return pos;
    },
  };

  function ensureDivision(d: number, depth: number, kind: TieKind): number[] {
    const saved = { label: ctx.label, kind: ctx.kind };
    ctx.label = `${idx.divisionNames[d]} division`;
    ctx.kind = kind;
    const order = divOrders[d]!.ensure(depth, rules.division, ctx);
    ctx.label = saved.label;
    ctx.kind = saved.kind;
    return order;
  }

  const divisionWinner = new Uint8Array(s.n);
  const seeds: number[][] = [];
  const conferenceOrders: number[][] = [];

  idx.conferenceNames.forEach((conf, c) => {
    const winners = idx.divsOfConf[c]!.map((d) => ensureDivision(d, 1, 'division_title')[0]!);
    for (const w of winners) divisionWinner[w] = 1;

    ctx.label = `${conf} division winners`;
    ctx.kind = 'seeding';
    const top = new LazyOrder(winners, s).ensure(winners.length, rules.wildCard, ctx);

    const rest = new LazyOrder(idx.confTeams[c]!.filter((t) => !divisionWinner[t]), s);
    ctx.label = `${conf} wild card`;
    ctx.kind = 'wild_card';
    rest.ensure(rules.format.wildCards, rules.wildCard, ctx);
    if (full) {
      ctx.label = `${conf} conference order`;
      ctx.kind = 'conference_order';
      rest.ensure(rest.size, rules.wildCard, ctx);
    }

    seeds.push([...top, ...rest.order.slice(0, rules.format.wildCards)]);
    conferenceOrders.push([...top, ...rest.order]);
  });

  if (full) {
    idx.divTeams.forEach((teams, d) => ensureDivision(d, teams.length, 'division_order'));
  }

  return { divisionOrders: divOrders.map((o) => o.order), conferenceOrders, seeds, divisionWinner };
}
