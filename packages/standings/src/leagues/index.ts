import type { RulesModule } from '../core/rules';
import { InputError } from '../core/season';
import { nfl2020 } from './nfl/2020';

export const RULES: readonly RulesModule[] = [nfl2020];

/** Exactly one rules module must cover the league-season. */
export function selectRules(league: string, season: number): RulesModule {
  const matches = RULES.filter(
    (r) => r.league === league && season >= r.seasons.from && (r.seasons.to === null || season <= r.seasons.to),
  );
  if (matches.length !== 1) {
    throw new InputError(`expected one rules module for ${league} ${season}, found ${matches.length}`);
  }
  return matches[0]!;
}
