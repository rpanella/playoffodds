<?php

namespace App\Console\Commands\Concerns;

use App\Models\Season;
use App\Services\SportsCrunch\SeasonSync;

trait ResolvesSeason
{
    /**
     * The season for `{league} {year?}`: the given year, or the latest active one. Syncs from
     * SportsCrunch first when the mirror doesn't have it yet.
     */
    protected function resolveSeason(SeasonSync $sync, string $league, ?string $year): Season
    {
        $find = fn (): ?Season => Season::query()
            ->whereRelation('league', 'code', $league)
            ->when($year !== null, fn ($q) => $q->where('year', (int) $year), fn ($q) => $q->where('status', 'active'))
            ->orderByDesc('year')
            ->first();

        $season = $find();
        if ($season === null) {
            $sync->sync($league, $year === null ? null : (int) $year);
            $season = $find();
        }

        return $season ?? throw new \RuntimeException("No {$league} season ".($year ?? 'active'));
    }
}
