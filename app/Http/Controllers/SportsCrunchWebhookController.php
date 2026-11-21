<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessGameUpdates;
use App\Models\Season;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Receives SportsCrunch's signed `games` webhooks (03 §2). The event is only a trigger: after checking
 * the signature, the payload's age and that it isn't a replay, it queues a re-sync of the season, which
 * reads the games from the API rather than trusting the payload.
 */
class SportsCrunchWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $secret = config('services.sportscrunch.webhook_secret');
        if (! is_string($secret) || $secret === '') {
            return response()->json(['error' => 'webhooks are not configured'], 503);
        }

        $body = $request->getContent();
        if (! self::signatureMatches((string) $request->header('X-Webhook-Signature', ''), $body, $secret)) {
            Log::warning('SportsCrunch webhook with a bad signature', ['request_id' => $request->header('X-Webhook-Request-Id')]);

            return response()->json(['error' => 'invalid signature'], 401);
        }

        $payload = json_decode($body, true);
        if (! is_array($payload) || ! is_string($payload['request_id'] ?? null) || ! is_int($payload['timestamp'] ?? null)) {
            return response()->json(['error' => 'malformed payload'], 422);
        }
        if (abs(time() - $payload['timestamp']) > config()->integer('services.sportscrunch.webhook_tolerance_seconds')) {
            return response()->json(['error' => 'stale payload'], 401);
        }
        if (! Cache::add("sportscrunch-webhook:{$payload['request_id']}", true, now()->addDay())) {
            return response()->json(['status' => 'duplicate'], 200);
        }

        if (($payload['resource'] ?? null) !== 'games') {
            return response()->json(['status' => 'ignored', 'resource' => $payload['resource'] ?? null], 200); // e.g. SportsCrunch's test webhook
        }
        $season = Season::where('sc_season_id', $payload['season_id'] ?? null)->first();
        if ($season === null) {
            return response()->json(['status' => 'ignored', 'reason' => 'unknown season'], 202);
        }

        ProcessGameUpdates::dispatch($season->id, 'webhook')->delay(now()->addSeconds(config()->integer('snapshots.after_finals.debounce_seconds')));

        return response()->json(['status' => 'queued'], 202);
    }

    /** SportsCrunch sends `v1=<hex hmac>` once per active signing secret, comma-separated, to allow rotation. */
    public static function signatureMatches(string $header, string $body, string $secret): bool
    {
        $expected = hash_hmac('sha256', $body, $secret);
        foreach (explode(',', $header) as $part) {
            $part = trim($part);
            if (str_starts_with($part, 'v1=') && hash_equals($expected, substr($part, 3))) {
                return true;
            }
        }

        return false;
    }
}
