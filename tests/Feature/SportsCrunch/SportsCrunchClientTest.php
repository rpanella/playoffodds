<?php

use App\Services\SportsCrunch\SportsCrunchClient;
use App\Services\SportsCrunch\SportsCrunchException;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

beforeEach(function () {
    Http::preventStrayRequests();
    Sleep::fake();
});

function client(?string $token = 'test-token'): SportsCrunchClient
{
    return new SportsCrunchClient('https://sportscrunch.test/', $token);
}

it('sends the token and asks for JSON', function () {
    Http::fake(['sportscrunch.test/api/v1/seasons/140/teams' => Http::response(['data' => [['id' => 3]]])]);

    expect(client()->teams(140))->toBe([['id' => 3]]);
    Http::assertSent(fn (Request $r): bool => $r->hasHeader('Authorization', 'Bearer test-token')
        && $r->hasHeader('Accept', 'application/json'));
});

it('passes the instant in UTC to the odds endpoints', function () {
    Http::fake(['sportscrunch.test/api/v1/seasons/140/*' => Http::response(['data' => []])]);

    $at = Carbon::parse('2026-11-20 09:00:00.250', 'America/New_York');
    client()->historicalOdds(140, $at);
    client()->matchupOdds(140, $at);

    Http::assertSent(fn (Request $r): bool => $r->url() === 'https://sportscrunch.test/api/v1/seasons/140/historical-odds?at=2026-11-20T14%3A00%3A00Z');
    Http::assertSent(fn (Request $r): bool => $r->url() === 'https://sportscrunch.test/api/v1/seasons/140/matchup-odds?at=2026-11-20T14%3A00%3A00Z');
});

it('retries rate limits and server errors', function () {
    Http::fake(['sportscrunch.test/*' => Http::sequence()
        ->push('slow down', 429)
        ->push('oops', 503)
        ->push(['data' => [['id' => 140]]])]);

    expect(client()->seasons('nfl'))->toBe([['id' => 140]]);
    Http::assertSentCount(3);
    Sleep::assertSequence([Sleep::for(2000)->milliseconds(), Sleep::for(5000)->milliseconds()]);
});

it('does not retry other client errors', function () {
    Http::fake(['sportscrunch.test/*' => Http::response('unauthenticated', 401)]);

    expect(fn () => client()->seasons('nfl'))->toThrow(RequestException::class);
    Http::assertSentCount(1);
});

it('refuses to send a request without a token', function () {
    expect(fn () => client(null)->seasons('nfl'))->toThrow(SportsCrunchException::class, 'SPORTSCRUNCH_API_KEY is not set');
    Http::assertNothingSent();
});
