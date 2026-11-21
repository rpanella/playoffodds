<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ResolvesSeason;
use App\Services\SportsCrunch\SeasonSync;
use App\Services\SportsCrunch\SportsCrunchClient;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('sportscrunch:webhooks
    {league=nfl : League code}
    {year? : Season year (default: the active season)}
    {--subscribe : Subscribe to the season\'s game updates if not already subscribed}')]
#[Description('List this account\'s SportsCrunch webhook subscriptions, or subscribe to a season\'s games')]
class SportsCrunchWebhooks extends Command
{
    use ResolvesSeason;

    public function handle(SportsCrunchClient $client, SeasonSync $sync): int
    {
        $season = $this->resolveSeason($sync, (string) $this->argument('league'), $this->argument('year'));
        $existing = collect($client->webhookSubscriptions());
        $forSeason = $existing->filter(fn (array $s): bool => ($s['resource'] ?? null) === 'games' && ($s['season_id'] ?? null) === $season->sc_season_id);

        if ($this->option('subscribe') && $forSeason->isEmpty()) {
            // Every status change, not just finals: a corrected score or a postponement matters too, and
            // the receiver re-syncs the season whatever the event says.
            $created = $client->createWebhookSubscription($season->sc_season_id);
            $this->components->info("Subscribed to SportsCrunch season {$season->sc_season_id} games (subscription {$created['id']})");
            $existing->push($created);
        } elseif ($this->option('subscribe')) {
            $this->components->info('Already subscribed');
        }

        $this->table(['ID', 'Resource', 'SportsCrunch season', 'Filters'], $existing->map(fn (array $s): array => [
            $s['id'] ?? '', $s['resource'] ?? '', $s['season_id'] ?? '', json_encode($s['filters'] ?? null),
        ]));
        $this->line('  Deliveries go to the webhook URL on the SportsCrunch account; it should be '.route('webhooks.sportscrunch'));

        return self::SUCCESS;
    }
}
