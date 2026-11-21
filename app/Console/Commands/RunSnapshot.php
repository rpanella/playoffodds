<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ResolvesSeason;
use App\Services\Snapshots\SnapshotRunner;
use App\Services\SportsCrunch\SeasonSync;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('snapshot:run
    {league=nfl : League code from config/leagues.php}
    {year? : Season year (default: the active season)}
    {--at= : Reconstruct the snapshot as of this past instant instead of now}
    {--sims= : Simulations (default: config snapshots.sims)}
    {--trigger=manual : scheduled, game_final, backfill or manual}
    {--no-sync : Skip refreshing the mirror from SportsCrunch first}')]
#[Description('Simulate a season and publish a snapshot (02 §3)')]
class RunSnapshot extends Command
{
    use ResolvesSeason;

    public function handle(SnapshotRunner $runner, SeasonSync $sync): int
    {
        $trigger = (string) $this->option('trigger');
        if (! in_array($trigger, SnapshotRunner::TRIGGERS, true)) {
            $this->components->error("Unknown trigger {$trigger}");

            return self::INVALID;
        }

        $season = $this->resolveSeason($sync, (string) $this->argument('league'), $this->argument('year'));
        $at = $this->option('at');
        $asOf = $at === null
            ? CarbonImmutable::now()->subSeconds(config()->integer('snapshots.live_lag_seconds'))->startOfSecond()
            : CarbonImmutable::parse($at)->utc()->startOfSecond();
        $sims = $this->option('sims') === null ? null : (int) $this->option('sims');

        $outcome = $runner->run($season, $asOf, $trigger, $at === null ? 'live' : 'reconstructed', $sims, ! $this->option('no-sync'));

        $label = strtoupper($season->league->code)." {$season->year} as of {$asOf->toIso8601ZuluString()}";
        if ($outcome->skipped()) {
            $this->components->info("{$label}: unchanged since snapshot {$outcome->previous?->id}, skipped");
        } else {
            $s = $outcome->snapshot;
            $this->components->info(sprintf(
                '%s: snapshot %s published%s (%d sims in %d ms, %d tiebreak draws)',
                $label, $s?->id, $outcome->current ? ' and current' : '', $s?->sims, $s?->runtime_ms, $s?->diagnostics['tiebreak_draws']['count'] ?? 0,
            ));
        }

        return self::SUCCESS;
    }
}
