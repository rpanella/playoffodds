/**
 * Keyed, counter-based randomness (D51). Every draw is addressed by (run seed, sim, purpose,
 * entity), so sims are independent of each other and of thread scheduling, and forcing one game
 * leaves every other draw unchanged.
 *
 * - Single draws (game outcomes, playoff games) read one 32-bit word of a Philox4x32-10 block.
 * - Sequences (a team's drift walk, tiebreak draws) use an sfc32 stream seeded from a Philox block.
 */
export const RNG_ID = 'philox4x32-10+sfc32@1';

/** Append-only: changing a value changes every result. */
export const Purpose = {
  drift: 1,
  outcome: 2,
  tiebreak: 3,
  playoff: 4,
} as const;
export type Purpose = (typeof Purpose)[keyof typeof Purpose];

const M0 = 0xd2511f53;
const M1 = 0xcd9e8d57;
const W0 = 0x9e3779b9;
const W1 = 0xbb67ae85;
const TWO_POW_32 = 4294967296;

/** High 32 bits of the 64-bit product of two uint32s, exact in doubles via 16-bit halves. */
function mulhi(a: number, b: number): number {
  const aLo = a & 0xffff;
  const aHi = a >>> 16;
  const bLo = b & 0xffff;
  const bHi = b >>> 16;
  const loLo = aLo * bLo;
  const hiLo = aHi * bLo;
  const loHi = aLo * bHi;
  const cross = (loLo >>> 16) + (hiLo & 0xffff) + loHi;
  return (aHi * bHi + (hiLo >>> 16) + Math.floor(cross / 65536)) >>> 0;
}

/** Philox4x32-10 (Salmon et al., Random123). Writes 4 uint32s into `out`. */
export function philox4x32(c0: number, c1: number, c2: number, c3: number, k0: number, k1: number, out: Uint32Array): void {
  for (let r = 0; r < 10; r++) {
    if (r > 0) {
      k0 = (k0 + W0) >>> 0;
      k1 = (k1 + W1) >>> 0;
    }
    const hi0 = mulhi(M0, c0);
    const lo0 = Math.imul(M0, c0) >>> 0;
    const hi1 = mulhi(M1, c2);
    const lo1 = Math.imul(M1, c2) >>> 0;
    c0 = (hi1 ^ c1 ^ k0) >>> 0;
    c1 = lo1;
    c2 = (hi0 ^ c3 ^ k1) >>> 0;
    c3 = lo0;
  }
  out[0] = c0;
  out[1] = c1;
  out[2] = c2;
  out[3] = c3;
}

/** FNV-1a 64 of the seed's UTF-8 bytes, split into the two Philox key words. */
export function seedKey(seed: string): [number, number] {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(seed)) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return [Number(h >> 32n), Number(h & 0xffffffffn)];
}

export class KeyedRng {
  readonly k0: number;
  readonly k1: number;
  private readonly block = new Uint32Array(4);
  private cached = { sim: -1, purpose: -1, entity: -1 };

  constructor(seed: string) {
    [this.k0, this.k1] = seedKey(seed);
  }

  /**
   * Uniform in [0, 1) for the `index`-th single draw of (sim, purpose). Four consecutive indices
   * share one Philox block; a one-block cache makes walking them in order cheap.
   */
  uniform(sim: number, purpose: Purpose, index: number): number {
    const entity = index >>> 2;
    const c = this.cached;
    if (c.sim !== sim || c.purpose !== purpose || c.entity !== entity) {
      philox4x32(sim >>> 0, purpose, entity, 0, this.k0, this.k1, this.block);
      c.sim = sim;
      c.purpose = purpose;
      c.entity = entity;
    }
    return this.block[index & 3]! / TWO_POW_32;
  }

  /** An independent sequential stream for (sim, purpose, entity). */
  stream(sim: number, purpose: Purpose, entity: number): Stream {
    const b = new Uint32Array(4);
    // Counter word 3 = 1 keeps stream seeds disjoint from single-draw blocks.
    philox4x32(sim >>> 0, purpose, entity >>> 0, 1, this.k0, this.k1, b);
    return new Stream(b[0]!, b[1]!, b[2]!, b[3]!);
  }
}

/** sfc32 (Chris Doty-Humphrey's Small Fast Counting generator), plus the distributions we need. */
export class Stream {
  // State lives in a typed array: 32-bit values outside V8's small-integer range would otherwise
  // be boxed on every update.
  private readonly s = new Int32Array(4);
  private spareNormal = NaN;

  constructor(a: number, b: number, c: number, d: number) {
    this.s[0] = a;
    this.s[1] = b;
    this.s[2] = c;
    this.s[3] = d;
    for (let i = 0; i < 8; i++) this.nextU32();
  }

  nextU32(): number {
    const s = this.s;
    const a = s[0]!, b = s[1]!, c = s[2]!, d = s[3]!;
    const t = (((a + b) | 0) + d) | 0;
    s[3] = d + 1;
    s[0] = b ^ (b >>> 9);
    s[1] = (c + (c << 3)) | 0;
    s[2] = (((c << 21) | (c >>> 11)) + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  uniform(): number {
    return this.nextU32() / TWO_POW_32;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.uniform() * n);
  }

  /** Standard normal (Marsaglia polar method; the second variate is kept for the next call). */
  normal(): number {
    if (!Number.isNaN(this.spareNormal)) {
      const z = this.spareNormal;
      this.spareNormal = NaN;
      return z;
    }
    let u: number, v: number, s: number;
    do {
      u = 2 * this.uniform() - 1;
      v = 2 * this.uniform() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * m;
    return u * m;
  }

  /** Student-t with `nu` degrees of freedom scaled to unit variance (Bailey's polar method). */
  studentT(nu: number): number {
    let u: number, v: number, w: number;
    do {
      u = 2 * this.uniform() - 1;
      v = 2 * this.uniform() - 1;
      w = u * u + v * v;
    } while (w >= 1 || w === 0);
    // w^(-2/nu) via exp/log: several times faster than Math.pow in V8.
    const t = u * Math.sqrt((nu * (Math.exp((-2 / nu) * Math.log(w)) - 1)) / w);
    return t * Math.sqrt((nu - 2) / nu);
  }
}
