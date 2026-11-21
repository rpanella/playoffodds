<?php

namespace App\Services\Site;

use App\Models\ClinchStatus;
use App\Models\CurrentSnapshot;
use App\Models\Game;
use App\Models\League;
use App\Models\Season;
use App\Models\SeasonTeam;
use App\Models\Snapshot;
use App\Models\SnapshotStanding;
use App\Models\TeamOdds;
use App\Services\Snapshots\GameWatch;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * What the pages show for a league: the current snapshot's odds, standings and clinch statuses, daily history
 * points and movement (features/10, features/11). Reads only local tables (D40).
 */
class LeagueOdds
{
    /** No published run for this long (during a season) shows the stale banner. */
    private const STALE_HOURS = 26;

    /** Results in the mirror that the current run hasn't counted, this long after kickoff, also show it. */
    private const STALE_AFTER_KICKOFF_HOURS = 7;

    public function __construct(private readonly GameWatch $watch) {}

    /** The league's latest active season, or its latest season. */
    public function season(League $league): ?Season
    {
        return $league->seasons()->orderByRaw("status = 'active' desc")->orderByDesc('year')->first();
    }

    public function current(Season $season): ?Snapshot
    {
        return CurrentSnapshot::with('snapshot')->find($season->id)?->snapshot;
    }

    /**
     * One row per team in the current snapshot: alignment, odds, standing, clinch statuses and movement.
     *
     * @return list<array<string, mixed>>
     */
    public function rows(Season $season, Snapshot $snapshot): array
    {
        $teams = $season->seasonTeams()->with('team')->get()->keyBy('id');
        $odds = TeamOdds::where('snapshot_id', $snapshot->id)->get()->keyBy('season_team_id');
        $standings = SnapshotStanding::where('snapshot_id', $snapshot->id)->get()->keyBy('season_team_id');
        $clinch = ClinchStatus::where('snapshot_id', $snapshot->id)->get()->groupBy('season_team_id');
        $before = $this->pointsBefore($season, $snapshot);

        return array_values($teams->map(function (SeasonTeam $st) use ($odds, $standings, $clinch, $before): array {
            $o = $odds[$st->id];
            $s = $standings[$st->id];
            $statuses = collect($clinch[$st->id] ?? [])->keyBy('target');

            return [
                'id' => $st->id,
                'slug' => $st->team->slug,
                'name' => $st->team->name,
                'short_name' => $st->team->short_name,
                'abbreviation' => $st->team->abbreviation,
                'conference' => $st->conference,
                'division' => $st->division,
                'record' => ['w' => $s->wins, 'l' => $s->losses, 't' => $s->ties],
                'seed_now' => $s->seed,
                'division_rank' => $s->division_rank,
                'wins' => ['mean' => $o->wins_mean, 'p10' => $o->wins_p10, 'p90' => $o->wins_p90],
                'p_playoffs' => $o->p_playoffs,
                'p_division' => $o->p_division,
                'p_top_seed' => $o->p_top_seed,
                'p_super_bowl' => $o->p_round['super_bowl'] ?? null,
                'p_champion' => $o->p_champion,
                'change_1d' => isset($before['1d'][$st->id]) ? $o->p_playoffs - $before['1d'][$st->id] : null,
                'change_7d' => isset($before['7d'][$st->id]) ? $o->p_playoffs - $before['7d'][$st->id] : null,
                'clinch' => $statuses->map(fn (ClinchStatus $c): array => [
                    'status' => $c->status,
                    'controls_destiny' => $c->controls_destiny,
                ])->all(),
                'odds' => $o,
            ];
        })->sortBy([['conference', 'asc'], ['division', 'asc'], ['division_rank', 'asc']])->all());
    }

    /**
     * The last published snapshot of each league-local day (features/11 §1), oldest first.
     *
     * @return Collection<int, Snapshot>
     */
    public function dailySnapshots(Season $season): Collection
    {
        $tz = $season->league->timezone;

        return Snapshot::where('season_id', $season->id)
            ->where('status', Snapshot::STATUS_PUBLISHED)
            ->whereNull('superseded_by_id')
            ->orderBy('as_of')
            ->get(['id', 'as_of', 'origin'])
            ->groupBy(fn (Snapshot $s): string => $s->as_of->setTimezone($tz)->toDateString())
            ->map(fn (Collection $day): Snapshot => $day->last())
            ->values();
    }

