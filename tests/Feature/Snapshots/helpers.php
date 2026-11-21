<?php

use App\Models\Game;
use App\Models\League;
use App\Models\Season;
use App\Models\SeasonTeam;
use App\Models\Team;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Fills the mirror with the 2024 NFL season from the standings package's golden fixture, with the
 * last `$unplayed` games (by kickoff) still scheduled. SportsCrunch IDs: season 21, teams 1–32 in
 * fixture order, games from the fixture's `sc-N` IDs. Weeks are 16 games each in kickoff order.
 */
function seedMirror2024(int $unplayed = 16): Season
{
    $fixture = json_decode(file_get_contents(base_path('packages/standings/fixtures/nfl/golden/2024.input.json')), true);
    $league = League::create(['code' => 'nfl', 'name' => 'NFL', 'timezone' => 'America/New_York', 'daily_snapshot_time' => '09:00']);
    $season = Season::create(['league_id' => $league->id, 'year' => 2024, 'sc_season_id' => 21, 'status' => 'active']);

    $seasonTeams = [];
    foreach ($fixture['teams'] as $i => $t) {
        $team = Team::create([
            'league_id' => $league->id, 'sc_team_id' => $i + 1, 'slug' => Str::slug($t['name']), 'name' => $t['name'],
            'location' => Str::beforeLast($t['name'], ' '), 'short_name' => Str::afterLast($t['name'], ' '),
            'abbreviation' => strtoupper(Str::after($t['id'], 'nfl-')),
        ]);
        $seasonTeams[$t['id']] = SeasonTeam::create(['season_id' => $season->id, 'team_id' => $team->id, 'conference' => $t['conference'], 'division' => $t['division']])->id;
    }

    $games = collect($fixture['games'])->sortBy(fn (array $g): string => $g['start'].$g['id'])->values();
    foreach ($games as $k => $g) {
        $played = $k < $games->count() - $unplayed;
        Game::create([
            'season_id' => $season->id,
            'sc_game_id' => (int) Str::after($g['id'], 'sc-'),
            'home_season_team_id' => $seasonTeams[$g['home']],
            'away_season_team_id' => $seasonTeams[$g['away']],
            'start_at' => Carbon::parse($g['start']),
            'week' => intdiv($k, 16) + 1,
            'season_type' => 'regular',
            'neutral' => $g['neutral'] ?? false,
            'status' => $played ? 'final' : 'scheduled',
            'home_score' => $played ? $g['home_score'] : null,
            'away_score' => $played ? $g['away_score'] : null,
        ]);
    }

    return $season;
}

/**
 * Sets what the faked odds endpoints return: every game at `$pHome` (odd game IDs projected, even ones
 * market), and a matchup matrix at `$matrix` home and 0.5 neutral.
 */
function fakeOdds(float $pHome = 0.57, float $matrix = 0.56): void
{
    test()->odds = ['p' => $pHome, 'matrix' => $matrix];
}

/** Fakes SportsCrunch's odds endpoints for season 21, answering from `fakeOdds`; teams in SportsCrunch ID order. */
function registerOddsFake(): void
{
    fakeOdds();
    $gameIds = Game::pluck('sc_game_id'); // the games as seeded; a test may rename one to drop its odds
    Http::preventStrayRequests();
    Http::fake([
        'sportscrunch.test/api/v1/seasons/21/historical-odds*' => fn () => Http::response(['data' => $gameIds
            ->map(fn (int $id): array => ['id' => $id, 'home_win_probability' => test()->odds['p'], 'is_projected' => $id % 2 === 1])->all()]),
        'sportscrunch.test/api/v1/seasons/21/matchup-odds*' => function () {
            $ids = Team::orderBy('sc_team_id')->pluck('sc_team_id');
            $grid = fn (float $p) => $ids->map(fn (int $a) => $ids->map(fn (int $b) => $a === $b ? null : $p)->all())->all();

            return Http::response(['data' => [
                'as_of' => '2025-01-05T00:00:00Z', 'game_time' => '2025-01-06T01:00:01Z', 'model' => 'test',
                'teams' => $ids->map(fn (int $id): array => ['id' => $id])->all(),
                'home' => $grid(test()->odds['matrix']), 'neutral' => $grid(0.5),
            ]]);
        },
    ]);
}
