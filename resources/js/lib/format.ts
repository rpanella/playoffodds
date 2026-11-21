// Number formatting for the odds pages (features/10 §5). Mirrors app/Support/Format.php.

/** One decimal; values that would round to 0 or 100 show as "<0.1%" and ">99.9%". */
export function pct(p: number | null | undefined): string {
    if (p === null || p === undefined) {
        return '–';
    }
    const value = Math.round(p * 1000) / 10;
    if (value <= 0) {
        return '<0.1%';
    }
    if (value >= 100) {
        return '>99.9%';
    }
    return `${value.toFixed(1)}%`;
}

/** A change in probability as points with an arrow, so it never relies on color: "▲ 4.1", "▼ 2.0", "0.0". */
export function change(d: number | null | undefined): string {
    if (d === null || d === undefined) {
        return '–';
    }
    const points = Math.round(d * 1000) / 10;
    if (points === 0) {
        return '0.0';
    }
    return `${points > 0 ? '▲' : '▼'} ${Math.abs(points).toFixed(1)}`;
}

export function record(r: { w: number; l: number; t: number }): string {
    return r.t > 0 ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`;
}

export interface Clinch {
    status: 'clinched' | 'eliminated' | 'alive';
    controls_destiny: boolean | null;
}

/** The strongest proven status, from the clinch check only (never from a probability). */
export function clinchLabel(
    clinch: Partial<Record<'playoffs' | 'division' | 'top_seed', Clinch>>,
): string | null {
    if (clinch.top_seed?.status === 'clinched') {
        return 'Clinched No. 1 seed';
    }
    if (clinch.division?.status === 'clinched') {
        return 'Clinched division';
    }
    if (clinch.playoffs?.status === 'clinched') {
        return 'Clinched playoff spot';
    }
    if (clinch.playoffs?.status === 'eliminated') {
        return 'Eliminated';
    }
    return null;
}
