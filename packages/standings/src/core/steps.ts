import type { TieContext } from './context';

/**
 * One tiebreak step. `apply` returns the clubs that survive it (all of them when the step
 * doesn't separate anyone or doesn't apply). Steps with `needs` are handled by the procedure:
 * `scores` runs only when every applied game has a score, `touchdowns` is never available
 * (SportsCrunch doesn't record touchdowns), and `coin` is the final toss.
 */
export interface Step {
  id: string;
  needs?: 'scores' | 'touchdowns' | 'coin';
  apply?(clubs: number[], ctx: TieContext): number[];
}

/** Survivors with the best num/den. Not applicable (everyone survives) if any den is zero. */
function bestRatio(clubs: number[], num: number[], den: number[]): number[] {
  for (const d of den) if (d === 0) return clubs;
  let best = 0;
  for (let i = 1; i < clubs.length; i++) {
    if (num[i]! * den[best]! > num[best]! * den[i]!) best = i;
  }
  return clubs.filter((_, i) => num[i]! * den[best]! === num[best]! * den[i]!);
}

function bestValue(clubs: number[], values: number[], higherIsBetter: boolean): number[] {
  const target = higherIsBetter ? Math.max(...values) : Math.min(...values);
  return clubs.filter((_, i) => values[i] === target);
}

/** Opponents every club in `clubs` has played (played games only). */
function commonOpponents(clubs: number[], ctx: TieContext): Uint8Array {
  const { idx, s } = ctx;
  const n = s.n;
  const count = new Int32Array(n);
  const seen = new Int32Array(n).fill(-1);
  for (let k = 0; k < clubs.length; k++) {
    const c = clubs[k]!;
    for (const g of idx.teamGames[c]!) {
      if (s.result[g] === 0) continue;
      const o = idx.home[g] === c ? idx.away[g]! : idx.home[g]!;
      if (seen[o] !== k) {
        seen[o] = k;
        count[o]!++;
      }
    }
  }
  const common = new Uint8Array(n);
  for (let o = 0; o < n; o++) if (count[o] === clubs.length) common[o] = 1;
  return common;
}

function opponent(ctx: TieContext, g: number, team: number): number {
  return ctx.idx.home[g] === team ? ctx.idx.away[g]! : ctx.idx.home[g]!;
}

/** Best percentage in games among the tied clubs (two-club "games between", multi-club "games among"). */
export const headToHead: Step = {
  id: 'head_to_head',
  apply(clubs, { s }) {
    const n = s.n;
    const num: number[] = [];
    const den: number[] = [];
    for (const c of clubs) {
      let w = 0, l = 0, t = 0;
      for (const o of clubs) {
        if (o === c) continue;
        w += s.h2hW[c * n + o]!;
        l += s.h2hW[o * n + c]!;
        t += s.h2hT[c * n + o]!;
      }
      num.push(2 * w + t);
      den.push(2 * (w + l + t));
    }
    return bestRatio(clubs, num, den);
  },
};

/** Wild card, three or more clubs: a club that beat each of the others advances; one that lost to each is eliminated. */
export const headToHeadSweep: Step = {
  id: 'head_to_head_sweep',
  apply(clubs, { s }) {
    const n = s.n;
    const sweptBy = (c: number, o: number) => s.h2hW[c * n + o]! > 0 && s.h2hW[o * n + c]! === 0 && s.h2hT[c * n + o]! === 0;
    const sweepers = clubs.filter((c) => clubs.every((o) => o === c || sweptBy(c, o)));
    if (sweepers.length === 1) return sweepers;
    const swept = new Set(clubs.filter((c) => clubs.every((o) => o === c || sweptBy(o, c))));
    if (swept.size === 0 || swept.size === clubs.length) return clubs;
    return clubs.filter((c) => !swept.has(c));
  },
};

export const divisionPct: Step = {
  id: 'division_record',
  apply(clubs, { s }) {
    return bestRatio(clubs, clubs.map((c) => 2 * s.dw[c]! + s.dt[c]!), clubs.map((c) => 2 * (s.dw[c]! + s.dl[c]! + s.dt[c]!)));
  },
};

export const conferencePct: Step = {
  id: 'conference_record',
  apply(clubs, { s }) {
    return bestRatio(clubs, clubs.map((c) => 2 * s.cw[c]! + s.ct[c]!), clubs.map((c) => 2 * (s.cw[c]! + s.cl[c]! + s.ct[c]!)));
  },
};

