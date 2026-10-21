# 01 — Simulation Engine

**Status: DRAFT v3 (2026-10-21).** NFL first (D43). Drift follows D51; the rest of the parameters are starting values to check after launch.

`@playoffodds/engine` is a pure TypeScript package. It takes one `SimInput` and returns aggregate odds. It runs as a Node CLI spawned by a Laravel queue job, and later inside a browser Web Worker for the picker. It uses `@playoffodds/standings` ([04](04-standings-tiebreakers.md)) for every standings, tiebreak and seeding decision.

## 1. Rules for the engine

- **Pure.** No network, database, filesystem, clock or `Math.random`. The CLI wrapper does all I/O.
- **Keyed randomness (D51).** Every random draw comes from a counter-based generator addressed by `(run seed, sim index, purpose, entity)`, as in PoolCrunch's `ml/simulator/rng.py`.
  - **Purposes** are a small fixed enum, append-only: drift, outcome, tiebreak, later lottery.
  - **Entity** is a fixed index in the season's full team or game roster, never "remaining games".
  - **What this buys:** sims 0–1,999 of a 100k run match a 2k run. Results don't depend on thread scheduling. Pinning one game in the picker leaves every other draw unchanged.
  - Pick a well-known counter-based algorithm (for example Philox, or a keyed hash such as SplitMix over the key tuple) in M0, version it, and test it.
- **Deterministic in Node.** Same input, seed and engine version produce the same output. Browser results need not be bit-identical.
- **Known results are never re-simulated.** Final games and completed playoff games are fixed inputs.

## 2. Input (`SimInput`)

Built by Laravel from its local mirror of SportsCrunch data ([02](02-simulation-outputs.md)). Example, abbreviated:

```json
{
  "schema": "sim-input/1",
  "league": "nfl",
  "season": 2026,
  "as_of": "2026-11-03T14:00:00Z",
  "current_week": 9,
  "teams": [
    { "id": "nfl-buf", "name": "Buffalo Bills", "conference": "AFC", "division": "AFC East" }
  ],
  "games": [
    { "id": "sc-210345", "week": 1, "start": "2026-09-13T17:00:00Z", "season_type": "regular",
      "home": "nfl-buf", "away": "nfl-nyj", "neutral": false,
      "status": "final", "home_score": 27, "away_score": 17 },
    { "id": "sc-210512", "week": 10, "start": "2026-11-08T18:00:00Z", "season_type": "regular",
      "home": "nfl-buf", "away": "nfl-mia", "neutral": false,
      "status": "scheduled", "p_home": 0.71, "p_source": "market" }
  ],
  "ratings": { "scale": "logit", "hfa": 0.20, "source": "sportscrunch", "teams": { "nfl-buf": 0.62, "nfl-mia": -0.15 } },
  "postseason": { "state": "not_started" },
  "params": { "sims": 100000, "seed": "01JBQ7…", "tie_rate": 0.00373, "drift": "nfl-line-drift@v2" }
}
```

- `p_home` is SportsCrunch's home win probability for that game. `p_source` is `market` or `projected` (from `is_projected`).
- `ratings` price games that are not on the schedule, meaning playoff matchups (D47, [03](03-sportscrunch-integration.md) §4).
- `params.drift` names a drift parameter file bundled with the engine (§4). The standings package picks the rule era from `league` + `season`. The engine records the drift and rules IDs in its output.
- Validation rejects unknown team IDs, duplicate game IDs, final games without scores, scheduled games without `p_home`, and probabilities outside (0, 1).

## 3. One simulated season

1. **Baseline.** Build standings from final games once per run (via the standings package). Each sim starts from a copy.
2. **Draw the drift.** Draw this sim's per-team rating walks (§4).
3. **Remaining regular season.** Walk unplayed games in rounds: NFL by week; NBA, NHL and MLB by league-local date.
   - Each game's probability is `sigmoid(logit(p_home) + W_home(h) − W_away(h))`, where `h` is the number of weeks between `current_week` and the game's week and `W_t(h)` is team *t*'s walk at that horizon.
   - Sample the outcome (§5) and add it to the standings.
