<?php

namespace App\Services\SportsCrunch;

use DateTimeInterface;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Read-only client for the SportsCrunch API (03 §2, §4). Every endpoint used is a GET, so failed
 * connections, 429s and server errors are retried with backoff; any other error throws.
 */
class SportsCrunchClient
{
    /** Waits between attempts, in milliseconds. The odds endpoints allow 30 requests a minute. */
    private const RETRY_DELAYS = [2000, 5000, 15000];

    public function __construct(
        private readonly string $url,
        private readonly ?string $token,
        private readonly int $timeout = 60,
    ) {}

    /** @return list<array<mixed>> */
    public function seasons(string $league): array
    {
        return $this->rows('/seasons', ['league' => $league]);
    }

    /** @return list<array<mixed>> */
    public function teams(int $season): array
    {
        return $this->rows("/seasons/{$season}/teams");
    }

    /** @return list<array<mixed>> */
    public function games(int $season): array
    {
        return $this->rows("/seasons/{$season}/games");
    }

    /**
     * Every game's odds as they stood at `$at`: the market line where one existed, else the projection.
     *
     * @return list<array<mixed>>
     */
    public function historicalOdds(int $season, DateTimeInterface $at): array
    {
        return $this->rows("/seasons/{$season}/historical-odds", ['at' => self::instant($at)]);
    }

    /**
     * Home and neutral-site win probabilities for every pairing of the season's teams at `$at`.
     *
     * @return array<string, mixed>
     */
    public function matchupOdds(int $season, DateTimeInterface $at): array
    {
        return $this->get("/seasons/{$season}/matchup-odds", ['at' => self::instant($at)]);
    }

    /** `at` as the API expects it: UTC, whole seconds. */
    public static function instant(DateTimeInterface $at): string
    {
        return Carbon::instance($at)->utc()->format('Y-m-d\TH:i:s\Z');
    }

    /**
     * A response whose `data` is a list of objects (seasons, teams, games, odds).
     *
     * @param  array<string, scalar>  $query
     * @return list<array<mixed>>
     */
    private function rows(string $path, array $query = []): array
    {
        $rows = [];
        foreach ($this->get($path, $query) as $row) {
            if (! is_array($row)) {
                throw new SportsCrunchException("SportsCrunch {$path}: expected a list of objects");
            }
            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * @param  array<string, scalar>  $query
     * @return array<mixed>
     */
    private function get(string $path, array $query = []): array
    {
        $data = $this->request()->get($path, $query)->throw()->json('data');
        if (! is_array($data)) {
            throw new SportsCrunchException("SportsCrunch {$path}: response has no data");
        }

        return $data;
    }

    private function request(): PendingRequest
    {
        if ($this->token === null || $this->token === '') {
            throw new SportsCrunchException('SPORTSCRUNCH_API_KEY is not set');
        }

        return Http::baseUrl(rtrim($this->url, '/').'/api/v1')
            ->withToken($this->token)
            ->acceptJson()
            ->connectTimeout(5)
            ->timeout($this->timeout)
            ->retry(self::RETRY_DELAYS, 0, fn (Throwable $e): bool => $e instanceof ConnectionException
                || ($e instanceof RequestException && ($e->response->serverError() || $e->response->status() === 429)));
    }
}
