import { describe, expect, it } from 'vitest';
import { KeyedRng, philox4x32, Purpose } from '../src/rng';

const hex = (out: Uint32Array) => [...out].map((x) => x.toString(16).padStart(8, '0'));

describe('philox4x32-10', () => {
  // Known-answer vectors from Random123's kat_vectors.
  it.each([
    [[0, 0, 0, 0], [0, 0], ['6627e8d5', 'e169c58d', 'bc57ac4c', '9b00dbd8']],
    [[0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], [0xffffffff, 0xffffffff], ['408f276d', '41c83b0e', 'a20bc7c6', '6d5451fd']],
    [[0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344], [0xa4093822, 0x299f31d0], ['d16cfe09', '94fdcceb', '5001e420', '24126ea1']],
  ])('matches the reference for counter %j key %j', (ctr, key, expected) => {
    const out = new Uint32Array(4);
    philox4x32(ctr[0]!, ctr[1]!, ctr[2]!, ctr[3]!, key[0]!, key[1]!, out);
    expect(hex(out)).toEqual(expected);
  });
});

describe('keyed draws', () => {
  it('depend only on their key, not on draw order or other draws', () => {
    const a = new KeyedRng('seed-1');
    const b = new KeyedRng('seed-1');
    const forward = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => a.uniform(7, Purpose.outcome, i));
    const backward = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((i) => b.uniform(7, Purpose.outcome, i)).reverse();
    expect(backward).toEqual(forward);
    b.uniform(8, Purpose.playoff, 3); // unrelated draw in between
    expect(b.uniform(7, Purpose.outcome, 4)).toBe(forward[4]);
  });

  it('differ across seeds, sims, purposes and entities', () => {
    const r = new KeyedRng('seed-1');
    const base = r.uniform(0, Purpose.outcome, 0);
    expect(new KeyedRng('seed-2').uniform(0, Purpose.outcome, 0)).not.toBe(base);
    expect(r.uniform(1, Purpose.outcome, 0)).not.toBe(base);
    expect(r.uniform(0, Purpose.playoff, 0)).not.toBe(base);
    expect(r.uniform(0, Purpose.outcome, 1)).not.toBe(base);
  });

  it('streams are reproducible and independent per entity', () => {
    const r = new KeyedRng('seed-1');
    const s1 = r.stream(3, Purpose.drift, 5);
    const s2 = r.stream(3, Purpose.drift, 5);
    const s3 = r.stream(3, Purpose.drift, 6);
    const x = [s1.uniform(), s1.uniform(), s1.uniform()];
    expect([s2.uniform(), s2.uniform(), s2.uniform()]).toEqual(x);
    expect(s3.uniform()).not.toBe(x[0]);
  });
});

describe('distributions', () => {
  const stream = new KeyedRng('dist').stream(0, Purpose.drift, 0);
  const n = 200_000;

  it('uniforms have mean 1/2 and variance 1/12', () => {
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) {
      const u = stream.uniform();
      sum += u;
      sq += u * u;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    expect(sq / n - (sum / n) ** 2).toBeCloseTo(1 / 12, 3);
  });

  it('student-t draws have unit variance and heavy tails', () => {
    const nu = 4.79;
    let sum = 0, sq = 0, beyond3 = 0;
    for (let i = 0; i < n; i++) {
      const t = stream.studentT(nu);
      sum += t;
      sq += t * t;
      if (Math.abs(t) > 3) beyond3++;
    }
    expect(sum / n).toBeCloseTo(0, 1);
    expect(sq / n).toBeGreaterThan(0.95);
    expect(sq / n).toBeLessThan(1.05);
    // A unit-variance normal puts 0.27% beyond 3 sd; this t puts about 1.1% there.
    expect(beyond3 / n).toBeGreaterThan(0.008);
    expect(beyond3 / n).toBeLessThan(0.014);
  });
});
