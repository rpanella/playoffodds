# 03 — SportsCrunch Integration

**Status: DRAFT v3 (2026-10-21; §3–4 and §6 updated 2026-11-20).** Boundary per D44 (replaces D30). The endpoint list was checked against the SportsCrunch `develop` branch on 2026-10-21. The matchup odds endpoint went live on 2026-11-20 (§4).

## 1. Who owns what

| SportsCrunch | PlayoffOdds |
|---|---|
| Teams, seasons, schedules, scores, game status | Simulation engine and snapshots |
| Per-game home win probabilities (market consensus or its predictor) | The standings engine package `@playoffodds/standings` (D44) |
| Matchup odds for any pairing, from its predictor (live for NFL) | Local mirror, publishing, website, API/MCP |
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

**Checked in M0 (2026-10-21):**
- **Coverage.** Both endpoints return a probability for every unplayed game: market odds where a line exists (weeks 7–8 at the time) and the market-based projection for the rest. At week 7 of 2026, 151 of 179 remaining games were projected.
- **Agreement.** The two endpoints agree exactly on market-priced games and within 0.002 on projected ones.
- **`is_projected`.** Only `historical-odds` returns it.
- **Live snapshots** therefore use `historical-odds?at=` set to about a minute ago: the same path as backfill, with the projected flag. That endpoint rejects future instants and is throttled to 30 requests per minute.

Consumer tests pin the fields above.

## 3. Additions needed

| # | Addition | Needed for | When |
|---|---|---|---|
| 1 | **Matchup odds endpoint:** `GET /seasons/{season}/matchup-odds?at=` (§4) | Playoff games and championship odds | **Done:** live on prod 2026-11-20, NFL only. NBA and NHL are switched on before M5, MLB before M6 |
| 2 | **Official standings crawl:** ESPN standings including clinch/elimination markers, stored per season and exposed via `GET /seasons/{season}/standings/official` | Live cross-check for our standings (D44) and our computed clinch statuses (D50); fills the gap when the league announces a clinch before our conservative check proves it | M1–M2; launch can proceed without it |
| 3 | **PHP standings wrapper** around the shared CLI (§7) | SportsCrunch-side standings and seeds | Any time after launch, when SportsCrunch needs it |
| 4 | **NHL end type** (regulation/OT/shootout) on games | NHL standings (loser point, RW/ROW) | Before M5 |
| 5 | **NBA Cup final flag:** the NBA Cup championship game does not count in the standings | NBA standings | Before M5 |
| 6 | Re-check MLB inputs (pitcher-aware anchors already exist) | MLB | Before M6 |

## 4. Matchup odds endpoint (D52)

Playoff games aren't on the schedule, so they have no line and no game probability. SportsCrunch's `GET /seasons/{season}/matchup-odds?at=` (live on prod since 2026-11-20) runs its existing predictor on every pairing. The schema is `MatchupOdds` in SportsCrunch's `docs/api/openapi.yaml`.

**Request.** Same auth and rules as `historical-odds`: `at` (ISO-8601 UTC) is required. A future instant gives 400, a missing or unparseable one 422, and a season without market lines 404. Throttled to 30 requests a minute. About 3–4 s a call for the NFL. `?at=` in the past serves backfill the same way `historical-odds?at=` does.

**Leagues.** NFL only for now; other leagues get 422. SportsCrunch switches NBA and NHL on before M5 and MLB before M6. MLB pairings will be pitcher-neutral, because playoff starters aren't known.

**Response (`data`):**

- `as_of`, `model` (`"RecentOddsPredictor+SeasonWinsPredictor"`).
- `game_time`: the kickoff every pairing is priced at, one second after the later of `at` and the season's last regular-season kickoff. During the postseason that is `at` plus a second.
- `teams` (`id`, `shortname`, `location`, `name`) in shortname order. That is the same order as `/seasons/{season}/teams` and the row and column order of both matrices.
- `home[i][j]`: the probability that `teams[i]` beats `teams[j]` at `teams[i]`'s home. Each pair appears both ways, so for the NFL that is 32 × 31 = 992 entries.
- `neutral[i][j]`: the same at a neutral site. The diagonal of both is null.

