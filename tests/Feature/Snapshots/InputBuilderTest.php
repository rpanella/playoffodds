<?php

use App\Models\Game;
use App\Services\Snapshots\InputBuilder;
use App\Services\Snapshots\SnapshotException;
use Carbon\CarbonImmutable;

require_once __DIR__.'/helpers.php';

beforeEach(function () {
    config(['services.sportscrunch.url' => 'https://sportscrunch.test', 'services.sportscrunch.token' => 'test-token']);
    $this->season = seedMirror2024(unplayed: 16);
    registerOddsFake();
    // Just before the first unplayed game.
    $this->asOf = CarbonImmutable::parse(Game::where('status', 'scheduled')->min('start_at'))->subHour();
});

it('builds teams, results, remaining games and the matchup matrix as the engine expects', function () {
    $input = app(InputBuilder::class)->build($this->season, $this->asOf, 'seed-1', 500);

    expect($input)->toMatchArray(['schema' => 'sim-input/1', 'league' => 'nfl', 'season' => 2024, 'current_week' => 17])
        ->and($input['params'])->toBe(['sims' => 500, 'seed' => 'seed-1', 'tie_rate' => 0.00373, 'drift' => 'nfl-line-drift@v2'])
        ->and($input['teams'])->toHaveCount(32)
        ->and($input['teams'][0])->toBe(['id' => 'nfl-ari', 'name' => 'Arizona Cardinals', 'conference' => 'NFC', 'division' => 'NFC West']);

    $byStatus = collect($input['games'])->groupBy('status');
    expect($byStatus['final'])->toHaveCount(256)->and($byStatus['scheduled'])->toHaveCount(16);
    expect($byStatus['final'][0])->toHaveKeys(['home_score', 'away_score'])->not->toHaveKey('p_home');
    $scheduled = $byStatus['scheduled'][0];
    expect($scheduled)->toMatchArray(['week' => 17, 'p_home' => 0.57])
        ->and($scheduled['p_source'])->toBe((int) substr($scheduled['id'], 3) % 2 === 1 ? 'projected' : 'market');

    // Matrix rows follow SportsCrunch's team order, labeled with engine IDs.
    expect($input['matchups'])->toMatchArray(['source' => 'sportscrunch', 'model' => 'test'])
        ->and($input['matchups']['teams'][0])->toBe('nfl-buf')
        ->and($input['matchups']['home'][0][1])->toBe(0.56)
        ->and($input['matchups']['home'][0][0])->toBeNull();
});

it('treats a game that is final now but started after as_of as unplayed', function () {
    $later = CarbonImmutable::parse(Game::where('status', 'final')->max('start_at'))->subDays(3);

    $input = app(InputBuilder::class)->build($this->season, $later, 'seed', 500);

    $unplayed = collect($input['games'])->where('status', 'scheduled');
    expect($unplayed->count())->toBeGreaterThan(16)
        ->and($unplayed->every(fn (array $g): bool => CarbonImmutable::parse($g['start'])->gte($later)))->toBeTrue();
});

it('fails when SportsCrunch has no odds for an unplayed game', function () {
    Game::where('status', 'scheduled')->first()->update(['sc_game_id' => 999999]);

    expect(fn () => app(InputBuilder::class)->build($this->season, $this->asOf, 'seed', 500))
        ->toThrow(SnapshotException::class, 'no odds for game 999999');
});

it('hashes content without as_of, the seed or the probabilities', function () {
    $builder = app(InputBuilder::class);
    $a = $builder->build($this->season, $this->asOf, 'seed-a', 500);
    fakeOdds(pHome: 0.58, matrix: 0.57);
    $b = $builder->build($this->season, $this->asOf->addMinute(), 'seed-b', 500);

    expect(InputBuilder::contentHash($a))->toBe(InputBuilder::contentHash($b))
        ->and(InputBuilder::maxProbabilityChange($a, $b))->toEqualWithDelta(0.01, 1e-9);

    // A result changes the content.
    Game::where('status', 'scheduled')->first()->update(['status' => 'final', 'home_score' => 20, 'away_score' => 17]);
    $c = $builder->build($this->season, $this->asOf->addDays(30), 'seed-c', 500);
    expect(InputBuilder::contentHash($c))->not->toBe(InputBuilder::contentHash($a));
});
