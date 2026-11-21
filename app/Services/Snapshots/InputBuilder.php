<?php

namespace App\Services\Snapshots;

use App\Models\Game;
use App\Models\Season;
use App\Models\SeasonTeam;
use App\Services\SportsCrunch\SportsCrunchClient;
use Carbon\CarbonImmutable;

/**
 * Builds the engine's `sim-input/1` document (01 §2) for a season at `as_of` (02 §3 step 3): teams and
 * alignment and the schedule from the mirror, plus SportsCrunch's game probabilities and matchup odds
 * fetched at that same instant.
 */
class InputBuilder
{
    /** SportsCrunch statuses that mean a result, when the game started before `as_of`. */
    private const FINAL_STATUSES = ['final', 'forfeit'];

    public function __construct(private readonly SportsCrunchClient $client) {}

    /**
     * @return array<string, mixed>
     */
    public function build(Season $season, CarbonImmutable $asOf, string $seed, int $sims): array
    {
        $league = $season->league;
        $engine = config("leagues.{$league->code}.engine");
        if (! is_array($engine)) {
            throw new SnapshotException("No engine parameters for league {$league->code} in config/leagues.php");
        }

        $seasonTeams = $season->seasonTeams()->with('team')->get()
            ->sortBy(fn (SeasonTeam $st): string => $st->team->abbreviation)->values();
        $teamIds = [];
        $teamIdsBySc = [];
        $teams = [];
        foreach ($seasonTeams as $st) {
            $id = self::engineTeamId($league->code, $st->team->abbreviation);
            $teamIds[$st->id] = $id;
            $teamIdsBySc[$st->team->sc_team_id] = $id;
            $teams[] = ['id' => $id, 'name' => $st->team->name, 'conference' => $st->conference, 'division' => $st->division];
        }

        // Postseason games wait for postseason resume (M4); the engine simulates the bracket itself.
        $games = $season->games()->where('season_type', 'regular')->orderBy('start_at')->orderBy('sc_game_id')->get();
        $odds = [];
        foreach ($this->client->historicalOdds($season->sc_season_id, $asOf) as $row) {
            $odds[$row['id']] = $row;
        }

        $rows = [];
        foreach ($games as $g) {
            $rows[] = $this->gameRow($g, $asOf, $teamIds, $odds);
        }
        $unplayedWeeks = array_column(array_filter($rows, fn (array $r): bool => $r['status'] === 'scheduled'), 'week');
        $currentWeek = $unplayedWeeks === [] ? (int) $games->max('week') + 1 : min($unplayedWeeks);

        return [
            'schema' => 'sim-input/1',
            'league' => $league->code,
            'season' => $season->year,
            'as_of' => SportsCrunchClient::instant($asOf),
            'current_week' => $currentWeek,
            'teams' => $teams,
            'games' => $rows,
            'matchups' => $this->matchups($season, $asOf, $teamIdsBySc, count($teams)),
            'postseason' => ['state' => 'not_started'],
            'params' => ['sims' => $sims, 'seed' => $seed, 'tie_rate' => $engine['tie_rate'], 'drift' => $engine['drift']],
        ];
    }

    /** The engine's team ID, e.g. "nfl-buf". */
    public static function engineTeamId(string $league, string $abbreviation): string
    {
        return $league.'-'.strtolower($abbreviation);
    }

    /**
     * The input without `as_of`, the seed and the probabilities: results, schedule, alignment, which
     * games have market lines, and parameters. SportsCrunch's projections drift a little with every
     * passing second, so probabilities are compared separately with a tolerance (`maxProbabilityChange`).
     *
     * @param  array<string, mixed>  $input
     */
    public static function contentHash(array $input): string
    {
        unset($input['as_of'], $input['params']['seed']);
        $input['games'] = array_map(function (array $g): array {
            unset($g['p_home']);

            return $g;
        }, $input['games']);
        $input['matchups'] = array_diff_key($input['matchups'], array_flip(['as_of', 'game_time', 'home', 'neutral']));

        return hash('sha256', self::json($input));
    }

    /**
     * The largest change in any game or matchup probability between two inputs with the same content
     * hash (so the same games are unplayed and the matrices list the teams in the same order).
     *
     * @param  array<string, mixed>  $a
     * @param  array<string, mixed>  $b
     */
    public static function maxProbabilityChange(array $a, array $b): float
    {
        $max = 0.0;
        $pa = array_column($a['games'], 'p_home', 'id');
        foreach (array_column($b['games'], 'p_home', 'id') as $id => $p) {
            $max = max($max, abs($p - ($pa[$id] ?? INF)));
        }
        foreach (['home', 'neutral'] as $grid) {
            foreach ($b['matchups'][$grid] as $i => $row) {
                foreach ($row as $j => $p) {
                    if ($p !== null) {
                        $max = max($max, abs($p - ($a['matchups'][$grid][$i][$j] ?? INF)));
                    }
                }
            }
        }

        return $max;
    }

