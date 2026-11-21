# 02 — Data Model, Snapshots, and Publishing

**Status: DRAFT v3 (2026-10-21).** Simplified per D46. Column lists are a starting point for migrations, not a frozen schema.

Laravel keeps a local mirror of the SportsCrunch data it needs, runs simulations into immutable snapshots, and serves every page from local tables. Page requests never call SportsCrunch or run a simulation (D40).

## 1. Terms

| Term | Meaning |
|---|---|
| `as_of` | The instant a snapshot represents: games final before it count as played. Not the time the job ran. |
| snapshot | One simulation run for a league-season at an `as_of`. Immutable once published. |
| current | The snapshot the site shows now, via a per-league-season pointer. |
| daily point | For history charts: the last published snapshot of each league-local day. |
| `live` / `reconstructed` | Whether a snapshot was computed at the time, or backfilled later from SportsCrunch's historical data (D46). |
| if season ended | Standings and seeds from applying the tiebreak procedures to games played so far. This is what the site shows as current standings. |
| clinch status | Clinched / eliminated / alive per team and target, computed by PlayoffOdds's clinch check (D50, [features/14](features/14-clinch-magic-elimination.md)). Never inferred from a probability. |
| official | A league-recognized clinch/elimination marker crawled by SportsCrunch; used as a cross-check and to fill gaps when the league announces first. |

## 2. Tables (MySQL database `podds`, D19)

### Mirror of SportsCrunch data

| Table | Key columns |
|---|---|
| `leagues` | `id`, `code` (`nfl`), `name`, `timezone`, `daily_snapshot_time` |
| `seasons` | `id`, `league_id`, `year`, `sc_season_id`, `status`, `synced_at` |
| `teams` | `id`, `league_id`, `sc_team_id`, `slug`, `name`, `short_name`, `abbreviation` |
| `season_teams` | `id`, `season_id`, `team_id`, `conference`, `division` (alignment is per season) |
| `games` | `id`, `season_id`, `sc_game_id`, `home_season_team_id`, `away_season_team_id`, `start_at`, `week`, `season_type`, `neutral`, `status`, `home_score`, `away_score`, `end_type` (null until NHL), `p_home`, `p_source`, `sc_updated_at` |
| `official_statuses` | `season_team_id`, `target`, `status`, `source`, `observed_at` (from the SportsCrunch crawl, when it exists) |

### Snapshots and results

| Table | Key columns |
|---|---|
| `snapshots` | `id` (ULID), `league_id`, `season_id`, `as_of`, `trigger` (`scheduled`, `game_final`, `backfill`, `manual`), `origin` (`live`, `reconstructed`), `status` (`pending`, `running`, `published`, `failed`), `input_path`, `input_sha256`, `seed`, `sims`, `engine_version`, `standings_version`, `rules_id`, `runtime_ms`, `diagnostics` (json), `error`, `superseded_by_id`, `created_at`, `published_at` |
| `current_snapshots` | `league_id`, `season_id` (primary key), `snapshot_id`, `updated_at` |
| `snapshot_standings` | `snapshot_id`, `season_team_id`, `wins`, `losses`, `ties`, `win_pct`, `division_rank`, `conference_rank`, `seed` (if season ended, nullable), `extras` (json: division/conference records etc. for display) |
| `team_odds` | `snapshot_id`, `season_team_id`, `p_playoffs`, `p_division`, `p_top_seed`, `p_seed` (json array), `p_round` (json), `p_champion`, `wins_mean`, `wins_p10`, `wins_p50`, `wins_p90`, `wins_hist` (json) |
| `clinch_statuses` | `snapshot_id`, `season_team_id`, `target` (`playoffs`, `division`, `top_seed`), `status` (`clinched`, `eliminated`, `alive`), `controls_destiny` (bool, null when not checked), `method_version`, `runtime_ms`, `details` (json: e.g. counterexample summary) |

