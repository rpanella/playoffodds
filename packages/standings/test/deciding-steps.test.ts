// Each scenario ties every step before the one under test, in the full 32-team league, and
// checks that step decides (through the trace) and picks the club the official rule picks.
import { describe, expect, it } from 'vitest';
import { computeStandings, type StandingsInput } from '../src';
import { fullScenario } from './helpers';

/** The trace entries for one tie context, as "step: clubs -> survivors". */
function decisions(input: StandingsInput, context: string): string[] {
  const out = computeStandings(input, { trace: true });
  return out.trace!.filter((t) => t.context === context).map((t) => `${t.step}: ${t.clubs.join(' ')} -> ${t.survivors.join(' ')}`);
}

const seedsAFC = (input: StandingsInput) => computeStandings(input).seeds.AFC!;

// e1 and e2 split, both beat e3 and n1, and each loses one more game. Through step 4 they tie:
// head-to-head 1-1, division 2-1, common games (e3, n1, and any shared opponent) and conference 3-1.
// Their opponents are the same apart from the extra loss, and they share a record, so strength of
// victory ties too.
const divisionPair = (e1e3: string, e2e3: string, e1Loss: string, e2Loss: string) => [
  'e1>e2', 'e2>e1', e1e3, e2e3, 'e1>n1', 'e2>n1', e1Loss, e2Loss,
];

describe('division, two clubs', () => {
  it('strength of schedule decides: a loss to a stronger team helps', () => {
    const input = fullScenario([
      ...divisionPair('e1>e3', 'e2>e3', 'xe1>e1', 'xe2>e2'),
      'xe1>xn1', 'xe1>xn2', // xe1 3-0
      'xn3>xe2', // xe2 1-1
    ]);
    expect(decisions(input, 'AFC East division')[0]).toBe('strength_of_schedule: e1 e2 -> e1');
  });

  it('combined ranking among conference teams decides, with a shared points-allowed rank', () => {
    // Both lose to xe1, so strength of schedule ties. e1 scores 100 (1st in the AFC), e2 80 (2nd);
    // both allow 70, so they share a points-allowed rank.
    const input = fullScenario(divisionPair('e1 40-10 e3', 'e2>e3', 'xe1>e1', 'xe1>e2'));
    expect(decisions(input, 'AFC East division')[0]).toBe('combined_ranking_conference: e1 e2 -> e1');
  });

  it('clubs tied for a points rank each get that rank ("1, 1, 3"), so the conference ranking can tie', () => {
    // AFC points scored: e1 90 and n2 90 share 1st, so e2 (80) is 3rd. Points allowed: e2 70 (14th),
    // w1 75 (15th), e1 80 (16th). Conference sums: e1 1 + 16 = 17, e2 3 + 14 = 17, a tie. Ranked
    // 1, 1, 2 instead, e2 would win here. Among all teams xs1 (85 scored) sits between them:
    // e1 1 + 30 = 31, e2 4 + 28 = 32, so e1 wins the all-teams ranking.
    const input = fullScenario([
      ...divisionPair('e1 30-10 e3', 'e2>e3', 'xe1 30-10 e1', 'xe1 20-10 e2'),
      'n2 90-0 xn4', 'xw1 75-0 w1', 'xs1 85-0 xs2',
    ]);
    expect(decisions(input, 'AFC East division')[0]).toBe('combined_ranking_all: e1 e2 -> e1');
  });

  it('net points in common games decides', () => {
    // Points totals are equal (90 for, 70 against), so both rankings tie. Common opponents are e3 and
    // n1: e1 +30 (30-10, 20-10), e2 +25 (25-10, 20-10). The losses are to different 1-0 teams.
    const input = fullScenario(divisionPair('e1 30-10 e3', 'e2 25-10 e3', 'xe1 20-10 e1', 'xe2 20-15 e2'));
    expect(decisions(input, 'AFC East division')[0]).toBe('net_points_common: e1 e2 -> e1');
  });

  it('net points in all games decides', () => {
    // Common games are both +20. e1 scores 100 and allows 81 (+19), e2 90 and 75 (+15). Rankings
    // tie: scored 1st and 2nd, allowed 16th and 15th in the AFC (32nd and 31st overall).
    const input = fullScenario(divisionPair('e1>e3', 'e2>e3', 'xe1 31-30 e1', 'xe2 25-20 e2'));
    expect(decisions(input, 'AFC East division')[0]).toBe('net_points_all: e1 e2 -> e1');
  });
});

