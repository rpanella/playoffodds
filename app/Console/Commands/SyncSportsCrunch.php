<?php

namespace App\Console\Commands;

use App\Services\SportsCrunch\SeasonSync;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('sportscrunch:sync
    {league=nfl : League code from config/leagues.php}
    {year? : Season year (default: the active season)}
    {--force : Allow removing more than 10% of the season\'s games}')]
#[Description('Copy a league-season\'s teams, alignment and games from SportsCrunch')]
class SyncSportsCrunch extends Command
{
    public function handle(SeasonSync $sync): int
    {
        $league = (string) $this->argument('league');
        $year = $this->argument('year');
        $result = $sync->sync($league, $year === null ? null : (int) $year, (bool) $this->option('force'));

        $this->components->info(sprintf(
            '%s %d: %d teams, %d games (%d new, %d removed)',
            strtoupper($league), $result->season->year, $result->teams, $result->games, $result->added, $result->removed,
        ));

        return self::SUCCESS;
    }
}
