<?php

namespace App\Services\SportsCrunch;

use App\Models\Game;
use App\Models\League;
use App\Models\Season;
use App\Models\SeasonTeam;
use App\Models\Team;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Copies one league-season from SportsCrunch into the mirror tables (02 §2, 03 §5): the season,
 * its teams and alignment, and its regular-season and postseason games with status and scores.
 * Game probabilities are not copied; snapshots fetch them at their own instant.
 */
class SeasonSync
{
    /** Season types the mirror keeps; SportsCrunch also has preseason, exhibition and others. */
    public const SEASON_TYPES = ['regular', 'postseason'];

    /** A sync that would delete more than this share of the season's games stops unless forced. */
    private const MAX_REMOVED_SHARE = 0.1;

    public function __construct(private readonly SportsCrunchClient $client) {}

    /**
     * @param  int|null  $year  The season year; the latest active season when null.
     * @param  bool  $force  Allow removing more than 10% of the season's games.
     */
    public function sync(string $leagueCode, ?int $year = null, bool $force = false): SyncResult
    {
        $config = config("leagues.{$leagueCode}");
        if (! is_array($config)) {
            throw new SportsCrunchException("League {$leagueCode} is not in config/leagues.php");
        }

        $remote = $this->pickSeason($this->client->seasons($leagueCode), $leagueCode, $year);
        $teams = $this->client->teams($remote['id']);
        $games = array_values(array_filter(
            $this->client->games($remote['id']),
            fn (array $g): bool => in_array($g['season_type'], self::SEASON_TYPES, true),
        ));

        // Check everything before writing anything.
        $teamRows = array_map(fn (array $t): array => $this->teamRow($t, $config['conferences']), $teams);
        $scTeamIds = array_column($teamRows, 'sc_team_id');
        foreach ($games as $g) {
            foreach (['home_team', 'away_team'] as $side) {
                if (! in_array($g[$side]['id'], $scTeamIds, true)) {
                    throw new SportsCrunchException("Game {$g['id']}: {$side} {$g[$side]['id']} is not one of the season's teams");
                }
            }
        }

        return DB::transaction(function () use ($leagueCode, $config, $remote, $teamRows, $games, $force): SyncResult {
            $league = League::updateOrCreate(['code' => $leagueCode], [
                'name' => $config['name'],
                'timezone' => $config['timezone'],
                'daily_snapshot_time' => $config['daily_snapshot_time'],
            ]);
            $season = Season::updateOrCreate(['sc_season_id' => $remote['id']], [
                'league_id' => $league->id,
                'year' => $remote['year'],
                'status' => $remote['status'],
                'regular_season_start_date' => $remote['regular_season_start_date'] ?? null,
                'regular_season_end_date' => $remote['regular_season_end_date'] ?? null,
                'post_season_start_date' => $remote['post_season_start_date'] ?? null,
                'post_season_end_date' => $remote['post_season_end_date'] ?? null,
            ]);

            $seasonTeamIds = [];
            foreach ($teamRows as $row) {
                $team = Team::updateOrCreate(
                    ['league_id' => $league->id, 'sc_team_id' => $row['sc_team_id']],
                    $row['team'],
                );
                $seasonTeamIds[$row['sc_team_id']] = SeasonTeam::updateOrCreate(
                    ['season_id' => $season->id, 'team_id' => $team->id],
                    $row['alignment'],
                )->id;
            }

            $existing = Game::where('season_id', $season->id)->pluck('sc_game_id')->all();
            $incoming = array_column($games, 'id');
            $removed = array_values(array_diff($existing, $incoming));
            if (! $force && $removed !== [] && count($removed) > self::MAX_REMOVED_SHARE * count($existing)) {
                throw new SportsCrunchException(sprintf(
                    '%s %d: SportsCrunch no longer lists %d of %d games; rerun with --force to remove them',
                    $leagueCode, $remote['year'], count($removed), count($existing),
                ));
            }

            // p_home, p_source and odds_snapshot_id are left out of the update list on purpose.
            $updates = ['season_id', 'home_season_team_id', 'away_season_team_id', 'start_at', 'week', 'season_type', 'neutral', 'status', 'home_score', 'away_score'];
            foreach (array_chunk($games, 500) as $chunk) {
                Game::upsert(array_map(fn (array $g): array => [
                    'sc_game_id' => $g['id'],
                    'season_id' => $season->id,
                    'home_season_team_id' => $seasonTeamIds[$g['home_team']['id']],
                    'away_season_team_id' => $seasonTeamIds[$g['away_team']['id']],
                    'start_at' => Carbon::parse($g['start_time'])->utc()->format('Y-m-d H:i:s'),
                    'week' => $g['week'],
                    'season_type' => $g['season_type'],
                    'neutral' => (bool) $g['neutral_location'],
                    'status' => $g['status'],
                    'home_score' => $g['home_score'],
                    'away_score' => $g['away_score'],
                ], $chunk), ['sc_game_id'], $updates);
            }
            if ($removed !== []) {
                Game::where('season_id', $season->id)->whereIn('sc_game_id', $removed)->delete();
            }

            $season->update(['synced_at' => now()]);

            return new SyncResult(
                season: $season,
                teams: count($teamRows),
                games: count($games),
                added: count(array_diff($incoming, $existing)),
                removed: count($removed),
            );
        });
    }

    /**
     * @param  list<array<mixed>>  $seasons
     * @return array<mixed>
     */
    private function pickSeason(array $seasons, string $leagueCode, ?int $year): array
    {
        $candidates = array_values(array_filter(
            $seasons,
            fn (array $s): bool => $year === null ? $s['status'] === 'active' : $s['year'] === $year,
        ));
        usort($candidates, fn (array $a, array $b): int => $b['year'] <=> $a['year']);

        return $candidates[0] ?? throw new SportsCrunchException(
            $year === null ? "SportsCrunch has no active {$leagueCode} season" : "SportsCrunch has no {$leagueCode} {$year} season",
        );
    }

    /**
     * @param  array<mixed>  $t
     * @param  array<string, string>  $conferenceCodes
     * @return array{sc_team_id: int, team: array<string, mixed>, alignment: array<string, string>}
     */
    private function teamRow(array $t, array $conferenceCodes): array
    {
        $conference = $conferenceCodes[$t['conference'] ?? ''] ?? throw new SportsCrunchException(
            "Team {$t['id']} ({$t['shortname']}): unknown conference ".json_encode($t['conference'] ?? null).'; add it to config/leagues.php',
        );
        if (blank($t['division'] ?? null)) {
            throw new SportsCrunchException("Team {$t['id']} ({$t['shortname']}) has no division");
        }
        $name = trim("{$t['location']} {$t['name']}");

        return [
            'sc_team_id' => $t['id'],
            'team' => [
                'slug' => Str::slug($name),
                'name' => $name,
                'location' => $t['location'],
                'short_name' => $t['name'],
                'abbreviation' => $t['shortname'],
                'primary_color' => $t['primary_color'] ?? null,
                'secondary_color' => $t['secondary_color'] ?? null,
            ],
            'alignment' => ['conference' => $conference, 'division' => $t['division']],
        ];
    }
}
