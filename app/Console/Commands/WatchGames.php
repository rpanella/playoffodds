<?php

namespace App\Console\Commands;

use App\Jobs\ProcessGameUpdates;
use App\Services\Snapshots\GameWatch;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('snapshot:watch')]
#[Description('Polling fallback for SportsCrunch webhooks: queue a game check for each season with a game in progress')]
class WatchGames extends Command
{
    public function handle(GameWatch $watch): int
    {
        $seasons = $watch->seasonsToPoll();
        foreach ($seasons as $season) {
            ProcessGameUpdates::dispatch($season->id, 'poll');
        }
        $this->components->info($seasons->isEmpty()
            ? 'No games in progress'
            : 'Queued a check for '.$seasons->map(fn ($s): string => strtoupper($s->league->code)." {$s->year}")->implode(', '));

        return self::SUCCESS;
    }
}