describe('division, three clubs', () => {
  it('when one club drops out, the other two restart at head-to-head', () => {
    // e1 swept e2, e2 swept e3, e3 swept e1: 2-2 each among the three. e4 splits with e1 and e2 and
    // sweeps e3, so e3's division record (2-4) drops it. All three are 3-4.
    // Restarting, e1 beat e2 twice. Carrying on to common games instead would pick e2 (3-1 against
    // e3 and e4, to e1's 1-3).
    const input = fullScenario([
      'e1>e2', 'e2<e1', 'e2>e3', 'e3<e2', 'e3>e1', 'e1<e3',
      'e1>e4', 'e4>e1', 'e2>e4', 'e4>e2', 'e4>e3', 'e3<e4',
      'xe1>e1', 'xe2>e2', 'e3>xe3',
      'xn1>e4', 'xn2>e4', 'xn3>e4', 'xn4>e4', // e4 4-6
    ]);
    expect(decisions(input, 'AFC East division').slice(0, 2)).toEqual([
      'division_record: e1 e2 e3 -> e1 e2',
      'head_to_head: e1 e2 -> e1',
    ]);
  });
});

describe('wild card', () => {
  it('keeps only the top club of each division, and repeats that for every spot', () => {
    // e2, e3 and n2 are 4-2 behind four division winners. e2 has the best conference record (4-2),
    // so without the division step it would be seed 5. But e3 swept e2, so e3 represents the AFC
    // East; n2 beats e3 on conference record (3-2 to 2-2) for seed 5. For seed 6 the step runs
    // again: e2 and e3 are left, and the division order puts e3 first.
    const input = fullScenario([
      'e3>e2', 'e2<e3',
      'e2>s3', 'e2>s4', 'e2>w3', 'e2>w4',
      'e3>xe1', 'e3>xe2', 'n3>e3', 'n4>e3',
      'n2>s3', 'n2>w3', 'n2>w4', 'n2>xn1', 's4>n2', 'w2>n2',
      'xs1>n3', 'xs2>n3', 'xs1>n4', 'xs2>n4', 'xs3>w2', 'xs4>w2', 'xs3>s4', // fillers 1-2 or worse
      ...['xe1', 'xe2', 'xe3', 'xe4', 'xn1', 'xn2', 'xn3'].map((o) => `e1>${o}`), // e1 7-0
      ...['xe1', 'xe2', 'xe3', 'xe4', 'xn1', 'xn2'].map((o) => `n1>${o}`), 'xn4>n1', // n1 6-1
      ...['xw1', 'xw2', 'xw3', 'xw4', 'xs1'].map((o) => `s1>${o}`), 'xs2>s1', // s1 5-1
      ...['xw1', 'xw2', 'xw3', 'xw4'].map((o) => `w1>${o}`), 'xs4>w1', // w1 4-1
    ]);
    expect(seedsAFC(input)).toEqual(['e1', 'n1', 's1', 'w1', 'n2', 'e3', 'e2']);
    expect(decisions(input, 'AFC wild card').slice(0, 2)).toEqual([
      'division_pruning: e2 e3 n2 -> e3 n2',
      'conference_record: e3 n2 -> n2',
    ]);
  });

  it('strength of victory counts a club beaten twice twice', () => {
    // e2 beat e3 (1-3) twice and xs1 (3-1): 5-7 counted per win, .417 (4-4 counted once per club).
    // n2 beat n3 (1-1), n4 (1-1) and xs2 (1-2): 3-4, .429. Both 3-2, conference 2-0, and only two
    // common opponents (xw1, xw2), so the common-games step doesn't apply.
    const input = fullScenario([
      'e2>e3', 'e3<e2', 'e2>xs1', 'xw1>e2', 'xw2>e2',
      'n2>n3', 'n4<n2', 'n2>xs2', 'xw1>n2', 'xw2>n2',
      'xn2>e3', 'e3>xn3', // e3 1-3
      'xs1>xn4', 'xs1>xe3', 'xs1>xe4', // xs1 3-1
      'n3>xe1', 'n4>xe2', 'xs2>xn4', 'xn1>xs2', // n3 1-1, n4 1-1, xs2 1-2
      'e1>xn1', 'e1>xn2', 'n1>xn3', // division winners
    ]);
    expect(decisions(input, 'AFC wild card')[0]).toBe('strength_of_victory: e2 n2 -> n2');
  });

  it('net points in conference games decides', () => {
    // Same five opponents and results (4-1, conference 2-0), the same totals (100 for, 65 against),
    // so every earlier step ties. Conference games: e2 +30 (30-10, 20-10), n2 +25 (25-10, 20-10).
    const input = fullScenario([
      'e2 30-10 s3', 'e2 20-10 s4', 'e2 20-10 xs3', 'e2 20-15 xs4', 'xw1>e2',
      'n2 25-10 s3', 'n2 20-10 s4', 'n2 20-10 xs3', 'n2 25-15 xs4', 'xw1>n2',
      ...['xe1', 'xe2', 'xe3', 'xe4', 'xn1'].map((o) => `e1>${o}`),
      ...['xe1', 'xe2', 'xe3', 'xe4', 'xn1'].map((o) => `n1>${o}`),
      's1>xn2', 'w1>xn3',
    ]);
    expect(seedsAFC(input).slice(4, 6)).toEqual(['e2', 'n2']);
    expect(decisions(input, 'AFC wild card')[0]).toBe('net_points_conference: e2 n2 -> e2');
  });
});
