/** Simulation-side league format: playoff rounds and the week each is played (drift horizon). */
export interface BracketFormat {
  seedsPerConference: number;
  byes: number;
  /** Conferences whose champions meet in the final. */
  conferences: number;
  /** Teams in every division (the NFL's 32-team alignment is 2 × 4 × 4). */
  teamsPerDivision: number;
  /** Rounds in order; the last is the final between conference champions. `weeksAfter` counts from the last regular-season week. */
  rounds: { name: string; weeksAfter: number; neutral: boolean }[];
  /** Regular-season length by season range, for placing the playoff rounds. */
  calendars: { from: number; to: number | null; regularSeasonWeeks: number }[];
}

export const BRACKETS: Record<string, BracketFormat> = {
  // 2020 format: seeds 1-7, seed 1 has a bye, reseeding every round, neutral-site Super Bowl
  // after a bye week. The regular season was 17 weeks in 2020 and 18 from 2021.
  nfl: {
    seedsPerConference: 7,
    byes: 1,
    conferences: 2,
    teamsPerDivision: 4,
    rounds: [
      { name: 'wild_card', weeksAfter: 1, neutral: false },
      { name: 'divisional', weeksAfter: 2, neutral: false },
      { name: 'conference', weeksAfter: 3, neutral: false },
      { name: 'super_bowl', weeksAfter: 5, neutral: true },
    ],
    calendars: [
      { from: 2020, to: 2020, regularSeasonWeeks: 17 },
      { from: 2021, to: null, regularSeasonWeeks: 18 },
    ],
  },
};

/** The last regular-season week of `season`, or null when no calendar covers it. */
export function regularSeasonWeeks(bracket: BracketFormat, season: number): number | null {
  const cal = bracket.calendars.find((c) => season >= c.from && (c.to === null || season <= c.to));
  return cal?.regularSeasonWeeks ?? null;
}