Store probabilities as decimals in [0, 1], for example `DECIMAL(7,6)`. Later features add their own tables, such as `game_conditionals` for leverage, a scenario cache for the picker, and push subscriptions.

## 3. Snapshot job

1. **Trigger.** Runs on a daily schedule at the league's snapshot time and after game finals, debounced so a slate of games produces one run once the last game in a window goes final. Also runs for backfill or manually from an artisan command.
2. **Sync.** Refresh the mirror for the league-season from SportsCrunch (games, scores, probabilities, matchup odds).
3. **Build input.** Build `SimInput` ([01](01-simulation-engine.md) §2) from local tables with the cutoff at `as_of`.
4. **Skip if nothing changed.** If the input's sha256 and the engine and standings versions match the current snapshot, stop without creating a snapshot.
5. **Store input.** Gzip the input and write it to `snapshots/{league}/{season}/{snapshot_id}.json.gz` on the artifact disk (S3 in production), then record the sha256.
6. **Run.** Spawn the engine CLI (`node packages/cli/dist/simulate.mjs`) with Laravel's `Process` facade, with a timeout, and parse the output JSON. Then run the clinch CLI (`clinch` command, [features/14](features/14-clinch-magic-elimination.md)) on the same input, passing the simulation's 0%/100% results as its screen.
7. **Publish.** In one database transaction, insert `snapshot_standings`, `team_odds` and `clinch_statuses`, mark the snapshot `published`, and upsert `current_snapshots`.
8. **On failure** at any step: mark the snapshot `failed` with the error, leave `current_snapshots` untouched, and alert after repeated failures.

Jobs run on the Laravel queue (Horizon/Redis), one job at a time per league-season so runs don't race. The seed is derived from the snapshot ID.

## 4. Reproducibility and corrections

- To reproduce a snapshot, re-run the CLI on its stored input with its seed and the same engine and standings versions (both are in the CLI's output). Tag engine versions so old builds can be checked out. Input files are small (an NFL season is well under 1 MB), so keep them all.
- If SportsCrunch later corrects a score or a probability was wrong, re-run for the same `as_of`. The new snapshot sets `superseded_by_id` on the old one; charts use the newest non-superseded snapshot; the old one remains in the database.

## 5. History and movement

- A chart series is, for each league-local day, the team's value from the last published, non-superseded snapshot of that day. The NFL chart may label points by week.
- Movement is the change between current and the daily point 1 day or 7 days earlier, shown with both endpoints ("62% → 34%").
- **Backfill (M1).** For each day of the 2026 NFL season before the pipeline went live, build the input with `as_of` at that day's snapshot time:
  - games final before `as_of` count as played;
  - remaining-game probabilities come from `GET /historical-odds?at=` and matchup odds from `GET /matchup-odds?at=` at the same instant;
  - these snapshots are `origin = reconstructed`.
  - Note that SportsCrunch fixed stale NFL look-ahead lines on 2026-09-22 ([03](03-sportscrunch-integration.md) §6), so reconstructions of earlier dates may differ from what was served then. The label covers this.
- Days with no games still get a daily point, but only if inputs changed (for example, lines moved).

## 6. Serving

- Pages read `current_snapshots` and then that snapshot's rows. Cache responses by snapshot ID, since published rows never change.
- Show `as_of` on every page.
- Show a stale banner when the current snapshot is older than a league threshold, or when a game went final more than about 2 hours ago and isn't reflected.
- If a league-season has no current snapshot, show a plain "not available yet" state.

## 7. Later

- `game_conditionals` for "if X wins" splits, accumulated by the engine during the normal run ([features/13](features/13-leverage-rooting.md)).
- Per-sim outcome storage (compact binary), only if server-side picker refinement needs it ([features/12](features/12-interactive-picker.md) §6).
- Separate intraday and daily history if charts need it.
- Retention/pruning if artifact storage grows (it won't for inputs alone).
