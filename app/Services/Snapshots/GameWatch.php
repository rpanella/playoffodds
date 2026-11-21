<?php

namespace App\Services\Snapshots;

use App\Models\CurrentSnapshot;
use App\Models\Season;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Questions the after-finals triggers ask of the mirror: is a game being played, and has a result
 * come in (or been corrected) since the current snapshot?
 */
class GameWatch
{
    /** SportsCrunch statuses that end a game's watch. */
    private const SETTLED = ['final', 'forfeit', 'canceled', 'postponed'];

    /** A game kicked off recently that the mirror doesn't have as settled yet. */
    public function gameInProgress(Season $season, ?CarbonImmutable $now = null): bool
    {
        $now ??= CarbonImmutable::now();

        return $season->games()
            ->whereBetween('start_at', [$now->subHours(config()->integer('snapshots.poll.in_progress_hours')), $now])
            ->whereNotIn('status', self::SETTLED)
            ->exists();
    }

    /** Whether the mirror's results differ from those the current snapshot counted. */
    public function resultsChanged(Season $season, ?CarbonImmutable $now = null): bool
    {
        $current = CurrentSnapshot::with('snapshot')->find($season->id)?->snapshot;
        if ($current?->results_sha256 === null) {
            return true;
        }
        $asOf = ($now ?? CarbonImmutable::now())->subSeconds(config()->integer('snapshots.live_lag_seconds'));

        return InputBuilder::mirrorResultsHash($season, $asOf) !== $current->results_sha256;
    }

    /**
     * Active seasons with a game in progress, for the polling fallback.
     *
     * @return Collection<int, Season>
     */
    public function seasonsToPoll(?CarbonImmutable $now = null): Collection
    {
        return Season::with('league')->where('status', 'active')->get()
            ->filter(fn (Season $s): bool => $this->gameInProgress($s, $now))
            ->values();
    }
}
