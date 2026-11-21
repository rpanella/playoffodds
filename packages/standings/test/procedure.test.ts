import { describe, expect, it } from 'vitest';
import type { TieContext } from '../src/core/context';
import { pickWinner, type Procedure } from '../src/core/procedure';
import type { Step } from '../src/core/steps';

/** A step that records its calls and returns scripted survivors (or everyone). */
function scripted(id: string, log: string[], script: Record<string, number[]>): Step {
  return {
    id,
    apply(clubs) {
      log.push(`${id}:${clubs.join(',')}`);
      return script[clubs.join(',')] ?? clubs;
    },
  };
}

const ctx = { s: { scoresComplete: true }, trace: null, idx: { divOf: new Int32Array(8) } } as unknown as TieContext;

describe('pickWinner restarts', () => {
  it('restarts the multi-club steps when 4 clubs become 3, and the two-club steps when they become 2', () => {
    const log: string[] = [];
    const a = scripted('a', log, { '0,1,2,3': [0, 1, 2] });
    const b = scripted('b', log, { '0,1,2': [0, 1] });
    const x = scripted('x', log, { '0,1': [1] });
    const proc: Procedure = { name: 'test', pruneToDivisionLeaders: false, twoClub: [x], multiClub: [a, b] };
    expect(pickWinner([0, 1, 2, 3], proc, ctx)).toBe(1);
    expect(log).toEqual(['a:0,1,2,3', 'a:0,1,2', 'b:0,1,2', 'x:0,1']);
  });

  it('a club that wins outright ends the step without restarting', () => {
    const log: string[] = [];
    const a = scripted('a', log, {});
    const b = scripted('b', log, { '0,1,2': [2] });
    const proc: Procedure = { name: 'test', pruneToDivisionLeaders: false, twoClub: [], multiClub: [a, b] };
    expect(pickWinner([0, 1, 2], proc, ctx)).toBe(2);
    expect(log).toEqual(['a:0,1,2', 'b:0,1,2']);
  });
});
