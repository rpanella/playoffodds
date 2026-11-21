<?php

use App\Jobs\ProcessGameUpdates;
use App\Models\CurrentSnapshot;
use App\Models\Game;
use App\Models\League;
use App\Models\Season;
use App\Models\Snapshot;
use App\Services\Snapshots\GameWatch;
use App\Services\Snapshots\SnapshotRunner;
use App\Services\SportsCrunch\SeasonSync;
use App\Services\SportsCrunch\SyncResult;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/helpers.php';

/** POSTs a SportsCrunch webhook, signed with `$secret` unless a signature is given. */
function postWebhook(array $payload, string $secret = 'whsec-test', ?string $signature = null)
{
    $body = json_encode($payload);
    $signature ??= 'v1='.hash_hmac('sha256', 'other-secret-body', 'old').',v1='.hash_hmac('sha256', $body, $secret);

    return test()->call('POST', '/webhooks/sportscrunch', [], [], [], [
        'CONTENT_TYPE' => 'application/json',
        'HTTP_X_WEBHOOK_SIGNATURE' => $signature,
        'HTTP_X_WEBHOOK_REQUEST_ID' => $payload['request_id'] ?? '',
    ], $body);
}

function gamesPayload(int $scSeason = 140, string $requestId = 'req-1', ?int $timestamp = null): array
{
    return ['version' => 'v1', 'resource' => 'games', 'season_id' => $scSeason, 'events' => [['type' => 'updated', 'data' => ['id' => 1]]], 'request_id' => $requestId, 'timestamp' => $timestamp ?? time(), 'sync_request' => false];
}

describe('webhook endpoint', function () {
    beforeEach(function () {
        Queue::fake();
        config(['services.sportscrunch.webhook_secret' => 'whsec-test']);
        $league = League::create(['code' => 'nfl', 'name' => 'NFL', 'timezone' => 'America/New_York', 'daily_snapshot_time' => '09:00']);
        $this->season = Season::create(['league_id' => $league->id, 'year' => 2026, 'sc_season_id' => 140, 'status' => 'active']);
    });

    it('queues a debounced game check for a signed games webhook', function () {
        postWebhook(gamesPayload())->assertStatus(202)->assertJson(['status' => 'queued']);

        Queue::assertPushed(ProcessGameUpdates::class, fn (ProcessGameUpdates $job): bool => $job->seasonId === $this->season->id
            && $job->source === 'webhook' && $job->delay !== null);
    });

    it('rejects a bad signature, a stale payload and an unconfigured secret', function () {
        postWebhook(gamesPayload(), signature: 'v1=deadbeef')->assertStatus(401);
        postWebhook(gamesPayload(timestamp: time() - 3600))->assertStatus(401);
        config(['services.sportscrunch.webhook_secret' => null]);
        postWebhook(gamesPayload())->assertStatus(503);

        Queue::assertNothingPushed();
    });

    it('ignores a replayed request, a test webhook and an unknown season', function () {
        postWebhook(gamesPayload(requestId: 'same'))->assertStatus(202);
        postWebhook(gamesPayload(requestId: 'same'))->assertOk()->assertJson(['status' => 'duplicate']);
        postWebhook(['resource' => 'test', 'request_id' => 'req-test', 'timestamp' => time()])->assertOk()->assertJson(['status' => 'ignored']);
        postWebhook(gamesPayload(scSeason: 999, requestId: 'req-x'))->assertStatus(202)->assertJson(['status' => 'ignored']);

        Queue::assertPushedTimes(ProcessGameUpdates::class, 1);
    });
});

describe('site credentials', function () {
    it('asks for basic auth when credentials are set, but leaves the webhook and health check open', function () {
        config(['site.basic_auth.user' => 'preview', 'site.basic_auth.password' => 'secret']);

        $this->get('/')->assertStatus(401)->assertHeader('WWW-Authenticate', 'Basic realm="PlayoffOdds"');
        $this->get('/', ['PHP_AUTH_USER' => 'preview', 'PHP_AUTH_PW' => 'wrong'])->assertStatus(401);
        $this->get('/', ['PHP_AUTH_USER' => 'preview', 'PHP_AUTH_PW' => 'secret'])->assertOk();
        $this->get('/up')->assertOk();
        postWebhook(gamesPayload())->assertStatus(503); // reaches the controller (no webhook secret here)
    });

    it('is public when no credentials are set', function () {
        $this->get('/')->assertOk();
    });
});

