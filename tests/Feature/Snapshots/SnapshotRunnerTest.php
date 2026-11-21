<?php

// Runs the real engine CLI (packages/cli/dist) on the 2024 season with the last week unplayed.

use App\Models\ClinchStatus;
use App\Models\CurrentSnapshot;
use App\Models\Game;
use App\Models\Snapshot;
use App\Models\SnapshotStanding;
use App\Models\TeamOdds;
use App\Services\Snapshots\SnapshotException;
use App\Services\Snapshots\SnapshotRunner;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/helpers.php';

beforeEach(function () {
    if (! is_file(base_path('packages/cli/dist/simulate.mjs')) || ! is_file(base_path('packages/cli/dist/standings.mjs'))) {
        Process::path(base_path())->run(['node', 'packages/cli/build.mjs'])->throw();
    }
    config(['services.sportscrunch.url' => 'https://sportscrunch.test', 'services.sportscrunch.token' => 'test-token']);
    Storage::fake('local');
    $this->season = seedMirror2024(unplayed: 16);
    registerOddsFake();
    $this->asOf = CarbonImmutable::parse(Game::where('status', 'scheduled')->min('start_at'))->subHour();
    $this->run = fn (?CarbonImmutable $at = null, string $trigger = 'manual') => app(SnapshotRunner::class)
        ->run($this->season, $at ?? $this->asOf, $trigger, $trigger === 'backfill' ? 'reconstructed' : 'live', sims: 300, sync: false);
});

it('publishes a snapshot, makes it current and writes the current game probabilities', function () {
    $outcome = ($this->run)();

    $snapshot = $outcome->snapshot;
    expect($outcome->current)->toBeTrue()
        ->and($snapshot->status)->toBe(Snapshot::STATUS_PUBLISHED)
        ->and($snapshot)->toMatchArray(['sims' => 300, 'seed' => $snapshot->id, 'rules_id' => 'nfl@2020', 'engine_version' => '0.1.0', 'standings_version' => '0.1.0']);
    expect(CurrentSnapshot::find($this->season->id)->snapshot_id)->toBe($snapshot->id);
    Storage::disk('local')->assertExists($snapshot->input_path);

    expect(TeamOdds::count())->toBe(32)->and(SnapshotStanding::count())->toBe(32);
    foreach (['AFC', 'NFC'] as $conference) {
        $sum = TeamOdds::whereRelation('seasonTeam', 'conference', $conference)->sum('p_playoffs');
        expect((float) $sum)->toEqualWithDelta(7.0, 1e-4);
    }
    expect(SnapshotStanding::whereNotNull('seed')->count())->toBe(14);

    // With only week 18 left, the clinch check has claims to make, and every team has all three targets.
    expect(ClinchStatus::where('snapshot_id', $snapshot->id)->count())->toBe(96)
        ->and(ClinchStatus::where('status', 'clinched')->count())->toBeGreaterThan(0)
        ->and(ClinchStatus::where('status', 'eliminated')->count())->toBeGreaterThan(0)
        ->and(ClinchStatus::where('status', '!=', 'alive')->whereNotNull('controls_destiny')->count())->toBe(0)
        ->and(ClinchStatus::where('status', 'alive')->whereNull('controls_destiny')->count())->toBe(0)
        ->and(ClinchStatus::value('method_version'))->toBe('conservative-bnb@1')
        ->and($snapshot->diagnostics['clinch']['timed_out'])->toBe(0);

    $scheduled = Game::where('status', 'scheduled')->get();
    expect($scheduled->every(fn (Game $g): bool => $g->p_home === 0.57 && $g->odds_snapshot_id === $snapshot->id))->toBeTrue()
        ->and(Game::where('status', 'final')->whereNotNull('p_home')->count())->toBe(0);
});

it('skips a run when nothing material changed, and publishes when a probability moves', function () {
    $first = ($this->run)()->snapshot;

    fakeOdds(pHome: 0.571); // within the 0.002 tolerance
    $skip = ($this->run)($this->asOf->addMinutes(10));
    expect($skip->skipped())->toBeTrue()->and($skip->previous->id)->toBe($first->id)
        ->and(Snapshot::count())->toBe(1);

    fakeOdds(pHome: 0.60);
    $moved = ($this->run)($this->asOf->addMinutes(20));
    expect($moved->skipped())->toBeFalse()->and($moved->current)->toBeTrue()
        ->and(Game::where('status', 'scheduled')->first()->p_home)->toBe(0.6);
});

it('publishes an older backfilled snapshot without making it current', function () {
    $live = ($this->run)()->snapshot;

    fakeOdds(pHome: 0.52);
    $backfilled = ($this->run)($this->asOf->subDays(7), 'backfill');

    expect($backfilled->current)->toBeFalse()
        ->and($backfilled->snapshot->status)->toBe(Snapshot::STATUS_PUBLISHED)
        ->and($backfilled->snapshot->origin)->toBe('reconstructed');
    expect(CurrentSnapshot::find($this->season->id)->snapshot_id)->toBe($live->id)
        ->and(Game::where('status', 'scheduled')->first()->p_home)->toBe(0.57);
});

it('marks a failed run and leaves the current snapshot alone', function () {
    $live = ($this->run)()->snapshot;

    fakeOdds(matrix: 1.0); // the engine rejects a certain matchup
    expect(fn () => ($this->run)($this->asOf->addHour()))->toThrow(SnapshotException::class, 'Engine simulate failed (exit 2)');

    $failed = Snapshot::where('status', Snapshot::STATUS_FAILED)->sole();
    expect($failed->error)->toContain('matchups.home')
        ->and(CurrentSnapshot::find($this->season->id)->snapshot_id)->toBe($live->id)
        ->and(TeamOdds::where('snapshot_id', $failed->id)->count())->toBe(0);
});

it('records a run that fails before the engine starts', function () {
    Game::where('status', 'scheduled')->first()->update(['sc_game_id' => 999999]);

    expect(fn () => ($this->run)())->toThrow(SnapshotException::class, 'no odds for game 999999');
    expect(Snapshot::sole())->status->toBe(Snapshot::STATUS_FAILED)->input_path->toBeNull();
});

it('refuses to start while another run holds the season', function () {
    $lock = Cache::lock("snapshot-season-{$this->season->id}", 60);
    $lock->get();

    expect(fn () => ($this->run)())->toThrow(SnapshotException::class, 'in progress');
    $lock->release();
});
