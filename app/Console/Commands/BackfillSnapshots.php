<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ResolvesSeason;
use App\Services\Snapshots\SnapshotRunner;
use App\Services\SportsCrunch\SeasonSync;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('snapshot:backfill
    {league=nfl : League code from config/leagues.php}
    {year? : Season year (default: the active season)}
    {--from= : First day, Y-m-d in the league\'s time zone (default: the regular season\'s start)}
    {--to= : Last day (default: the latest day whose snapshot time has passed)}
    {--sims= : Simulations per day (default: config snapshots.sims)}')]
#[Description('Reconstruct one snapshot per day at the league\'s daily snapshot time (02 §5)')]
class BackfillSnapshots extends Command
{
    use ResolvesSeason;

    public function handle(SnapshotRunner $runner, SeasonSync $sync): int
    {
        $league = (string) $this->argument('league');
        $season = $this->resolveSeason($sync, $league, $this->argument('year'));
        $sync->sync($league, $season->year); // once; the daily runs below reuse the mirror

        $tz = $season->league->timezone;
        $time = $season->league->daily_snapshot_time;
        $latest = CarbonImmutable::now()->subSeconds(config()->integer('snapshots.live_lag_seconds'));
        $from = $this->option('from') ?? $season->regular_season_start_date?->toDateString()
            ?? throw new \RuntimeException('The season has no start date; pass --from');
        $to = $this->option('to') ?? $latest->setTimezone($tz)->toDateString();
        $sims = $this->option('sims') === null ? null : (int) $this->option('sims');

        $counts = ['published' => 0, 'skipped' => 0];
        for ($day = CarbonImmutable::parse($from, $tz); $day->toDateString() <= $to; $day = $day->addDay()) {
            $asOf = CarbonImmutable::parse($day->toDateString().' '.$time, $tz)->utc();
            if ($asOf->gt($latest)) {
                break;
            }
            $outcome = $runner->run($season, $asOf, 'backfill', 'reconstructed', $sims, sync: false);
            $counts[$outcome->skipped() ? 'skipped' : 'published']++;
            $this->line(sprintf(
                '  %s  %s%s',
                $day->toDateString(),
                $outcome->skipped() ? 'unchanged, skipped' : "published {$outcome->snapshot?->id}",
                $outcome->current ? ' (current)' : '',
            ));
        }

        $this->components->info(sprintf('%s %d: %d published, %d skipped', strtoupper($league), $season->year, $counts['published'], $counts['skipped']));

        return self::SUCCESS;
    }
}
