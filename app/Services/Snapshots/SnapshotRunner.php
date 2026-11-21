<?php

namespace App\Services\Snapshots;

use App\Models\CurrentSnapshot;
use App\Models\Game;
use App\Models\Season;
use App\Models\Snapshot;
use App\Models\SnapshotStanding;
use App\Models\TeamOdds;
use App\Services\SportsCrunch\SeasonSync;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * One snapshot run for a season at `as_of` (02 §3): sync, build the input, skip if nothing changed,
 * store the input, run the engine, then publish in one transaction. A failure after the run starts
 * marks the snapshot failed and leaves the current snapshot alone.
 */
class SnapshotRunner
{
    public const TRIGGERS = ['scheduled', 'game_final', 'backfill', 'manual'];

    public function __construct(
        private readonly SeasonSync $sync,
        private readonly InputBuilder $builder,
        private readonly EngineCli $engine,
    ) {}

    /**
     * @param  string  $origin  live (computed now) or reconstructed (a past as_of).
     * @param  bool  $sync  Refresh the mirror from SportsCrunch first.
     */
    public function run(Season $season, CarbonImmutable $asOf, string $trigger, string $origin, ?int $sims = null, bool $sync = true): RunOutcome
    {
        // One run at a time per season, so runs can't race on the current pointer.
        $lock = Cache::lock("snapshot-season-{$season->id}", 1800);
        if (! $lock->get()) {
            throw new SnapshotException("Another snapshot run for {$season->league->code} {$season->year} is in progress");
        }

        try {
            if ($sync) {
                $this->sync->sync($season->league->code, $season->year);
            }

            return $this->runLocked($season, $asOf, $trigger, $origin, $sims ?? config()->integer('snapshots.sims'));
        } finally {
            $lock->release();
        }
    }

    private function runLocked(Season $season, CarbonImmutable $asOf, string $trigger, string $origin, int $sims): RunOutcome
    {
        $id = strtolower((string) Str::ulid());
        $attributes = [
            'id' => $id,
            'league_id' => $season->league_id,
            'season_id' => $season->id,
            'as_of' => $asOf,
            'trigger' => $trigger,
            'origin' => $origin,
            'seed' => $id,
            'sims' => $sims,
        ];

        try {
            $input = $this->builder->build($season, $asOf, $id, $sims);
            $contentHash = InputBuilder::contentHash($input);
            $engineBuild = $this->engine->build();
        } catch (Throwable $e) {
            Snapshot::create($attributes + ['status' => Snapshot::STATUS_FAILED, 'error' => $e->getMessage()]);
            throw $e;
        }

        // Skip if the latest published snapshot up to this as_of saw the same results, schedule and
        // engine, and no probability has moved by more than the tolerance since (02 §3 step 4).
        $previous = Snapshot::where('season_id', $season->id)
            ->where('status', Snapshot::STATUS_PUBLISHED)
            ->where('as_of', '<=', $asOf)
            ->orderByDesc('as_of')
            ->first();
        if ($previous && $previous->content_sha256 === $contentHash && $previous->engine_build === $engineBuild) {
            $previousInput = $this->storedInput($previous);
            if ($previousInput !== null && InputBuilder::maxProbabilityChange($previousInput, $input) <= config()->float('snapshots.skip_tolerance')) {
                return new RunOutcome(null, false, $previous);
            }
        }

        $json = InputBuilder::json($input);
        $path = "snapshots/{$season->league->code}/{$season->year}/{$id}.json.gz";
        $snapshot = Snapshot::create($attributes + [
            'status' => Snapshot::STATUS_RUNNING,
            'input_path' => $path,
            'input_sha256' => hash('sha256', $json),
            'content_sha256' => $contentHash,
            'engine_build' => $engineBuild,
        ]);

        try {
            $gzipped = gzencode($json, 9);
            if ($gzipped === false) {
                throw new SnapshotException('Could not compress the snapshot input');
            }
            Storage::disk(config()->string('snapshots.disk'))->put($path, $gzipped);
            $sim = $this->engine->simulate($input);
            $standings = $this->engine->standings($input);
            $current = $this->publish($snapshot, $season, $input, $sim, $standings);
        } catch (Throwable $e) {
            $snapshot->update(['status' => Snapshot::STATUS_FAILED, 'error' => $e->getMessage()]);
            throw $e;
        }

        return new RunOutcome($snapshot, $current);
    }