**Mapping into `SimInput`.** Map `teams[].id` to our team IDs through the mirror, reorder rows and columns to `matchups.teams`, and set `matchups.source = "sportscrunch"` and `as_of` from the response. Fetch it at the same `at` as `historical-odds`.

**Team adjustments.** SportsCrunch's injury and roster adjustments apply as they would to a playoff game at `game_time`. An entry's per-game override for the team's last regular-season game carries into the playoffs. Otherwise the usual rule applies: out for the rest of the season means fully out, a return before then means fully back, and a return dated in January applies from that date. Example from Nov 20: BAL's QB entry has weeks 14–15 at 75% out and weeks 16–18 at 65%, so BAL's pairings carry 65%.

**Consistency check.** For a scheduled game without a market line, the matrix entry should equal the game's served `home_win_probability` within 0.002, unless either team's adjustment differs between that game and the playoffs. Pin this in a consumer test that skips games involving a team with a week-varying adjustment, or allows those to differ. Checked on prod 2026-11-20: 81 of 93 unlined games agreed within 0.002. The other 12 all involved BAL, MIA or LAR, and each moved in the direction of a player expected back by the playoffs. SportsCrunch confirmed these are exactly the games whose adjustment differs from the playoff value: MIA's QB and LAR's WR have return windows ending in week 18 (so 0% out in the playoffs), and BAL's QB has per-game overrides (75% out in weeks 14–15, 65% in the playoffs).

**Why a matrix and not ratings:** the predictor blends `RecentOddsPredictor` with `SeasonWinsPredictor` (separate sigmoid scales, with a preseason blend weight that decays), and MLB adds starting pitchers. One rating per team can't reproduce that blend, but running the predictor on every pairing is easy. If SportsCrunch is later rebuilt around one underlying rating per team, it can produce the same matrix from those ratings, and PlayoffOdds won't need to change.

**The `fit` fallback** (fit `logit(p_home) = r_home − r_away + hfa` to the remaining scheduled games, labeled `matchups.source = "fit"`) was for the M0 spike, before the endpoint existed. The NFL pipeline and backfill don't use it. Other leagues use the endpoint once SportsCrunch switches them on.

## 5. Sync and triggers

- **Daily snapshot:** each run first syncs the season's teams, alignment and games (`sportscrunch:sync`). Probabilities and matchup odds are fetched by the run itself (02 §3).
- **Game finals (D53, D54):**
  - **Webhook.** SportsCrunch sends signed `games` webhooks to `POST /webhooks/sportscrunch`.
    - Deliveries go to the webhook URL on the SportsCrunch account that owns PlayoffOdds' token, signed with that account's secret (`SPORTSCRUNCH_WEBHOOK_SECRET`). The header is `X-Webhook-Signature: v1=<hmac-sha256 of the body>`, once per active secret.
    - The receiver checks the signature, the payload's age (15 minutes) and the request ID (replays), then queues a check of the season 90 seconds later.
    - The event is only a trigger. The check re-syncs the season and runs a snapshot if a result came in or a score changed.
    - `sportscrunch:webhooks --subscribe` creates the subscription for the active season.
  - **Poll.** While any game is in progress (kicked off in the last 8 hours and not settled), `snapshot:watch` queues the same check every 10 minutes.
- **Failures:** retry with backoff. If SportsCrunch is down, no new snapshot is made and the site keeps showing the last good one (D40).

## 6. Historical data caveats

- `historical-odds?at=` reconstructs each game's probability from line history and the predictor as they run today, so backfilled snapshots are labeled `reconstructed` ([02](02-simulation-outputs.md) §5).
- Known case: until the fix on 2026-09-22 (SportsCrunch commit `16d7fcf`), NFL weeks 5–18 served frozen preseason look-ahead lines. Reconstructions of dates before that fix may not match what SportsCrunch actually served then.
- **Team adjustments** (SportsCrunch's injury and roster entries, on prod since November 2026) are versioned. A replay at `at` applies each entry only if it was known at `at`. Entries backdated later, such as those from SportsCrunch's Nov 17 review (PHI, TB, NYG and others, known from September and October), change replays of those dates. A reconstructed snapshot reflects the entries as of the day it was built.

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
