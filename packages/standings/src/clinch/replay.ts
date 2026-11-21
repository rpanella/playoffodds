import type { StandingsInput } from '../types';
import { computeClinch } from './compute';

const DAY = 86_400_000;
const ET = 5 * 3600_000; // close enough for day boundaries; daylight saving only shifts by an hour

/** The first moment a status held in a replay. */
export interface FirstClinch {
  team: string;
  type: 'playoff_berth' | 'division' | 'top_seed' | 'eliminated';
  /** NFL week by date (weeks run Wednesday to Tuesday from the opener). */
  after_week: number;
  /** Eastern date of the kickoff slot after which it first held. */
  date: string;
  /** The games of that slot, as away@home. */
  after_games: string[];
}

/** The NFL week of instant `t`, counting from the season's first kickoff. */
export function weekOf(opener: number, t: number): number {
  const openerDay = Math.floor((opener - ET) / DAY) * DAY + ET;
  return Math.floor((t - (openerDay - DAY)) / (7 * DAY)) + 1;
}

/**
 * Replays a finished season kickoff slot by kickoff slot (games starting at the same time count together)
 * and records when each team first clinched a playoff spot, its division or the top seed, or was
 * eliminated, under the conservative check (features/14 §4). Throws if a proven status ever reverts.
 */
export function replayClinches(full: StandingsInput): FirstClinch[] {
  const games = full.games.filter((g) => g.status === 'final').sort((a, b) => a.start!.localeCompare(b.start!));
  const opener = Date.parse(games[0]!.start!);
  const slots = [...new Set(games.map((g) => g.start!))];
  const first = new Map<string, FirstClinch>();
  const last = new Map<string, string>();

  for (const slot of slots) {
    const t = Date.parse(slot);
    const input: StandingsInput = {
      ...full,
      games: full.games.map((g) => (g.status === 'final' && Date.parse(g.start!) <= t ? g : { ...g, status: 'scheduled' as const, home_score: null, away_score: null })),
    };
    for (const st of computeClinch(input, { destiny: false }).statuses) {
      const key = `${st.team}|${st.target}`;
      const before = last.get(key);
      if ((before === 'clinched' || before === 'eliminated') && st.status !== before) {
        throw new Error(`${full.season} ${key}: ${before} after an earlier slot but ${st.status} after ${slot}`);
      }
      last.set(key, st.status);
      const type = st.status === 'clinched' ? ({ playoffs: 'playoff_berth', division: 'division', top_seed: 'top_seed' } as const)[st.target]
        : st.status === 'eliminated' && st.target === 'playoffs' ? 'eliminated' : null;
      if (type === null || first.has(`${st.team}|${type}`)) continue;
      first.set(`${st.team}|${type}`, {
        team: st.team,
        type,
        after_week: weekOf(opener, t),
        date: new Date(t - ET).toISOString().slice(0, 10),
        after_games: games.filter((g) => g.start === slot).map((g) => `${g.away}@${g.home}`),
      });
    }
  }
  return [...first.values()];
}
