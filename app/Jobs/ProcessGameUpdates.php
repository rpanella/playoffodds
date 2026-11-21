<?php

namespace App\Jobs;

use App\Models\Season;
use App\Services\Snapshots\GameWatch;
use App\Services\Snapshots\SnapshotLockedException;
use App\Services\Snapshots\SnapshotRunner;
use App\Services\SportsCrunch\SeasonSync;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * After a SportsCrunch webhook or a poll: re-sync the season, and if a result has come in since the
 * current snapshot, run one (02 §3 step 1). One pending job per season, so triggers that arrive
 * together share a run; a trigger during a run queues the next one.
 */
class ProcessGameUpdates implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [60, 300];

    public int $timeout = 600;

    public int $uniqueFor = 1800;

    /** @param  string  $source  webhook or poll, for the log. */
    public function __construct(public int $seasonId, public string $source) {}

    public function uniqueId(): string
    {
        return (string) $this->seasonId;
    }

    public function handle(SeasonSync $sync, GameWatch $watch, SnapshotRunner $runner): void
    {
        $season = Season::with('league')->find($this->seasonId);
        if ($season === null) {
            return;
        }

        $sync->sync($season->league->code, $season->year);
        if (! $watch->resultsChanged($season)) {
            return;
        }
        if (config('snapshots.after_finals.mode') === 'window' && $watch->gameInProgress($season)) {
            return; // the window's last final triggers the run
        }

        $asOf = CarbonImmutable::now()->subSeconds(config()->integer('snapshots.live_lag_seconds'))->startOfSecond();
        try {
            $runner->run($season, $asOf, 'game_final', 'live', sync: false);
        } catch (SnapshotLockedException) {
            $this->release(60); // the daily or another run is going; check again after it
        }
    }
}
