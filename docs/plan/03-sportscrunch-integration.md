# 03 — SportsCrunch Integration

**Status: DRAFT v3 (2026-10-21).** Boundary per D44 (replaces D30). The endpoint list was checked against the SportsCrunch `develop` branch on 2026-10-21.

## 1. Who owns what

| SportsCrunch | PlayoffOdds |
|---|---|
| Teams, seasons, schedules, scores, game status | Simulation engine and snapshots |
| Per-game home win probabilities (market consensus or its predictor) | The standings engine package `@playoffodds/standings` (D44) |
| Matchup odds for any pairing, from its predictor (to add) | Local mirror, publishing, website, API/MCP |
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
| 1 | **Matchup odds endpoint:** `GET /seasons/{season}/matchup-odds?at=` (§4) | Playoff games and championship odds | M1 (launch). Fallback: fit from anchors |
| 2 | **Official standings crawl:** ESPN standings including clinch/elimination markers, stored per season and exposed via `GET /seasons/{season}/standings/official` | Live cross-check for our standings (D44) and our computed clinch statuses (D50); fills the gap when the league announces a clinch before our conservative check proves it | M1–M2; launch can proceed without it |
| 3 | **PHP standings wrapper** around the shared CLI (§7) | SportsCrunch-side standings and seeds | Any time after launch, when SportsCrunch needs it |
| 4 | **NHL end type** (regulation/OT/shootout) on games | NHL standings (loser point, RW/ROW) | Before M5 |
| 5 | **NBA Cup final flag:** the NBA Cup championship game does not count in the standings | NBA standings | Before M5 |
| 6 | Re-check MLB inputs (pitcher-aware anchors already exist) | MLB | Before M6 |

## 4. Matchup odds endpoint (D52)

Playoff games aren't on the schedule, so they have no line and no game probability. SportsCrunch adds `GET /seasons/{season}/matchup-odds?at=`, which runs its existing predictor on every pairing:

- **Home matrix:** for every ordered pair of teams, the probability that the home team wins if they met at `at`. Each pair appears both ways, so this covers home and away. For the NFL that is 32 × 31 = 992 entries.
- **Neutral matrix:** the same pairs at a neutral site, from the predictor's neutral-site path (confirmed available).
- **Metadata:** `model` and `as_of`. `?at=` serves backfill the same way `historical-odds?at=` does.
- **Consistency check:** for scheduled games without a market line, the matrix entry should equal the game's `home_win_probability`. Pin this in a consumer test.
- **MLB:** playoff starters aren't known, so the matrix is pitcher-neutral. Re-check in M6.

**Why a matrix and not ratings:** the predictor blends `RecentOddsPredictor` with `SeasonWinsPredictor` (separate sigmoid scales, with a preseason blend weight that decays), and MLB adds starting pitchers. One rating per team can't reproduce that blend, but running the predictor on every pairing is easy. If SportsCrunch is later rebuilt around one underlying rating per team, it can produce the same matrix from those ratings, and PlayoffOdds won't need to change.

**Fallback until the endpoint exists** (the M0 spike, and backfill if that runs first): fit `logit(p_home) = r_home − r_away + hfa` to the remaining scheduled games and build the matrix from the fit. Record `matchups.source = "fit"` in the input.

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