4. **Seeding.** Call the standings engine's fast path to get division winners, playoff teams and seeds for this world.
5. **Playoffs.** Simulate the bracket from those seeds, or from the actual postseason state once it has started (§7).
   - Matchups use `sigmoid(r_home − r_away + hfa + W_home(h) − W_away(h))`, with no HFA at neutral sites. `h` is the weeks from now to that playoff round.
   - Playoff games cannot tie.
6. **Record** each team's wins/losses/ties, playoff qualification, division title, seed, furthest round and championship.

## 4. Drift: teams improving and declining (D51)

Game odds are today's best estimate, but teams change over a season: injuries, form, news. Each simulated season therefore gives every team its own random rating path, sized from **measured historical line movement**.

**Source.** PoolCrunch's fitted NFL generator, `poolcrunch/ml/simulator/params/line_drift_generator_v2.json`. It was fitted on 2014–2025 weekly boards from the SportsCrunch feed and validated against the market's own measured movement. Copy the relevant parameters into `packages/engine/params/nfl-line-drift-v2.json`, keeping the provenance (source path, fit date, measurement digest).

**Model.** Port the *team component* of `DriftedWorld._draw` in `poolcrunch/ml/simulator/driftgen.py`. For each team, the walk at horizon `h` is the sum of two independent pieces, each a cumulative sum over steps `k = 1..h`:

- a **coherent walk**: steps with variance `team_walk_var` (≈ 0.0122);
- a **standing term**: steps with variance `max(0, team_increment_var[k] − team_walk_var)`.

Every step is a Student-t draw (ν = `student_t_nu` ≈ 4.79) scaled to unit variance, then multiplied by the step's standard deviation. The total variance at `h` is `Σ team_increment_var[1..h]`, for example a standard deviation of about 0.40 log-odds per team at 8 weeks out.

All of a team's games read the same path, which is what makes a team's results move together. Clip extreme draws as PoolCrunch does (±6 log-odds).

**What is left out:**
- **PoolCrunch's per-game news and market-wide components.** They are independent from game to game, so they barely change season outcomes. They matter for PoolCrunch because the crowd picks off the board.
- **The final-week jump** (resting starters). A better version for us ties resting to whether a team has locked its seed in that world. That is a later refinement.

**Beyond the fitted range.** The fit covers 17 weeks. Playoff rounds early in the season can be further out; hold the last increment's variance constant beyond 17 and note it as a limitation.

**Before the picker (M4): add result coupling.** As ported, the walk is drawn up front and doesn't react to simulated results. Pinning the Bills to win next week wouldn't make them stronger afterwards, though real lines move after wins.
- Measure from line history how much of a team's weekly rating revision is explained by its result surprise (`actual − expected`).
- Add that part as an in-sim update after each round: `rating += K × (actual − expected)`.
- Shrink the walk so total movement still matches the measured curve.

**Other leagues.** Re-run PoolCrunch's measurement (`driftmodel.py`, `driftgen.fit`) on NBA, NHL and MLB line history before M5 and M6. Use calendar days or weeks as the horizon unit, as fits each league.

## 5. NFL outcomes and ties

Treat the drifted probability as expected home win credit `m`. With tie probability `tau = min(tie_rate, 2·min(m, 1−m))`:

- `P(home win) = m − tau/2`
- `P(tie) = tau`
- `P(away win) = 1 − m − tau/2`

`tie_rate = 0.00373` is PoolCrunch's measured NFL rate.

**No scores at launch (D47).** The simulator doesn't generate scores. Late NFL tiebreak steps use points (conference and league points rankings, net points, net touchdowns). If a tie in a simulated world reaches one of those steps, the standings engine resolves it with a seeded draw and increments a counter. Standings built from real results always use real scores. If the counter shows that the draw decides a playoff spot or seed often enough to matter, add a score model.

## 6. Output

```json
{
  "schema": "sim-output/1",
  "engine_version": "0.3.0+a1b2c3d",
  "rules_id": "nfl@2020",
  "drift_id": "nfl-line-drift@v2",
  "sims": 100000, "seed": "01JBQ7…", "runtime_ms": 6400,
  "teams": {
    "nfl-buf": {
      "p_playoffs": 0.874, "p_division": 0.61,
      "p_seed": [0.21, 0.18, 0.12, 0.10, 0.11, 0.09, 0.064],
      "p_round": { "divisional": 0.61, "conference": 0.36, "super_bowl": 0.21, "champion": 0.12 },
      "wins": { "mean": 11.4, "p10": 9, "p50": 11, "p90": 13, "hist": { "8": 0.03, "9": 0.08 } }
    }
  },
  "diagnostics": { "tiebreak_draws": { "count": 412, "affected_playoff_spot": 37 }, "drift_clipped": 0, "warnings": [] }
}
```

