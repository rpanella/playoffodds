import type { Clinch } from '@/lib/format';

export interface Meta {
    season: number;
    as_of: string;
    as_of_iso: string;
    stale: boolean;
    origin: 'live' | 'reconstructed';
    sims: number;
}

export interface League {
    code: string;
    name: string;
}

/** One team in the current snapshot (App\Services\Site\LeagueOdds::rows). */
export interface TeamRow {
    id: number;
    slug: string;
    name: string;
    short_name: string;
    abbreviation: string;
    conference: string;
    division: string;
    record: { w: number; l: number; t: number };
    seed_now: number | null;
    division_rank: number;
    wins: { mean: number; p10: number; p90: number };
    p_playoffs: number;
    p_division: number;
    p_top_seed: number;
    p_super_bowl: number | null;
    p_champion: number;
    change_1d: number | null;
    change_7d: number | null;
    clinch: Partial<Record<'playoffs' | 'division' | 'top_seed', Clinch>>;
}
