<?php

use App\Models\Game;
use App\Models\League;
use App\Models\Season;
use App\Models\SeasonTeam;
use App\Models\Team;
use App\Services\SportsCrunch\SeasonSync;
use App\Services\SportsCrunch\SportsCrunchException;
use Illuminate\Support\Facades\Http;

const SC = 'https://sportscrunch.test/api/v1';

beforeEach(function () {
    config(['services.sportscrunch.url' => 'https://sportscrunch.test', 'services.sportscrunch.token' => 'test-token']);
    Http::preventStrayRequests();
    // The fake reads test()->sc when a request is made, so a test can change the responses between syncs.
    Http::fake([
        SC.'/seasons?league=nfl' => fn () => Http::response(['data' => [
            ['id' => 120, 'year' => 2025, 'league' => 'nfl', 'status' => 'complete'],
            ['id' => 140, 'year' => 2026, 'league' => 'nfl', 'status' => 'active', 'regular_season_start_date' => '2026-09-09', 'regular_season_end_date' => '2027-01-09', 'post_season_start_date' => '2027-01-09', 'post_season_end_date' => '2027-02-21'],
        ]]),
        SC.'/seasons/140/teams' => fn () => Http::response(['data' => test()->sc['teams']]),
        SC.'/seasons/140/games' => fn () => Http::response(['data' => test()->sc['games']]),
    ]);
});

function scTeam(int $id, string $short, string $location, string $name, string $conference, string $division): array
{
    return ['id' => $id, 'shortname' => $short, 'location' => $location, 'name' => $name, 'conference' => $conference, 'division' => $division, 'team_level' => 1, 'primary_color' => '#00338D', 'secondary_color' => null];
}

function scGame(int $id, int $home, int $away, string $status = 'scheduled', ?int $hs = null, ?int $as = null, string $type = 'regular', int $week = 12): array
{
    return ['id' => $id, 'start_time' => '2026-11-22T18:00:00Z', 'status' => $status, 'season_type' => $type, 'week' => $week, 'home_team' => ['id' => $home], 'away_team' => ['id' => $away], 'neutral_location' => false, 'home_score' => $hs, 'away_score' => $as, 'home_win_probability' => 0.61];
}

/** Sets what the faked SportsCrunch returns for NFL 2026 (its season 140). */
function fakeSportsCrunch(?array $teams = null, ?array $games = null): void
{
    test()->sc = [
        'teams' => $teams ?? [
            scTeam(3, 'BUF', 'Buffalo', 'Bills', 'American Football Conference', 'AFC East'),
            scTeam(5, 'MIA', 'Miami', 'Dolphins', 'American Football Conference', 'AFC East'),
            scTeam(29, 'SEA', 'Seattle', 'Seahawks', 'National Football Conference', 'NFC West'),
            scTeam(31, 'ARI', 'Arizona', 'Cardinals', 'National Football Conference', 'NFC West'),
        ],
        'games' => $games ?? [
            scGame(1001, 3, 5, 'final', 27, 17, week: 11),
            scGame(1002, 29, 31),
            scGame(1003, 5, 29, 'scheduled-tbd', week: 18),
            scGame(900, 3, 29, 'final', 10, 20, type: 'preseason', week: 0),
        ],
    ];
}

it('copies the active season, its teams and alignment, and its regular and postseason games', function () {
    fakeSportsCrunch();

    $result = app(SeasonSync::class)->sync('nfl');

    expect($result->season->year)->toBe(2026)
        ->and($result->teams)->toBe(4)
        ->and($result->games)->toBe(3)
        ->and($result->added)->toBe(3);

    expect(League::sole())->code->toBe('nfl')->timezone->toBe('America/New_York');
    expect(Season::sole())->sc_season_id->toBe(140)->status->toBe('active')->synced_at->not->toBeNull();

    $bills = Team::where('abbreviation', 'BUF')->sole();
    expect($bills)->name->toBe('Buffalo Bills')->short_name->toBe('Bills')->slug->toBe('buffalo-bills');
    expect(SeasonTeam::where('team_id', $bills->id)->sole())->conference->toBe('AFC')->division->toBe('AFC East');

    $final = Game::where('sc_game_id', 1001)->sole();
    expect($final)->status->toBe('final')->home_score->toBe(27)->away_score->toBe(17)->week->toBe(11)
        ->and($final->homeTeam->team->abbreviation)->toBe('BUF')
        ->and($final->awayTeam->team->abbreviation)->toBe('MIA')
        ->and($final->start_at->toIso8601ZuluString())->toBe('2026-11-22T18:00:00Z');
    expect(Game::where('sc_game_id', 900)->exists())->toBeFalse();
});