/** Best percentage in common games; `minimum` games per club for the step to apply (wild card: 4). */
export function commonGamesPct(minimum = 0): Step {
  return {
    id: minimum > 0 ? `common_games_min_${minimum}` : 'common_games',
    apply(clubs, ctx) {
      const { idx, s } = ctx;
      const common = commonOpponents(clubs, ctx);
      const num: number[] = [];
      const den: number[] = [];
      for (const c of clubs) {
        let w = 0, l = 0, t = 0;
        for (const g of idx.teamGames[c]!) {
          if (s.result[g] === 0 || !common[opponent(ctx, g, c)]) continue;
          const r = s.gameResultFor(g, c);
          if (r > 0) w++;
          else if (r < 0) l++;
          else t++;
        }
        if (w + l + t < minimum) return clubs;
        num.push(2 * w + t);
        den.push(2 * (w + l + t));
      }
      return bestRatio(clubs, num, den);
    },
  };
}

/** Combined percentage of the opponents each club defeated, one entry per win. */
export const strengthOfVictory: Step = {
  id: 'strength_of_victory',
  apply(clubs, ctx) {
    const { idx, s } = ctx;
    const num: number[] = [];
    const den: number[] = [];
    for (const c of clubs) {
      let a = 0, b = 0;
      for (const g of idx.teamGames[c]!) {
        if (s.gameResultFor(g, c) !== 1) continue;
        const o = opponent(ctx, g, c);
        a += s.pctNum(o);
        b += s.pctDen(o);
      }
      num.push(a);
      den.push(b === 0 ? 1 : b);
    }
    return bestRatio(clubs, num, den);
  },
};

/** Combined percentage of every opponent played, one entry per game. */
export const strengthOfSchedule: Step = {
  id: 'strength_of_schedule',
  apply(clubs, ctx) {
    const { idx, s } = ctx;
    const num: number[] = [];
    const den: number[] = [];
    for (const c of clubs) {
      let a = 0, b = 0;
      for (const g of idx.teamGames[c]!) {
        if (s.result[g] === 0) continue;
        const o = opponent(ctx, g, c);
        a += s.pctNum(o);
        b += s.pctDen(o);
      }
      num.push(a);
      den.push(b);
    }
    return bestRatio(clubs, num, den);
  },
};

/** Rank in points scored plus rank in points allowed among `pool`; ties share the better rank. Lower wins. */
function combinedRanking(id: string, poolOf: (club: number, ctx: TieContext) => readonly number[]): Step {
  return {
    id,
    needs: 'scores',
    apply(clubs, ctx) {
      const { s } = ctx;
      const values = clubs.map((c) => {
        const pool = poolOf(c, ctx);
        let scored = 1, allowed = 1;
        for (const o of pool) {
          if (s.pf[o]! > s.pf[c]!) scored++;
          if (s.pa[o]! < s.pa[c]!) allowed++;
        }
        return scored + allowed;
      });
      return bestValue(clubs, values, false);
    },
  };
}

export const combinedRankingConference = combinedRanking('combined_ranking_conference', (c, ctx) => ctx.idx.confTeams[ctx.idx.confOf[c]!]!);
export const combinedRankingAll = combinedRanking('combined_ranking_all', (_c, ctx) => ctx.idx.teamIds.map((_, i) => i));

export const netPointsCommon: Step = {
  id: 'net_points_common',
  needs: 'scores',
  apply(clubs, ctx) {
    const { idx, s } = ctx;
    const common = commonOpponents(clubs, ctx);
    const values = clubs.map((c) => {
      let net = 0;
      for (const g of idx.teamGames[c]!) {
        if (s.result[g] === 0 || !common[opponent(ctx, g, c)]) continue;
        net += s.gameNet(g, c) ?? 0;
      }
      return net;
    });
    return bestValue(clubs, values, true);
  },
};

export const netPointsConference: Step = {
  id: 'net_points_conference',
  needs: 'scores',
  apply(clubs, ctx) {
    const { idx, s } = ctx;
    const values = clubs.map((c) => {
      let net = 0;
      for (const g of idx.teamGames[c]!) {
        if (s.result[g] === 0 || !idx.conferenceGame[g]) continue;
        net += s.gameNet(g, c) ?? 0;
      }
      return net;
    });
    return bestValue(clubs, values, true);
  },
};

export const netPointsAll: Step = {
  id: 'net_points_all',
  needs: 'scores',
  apply(clubs, { s }) {
    return bestValue(clubs, clubs.map((c) => s.pf[c]! - s.pa[c]!), true);
  },
};

export const netTouchdowns: Step = { id: 'net_touchdowns', needs: 'touchdowns' };

export const coinToss: Step = { id: 'coin_toss', needs: 'coin' };