    /**
     * A team's history: one point per day with its playoff, division and Super Bowl odds.
     *
     * @return list<array<string, mixed>>
     */
    public function history(Season $season, SeasonTeam $team): array
    {
        $days = $this->dailySnapshots($season);
        $odds = TeamOdds::whereIn('snapshot_id', $days->pluck('id'))->where('season_team_id', $team->id)->get()->keyBy('snapshot_id');
        $tz = $season->league->timezone;

        return array_values($days->filter(fn (Snapshot $s): bool => $odds->has($s->id))->map(fn (Snapshot $s): array => [
            'date' => $s->as_of->setTimezone($tz)->toDateString(),
            'origin' => $s->origin,
            'p_playoffs' => $odds[$s->id]->p_playoffs,
            'p_division' => $odds[$s->id]->p_division,
            'p_champion' => $odds[$s->id]->p_champion,
        ])->all());
    }

    /**
     * A team's games: results so far and the remaining schedule with the current snapshot's win probability.
     *
     * @return array{results: list<array<string, mixed>>, remaining: list<array<string, mixed>>}
     */
    public function games(Season $season, SeasonTeam $team): array
    {
        $tz = $season->league->timezone;
        $games = Game::where('season_id', $season->id)
            ->where('season_type', 'regular')
            ->where(fn ($q) => $q->where('home_season_team_id', $team->id)->orWhere('away_season_team_id', $team->id))
            ->with('homeTeam.team', 'awayTeam.team')
            ->orderBy('start_at')
            ->get();

        $results = [];
        $remaining = [];
        foreach ($games as $g) {
            $home = $g->home_season_team_id === $team->id;
            $opponent = $home ? $g->awayTeam->team : $g->homeTeam->team;
            $base = [
                'week' => $g->week,
                'date' => $g->start_at->setTimezone($tz)->toDateString(),
                'home' => $home,
                'neutral' => $g->neutral,
                'opponent' => ['name' => $opponent->name, 'abbreviation' => $opponent->abbreviation, 'slug' => $opponent->slug],
            ];
            if (in_array($g->status, ['final', 'forfeit'], true) && $g->home_score !== null && $g->away_score !== null) {
                [$for, $against] = $home ? [$g->home_score, $g->away_score] : [$g->away_score, $g->home_score];
                $results[] = $base + ['result' => $for > $against ? 'W' : ($for < $against ? 'L' : 'T'), 'score' => "{$for}-{$against}"];
            } elseif ($g->status !== 'canceled') {
                $remaining[] = $base + [
                    'kickoff' => $g->status === 'scheduled-tbd' ? null : $g->start_at->setTimezone($tz)->format('D g:i A'),
                    'p_win' => $g->p_home === null ? null : ($home ? $g->p_home : 1 - $g->p_home),
                    'p_source' => $g->p_source,
                ];
            }
        }

        return ['results' => $results, 'remaining' => $remaining];
    }

    /** Stale when no run has published for a day, or a counted result is missing hours after its kickoff. */
    public function isStale(Season $season, Snapshot $snapshot, ?CarbonImmutable $now = null): bool
    {
        $now ??= CarbonImmutable::now();
        if ($season->status !== 'active') {
            return false;
        }
        if ($snapshot->as_of->lt($now->subHours(self::STALE_HOURS))) {
            return true;
        }
        $lastFinal = $season->games()->whereIn('status', ['final', 'forfeit'])->max('start_at');

        return $lastFinal !== null
            && CarbonImmutable::parse($lastFinal)->lt($now->subHours(self::STALE_AFTER_KICKOFF_HOURS))
            && $this->watch->resultsChanged($season, $now);
    }

    /** "Nov 20, 2026, 9:00 AM ET" in the league's time zone. */
    public static function formatAsOf(CarbonInterface $asOf, string $timezone): string
    {
        return $asOf->setTimezone($timezone)->format('M j, Y, g:i A').($timezone === 'America/New_York' ? ' ET' : ' '.$asOf->setTimezone($timezone)->format('T'));
    }

    /**
     * Playoff odds at the daily points 1 and 7 days before the snapshot's day, by season team.
     *
     * @return array{'1d': array<int, float>, '7d': array<int, float>}
     */
    private function pointsBefore(Season $season, Snapshot $snapshot): array
    {
        $tz = $season->league->timezone;
        $day = $snapshot->as_of->setTimezone($tz)->startOfDay();
        $days = $this->dailySnapshots($season);
        $at = fn (int $back): ?Snapshot => $days->last(fn (Snapshot $s): bool => $s->as_of->setTimezone($tz)->lt($day->subDays($back - 1)));
        $pick = function (?Snapshot $s): array {
            return $s === null ? [] : TeamOdds::where('snapshot_id', $s->id)->pluck('p_playoffs', 'season_team_id')->map(fn ($p): float => (float) $p)->all();
        };

        return ['1d' => $pick($at(1)), '7d' => $pick($at(7))];
    }
}
