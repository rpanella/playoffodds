import { describe, expect, it } from 'vitest';
import { change, clinchLabel, pct, record } from './format';

describe('pct', () => {
    it('shows one decimal and never 0% or 100%', () => {
        expect(pct(0.874)).toBe('87.4%');
        expect(pct(0.0004)).toBe('<0.1%');
        expect(pct(0)).toBe('<0.1%');
        expect(pct(0.0005)).toBe('0.1%');
        expect(pct(0.9994)).toBe('99.9%');
        expect(pct(0.9995)).toBe('>99.9%');
        expect(pct(1)).toBe('>99.9%');
        expect(pct(null)).toBe('–');
    });
});

describe('change', () => {
    it('uses arrows as well as color', () => {
        expect(change(0.041)).toBe('▲ 4.1');
        expect(change(-0.02)).toBe('▼ 2.0');
        expect(change(0.0002)).toBe('0.0');
        expect(change(null)).toBe('–');
    });
});

describe('record and clinch labels', () => {
    it('formats records and picks the strongest proven status', () => {
        expect(record({ w: 9, l: 2, t: 0 })).toBe('9-2');
        expect(record({ w: 9, l: 2, t: 1 })).toBe('9-2-1');
        const alive = { status: 'alive', controls_destiny: true } as const;
        expect(
            clinchLabel({ playoffs: alive, division: alive, top_seed: alive }),
        ).toBeNull();
        expect(
            clinchLabel({
                playoffs: { status: 'clinched', controls_destiny: null },
                division: alive,
            }),
        ).toBe('Clinched playoff spot');
        expect(
            clinchLabel({
                playoffs: { status: 'clinched', controls_destiny: null },
                division: { status: 'clinched', controls_destiny: null },
            }),
        ).toBe('Clinched division');
        expect(
            clinchLabel({
                playoffs: { status: 'eliminated', controls_destiny: null },
            }),
        ).toBe('Eliminated');
    });
});