    /**
     * Hash of the input's final games and scores. Compared with `mirrorResultsHash` to tell whether a
     * result has come in (or been corrected) since a snapshot.
     *
     * @param  array<string, mixed>  $input
     */
    public static function resultsHash(array $input): string
    {
        $finals = array_filter($input['games'], fn (array $g): bool => $g['status'] === 'final');

        return self::hashResults(array_map(fn (array $g): string => "{$g['id']}:{$g['home_score']}-{$g['away_score']}", $finals));
    }

    /** The same hash from the mirror, for the games an input built at `$asOf` would count as final. */
    public static function mirrorResultsHash(Season $season, CarbonImmutable $asOf): string
    {
        $finals = $season->games()
            ->where('season_type', 'regular')
            ->whereIn('status', self::FINAL_STATUSES)
            ->where('start_at', '<', $asOf)
            ->get(['sc_game_id', 'home_score', 'away_score']);

        return self::hashResults($finals->map(fn (Game $g): string => "sc-{$g->sc_game_id}:{$g->home_score}-{$g->away_score}")->all());
    }

    /** @param  array<string>  $results */
    private static function hashResults(array $results): string
    {
        sort($results);

        return hash('sha256', implode("\n", $results));
    }

    /** @param  array<string, mixed>  $input */
    public static function json(array $input): string
    {
        return json_encode($input, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }

    /**
     * A game as the engine sees it at `as_of`: final only if it has a result and started before then,
     * so a backfilled day simulates games that hadn't been played yet.
     *
     * @param  array<int, string>  $teamIds
     * @param  array<int, array<mixed>>  $odds
     * @return array<string, mixed>
     */
    private function gameRow(Game $g, CarbonImmutable $asOf, array $teamIds, array $odds): array
    {
        $row = [
            'id' => "sc-{$g->sc_game_id}",
            'week' => $g->week,
            'start' => SportsCrunchClient::instant($g->start_at),
            'season_type' => 'regular',
            'home' => $teamIds[$g->home_season_team_id],
            'away' => $teamIds[$g->away_season_team_id],
            'neutral' => $g->neutral,
        ];

        if ($g->status === 'canceled') {
            return $row + ['status' => 'canceled'];
        }
        if (in_array($g->status, self::FINAL_STATUSES, true) && $g->start_at->lt($asOf)) {
            if ($g->home_score === null || $g->away_score === null) {
                throw new SnapshotException("Game {$g->sc_game_id} is {$g->status} but has no score");
            }

            return $row + ['status' => 'final', 'home_score' => $g->home_score, 'away_score' => $g->away_score];
        }

        $o = $odds[$g->sc_game_id] ?? throw new SnapshotException(
            "SportsCrunch has no odds for game {$g->sc_game_id} at ".SportsCrunchClient::instant($asOf),
        );

        return $row + [
            'status' => 'scheduled',
            'p_home' => (float) $o['home_win_probability'],
            'p_source' => $o['is_projected'] ? 'projected' : 'market',
        ];
    }

    /**
     * SportsCrunch's matchup matrix with its rows labeled by engine team IDs (03 §4).
     *
     * @param  array<int, string>  $teamIdsBySc
     * @return array<string, mixed>
     */
    private function matchups(Season $season, CarbonImmutable $asOf, array $teamIdsBySc, int $teamCount): array
    {
        $m = $this->client->matchupOdds($season->sc_season_id, $asOf);
        $teams = [];
        foreach ($m['teams'] ?? [] as $t) {
            $teams[] = $teamIdsBySc[$t['id']] ?? throw new SnapshotException("Matchup odds list team {$t['id']}, which isn't in the season");
        }
        if (count($teams) !== $teamCount) {
            throw new SnapshotException('Matchup odds cover '.count($teams)." teams; the season has {$teamCount}");
        }

        return [
            'source' => 'sportscrunch',
            'as_of' => $m['as_of'],
            'game_time' => $m['game_time'],
            'model' => $m['model'],
            'teams' => $teams,
            'home' => $m['home'],
            'neutral' => $m['neutral'],
        ];
    }
}