    /**
     * A published snapshot's stored input, or null if the file is gone.
     *
     * @return array<string, mixed>|null
     */
    private function storedInput(Snapshot $snapshot): ?array
    {
        $disk = Storage::disk(config()->string('snapshots.disk'));
        if ($snapshot->input_path === null || ! $disk->exists($snapshot->input_path)) {
            return null;
        }
        $input = json_decode((string) gzdecode((string) $disk->get($snapshot->input_path)), true);

        return is_array($input) ? $input : null;
    }

    /**
     * Writes the results and, when this is the newest snapshot, makes it current (02 §3 step 7).
     *
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $sim
     * @param  array<string, mixed>  $standings
     */
    private function publish(Snapshot $snapshot, Season $season, array $input, array $sim, array $standings): bool
    {
        $seasonTeamIds = [];
        foreach ($season->seasonTeams()->with('team')->get() as $st) {
            $seasonTeamIds[InputBuilder::engineTeamId($season->league->code, $st->team->abbreviation)] = $st->id;
        }
        $seasonTeamId = fn (string $teamId): int => $seasonTeamIds[$teamId]
            ?? throw new SnapshotException("Engine output names team {$teamId}, which isn't in the season");

        return DB::transaction(function () use ($snapshot, $season, $input, $sim, $standings, $seasonTeamId): bool {
            foreach ($sim['teams'] as $teamId => $odds) {
                TeamOdds::create([
                    'snapshot_id' => $snapshot->id,
                    'season_team_id' => $seasonTeamId($teamId),
                    'p_playoffs' => $odds['p_playoffs'],
                    'p_division' => $odds['p_division'],
                    'p_top_seed' => $odds['p_seed'][0],
                    'p_champion' => $odds['p_round']['champion'],
                    'p_seed' => $odds['p_seed'],
                    'p_round' => $odds['p_round'],
                    'wins_mean' => $odds['wins']['mean'],
                    'wins_p10' => $odds['wins']['p10'],
                    'wins_p50' => $odds['wins']['p50'],
                    'wins_p90' => $odds['wins']['p90'],
                    'wins_hist' => $odds['wins']['hist'],
                ]);
            }
            foreach ($standings['teams'] as $t) {
                SnapshotStanding::create([
                    'snapshot_id' => $snapshot->id,
                    'season_team_id' => $seasonTeamId($t['id']),
                    'wins' => $t['record']['w'],
                    'losses' => $t['record']['l'],
                    'ties' => $t['record']['t'],
                    'win_pct' => $t['pct'],
                    'division_rank' => $t['division_rank'],
                    'conference_rank' => $t['conference_rank'],
                    'seed' => $t['seed'],
                    'extras' => [
                        'division_record' => $t['division_record'],
                        'conference_record' => $t['conference_record'],
                        'points_for' => $t['points_for'],
                        'points_against' => $t['points_against'],
                        'division_winner' => $t['division_winner'],
                    ],
                ]);
            }

            $snapshot->update([
                'status' => Snapshot::STATUS_PUBLISHED,
                'engine_version' => $sim['engine_version'],
                'standings_version' => $sim['standings_version'],
                'rules_id' => $sim['rules_id'],
                'runtime_ms' => $sim['runtime_ms'],
                'diagnostics' => $sim['diagnostics'] + ['standings_unresolved' => $standings['unresolved']],
                'published_at' => now(),
            ]);

            // A backfilled snapshot older than the current one is published but doesn't become current.
            $current = CurrentSnapshot::with('snapshot')->find($season->id);
            if ($current !== null && $current->snapshot->as_of->gt($snapshot->as_of)) {
                return false;
            }
            CurrentSnapshot::updateOrCreate(['season_id' => $season->id], ['snapshot_id' => $snapshot->id]);

            // The current snapshot's game probabilities, for pages that show them (02 §2).
            foreach ($input['games'] as $g) {
                if ($g['status'] === 'scheduled') {
                    Game::where('sc_game_id', (int) Str::after($g['id'], 'sc-'))->update([
                        'p_home' => $g['p_home'],
                        'p_source' => $g['p_source'],
                        'odds_snapshot_id' => $snapshot->id,
                    ]);
                }
            }

            return true;
        });
    }
}
