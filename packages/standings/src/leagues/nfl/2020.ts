import type { RulesModule } from '../../core/rules';
import {
  coinToss,
  combinedRankingAll,
  combinedRankingConference,
  commonGamesPct,
  conferencePct,
  divisionPct,
  headToHead,
  headToHeadSweep,
  netPointsAll,
  netPointsCommon,
  netPointsConference,
  netTouchdowns,
  strengthOfSchedule,
  strengthOfVictory,
} from '../../core/steps';

// Step order follows rules/nfl/2020.md exactly.
const divisionSteps = [
  headToHead,
  divisionPct,
  commonGamesPct(),
  conferencePct,
  strengthOfVictory,
  strengthOfSchedule,
  combinedRankingConference,
  combinedRankingAll,
  netPointsCommon,
  netPointsAll,
  netTouchdowns,
  coinToss,
];

const wildCardTail = [
  conferencePct,
  commonGamesPct(4),
  strengthOfVictory,
  strengthOfSchedule,
  combinedRankingConference,
  combinedRankingAll,
  netPointsConference,
  netPointsAll,
  netTouchdowns,
  coinToss,
];

export const nfl2020: RulesModule = {
  id: 'nfl@2020',
  league: 'nfl',
  seasons: { from: 2020, to: null },
  source: 'rules/nfl/2020.md',
  conferences: ['AFC', 'NFC'],
  format: { wildCards: 3, byes: 1 },
  division: {
    name: 'NFL division',
    pruneToDivisionLeaders: false,
    twoClub: divisionSteps,
    multiClub: divisionSteps,
  },
  wildCard: {
    name: 'NFL wild card',
    pruneToDivisionLeaders: true,
    twoClub: [headToHead, ...wildCardTail],
    multiClub: [headToHeadSweep, ...wildCardTail],
  },
};