it('updates games in place on a rerun and never writes the game probabilities', function () {
    fakeSportsCrunch();
    app(SeasonSync::class)->sync('nfl');
    Game::where('sc_game_id', 1002)->update(['p_home' => 0.58, 'p_source' => 'market']);

    fakeSportsCrunch(games: [
        scGame(1001, 3, 5, 'final', 27, 17, week: 11),
        scGame(1002, 29, 31, 'final', 24, 20),
        scGame(1003, 5, 29, 'scheduled', week: 18),
    ]);
    $result = app(SeasonSync::class)->sync('nfl', 2026);

    expect($result->added)->toBe(0)->and(Game::count())->toBe(3);
    expect(Game::where('sc_game_id', 1002)->sole())
        ->status->toBe('final')->home_score->toBe(24)
        ->p_home->toBe(0.58)->p_source->toBe('market');
    expect(Team::count())->toBe(4)->and(SeasonTeam::count())->toBe(4);
});

it('stops before writing anything when a conference name is unknown', function () {
    fakeSportsCrunch(teams: [
        scTeam(3, 'BUF', 'Buffalo', 'Bills', 'AFC', 'AFC East'),
        scTeam(5, 'MIA', 'Miami', 'Dolphins', 'American Football Conference', 'AFC East'),
    ], games: []);

    expect(fn () => app(SeasonSync::class)->sync('nfl'))
        ->toThrow(SportsCrunchException::class, 'unknown conference "AFC"');
    expect(League::count())->toBe(0)->and(Team::count())->toBe(0);
});

it('stops before writing anything when a game names a team outside the season', function () {
    fakeSportsCrunch(games: [scGame(1001, 3, 77)]);

    expect(fn () => app(SeasonSync::class)->sync('nfl'))
        ->toThrow(SportsCrunchException::class, 'away_team 77 is not one of the season\'s teams');
    expect(Season::count())->toBe(0)->and(Game::count())->toBe(0);
});

it('removes games SportsCrunch no longer lists, but needs --force to remove many', function () {
    $games = array_map(fn (int $i): array => scGame(2000 + $i, 3, 5), range(1, 20));
    fakeSportsCrunch(games: $games);
    app(SeasonSync::class)->sync('nfl');

    // One of 20 (5%) goes quietly.
    fakeSportsCrunch(games: array_slice($games, 1));
    expect(app(SeasonSync::class)->sync('nfl')->removed)->toBe(1);
    expect(Game::where('sc_game_id', 2001)->exists())->toBeFalse();

    // Five of 19 (26%) needs force.
    fakeSportsCrunch(games: array_slice($games, 6));
    expect(fn () => app(SeasonSync::class)->sync('nfl'))->toThrow(SportsCrunchException::class, 'no longer lists 5 of 19 games');
    expect(Game::count())->toBe(19);
    expect(app(SeasonSync::class)->sync('nfl', force: true)->removed)->toBe(5);
    expect(Game::count())->toBe(14);
});

it('reports a season SportsCrunch does not have', function () {
    fakeSportsCrunch();

    expect(fn () => app(SeasonSync::class)->sync('nfl', 2031))->toThrow(SportsCrunchException::class, 'no nfl 2031 season');
    expect(fn () => app(SeasonSync::class)->sync('xfl'))->toThrow(SportsCrunchException::class, 'not in config/leagues.php');
});

it('runs from the command line', function () {
    fakeSportsCrunch();

    $this->artisan('sportscrunch:sync', ['league' => 'nfl'])
        ->expectsOutputToContain('NFL 2026: 4 teams, 3 games (3 new, 0 removed)')
        ->assertSuccessful();
});
