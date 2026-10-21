# 03 — SportsCrunch Integration

**Status: DRAFT v3 (2026-10-21).** Boundary per D44 (replaces D30). The endpoint list was checked against the SportsCrunch `develop` branch on 2026-10-21.

## 1. Who owns what

| SportsCrunch | PlayoffOdds |
|---|---|
| Teams, seasons, schedules, scores, game status | Simulation engine and snapshots |
| Per-game home win probabilities (market consensus or its predictor) | The standings engine package `@playoffodds/standings` (D44) |
| Team ratings (predictor internals) | Local mirror, publishing, website, API/MCP |
| Crawled official standings and clinch markers (to add) | — |
| Calls the standings engine through a PHP wrapper when it needs standings | — |

SportsCrunch's data completeness and backfill stay out of scope (D9). This plan only asks for the additions in §3.

**Drift parameters** (how much team strength moves over a season) don't come from SportsCrunch's API. They come from PoolCrunch's measurement of historical line movement on the SportsCrunch feed (D51, [01](01-simulation-engine.md) §4), bundled with the engine.

## 2. Existing endpoints we use

All are under `/api/v1` with a Sanctum token. Store the token as a secret, never in snapshot inputs or logs.

| Endpoint | Use | Fields we rely on |
|---|---|---|
| `GET /seasons?league=` | find the current season | `id`, year, status |
| `GET /seasons/{season}/teams` | teams and alignment | IDs, names, conference/division |
| `GET /seasons/{season}/games` | schedule, results, current probabilities | `id`, `start_time`, `status`, `season_type`, `week`, `home_team`, `away_team`, `neutral_location`, `home_score`, `away_score`, `home_win_probability` |
| `GET /seasons/{season}/historical-odds?at=` | probabilities for every unplayed game as of a past instant (backfill) | per-game probability, `is_projected` |
| Webhook subscriptions (`/webhooks/subscriptions`) | trigger a run when games go final | signed events; verify the signature, then re-pull games (the event is only a trigger) |

Verify in M0 that `home_win_probability` on the games endpoint and `historical-odds?at=now` agree, and that `is_projected` (or an equivalent) is available on the current-games path. Consumer tests pin the fields above.

## 3. Additions needed

| # | Addition | Needed for | When |
|---|---|---|---|
| 1 | **Ratings endpoint:** `GET /seasons/{season}/ratings?at=` (§4) | Playoff matchups and championship odds | M1 (launch). Fallback: fit from anchors |
| 2 | **Official standings crawl:** ESPN standings including clinch/elimination markers, stored per season and exposed via `GET /seasons/{season}/standings/official` | Live cross-check for our standings (D44) and our computed clinch statuses (D50); fills the gap when the league announces a clinch before our conservative check proves it | M1–M2; launch can proceed without it |
| 3 | **PHP standings wrapper** around the shared CLI (§7) | SportsCrunch-side standings and seeds | Any time after launch, when SportsCrunch needs it |
| 4 | **NHL end type** (regulation/OT/shootout) on games | NHL standings (loser point, RW/ROW) | Before M5 |
| 5 | **NBA Cup final flag:** the NBA Cup championship game does not count in the standings | NBA standings | Before M5 |
| 6 | Re-check MLB inputs (pitcher-aware anchors already exist) | MLB | Before M6 |

## 4. Ratings endpoint (D47)

SportsCrunch's predictor blends `RecentOddsPredictor` with `SeasonWinsPredictor` (separate sigmoid scales, with a preseason blend weight that decays), and MLB uses `RecentOddsWithPitcherPredictor`. The endpoint should expose whatever reproduces the predictor's probability for an arbitrary matchup:

- **Preferred:** one effective rating per team on a logit scale, after blending, plus HFA in the same units, such that `P(home) = sigmoid(r_home − r_away + hfa)` (HFA omitted at neutral sites). Also return `model` and `as_of`.
- **If the blend can't be expressed that way:** return an N×N home-win probability matrix plus a neutral-site matrix (32×32 for NFL), computed by the predictor.
- **Fallback in PlayoffOdds until this exists:** least-squares fit of `logit(p_home) = r_home − r_away + hfa` over the remaining scheduled games. This is close to exact for predictor-generated games and reasonable for market-priced ones. Record `ratings.source = "fit"` in the input.

## 5. Sync and triggers

- **Daily scheduled sync** of teams, games and probabilities for each active league-season before the daily snapshot.
- **Game finals:** a webhook triggers a games re-pull and a debounced snapshot. A poll every 15 minutes during game windows covers missed webhooks.
- **Failures:** retry with backoff. If SportsCrunch is down, no new snapshot is made and the site keeps showing the last good one (D40).

## 6. Historical data caveats

- `historical-odds?at=` reconstructs each game's probability from line history and the predictor as they run today, so backfilled snapshots are labeled `reconstructed` ([02](02-simulation-outputs.md) §5).
- Known case: until the fix on 2026-09-22 (SportsCrunch commit `16d7fcf`), NFL weeks 5–18 served frozen preseason look-ahead lines. Reconstructions of dates before that fix may not match what SportsCrunch actually served then.

## 7. PHP wrapper (D44, post-launch)

The standings package builds a single-file CLI (`standings.mjs`, no dependencies) that reads `standings-input/1` JSON on stdin and writes `standings-output/1` JSON to stdout ([04](04-standings-tiebreakers.md) §8).

In SportsCrunch, a small service builds the input from its own tables, runs the CLI and maps the output to a DTO:

```php
final class StandingsEngine
{
    public function compute(Season $season, CarbonInterface $asOf): StandingsResult
    {
        $input = $this->inputBuilder->build($season, $asOf);   // teams, alignment, final games before $asOf
        $result = Process::input(json_encode($input))
            ->timeout(30)
            ->run(['node', config('standings.cli_path'), 'standings']);
        // throw on failure; decode; record $output['engine_version'] with any stored result
        return StandingsResult::fromArray(json_decode($result->output(), true, flags: JSON_THROW_ON_ERROR));
    }
}
```

- Each call starts a Node process (roughly 100 ms). For backfills, send many `as_of` cutoffs in one call.
- SportsCrunch already has Node scripts (`bin/*.mjs`). Confirm Node is installed on its production server.
- How SportsCrunch gets a pinned CLI version is open question **O9**. Recommendation: a vendored, version-stamped bundle, refreshed by a script.
