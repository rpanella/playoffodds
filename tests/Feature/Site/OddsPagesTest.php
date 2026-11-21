<?php

// The odds pages on a real snapshot: the 2024 season with week 17 (16 games) left, run through the engine.

use App\Models\CurrentSnapshot;
use App\Models\Game;
use App\Models\Season;
use App\Services\Site\LeagueOdds;
use App\Services\Snapshots\SnapshotRunner;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

require_once __DIR__.'/../Snapshots/helpers.php';

beforeEach(function () {
    if (! is_file(base_path('packages/cli/dist/simulate.mjs')) || ! is_file(base_path('packages/cli/dist/standings.mjs'))) {
        Process::path(base_path())->run(['node', 'packages/cli/build.mjs'])->throw();
    }
    config(['services.sportscrunch.url' => 'https://sportscrunch.test', 'services.sportscrunch.token' => 'test-token', 'inertia.ssr.enabled' => false]);
    Storage::fake('local');
    $this->season = seedMirror2024(unplayed: 16);
    registerOddsFake();
    $this->asOf = CarbonImmutable::parse(Game::where('status', 'scheduled')->min('start_at'))->subHour();
    app(SnapshotRunner::class)->run($this->season, $this->asOf, 'manual', 'live', sims: 300, sync: false);
});

it('shows the league table grouped by conference and division', function () {
    $this->get('/nfl')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('League/Index')
        ->where('league.code', 'nfl')
        ->where('meta.season', 2024)
        ->where('meta.sims', 300)
        ->has('conferences', 2)
        ->has('conferences.0.divisions', 4)
        ->has('conferences.0.divisions.0.teams', 4)
        ->has('conferences.0.divisions.0.teams.0', fn (Assert $t) => $t
            ->hasAll(['slug', 'name', 'record', 'seed_now', 'wins', 'p_playoffs', 'p_division', 'p_top_seed', 'p_super_bowl', 'p_champion', 'change_1d', 'change_7d', 'clinch'])
            ->has('clinch', 3)
            ->etc()));
});

it('shows each seed and missing the playoffs, summing to one per team', function () {
    $this->get('/nfl/seeds')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('League/Seeds')
        ->has('conferences', 2)
        ->has('conferences.0.teams', 16)
        ->where('conferences.0.teams', fn ($teams) => collect($teams)->every(
            fn ($t) => abs(array_sum($t['p_seed']) + $t['p_miss'] - 1) < 1e-6 && count($t['p_seed']) === 7,
        )));
});

it('shows a team page with the answer sentence, history and schedule', function () {
    $this->get('/nfl/buffalo-bills')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('League/Team')
        ->where('team.slug', 'buffalo-bills')
        ->where('answer', fn (string $a) => (bool) preg_match('/^The Bills (have a [<>]?\d+(\.\d)?% chance to make the playoffs|have clinched a playoff spot|have been eliminated)/', $a))
        ->has('history', 1)
        ->where('history.0.origin', 'live')
        ->has('games.remaining', 1)
        ->has('games.results', 16)
        ->where('games.remaining.0.p_win', fn ($p) => $p > 0 && $p < 1));
});

it('answers 404 for an unknown team or league', function () {
    $this->get('/nfl/not-a-team')->assertNotFound();
    $this->get('/xfl')->assertNotFound();
});

it('lists the current run on the methodology page and every page in the sitemap', function () {
    $this->get('/methodology')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Methodology')
        ->where('current.0.sims', 300)
        ->where('current.0.rules_id', 'nfl@2020')
        ->where('current.0.clinch_method', 'conservative-bnb@1'));

    $xml = $this->get('/sitemap.xml')->assertOk()->assertHeader('Content-Type', 'application/xml')->getContent();
    expect(substr_count($xml, '<loc>'))->toBe(2 + 2 + 32)->and($xml)->toContain('/nfl/buffalo-bills');
});

it('flags stale odds a day after the last run, or hours after a result it has not counted', function () {
    $odds = app(LeagueOdds::class);
    $season = Season::with('league')->find($this->season->id);
    $snapshot = CurrentSnapshot::find($season->id)->snapshot;

    expect($odds->isStale($season, $snapshot, $this->asOf->addHours(2)))->toBeFalse()
        ->and($odds->isStale($season, $snapshot, $this->asOf->addHours(27)))->toBeTrue();

    // A game goes final in the mirror; 8 hours after its kickoff the run still hasn't counted it.
    $game = Game::where('status', 'scheduled')->orderBy('start_at')->first();
    $game->update(['status' => 'final', 'home_score' => 20, 'away_score' => 10]);
    $kickoff = CarbonImmutable::parse($game->start_at);
    expect($odds->isStale($season, $snapshot, $kickoff->addHours(3)))->toBeFalse()
        ->and($odds->isStale($season, $snapshot, $kickoff->addHours(8)))->toBeTrue();
});