describe('after-finals runs', function () {
    beforeEach(function () {
        if (! is_file(base_path('packages/cli/dist/simulate.mjs')) || ! is_file(base_path('packages/cli/dist/standings.mjs'))) {
            Process::path(base_path())->run(['node', 'packages/cli/build.mjs'])->throw();
        }
        config(['services.sportscrunch.url' => 'https://sportscrunch.test', 'services.sportscrunch.token' => 'test-token', 'snapshots.sims' => 300]);
        Storage::fake('local');
        $this->season = seedMirror2024(unplayed: 16);
        registerOddsFake();
        // The mirror is edited directly below, so the job's sync does nothing.
        $this->mock(SeasonSync::class)->shouldReceive('sync')->andReturnUsing(fn () => new SyncResult($this->season, 32, 272, 0, 0));
        $asOf = CarbonImmutable::parse(Game::where('status', 'scheduled')->min('start_at'))->subHour();
        $this->first = app(SnapshotRunner::class)->run($this->season, $asOf, 'manual', 'live', sync: false)->snapshot;
        $this->scheduled = fn () => Game::where('status', 'scheduled')->orderBy('start_at');
    });

    it('sees no new results until a game goes final or a score is corrected', function () {
        $watch = app(GameWatch::class);
        expect($watch->resultsChanged($this->season))->toBeFalse();

        ($this->scheduled)()->first()->update(['status' => 'final', 'home_score' => 24, 'away_score' => 21]);
        expect($watch->resultsChanged($this->season))->toBeTrue();
    });

    it('runs a game_final snapshot when a result has come in', function () {
        ($this->scheduled)()->first()->update(['status' => 'final', 'home_score' => 24, 'away_score' => 21]);

        (new ProcessGameUpdates($this->season->id, 'webhook'))->handle(app(SeasonSync::class), app(GameWatch::class), app(SnapshotRunner::class));

        $latest = CurrentSnapshot::find($this->season->id)->snapshot;
        expect($latest->id)->not->toBe($this->first->id)->and($latest->trigger)->toBe('game_final');
        expect(app(GameWatch::class)->resultsChanged($this->season))->toBeFalse();
    });

    it('does nothing when no result is new', function () {
        (new ProcessGameUpdates($this->season->id, 'poll'))->handle(app(SeasonSync::class), app(GameWatch::class), app(SnapshotRunner::class));

        expect(Snapshot::count())->toBe(1);
    });

    it('in window mode, waits while another game is still in progress', function () {
        config(['snapshots.after_finals.mode' => 'window']);
        [$done, $playing] = ($this->scheduled)()->take(2)->get()->all();
        $done->update(['status' => 'final', 'home_score' => 24, 'away_score' => 21]);
        $playing->update(['start_at' => now()->subHour()]);

        $job = fn () => (new ProcessGameUpdates($this->season->id, 'webhook'))->handle(app(SeasonSync::class), app(GameWatch::class), app(SnapshotRunner::class));
        $job();
        expect(Snapshot::count())->toBe(1);

        $playing->update(['status' => 'final', 'home_score' => 10, 'away_score' => 13]);
        $job();
        expect(Snapshot::count())->toBe(2);
    });

    it('polls only seasons with a game in progress', function () {
        Queue::fake();
        $this->artisan('snapshot:watch')->expectsOutputToContain('No games in progress');
        Queue::assertNothingPushed();

        ($this->scheduled)()->first()->update(['start_at' => now()->subMinutes(30)]);
        $this->artisan('snapshot:watch')->expectsOutputToContain('Queued a check for NFL 2024');
        Queue::assertPushed(ProcessGameUpdates::class, fn (ProcessGameUpdates $job): bool => $job->source === 'poll');
    });
});