`p_seed` has one entry per seed (NFL: 1–7), and a team's `p_seed` sums to `p_playoffs`. Probabilities are decimals in [0, 1]. Rule IDs are illustrative until the standings package defines them.

**Clinch.** Simulation output never sets clinch status. That comes from the clinch check ([features/14](features/14-clinch-magic-elimination.md)), which uses the simulation only as a screen.

## 7. Postseason (M4, needed by Wild Card weekend)

Once the regular season ends, seeds are fixed. `postseason` then carries completed playoff games, and the engine builds the bracket from actual seeds and simulates only the unresolved games.

NFL bracket: seeds 1–7 per conference, seed 1 gets a bye, Wild Card games are 2v7, 3v6 and 4v5. The bracket reseeds each round so the top remaining seed plays the lowest. The higher seed hosts every game except the neutral-site Super Bowl. Bracket formats are data in each league module, not hard-coded logic.

## 8. Performance targets

- NFL: 100k sims in under ~10 s on the production server, measured in M0.
- If that misses, split sims across Node `worker_threads` (possible because draws are keyed per sim), or ship at a lower count with the count shown on the methodology page.
- Browser (picker): 2k sims for a first result in well under a second on a mid-range phone, then refine toward 5k.

## 9. Known limitations at launch

These are stated on the methodology page:

- No player-level context beyond what the market prices into each game's probability.
- Week 18 rest decisions are not modeled.
- Drift doesn't react to simulated results until the M4 split.
- Drift beyond 17 weeks is extrapolated.
- Score-based tiebreak steps use a draw in simulated worlds.

## 10. Later extensions

- **Picker (M4):** `pins: [{ "game_id": "...", "outcome": "home" }]` forces outcomes. The caller derives the seed from snapshot ID + pins so everyone viewing a shared scenario gets the same numbers (D23/D35). Requires the result-coupled drift (§4).
- **NHL (M5):** six outcome classes, home/away winner × regulation/OT/shootout. Sample the winner from the drifted probability first, then regulation vs extra time, then OT vs shootout, so the outright win probability is preserved. Standings need RW/ROW and the loser point. Goal differential steps need a goal model or the draw fallback.
- **NBA (M5):** play-in bracket for seeds 7–10; point differential is the last tiebreak step (draw fallback at first).
- **MLB (M6):** 162 games per team, so performance matters most here; series formats with byes for the top two division winners.
- **Leverage (later):** while running, accumulate counts per near-term game outcome × team, giving "odds if X wins" for every upcoming game in one pass without storing per-sim results ([features/13](features/13-leverage-rooting.md)).
- **Calibration (backlog):** backtest season odds against actual seasons; check drift and tie rate on 2026 results, reusing SportsCrunch's `benchmark:win-probabilities` and PoolCrunch's measurement tooling; consider per-sim talent uncertainty at the start of a season (D10).

## 11. Tests

- **RNG:** keyed draws are stable across sim counts and thread splits. Changing one game's pin changes no other game's draws.
- **Drift:** across many sims, each team's walk variance at each horizon matches `Σ team_increment_var[1..h]` within tolerance, and two games of the same team share the walk. Golden values from PoolCrunch's generator on a fixed seed are not expected to match bit-for-bit (different RNG), but the variance curve must.
- **Sampling:** over many draws, outcome frequencies match §5 within tolerance; probabilities always sum to 1.
- **Determinism:** same input + seed gives byte-identical output.
- **All games final:** every team's seed has probability exactly 1 and matches the standings engine's deterministic result.
- **Invariants:** each sim assigns each seed exactly once per conference; `sum(p_seed) == p_playoffs`; round probabilities never increase in later rounds.
- **Smoke:** run on the live 2026 NFL season and sanity-check against public models (ESPN FPI, NYT). They are a sanity check, not an oracle.
